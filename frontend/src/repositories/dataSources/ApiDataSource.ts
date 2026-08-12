import { apiClient } from '../../api/client';
import { IDataSource } from './IDataSource';

export class ApiDataSource implements IDataSource {
  public client = apiClient;

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const response = await this.client.get(endpoint, { params });
    return response.data;
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await apiClient.post(endpoint, body);
    return response.data;
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await apiClient.put(endpoint, body);
    return response.data;
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await apiClient.patch(endpoint, body);
    return response.data;
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await apiClient.delete(endpoint);
    return response.data;
  }
}
