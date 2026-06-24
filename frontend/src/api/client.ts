import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import Constants from 'expo-constants';

let API_URL = 'http://127.0.0.1:8000/api'; // IP par défaut

// En environnement de développement Expo, on récupère l'IP dynamique de l'ordinateur
const debuggerHost = Constants.expoConfig?.hostUri;
if (debuggerHost) {
  // hostUri ressemble à "192.168.1.103:8081", on extrait juste l'IP
  const ip = debuggerHost.split(':')[0];
  API_URL = `http://${ip}:8000/api`;
}

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Log détaillé pour le débogage des erreurs 403/401
    // On ignore les 403 sur les logs d'activité, rappels et ventes qui peuvent être restreints selon le rôle
    const isOptionalEndpoint = originalRequest.url?.includes('activity-logs') ||
                               originalRequest.url?.includes('reminders') ||
                               originalRequest.url?.includes('movements') ||
                               originalRequest.url?.includes('payrolls') ||
                               originalRequest.url?.includes('employees/me') ||
                               originalRequest.url?.includes('sales');

    if (error.response && !(error.response.status === 403 && isOptionalEndpoint)) {
      console.log(`[API Error] ${error.response.status} on ${originalRequest.url}`, error.response.data);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await AsyncStorage.getItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const response = await axios.post(`${API_URL}/auth/refresh/`, {
          refresh: refreshToken,
        });

        const { access } = response.data;
        await AsyncStorage.setItem('access_token', access);

        apiClient.defaults.headers.common['Authorization'] = `Bearer ${access}`;
        originalRequest.headers['Authorization'] = `Bearer ${access}`;

        return apiClient(originalRequest);
      } catch (refreshError) {
        // Si le refresh échoue, on peut forcer la déconnexion
        console.error('Token refresh failed', refreshError);
        await AsyncStorage.clear();
        // Optionnel : rediriger vers le login ou laisser le context réagir à la perte du token
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Utility to fetch all pages of a paginated DRF endpoint
 */
export const fetchAll = async (url: string): Promise<any[]> => {
  let results: any[] = [];
  let nextUrl = url;

  try {
    while (nextUrl) {
      // We use the full URL if it's already an absolute URL (from 'next'),
      // otherwise axios uses the baseURL
      const response = await apiClient.get(nextUrl);

      if (Array.isArray(response.data)) {
        results = [...results, ...response.data];
        nextUrl = ''; // Not paginated
      } else if (response.data && response.data.results) {
        results = [...results, ...response.data.results];
        nextUrl = response.data.next; // DRF pagination provides the full URL for the next page

        // If nextUrl is absolute, we need to handle it carefully because apiClient has a baseURL.
        // Axios handles absolute URLs in 'get' by ignoring baseURL.
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
