import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as Sentry from '@sentry/react-native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ThemeProvider } from './src/context/ThemeContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { registerForPushNotificationsAsync } from './src/utils/notifications';
import { registerDeviceForPush } from './src/utils/deviceRegistration';
import { syncManager } from './src/utils/syncManager';

// Sentry : monitoring des crashs et erreurs. Le DSN est PUBLIC par nature (il
// n'autorise que l'envoi d'événements) — versionné pour que web (npm run deploy),
// mobile (eas.json) et local le trouvent sans configuration. Projet
// @solferme/solferme-mobile ; les événements web y sont taggés platform=web.
// Désactivé en dev (__DEV__).
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN
  || 'https://348011a5a2790e4435177db6dbde10cc@o4512033488699392.ingest.de.sentry.io/4512034243674192';
Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !__DEV__ && !!SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  sendDefaultPii: false,   // pas d'e-mail / IP envoyés
  tracesSampleRate: 0,     // erreurs uniquement (économise le quota gratuit)
});

/**
 * Démarre la synchronisation Offline-First UNIQUEMENT pour les comptes métier
 * (PROPRIETAIRE / EMPLOYE). Le SuperAdmin est ONLINE-ONLY : aucune initialisation
 * SQLite métier, aucun pull des données des fermes, aucun watcher de sync.
 */
function SyncManagerBootstrap() {
  const { userToken, isSuperAdmin, authChecked } = useAuth();

  useEffect(() => {
    // On attend la confirmation serveur du statut (authChecked) : sans elle, un
    // SuperAdmin en cours d'authentification déclencherait la sync métier.
    if (!authChecked) return;
    if (!userToken || isSuperAdmin) return;

    syncManager.initialize().catch(console.warn);
    const unsubscribe = syncManager.watchNetworkAndSync();
    return () => unsubscribe();
  }, [userToken, isSuperAdmin, authChecked]);

  return null;
}

/**
 * Enregistre l'appareil pour les notifications push distantes dès qu'un compte
 * MÉTIER est authentifié. Le SuperAdmin (online-only) n'a pas de push métier.
 */
function PushBootstrap() {
  const { userToken, isSuperAdmin, authChecked } = useAuth();

  useEffect(() => {
    if (!authChecked || !userToken || isSuperAdmin) return;
    registerDeviceForPush();
  }, [userToken, isSuperAdmin, authChecked]);

  return null;
}

function App() {
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  return (
    // GestureHandlerRootView + SafeAreaProvider à la RACINE : obligatoires pour
    // @react-navigation/drawer (react-native-gesture-handler / reanimated). En
    // Expo Go un fallback masque l'oubli ; dans un build EAS Android l'app
    // crashe au lancement sans eux.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <LanguageProvider>
            <ThemeProvider>
              <AuthProvider>
                <SyncManagerBootstrap />
                <PushBootstrap />
                <AppNavigator />
                <Toast />
              </AuthProvider>
            </ThemeProvider>
          </LanguageProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);
