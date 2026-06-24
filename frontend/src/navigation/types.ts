export type RootStackParamList = {
  Auth: undefined;
  RootDrawer: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type DrawerParamList = {
  MainTabs: undefined;
  Profile: undefined;
  Employees: undefined;
  Statistics: undefined;
  Settings: undefined;
  Help: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Farms: undefined;
  Finance: undefined;
  More: undefined;
};

export type FarmsStackParamList = {
  FarmsList: undefined;
  FarmDetail: { farmId: number, farmName: string };
  LotDetail: { farmId: number, lotId: number, lotName: string };
};
