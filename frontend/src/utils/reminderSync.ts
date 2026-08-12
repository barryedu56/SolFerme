import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleReminderNotification, cancelNotification } from './notifications';

/**
 * Synchronise les rappels récupérés de l'API avec les notifications locales.
 * Planifie les nouveaux rappels et annule ceux qui sont terminés/supprimés.
 */
export async function syncReminders(reminders: any[]) {
  try {
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

        // Si c'est dans le futur et pas encore programmé
        if (rDate > new Date() && !isScheduled) {
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

    // 2. Nettoyer les notifications pour les rappels qui n'existent plus dans la liste (supprimés)
    const currentReminderIds = reminders.map(r => r.id.toString());
    for (const rid in scheduledIds) {
      if (!currentReminderIds.includes(rid)) {
        await cancelNotification(scheduledIds[rid]);
        delete scheduledIds[rid];
        await AsyncStorage.removeItem(`notif_reminder_${rid}`);
      }
    }

    await AsyncStorage.setItem('scheduled_reminder_ids', JSON.stringify(scheduledIds));
  } catch (error) {
    console.error('Erreur syncReminders:', error);
  }
}
