import React, { createContext, useState, useEffect, useContext } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme as defaultTheme } from '../theme';

export type ThemeMode = 'light' | 'dark' | 'auto';

const darkColors = {
  ...defaultTheme.colors,
  background: '#121212',
  surface: '#1E1E1E',
  text: '#FFFFFF',
  textSecondary: '#AAAAAA',
  border: '#333333',
  inputBackground: '#2C2C2C',
  primary: '#F9D760',
};

const lightColors = { ...defaultTheme.colors };

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isDarkMode: boolean;
  toggleDarkMode: (val: boolean) => void;
  notifications: boolean;
  toggleNotifications: (val?: boolean) => void;
  theme: typeof defaultTheme;
}

export const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'auto',
  setThemeMode: () => {},
  isDarkMode: false,
  toggleDarkMode: () => {},
  notifications: true,
  toggleNotifications: () => {},
  theme: defaultTheme
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('auto');
  const [notifications, setNotifications] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedMode = await AsyncStorage.getItem('themeMode') as ThemeMode | null;
        if (savedMode) setThemeModeState(savedMode);

        const notifVal = await AsyncStorage.getItem('notifications');
        if (notifVal !== null) setNotifications(notifVal === 'true');
      } catch (e) {
        console.error("Failed to load theme settings", e);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem('themeMode', mode);
  };

  const toggleDarkMode = (val: boolean) => {
    setThemeMode(val ? 'dark' : 'light');
  };

  const toggleNotifications = (val?: boolean) => {
    const newVal = val !== undefined ? val : !notifications;
    setNotifications(newVal);
    AsyncStorage.setItem('notifications', String(newVal));
  };

  const isDarkMode = themeMode === 'auto'
    ? systemColorScheme === 'dark'
    : themeMode === 'dark';

  const currentTheme = {
    ...defaultTheme,
    colors: isDarkMode ? darkColors : lightColors
  };

  // Ne pas bloquer le rendu complètement si possible, ou afficher un loader
  if (loading) return null;

  return (
    <ThemeContext.Provider value={{
      themeMode,
      setThemeMode,
      isDarkMode,
      toggleDarkMode,
      notifications,
      toggleNotifications,
      theme: currentTheme
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
