import { BaseRepository } from './BaseRepository';

export type PreparedFeedInventory = {
  id: number;
  farm: number;
  lot: number | null;
  feed_name: string;
  quantity_kg: number;
  updated_at: string;
};

export class PreparedFeedInventoryRepository extends BaseRepository<PreparedFeedInventory> {
  constructor() {
    super('/prepared-feed-inventory/');
  }
}
