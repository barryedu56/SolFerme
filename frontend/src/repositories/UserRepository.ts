import { BaseRepository } from './BaseRepository';

export type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  created_at?: string;
  updated_at?: string;
};

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('/users/');
  }
}
