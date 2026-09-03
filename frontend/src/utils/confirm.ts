import { Alert, Platform } from 'react-native';

/**
 * Confirmation cross-platform (web + natif).
 * Retourne true si l'utilisateur confirme, false sinon.
 */
export function confirmAsync(title: string, message?: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ok =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(message ? `${title}\n\n${message}` : title)
        : true;
    return Promise.resolve(ok);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Confirmer', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
