import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Détection Expo Go : expo-notifications n'est pas supporté dans Expo Go (SDK 53+).
// On désactive toutes les fonctionnalités de notifications dans cet environnement.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

if (!IS_EXPO_GO) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function registerForPushNotificationsAsync() {
  if (IS_EXPO_GO) return;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Rappels SolFerme',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F9D760',
      sound: 'default',
    });
  }
}

export async function scheduleReminderNotification(reminder: any) {
  if (IS_EXPO_GO) return null;
  try {
    const { id, title, type, date, time, repetition, lot_name } = reminder;

    // ⚠️ CORRECTION (BUG H1 — double planification de notifications de rappel).
    // Deux chemins appelaient scheduleReminderNotification sans déduplication :
    //  - ReminderScreen (création/édition) ne stockait que `notif_reminder_${id}` ;
    //  - syncReminders (RemindersScreen) lisait la map `scheduled_reminder_ids`.
    // Un même rappel était donc planifié 2× (une notif par chemin). On centralise ici :
    //  - avant toute planification, on annule la notification éventuellement déjà
    //    existante pour CE rappel (quelle que soit la clé utilisée) ;
    //  - après planification, on écrit les DEUX clés pour qu'aucun chemin ne re-planifie.
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const existingKeys = [`notif_reminder_${id}`];
    try {
      const scheduledMapString = await AsyncStorage.getItem('scheduled_reminder_ids');
      if (scheduledMapString) {
        const scheduledMap = JSON.parse(scheduledMapString);
        if (scheduledMap && scheduledMap[id]) existingKeys.push(scheduledMap[id]);
      }
    } catch {}
    for (const key of existingKeys) {
      const storedNotifId = await AsyncStorage.getItem(key).catch(() => null);
      if (storedNotifId) {
        await cancelNotification(storedNotifId);
        await AsyncStorage.removeItem(key).catch(() => {});
      }
    }

    const [year, month, day] = date.split('-').map((v: string) => parseInt(v, 10));
    const triggerDate = new Date(year, month - 1, day);

    if (time) {
      const [hours, minutes] = time.split(':').map((v: string) => parseInt(v, 10));
      triggerDate.setHours(hours, minutes, 0, 0);
    } else {
      triggerDate.setHours(8, 0, 0, 0);
    }

    const now = new Date();
    let trigger: any;

    if (repetition === 'DAILY') {
      trigger = {
        hour: triggerDate.getHours(),
        minute: triggerDate.getMinutes(),
        repeats: true,
      };
    } else if (repetition === 'WEEKLY') {
      trigger = {
        weekday: triggerDate.getDay() + 1,
        hour: triggerDate.getHours(),
        minute: triggerDate.getMinutes(),
        repeats: true,
      };
    } else if (repetition === 'MONTHLY') {
      trigger = {
        day: triggerDate.getDate(),
        hour: triggerDate.getHours(),
        minute: triggerDate.getMinutes(),
        repeats: true,
      };
    } else {
      // Calcul du délai en secondes pour éviter l'usage de l'objet Date
      const diffSeconds = Math.floor((triggerDate.getTime() - now.getTime()) / 1000);
      const seconds = diffSeconds > 0 ? diffSeconds : 2; // 2 secondes minimum
      trigger = {
        seconds: seconds,
        repeats: false,
      };
    }

    // On ajoute le channelId au trigger ET au content pour être sûr
    const finalTrigger = {
      ...trigger,
      channelId: 'default',
    };

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `🔔 ${title}`,
        body: `${type}${lot_name ? ' - Lot: ' + lot_name : ''}`,
        data: { screen: 'Reminders', reminderId: id },
        sound: 'default',
      },
      trigger: finalTrigger,
    });

    return notifId;
  } catch (error) {
    console.error("Erreur lors de la planification de la notification:", error);
    return null;
  }
}

export async function cancelNotification(id: string) {
  if (IS_EXPO_GO) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (e) {}
}

export async function cancelAllNotifications() {
  if (IS_EXPO_GO) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
