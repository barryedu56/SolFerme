import { BaseRepository } from './BaseRepository';

export type Movement = {
  id: number;
  lot: number;
  type: string;
  quantity: number;
  date: string;
  reason: string | null;
  status: string;
  sale_id: number | null;
  created_by_id: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export class MovementRepository extends BaseRepository<Movement> {
  constructor() {
    super('/movements/');
  }
}
