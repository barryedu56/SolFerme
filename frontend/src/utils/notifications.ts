import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Détection Expo Go : expo-notifications n'est pas supporté dans Expo Go (SDK 53+).
// On désactive toutes les fonctionnalités de notifications dans cet environnement.
const IS_EXPO_GO = Constants.appOwnership === 'expo';
const IS_WEB = Platform.OS === 'web';
const DISABLED = IS_EXPO_GO || IS_WEB;

if (!DISABLED) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/* ─────────────── Préférence utilisateur (interrupteur Paramètres) ─────────────── */

const NOTIF_PREF_KEY = 'notifications';

export async function areNotificationsEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(NOTIF_PREF_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

/**
 * Applique le choix de l'interrupteur « Notifications » des Paramètres.
 * - OFF : annule toutes les notifications locales planifiées + purge la map.
 * - ON  : (re)demande la permission OS ; la resynchronisation des rappels est
 *   relancée par l'écran Rappels à sa prochaine ouverture.
 */
export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIF_PREF_KEY, String(enabled));
  } catch {}
  if (DISABLED) return;
  if (!enabled) {
    await cancelAllNotifications();
    try { await AsyncStorage.removeItem('scheduled_reminder_ids'); } catch {}
    try {
      const keys = await AsyncStorage.getAllKeys();
      const notifKeys = keys.filter((k) => k.startsWith('notif_reminder_'));
      if (notifKeys.length) await AsyncStorage.multiRemove(notifKeys);
    } catch {}
  } else {
    await ensurePermission();
  }
}

/* ─────────────── Permissions & enregistrement appareil ─────────────── */

async function ensurePermission(): Promise<boolean> {
  if (DISABLED) return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    return final === 'granted';
  } catch {
    return false;
  }
}

export async function registerForPushNotificationsAsync(): Promise<void> {
  if (DISABLED) return;
  const granted = await ensurePermission();
  if (!granted) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Alertes & rappels SolFerme',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F9D760',
      sound: 'default',
    });
  }
}

/**
 * Jeton Expo Push de l'appareil, à envoyer au backend pour les notifications
 * distantes (alerte santé, rappel dû quand l'app est fermée).
 * Nécessite un `projectId` EAS (défini via EXPO_PUBLIC_EAS_PROJECT_ID). Sans lui,
 * seules les notifications LOCALES fonctionnent — on retourne alors null sans erreur.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (DISABLED) return null;
  try {
    const granted = await ensurePermission();
    if (!granted) return null;
    const projectId =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId ||
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    if (!projectId) {
      console.warn('[push] Aucun projectId EAS — notifications distantes désactivées (les rappels locaux fonctionnent).');
      return null;
    }
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data || null;
  } catch (e) {
    console.warn('[push] getExpoPushToken a échoué', e);
    return null;
  }
}

/* ─────────────── Notifications LOCALES de rappel ─────────────── */

export async function scheduleReminderNotification(reminder: any) {
  if (DISABLED) return null;
  if (!(await areNotificationsEnabled())) return null;
  try {
    const { id, title, type, date, time, repetition, lot_name } = reminder;

    // Déduplication : on annule toute notification déjà planifiée pour CE rappel
    // (quelle que soit la clé) avant d'en planifier une nouvelle.
    const existingKeys = [`notif_reminder_${id}`];
    try {
      const mapString = await AsyncStorage.getItem('scheduled_reminder_ids');
      if (mapString) {
        const map = JSON.parse(mapString);
        if (map && map[id]) existingKeys.push(map[id]);
      }
    } catch {}
    for (const key of existingKeys) {
      const stored = await AsyncStorage.getItem(key).catch(() => null);
      if (stored) {
        await cancelNotification(stored);
        await AsyncStorage.removeItem(key).catch(() => {});
      }
    }

    const [year, month, day] = String(date).split('-').map((v: string) => parseInt(v, 10));
    const triggerDate = new Date(year, month - 1, day);
    if (time) {
      const [h, m] = String(time).split(':').map((v: string) => parseInt(v, 10));
      triggerDate.setHours(h, m, 0, 0);
    } else {
      triggerDate.setHours(8, 0, 0, 0);
    }

    // Triggers au format SDK 54 (le champ `type` est obligatoire).
    const T = Notifications.SchedulableTriggerInputTypes;
    let trigger: Notifications.NotificationTriggerInput;

    if (repetition === 'DAILY') {
      trigger = { type: T.DAILY, hour: triggerDate.getHours(), minute: triggerDate.getMinutes(), channelId: 'default' };
    } else if (repetition === 'WEEKLY') {
      // expo : weekday 1 (dimanche) → 7 (samedi)
      trigger = { type: T.WEEKLY, weekday: triggerDate.getDay() + 1, hour: triggerDate.getHours(), minute: triggerDate.getMinutes(), channelId: 'default' };
    } else if (repetition === 'MONTHLY') {
      trigger = { type: T.MONTHLY, day: triggerDate.getDate(), hour: triggerDate.getHours(), minute: triggerDate.getMinutes(), channelId: 'default' };
    } else {
      // Ponctuel : si la date est future → trigger DATE ; sinon → dans 2 s (test).
      if (triggerDate.getTime() > Date.now() + 1000) {
        trigger = { type: T.DATE, date: triggerDate, channelId: 'default' };
      } else {
        trigger = { type: T.TIME_INTERVAL, seconds: 2, repeats: false, channelId: 'default' };
      }
    }

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `🔔 ${title}`,
        body: `${type}${lot_name ? ' - Lot: ' + lot_name : ''}`,
        data: { screen: 'Reminders', reminderId: id },
        sound: 'default',
      },
      trigger,
    });

    return notifId;
  } catch (error) {
    console.error('Erreur lors de la planification de la notification:', error);
    return null;
  }
}

/**
 * Notification de confirmation immédiate à la création d'un rappel — donne à
 * l'utilisateur la preuve visible que les notifications fonctionnent, et lui
 * rappelle QUAND la vraie notification arrivera.
 */
export async function notifyReminderScheduled(reminder: any) {
  if (DISABLED) return;
  if (!(await areNotificationsEnabled())) return;
  try {
    const { title, date, time } = reminder;
    const when = time ? `${date} à ${String(time).slice(0, 5)}` : `${date} à 08:00`;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✅ Rappel programmé',
        body: `« ${title} » — vous serez notifié le ${when}.`,
        data: { screen: 'Reminders' },
        sound: 'default',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, repeats: false, channelId: 'default' },
    });
  } catch {}
}

/**
 * Diagnostic : pourquoi les notifications ne fonctionneront pas (le cas échéant).
 * Utilisé pour afficher un message clair à l'utilisateur.
 */
export async function getNotificationDiagnostics(): Promise<{ ok: boolean; reason?: string }> {
  if (IS_WEB) return { ok: false, reason: "Les notifications ne sont pas disponibles sur la version web." };
  if (IS_EXPO_GO) return { ok: false, reason: "Les notifications sont désactivées dans Expo Go. Utilisez un build de développement (eas build) ou l'application installée." };
  if (!(await areNotificationsEnabled())) return { ok: false, reason: "Les notifications sont désactivées dans Paramètres." };
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: asked } = await Notifications.requestPermissionsAsync();
      if (asked !== 'granted') {
        return { ok: false, reason: "L'autorisation des notifications a été refusée. Activez-la dans les réglages du téléphone." };
      }
    }
  } catch {
    return { ok: false, reason: "Impossible de vérifier l'autorisation des notifications." };
  }
  return { ok: true };
}

export async function cancelNotification(id: string) {
  if (DISABLED) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}

export async function cancelAllNotifications() {
  if (DISABLED) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}
