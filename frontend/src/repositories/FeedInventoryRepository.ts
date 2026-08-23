import { BaseRepository } from './BaseRepository';

export type FeedInventory = {
  id: number;
  farm: number;
  lot: number | null;
  feed_type: string;
  quantity_kg: number;
  updated_at: string;
};

export class FeedInventoryRepository extends BaseRepository<FeedInventory> {
  constructor() {
    super('/feed-inventory/');
  }
}
