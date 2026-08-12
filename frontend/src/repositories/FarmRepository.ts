import { BaseRepository } from './BaseRepository';

export type Farm = {
  id: number;
  owner: number;
  name: string;
  location: string | null;
  description: string | null;
  status: string;
  has_data: boolean;
  created_at: string;
  updated_at: string;
};

export class FarmRepository extends BaseRepository<Farm> {
  constructor() {
    super('/farms/');
  }

  async archive(id: number | string): Promise<void> {
    await this.api.post<void>(`/farms/${id}/archive/`);
  }

  async reactivate(id: number | string): Promise<void> {
    await this.api.post<void>(`/farms/${id}/reactivate/`);
  }
}
