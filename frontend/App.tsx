import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import Toast from 'react-native-toast-message';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ThemeProvider } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { registerForPushNotificationsAsync } from './src/utils/notifications';
import { syncManager } from './src/utils/syncManager';

export default function App() {
  useEffect(() => {
    registerForPushNotificationsAsync();
    syncManager.initialize().catch(console.warn);
    const unsubscribe = syncManager.watchNetworkAndSync();
    return () => unsubscribe();
  }, []);

  return (
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppNavigator />
          <Toast />
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
