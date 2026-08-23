import { BaseRepository } from './BaseRepository';

export type LotExpense = {
  id: number;
  lot: number;
  name: string;
  amount: number;
  created_at?: string;
  updated_at?: string;
};

export class LotExpenseRepository extends BaseRepository<LotExpense> {
  constructor() {
    super('/lot-expenses/');
  }

  async getByLot(lotId: number): Promise<LotExpense[]> {
    return this.list({ lot: lotId });
  }
}
