import React, { createContext, useState, useEffect, useContext } from 'react';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import fr from '../i18n/fr';
import en from '../i18n/en';

type Language = 'fr' | 'en' | 'auto';
type Translations = typeof fr;

interface LanguageContextProps {
  language: Language;
  activeLanguage: 'fr' | 'en';
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

const translations: Record<string, Translations> = { fr, en };

export const LanguageContext = createContext<LanguageContextProps>({
  language: 'auto',
  activeLanguage: 'fr',
  setLanguage: () => {},
  t: (key: string) => key,
});

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguageState] = useState<Language>('auto');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const loadLanguage = async () => {
      const savedLang = await AsyncStorage.getItem('language') as Language | null;
      if (savedLang) setLanguageState(savedLang);
      setMounted(true);
    };
    loadLanguage();
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem('language', lang);
  };

  const getActiveLanguage = () => {
    if (language === 'auto') {
      const locales = getLocales();
      const systemLocale = locales && locales.length > 0 ? locales[0].languageCode : 'fr';
      return systemLocale === 'fr' ? 'fr' : 'en';
    }
    return language;
  };

  const t = (path: string, params?: Record<string, any>) => {
    const activeLang = getActiveLanguage();
    const keys = path.split('.');
    let result: any = translations[activeLang];

    for (const key of keys) {
      if (result && result[key]) {
        result = result[key];
      } else {
        return path;
      }
    }

    if (typeof result === 'string' && params) {
      Object.keys(params).forEach(key => {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), params[key]);
      });
    }

    return result;
  };

  if (!mounted) return null;

  const activeLanguage = getActiveLanguage();

  return (
    <LanguageContext.Provider value={{ language, activeLanguage, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => useContext(LanguageContext);
