import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';

// API URL configurable via AsyncStorage, avec fallback automatique
// Priorité : 1) URL stockée (configureApiUrl)  2) URL configurée persistée
//           3) Détection Expo dev (hostUri)    4) Détection plateforme
//           5) Fallback par défaut
let _configuredApiUrl: string | null = null;
const DEFAULT_API_URL = 'http://192.168.1.141:8000/api';

const detectLocalUrl = (): string => {
  // 1. Extra config from app.config.js (EXPO_PUBLIC_API_URL)
  if (Constants.expoConfig?.extra?.apiUrl) {
    return Constants.expoConfig.extra.apiUrl;
  }

  // 2. En développement Expo, utiliser l'IP du poste de développement
  const debuggerHost = Constants.expoConfig?.hostUri;
  if (debuggerHost) {
    const ip = debuggerHost.split(':')[0];
    return `http://${ip}:8000/api`;
  }

  // 3. Fallback selon la plateforme
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `http://${window.location.hostname}:8000/api`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000/api';
  }
  return 'http://localhost:8000/api';
};

const AUTO_DETECTED_URL = detectLocalUrl();

export const configureApiUrl = async (url: string): Promise<void> => {
  _configuredApiUrl = url;
  await AsyncStorage.setItem('api_base_url', url);
  apiClient.defaults.baseURL = url;
};

export const getApiUrl = async (): Promise<string> => {
  if (_configuredApiUrl) return _configuredApiUrl;
  try {
    const stored = await AsyncStorage.getItem('api_base_url');
    if (stored) {
      // Auto-correction : Si le Web a gardé l'URL Android en cache, on l'ignore
      if (Platform.OS === 'web' && stored.includes('10.0.2.2')) {
        await AsyncStorage.removeItem('api_base_url');
      } else {
        _configuredApiUrl = stored;
        return stored;
      }
    }
  } catch {
    // AsyncStorage peut échouer, on continue
  }
  return AUTO_DETECTED_URL;
};

// Initialisation asynchrone de la baseURL
const initApiUrl = async (): Promise<string> => {
  const url = await getApiUrl();
  apiClient.defaults.baseURL = url;
  return url;
};

// URL initiale (sera mise à jour par initApiUrl au premier usage)
let API_URL = DEFAULT_API_URL;

export const apiClient = axios.create({
  baseURL: API_URL, // Sera mis à jour par initApiUrl() au démarrage
  headers: {
    'Content-Type': 'application/json',
  },
});

// Initialiser l'URL au chargement du module
initApiUrl().catch(() => {
  // Silencieux — utilise le fallback DEFAULT_API_URL
});

// Le frontend parle « ACTIF » partout ; le backend utilise « ACTIVE » pour la
// plupart des modèles transactionnels (Production, Sale, Feed…) → on traduit.
// EXCEPTION : Farm, Lot et Employee utilisent « ACTIF » côté backend aussi.
// Convertir leur statut en « ACTIVE » les casse (« "ACTIVE" is not a valid
// choice » à la création / édition / synchro d'un lot créé hors-ligne).
const ACTIF_NATIVE_ENDPOINT = /\/(farms|lots|employees)(\/|$|\?)/;

const normalizeStatusToBackend = (data: any): any => {
  if (data === null || data === undefined) return data;
  // Ne pas transformer les FormData
  if (data instanceof FormData) return data;
  if (Array.isArray(data)) return data.map(normalizeStatusToBackend);
  if (typeof data === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === 'status' && typeof v === 'string' && v.toUpperCase() === 'ACTIF') {
        out[k] = 'ACTIVE';
      } else {
        out[k] = normalizeStatusToBackend(v);
      }
    }
    return out;
  }
  return data;
};

apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.data && !ACTIF_NATIVE_ENDPOINT.test(config.url || '')) {
      config.data = normalizeStatusToBackend(config.data);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Callback appelé quand la session expire (refresh token échoué)
let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (handler: (() => void) | null) => {
  onSessionExpired = handler;
};

// Supprime uniquement les données d'authentification, PAS la config API
export const clearAuthData = async (): Promise<void> => {
  const keysToRemove = ['access_token', 'refresh_token', 'user_role', 'user_name', 'user_image', 'user_farms', 'user_id'];
  await Promise.all(keysToRemove.map(k => AsyncStorage.removeItem(k).catch(() => {})));
};

// Verrou global pour éviter que plusieurs requêtes 401 déclenchent
// un refresh simultané (race condition avec ROTATE_REFRESH_TOKENS).
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

// Cache mémoire du refresh token pour éviter les lectures AsyncStorage
// concurrentes qui peuvent retourner l'ancien token pendant une rotation.
// Mis à jour par AuthContext.login() et par chaque refresh réussi.
let _cachedRefreshToken: string | null = null;

/** Appelé par AuthContext après login pour initialiser le cache mémoire */
export const setCachedRefreshToken = (token: string | null): void => {
  _cachedRefreshToken = token;
};

const getRefreshToken = async (): Promise<string | null> => {
  // Priorité au cache mémoire (atomique pour cette session, pas de stale read)
  if (_cachedRefreshToken) return _cachedRefreshToken;
  // Fallback AsyncStorage (premier chargement après restart de l'app)
  const stored = await AsyncStorage.getItem('refresh_token');
  if (stored) {
    _cachedRefreshToken = stored;
    return stored;
  }
  return null;
};

const processFailedQueue = (error: any, token: string | null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
};

const normalizeStatusInPayload = (data: any): any => {
  if (data === null || data === undefined) return data;
  if (data instanceof Blob || data instanceof ArrayBuffer) return data;
  if (Array.isArray(data)) return data.map(normalizeStatusInPayload);
  if (typeof data === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === 'status' && typeof v === 'string' && v.toUpperCase() === 'ACTIVE') {
        out[k] = 'ACTIF';
      } else {
        out[k] = normalizeStatusInPayload(v);
      }
    }
    return out;
  }
  return data;
};

apiClient.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = normalizeStatusInPayload(response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 429) {
      const waitTime = error.response.headers['retry-after'] || 'quelques';
      Alert.alert("Trop de tentatives", `Veuillez patienter ${waitTime} secondes.`);
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/login/')) return Promise.reject(error);

      // Si un refresh est déjà en cours, mettre en file d'attente
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return apiClient(originalRequest);
        }).catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Petit délai pour laisser AsyncStorage se stabiliser si une autre opération
        // vient de mettre à jour le token
        await new Promise(r => setTimeout(r, 100));
        const refreshToken = await getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token');
        const baseUrl = apiClient.defaults.baseURL || API_URL;
        const response = await axios.post(`${baseUrl}/auth/refresh/`, { refresh: refreshToken });
        const { access, refresh } = response.data;
        await AsyncStorage.setItem('access_token', access);
        if (refresh) {
          await AsyncStorage.setItem('refresh_token', refresh);
          // Mettre à jour le cache mémoire AVANT de résoudre la queue
          _cachedRefreshToken = refresh;
        }
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${access}`;
        originalRequest.headers['Authorization'] = `Bearer ${access}`;
        // Résoudre toutes les requêtes en attente avec le nouveau token
        processFailedQueue(null, access);
        isRefreshing = false;
        return apiClient(originalRequest);
      } catch (refreshError) {
        _cachedRefreshToken = null;
        processFailedQueue(refreshError, null);
        isRefreshing = false;
        // Correction: nettoyer auth ET notifier AuthContext pour synchroniser l'état React
        await clearAuthData();
        if (onSessionExpired) {
          onSessionExpired();
        }
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export const fetchAll = async (url: string): Promise<any[]> => {
  let results: any[] = [];
  let nextUrl = url;
  try {
    while (nextUrl) {
      const response = await apiClient.get(nextUrl);
      if (Array.isArray(response.data)) {
        results = [...results, ...response.data];
        nextUrl = '';
      } else if (response.data && response.data.results) {
        results = [...results, ...response.data.results];
        nextUrl = response.data.next;
      } else {
        nextUrl = '';
      }
    }
    return results;
  } catch (error) {
    console.error(`Error in fetchAll for ${url}:`, error);
    throw error;
  }
};
