import { BaseRepository } from './BaseRepository';

export type HealthInventory = {
  id: number;
  farm: number;
  lot: number | null;
  product_name: string;
  product_type: string;
  quantity: number;
  unit: string;
  updated_at: string;
};

export class HealthInventoryRepository extends BaseRepository<HealthInventory> {
  constructor() {
    super('/health-inventory/');
  }
}
