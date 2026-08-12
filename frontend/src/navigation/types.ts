// ===== PARAMÈTRES DE NAVIGATION SOLFERME =====
// Généré à partir de AppNavigator.tsx — doit rester synchronisé avec les enregistrements de routes.

export type RootStackParamList = {
  Auth: undefined;
  RootDrawer: undefined;
  TransactionsHistory: { lotId?: number; farmId?: number } | undefined;
  AddExpense: { farmId?: number } | undefined;
  Purchase: { type?: 'feed' | 'health'; farmId?: number; lotId?: number } | undefined;
  HealthAlertDetail: { alert: any } | undefined;
  Inventory: { lotId?: number; farmId?: number } | undefined;
  AttendanceHistory: { employeeId?: number } | undefined;
  EmployeeRequests: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type DrawerParamList = {
  MainTabs: undefined;
  Reminders: undefined;
  Profile: undefined;
  Tasks: undefined;
  Attendance: undefined;
  Payroll: undefined;
  Requests: undefined;
  Statistics: undefined;
  Employees: { screen?: string; params?: any } | undefined;
  GlobalHistory: undefined;
  Database: undefined;
  Settings: undefined;
  Help: undefined;
  ActionReminder: { lotId?: number; farmId?: number } | undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Farms: undefined;
  Finance: undefined;
  Plus: undefined;   // Propriétaire — ouvre le Drawer
  Activités: undefined; // Employé — ouvre le Drawer
};

export type FarmsStackParamList = {
  FarmsList: undefined;
  CreateFarm: { farm?: any } | undefined;
  FarmDetail: { farmId: number; farmName: string };
  CreateLot: { farmId: number; farmName: string; lot?: any } | undefined;
  LotDetail: { farmId: number; lotId: number; lotName: string; activeTab?: string };
  ActionProduction: { lotId: number; lotName: string; lotPurchaseDate?: string; item?: any };
  ProductionConvert: { lotId: number; lotName: string; production: any };
  ActionVente: { lotId: number; lotName: string; lotPurchaseDate?: string; item?: any };
  ActionVentePoules: { lotId: number; lotName: string; lotPurchaseDate?: string; currentQuantity?: number; item?: any };
  ActionAlimentation: { lotId: number; lotName: string; farmId: number; lotPurchaseDate?: string; item?: any; activeTab?: string };
  ActionSante: { lotId: number; lotName: string; farmId: number; lotPurchaseDate?: string; item?: any; activeTab?: string };
  ActionPreparation: { lotId: number; farmId: number; lotName?: string };
  ActionMouvement: { lotId: number; lotName: string; lotPurchaseDate?: string; item?: any };
  ActionEtatPoules: { lotId: number; lotName: string };
  ActionReminder: { lotId?: number; farmId?: number };
  LotHistory: { lotId: number; lotName: string };
};

export type EmployeesStackParamList = {
  EmployeesList: undefined;
  CreateEmployee: { employeeId?: number } | undefined;
  EmployeeDetail: { employeeId: number };
  EditEmployee: { employee: any };
  Attendance: { employeeId?: number };
  AttendanceHistory: { employeeId?: number };
  Payroll: { employee?: any; initialMonth?: string };
  CreatePayroll: { employee?: any; initialMonth?: string };
  CreateBonus: { employee?: any };
  Tasks: { employeeId?: number } | undefined;
  CreateTask: { employeeId?: number } | undefined;
};