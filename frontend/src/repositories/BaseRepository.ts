import { ApiRepository } from './ApiRepository';
import { Repository } from './Repository';

export abstract class BaseRepository<T> implements Repository<T> {
  protected api = new ApiRepository();

  constructor(protected endpoint: string) {}

  async list(params: Record<string, any> = {}): Promise<T[]> {
    // 🔧 ApiRepository.get (et axios) attendent un AxiosRequestConfig avec une
    // clé `params`. Passer le filtre brut (ex: `{ sale: id }`) faisait que le
    // filtre était SILENCIEUX ignoré → la liste renvoyait TOUTES les lignes
    // (paiements de toutes les ventes mélangés), Online comme Offline.
    const res = await this.api.get<T[]>(this.endpoint, { params });
    return res.data as T[];
  }

  async get(id: number | string): Promise<T> {
    const res = await this.api.get<T>(`${this.endpoint}${id}/`);
    return res.data as T;
  }

  async create(payload: Partial<T>): Promise<T> {
    const res = await this.api.post<T>(this.endpoint, payload);
    return res.data as T;
  }

  async update(id: number | string, payload: Partial<T>): Promise<T> {
    const res = await this.api.put<T>(`${this.endpoint}${id}/`, payload);
    return res.data as T;
  }

  async patch(id: number | string, payload: Partial<T>): Promise<T> {
    const res = await this.api.patch<T>(`${this.endpoint}${id}/`, payload);
    return res.data as T;
  }

  async delete(id: number | string): Promise<void> {
    await this.api.delete<void>(`${this.endpoint}${id}/`);
  }
}
