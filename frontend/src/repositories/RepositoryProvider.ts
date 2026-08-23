import { ApiRepository } from './ApiRepository';
import { EmployeeRepository } from './EmployeeRepository';
import { FarmRepository } from './FarmRepository';
import { SalePaymentsRepository } from './SalePaymentsRepository';
import { LotRepository } from './LotRepository';
import { LotExpenseRepository } from './LotExpenseRepository';
import { MovementRepository } from './MovementRepository';
import { ProductionRepository } from './ProductionRepository';
import { SalesRepository } from './SalesRepository';
import { UserRepository } from './UserRepository';
import { FeedInventoryRepository } from './FeedInventoryRepository';
import { PreparedFeedInventoryRepository } from './PreparedFeedInventoryRepository';
import { HealthInventoryRepository } from './HealthInventoryRepository';

export const repositoryProvider = {
  api: new ApiRepository(),
  employee: new EmployeeRepository(),
  farm: new FarmRepository(),
  lot: new LotRepository(),
  lotExpense: new LotExpenseRepository(),
  movement: new MovementRepository(),
  production: new ProductionRepository(),
  sale: new SalesRepository(),
  salePayments: new SalePaymentsRepository(),
  user: new UserRepository(),
  feedInventory: new FeedInventoryRepository(),
  preparedFeedInventory: new PreparedFeedInventoryRepository(),
  healthInventory: new HealthInventoryRepository(),
};
