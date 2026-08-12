export interface Repository<T> {
  list(params?: Record<string, any>): Promise<T[]>;
  get(id: number | string): Promise<T>;
  create(payload: Partial<T>): Promise<T>;
  update(id: number | string, payload: Partial<T>): Promise<T>;
  delete(id: number | string): Promise<void>;
}
