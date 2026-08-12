import { BaseRepository } from './BaseRepository';

export type Production = {
  id: number;
  lot: number;
  date: string;
  casiers_produits: number;
  casiers_vendables: number;
  oeufs_casses: number;
  note: string | null;
  status: string;
  created_by_id: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export class ProductionRepository extends BaseRepository<Production> {
  constructor() {
    super('/productions/');
  }
}
