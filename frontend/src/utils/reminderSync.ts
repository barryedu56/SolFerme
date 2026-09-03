import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleReminderNotification, cancelNotification, cancelAllNotifications, areNotificationsEnabled } from './notifications';

/**
 * Synchronise les rappels récupérés de l'API avec les notifications locales.
 * Planifie les nouveaux rappels et annule ceux qui sont terminés/supprimés.
 */
export async function syncReminders(reminders: any[]) {
  try {
    // Interrupteur « Notifications » (Paramètres) : si coupé, on s'assure qu'aucune
    // notification locale ne subsiste et on n'en planifie aucune.
    if (!(await areNotificationsEnabled())) {
      await cancelAllNotifications();
      await AsyncStorage.setItem('scheduled_reminder_ids', JSON.stringify({}));
      return;
    }
    const scheduledIdsString = await AsyncStorage.getItem('scheduled_reminder_ids');
    let scheduledIds = scheduledIdsString ? JSON.parse(scheduledIdsString) : {};

    // 1. Identifier les rappels PENDING qui ne sont pas encore programmés localement
    for (const r of reminders) {
      if (r.status === 'PENDING') {
        const isScheduled = scheduledIds[r.id];
        const rDate = new Date(r.date);

        // Si l'heure est fournie, on l'ajoute
        if (r.time) {
          const [h, m] = r.time.split(':');
          rDate.setHours(parseInt(h), parseInt(m), 0, 0);
        } else {
          rDate.setHours(8, 0, 0, 0);
        }

        // On autorise la planification si c'est dans le futur ou si c'est tout récent (moins d'une minute)
        // pour permettre le déclenchement immédiat de test
        const isRecentOrFuture = rDate.getTime() > new Date().getTime() - 60000;

        if (isRecentOrFuture && !isScheduled) {
          const notifId = await scheduleReminderNotification(r);
          if (notifId) {
            scheduledIds[r.id] = notifId;
            await AsyncStorage.setItem(`notif_reminder_${r.id}`, notifId);
          }
        }
      } else if (r.status === 'COMPLETED' || r.status === 'CANCELLED') {
        // Si le rappel est terminé mais qu'une notification existe, on l'annule
        const notifId = scheduledIds[r.id];
        if (notifId) {
          await cancelNotification(notifId);
          delete scheduledIds[r.id];
          await AsyncStorage.removeItem(`notif_reminder_${r.id}`);
        }
      }
    }

    // 2. Nettoyer les notifications pour les rappels qui n'existent plus dans la liste
    //    (supprimés, passés, ou ré-attribués d'un ID négatif → positif au sync).
    const currentReminderIds = new Set(reminders.map(r => r.id.toString()));

    // 2a. Via la map scheduled_reminder_ids.
    for (const rid in scheduledIds) {
      if (!currentReminderIds.has(rid)) {
        await cancelNotification(scheduledIds[rid]);
        delete scheduledIds[rid];
        await AsyncStorage.removeItem(`notif_reminder_${rid}`);
      }
    }

    // 2b. Via les clés notif_reminder_* non enregistrées dans la map. C'est le cas des
    //     rappels planifiés uniquement par ReminderScreen (création/édition) — en
    //     particulier les rappels créés HORS-LIGNE sous un ID négatif, qui deviennent
    //     orphelins une fois l'ID ré-attribué à un positif. Sans ce balayage, leur
    //     notification était conservée et doublonnait celle planifiée sous le nouvel ID.
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const notifKeys = allKeys.filter((k: string) => k.startsWith('notif_reminder_'));
      for (const key of notifKeys) {
        const rid = key.replace('notif_reminder_', '');
        if (rid && !currentReminderIds.has(rid)) {
          const orphanNotifId = await AsyncStorage.getItem(key).catch(() => null);
          if (orphanNotifId) await cancelNotification(orphanNotifId);
          delete scheduledIds[rid];
          await AsyncStorage.removeItem(key);
        }
      }
    } catch (e) {
      console.warn('syncReminders: balayage des clés notif_reminder_* ajourné', e);
    }

    await AsyncStorage.setItem('scheduled_reminder_ids', JSON.stringify(scheduledIds));
  } catch (error) {
    console.error('Erreur syncReminders:', error);
  }
}
