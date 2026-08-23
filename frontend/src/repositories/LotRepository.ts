import { BaseRepository } from './BaseRepository';

export type Lot = {
  id: number;
  farm: number;
  name: string;
  breed: string;
  initial_quantity: number;
  current_quantity: number;
  purchase_date: string;
  purchase_price: number;
  supplier: string | null;
  status: string;
  motif_fin: string | null;
  current_eggs_stock: number;
  current_broken_eggs_stock: number;
  total_casiers_produits: number;
  has_data: boolean;
  created_at: string;
  updated_at: string;
};

export class LotRepository extends BaseRepository<Lot> {
  constructor() {
    super('/lots/');
  }

  async archive(id: number | string): Promise<void> {
    await this.api.post<void>(`${this.endpoint}${id}/archive/`);
  }
}
