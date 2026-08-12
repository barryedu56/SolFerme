import { BaseRepository } from './BaseRepository';

export type Employee = {
  id: number;
  user: number;
  user_name: string | null;
  user_email: string | null;
  farm: number;
  farm_name: string | null;
  position: string;
  salary: number;
  payment_frequency: string;
  address: string | null;
  hired_at: string | null;
  status: string;
  bonus_total: number;
  estimated_total: number;
  lots_json: string | null;
  last_bonus_json: string | null;
  created_at: string;
  updated_at: string;
};

export class EmployeeRepository extends BaseRepository<Employee> {
  constructor() {
    super('/employees/');
  }
}
