import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, clearAuthData, setSessionExpiredHandler, setCachedRefreshToken } from '../api/client';
import { resetDatabaseHandle, wipeAllLocalTables } from '../database/localDatabase';
import { syncManager } from '../utils/syncManager';

interface AuthContextType {
  userToken: string | null;
  userRole: string | null;
  userName: string | null;
  userImage: string | null;
  userFarms: any[] | null;
  userId: number | null;
  isLoading: boolean;
  login: (access: string, refresh: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userImage, setUserImage] = useState<string | null>(null);
  const [userFarms, setUserFarms] = useState<any[] | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredData();
  }, []);

  // Enregistre un handler pour synchroniser l'état React quand le refresh token échoue
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUserToken(null);
      setUserRole(null);
      setUserName(null);
      setUserImage(null);
      setUserFarms(null);
      setUserId(null);
      setCachedRefreshToken(null);
      // 🔧 NE PAS vider la base locale ici : les modifications offline (sync_queue +
      // lignes locales en attente de push) seraient DÉTRUITES avant d'avoir pu être
      // synchronisées. Une session expirée après une période hors-ligne ne doit pas
      // faire perdre le travail effectué hors-ligne : au prochain login, syncAll()
      // repousse ces opérations (pushPendingOperations) vers le backend.
      resetDatabaseHandle();
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const loadStoredData = async () => {
    try {
      const token = await AsyncStorage.getItem('access_token');
      const role = await AsyncStorage.getItem('user_role');
      const name = await AsyncStorage.getItem('user_name');
      const image = await AsyncStorage.getItem('user_image');
      const farmsStr = await AsyncStorage.getItem('user_farms');
      const userIdStr = await AsyncStorage.getItem('user_id');
      setUserToken(token);
      setUserRole(role);
      setUserName(name);
      setUserImage(image);
      if (farmsStr) setUserFarms(JSON.parse(farmsStr));
      if (userIdStr) setUserId(parseInt(userIdStr, 10));

      if (token) {
        updateUser();
      }
    } catch (e) {
      console.error('Failed to load auth data', e);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (access: string, refresh: string) => {
    setIsLoading(true);
    await AsyncStorage.setItem('access_token', access);
    await AsyncStorage.setItem('refresh_token', refresh);
    setCachedRefreshToken(refresh); // Cache mémoire pour éviter les stale reads pendant rotation

    try {
      const userRes = await apiClient.get('/auth/user/');
      const { id, role, name, profile_image, farms } = userRes.data;

      await AsyncStorage.setItem('user_role', role);
      await AsyncStorage.setItem('user_name', name || 'Utilisateur');
      await AsyncStorage.setItem('user_id', String(id));
      if (profile_image) await AsyncStorage.setItem('user_image', profile_image);
      if (farms) await AsyncStorage.setItem('user_farms', JSON.stringify(farms));

      setUserToken(access);
      setUserId(id);
      setUserRole(role);
      setUserName(name || 'Utilisateur');
      setUserImage(profile_image || null);
      setUserFarms(farms || null);

      // 🔧 Déclencher le pull initial des données vers SQLite pour que le mode offline
      // ait toutes les données disponibles immédiatement après le login.
      // Exécuté en background — ne bloque pas l'UI.
      syncManager.syncAfterLogin().catch((e: any) =>
        console.warn('[Auth] syncAfterLogin failed:', e?.message)
      );

      // Initialiser la DB locale (crée les tables si nécessaire)
      syncManager.initialize().catch((e: any) =>
        console.warn('[Auth] syncManager.initialize failed:', e?.message)
      );
    } catch (error) {
      console.error('Error fetching user info after login', error);
      // Even if user info fetch fails, we have the token
      setUserToken(access);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      const refreshToken = await AsyncStorage.getItem('refresh_token');
      if (refreshToken) {
        await apiClient.post('/auth/logout/', { refresh_token: refreshToken });
      }
    } catch (error) {
      console.error('Error during backend logout', error);
    } finally {
      setCachedRefreshToken(null);
      await clearAuthData();
      await wipeAllLocalTables().catch(() => {});
      await resetDatabaseHandle();
      setUserToken(null);
      setUserRole(null);
      setUserName(null);
      setUserImage(null);
      setUserFarms(null);
      setUserId(null);
      setIsLoading(false);
    }
  };

  const updateUser = async () => {
    try {
      const userRes = await apiClient.get('/auth/user/');
      const { id, role, name, profile_image, farms } = userRes.data;

      await AsyncStorage.setItem('user_role', role);
      await AsyncStorage.setItem('user_name', name || 'Utilisateur');
      if (id) await AsyncStorage.setItem('user_id', String(id));
      if (profile_image) {
        await AsyncStorage.setItem('user_image', profile_image);
      } else {
        await AsyncStorage.removeItem('user_image');
      }
      if (farms) {
        await AsyncStorage.setItem('user_farms', JSON.stringify(farms));
      }

      if (id) setUserId(id);
      setUserRole(role);
      setUserName(name || 'Utilisateur');
      setUserImage(profile_image || null);
      setUserFarms(farms || null);
    } catch (error) {
      console.error('Error updating user info', error);
    }
  };

  return (
    <AuthContext.Provider value={{ userToken, userRole, userName, userImage, userFarms, userId, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
