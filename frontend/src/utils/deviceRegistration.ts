import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { registerForPushNotificationsAsync, getExpoPushToken } from './notifications';

const LAST_TOKEN_KEY = 'push_device_token';

/**
 * Enregistre l'appareil courant auprès du backend pour recevoir les
 * notifications distantes (alertes santé, rappels dus app fermée).
 * Idempotent : ne renvoie au serveur que si le jeton a changé.
 * Silencieux : aucune erreur ne remonte (le mode local reste fonctionnel).
 */
export async function registerDeviceForPush(): Promise<void> {
  try {
    await registerForPushNotificationsAsync();
    const token = await getExpoPushToken();
    if (!token) return;

    const previous = await AsyncStorage.getItem(LAST_TOKEN_KEY).catch(() => null);
    await apiClient.post('/devices/', { token, platform: Platform.OS });
    if (previous !== token) {
      await AsyncStorage.setItem(LAST_TOKEN_KEY, token).catch(() => {});
    }
  } catch (e: any) {
    console.warn('[push] enregistrement appareil ignoré:', e?.message || e);
  }
}

/**
 * Désenregistre l'appareil (à la déconnexion) pour ne plus recevoir les
 * notifications de l'utilisateur qui se déconnecte.
 */
export async function unregisterDeviceForPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(LAST_TOKEN_KEY).catch(() => null);
    if (!token) return;
    await apiClient.delete('/devices/', { data: { token } }).catch(() => {});
    await AsyncStorage.removeItem(LAST_TOKEN_KEY).catch(() => {});
  } catch {
    /* silencieux */
  }
}
