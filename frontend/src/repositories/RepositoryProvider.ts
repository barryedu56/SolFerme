import { ApiRepository } from './ApiRepository';
import { EmployeeRepository } from './EmployeeRepository';
import { FarmRepository } from './FarmRepository';
import { SalePaymentsRepository } from './SalePaymentsRepository';
import { LotRepository } from './LotRepository';
import { MovementRepository } from './MovementRepository';
import { ProductionRepository } from './ProductionRepository';
import { SalesRepository } from './SalesRepository';

export const repositoryProvider = {
  api: new ApiRepository(),
  employee: new EmployeeRepository(),
  farm: new FarmRepository(),
  lot: new LotRepository(),
  movement: new MovementRepository(),
  production: new ProductionRepository(),
  sale: new SalesRepository(),
  salePayments: new SalePaymentsRepository(),
};
