import React, { createContext, useState, useEffect, useContext } from 'react';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import fr from '../i18n/fr';
import en from '../i18n/en';

type Language = 'fr' | 'en' | 'auto';
type Translations = Record<string, any>;
type TranslationParams = Record<string, string | number | boolean | null | undefined>;

interface LanguageContextProps {
  language: Language;
  activeLanguage: 'fr' | 'en';
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: TranslationParams, fallback?: string) => string;
}

const translations: Record<string, Translations> = { fr, en };
const fallbackMessage = {
  fr: 'Texte indisponible',
  en: 'Text unavailable',
};

const getTranslationValue = (dictionary: any, path: string) => {
  const keys = path.split('.');
  let current: any = dictionary;

  for (const key of keys) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }

  return current;
};

const formatTranslation = (value: string, params?: TranslationParams) => {
  if (!params) return value;

  return Object.entries(params).reduce((result, [key, paramValue]) => {
    const replacement = paramValue == null ? '' : String(paramValue);
    return result
      .replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), replacement)
      .replace(new RegExp(`\\{${key}\\}`, 'g'), replacement);
  }, value);
};

export const LanguageContext = createContext<LanguageContextProps>({
  language: 'auto',
  activeLanguage: 'fr',
  setLanguage: () => {},
  t: (key: string, params?: TranslationParams, fallback?: string) => {
    const lang = 'fr';
    const value = getTranslationValue(translations[lang], key);
    return formatTranslation(typeof value === 'string' ? value : fallback ?? fallbackMessage[lang], params);
  },
});

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguageState] = useState<Language>('auto');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const loadLanguage = async () => {
      const savedLang = (await AsyncStorage.getItem('language')) as Language | null;
      if (savedLang && (savedLang === 'fr' || savedLang === 'en' || savedLang === 'auto')) {
        setLanguageState(savedLang);
      }
      setMounted(true);
    };
    loadLanguage();
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem('language', lang);
  };

  const getActiveLanguage = (): 'fr' | 'en' => {
    if (language === 'auto') {
      const locales = getLocales();
      const systemLocale = locales && locales.length > 0 ? locales[0].languageCode : 'fr';
      return systemLocale === 'fr' ? 'fr' : 'en';
    }
    return language === 'fr' ? 'fr' : 'en';
  };

  const t = (path: string, params?: TranslationParams, fallback?: string) => {
    const activeLang = getActiveLanguage();
    const primary = getTranslationValue(translations[activeLang], path);
    const altLang = activeLang === 'fr' ? 'en' : 'fr';
    const altValue = getTranslationValue(translations[altLang], path);
    const resolved = typeof primary === 'string' ? primary : typeof altValue === 'string' ? altValue : fallback ?? fallbackMessage[activeLang];

    if (typeof resolved !== 'string') {
      return fallback ?? fallbackMessage[activeLang];
    }

    return formatTranslation(resolved, params);
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
