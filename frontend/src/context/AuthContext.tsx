import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

interface AuthContextType {
  userToken: string | null;
  userRole: string | null;
  userName: string | null;
  userImage: string | null;
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredData();
  }, []);

  const loadStoredData = async () => {
    try {
      const token = await AsyncStorage.getItem('access_token');
      const role = await AsyncStorage.getItem('user_role');
      const name = await AsyncStorage.getItem('user_name');
      const image = await AsyncStorage.getItem('user_image');
      setUserToken(token);
      setUserRole(role);
      setUserName(name);
      setUserImage(image);
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

    try {
      const userRes = await apiClient.get('/auth/user/');
      const { role, name, profile_image } = userRes.data;

      await AsyncStorage.setItem('user_role', role);
      await AsyncStorage.setItem('user_name', name || 'Utilisateur');
      if (profile_image) await AsyncStorage.setItem('user_image', profile_image);

      setUserToken(access);
      setUserRole(role);
      setUserName(name || 'Utilisateur');
      setUserImage(profile_image || null);
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
    await AsyncStorage.clear();
    setUserToken(null);
    setUserRole(null);
    setUserName(null);
    setUserImage(null);
    setIsLoading(false);
  };

  const updateUser = async () => {
    try {
      const userRes = await apiClient.get('/auth/user/');
      const { role, name, profile_image } = userRes.data;

      await AsyncStorage.setItem('user_role', role);
      await AsyncStorage.setItem('user_name', name || 'Utilisateur');
      if (profile_image) {
        await AsyncStorage.setItem('user_image', profile_image);
      } else {
        await AsyncStorage.removeItem('user_image');
      }

      setUserRole(role);
      setUserName(name || 'Utilisateur');
      setUserImage(profile_image || null);
    } catch (error) {
      console.error('Error updating user info', error);
    }
  };

  return (
    <AuthContext.Provider value={{ userToken, userRole, userName, userImage, isLoading, login, logout, updateUser }}>
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
