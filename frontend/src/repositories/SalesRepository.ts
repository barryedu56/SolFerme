import { BaseRepository } from './BaseRepository';
import { SalePayment } from './SalePaymentsRepository';

export type Sale = {
  id: number;
  lot: number;
  date: string;
  product_type: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  amount_paid: number;
  customer_name: string | null;
  customer_phone: string | null;
  note: string | null;
  status: string;
  payment_status: string;
  payments?: SalePayment[];
  created_by_id: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export class SalesRepository extends BaseRepository<Sale> {
  constructor() {
    super('/sales/');
  }
}
