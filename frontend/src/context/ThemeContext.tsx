import React, { createContext, useState, useEffect, useContext } from 'react';
import { useColorScheme } from 'react-native';
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
  primary: '#F9D760', // Keep primary yellow for brand consistency
};

const lightColors = { ...defaultTheme.colors };

export const ThemeContext = createContext({
  themeMode: 'auto' as ThemeMode,
  setThemeMode: (mode: ThemeMode) => {},
  isDarkMode: false,
  toggleDarkMode: (val: boolean) => {},
  notifications: true,
  toggleNotifications: (val?: boolean) => {},
  theme: {
    ...defaultTheme,
    colors: lightColors
  }
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('auto');
  const [notifications, setNotifications] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const savedMode = await AsyncStorage.getItem('themeMode') as ThemeMode | null;
      if (savedMode) setThemeModeState(savedMode);

      const notifVal = await AsyncStorage.getItem('notifications');
      if (notifVal !== null) setNotifications(notifVal === 'true');
      setMounted(true);
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
  
  if (!mounted) return null;

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
