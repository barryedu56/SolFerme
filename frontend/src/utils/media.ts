import { apiClient } from '../api/client';

/**
 * Constructs the full URL for a profile image, handling relative paths from the Django server.
 * It removes '/api' from the baseURL to get the root server URL.
 */
export const getProfileImageUrl = (path: string | null): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;

  const baseUrl = apiClient.defaults.baseURL?.replace('/api', '') || '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${baseUrl}${cleanPath}`;
};
