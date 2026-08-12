import { BaseRepository } from './BaseRepository';

export type SalePayment = {
  id: number;
  sale: number;
  farm: number;
  lot: number;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference: string | null;
  note: string | null;
  status: string;
  created_by_id: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export class SalePaymentsRepository extends BaseRepository<SalePayment> {
  constructor() {
    super('/sale-payments/');
  }
}
