import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList, DrawerItem } from '@react-navigation/drawer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

import { WelcomeScreen } from '../screens/WelcomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { FarmsScreen } from '../screens/FarmsScreen';
import { FarmDetailScreen } from '../screens/FarmDetailScreen';
import { CreateFarmScreen } from '../screens/CreateFarmScreen';
import { CreateLotScreen } from '../screens/CreateLotScreen';
import { LotDetailScreen } from '../screens/LotDetailScreen';
import { EmployeesScreen } from '../screens/EmployeesScreen';
import { CreateEmployeeScreen } from '../screens/CreateEmployeeScreen';
import { EmployeeDetailScreen } from '../screens/EmployeeDetailScreen';
import { EditEmployeeScreen } from '../screens/EditEmployeeScreen';
import { FinanceScreen } from '../screens/FinanceScreen';
import { StatisticsScreen } from '../screens/StatisticsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { EmployeeProfileScreen } from '../screens/EmployeeProfileScreen';
import { EmployeeDashboardScreen } from '../screens/EmployeeDashboardScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { CreateTaskScreen } from '../screens/CreateTaskScreen';
import { DatabaseMgtScreen } from '../screens/DatabaseMgtScreen';
import { LotHistoryScreen } from '../screens/LotHistoryScreen';
import { TransactionsHistoryScreen } from '../screens/TransactionsHistoryScreen';
import { AttendanceScreen } from '../screens/AttendanceScreen';
import { AttendanceHistoryScreen } from '../screens/AttendanceHistoryScreen';
import { PayrollScreen } from '../screens/PayrollScreen';
import { CreatePayrollScreen } from '../screens/CreatePayrollScreen';
import { CreateBonusScreen } from '../screens/CreateBonusScreen';
import { ActionProductionScreen } from '../screens/actions/ProductionScreen';
import { ProductionConvertScreen } from '../screens/actions/ProductionConvertScreen';
import { ActionVenteScreen } from '../screens/actions/VenteScreen';
import { ActionVentePoulesScreen } from '../screens/actions/ActionVentePoules';
import { ActionAlimentationScreen } from '../screens/actions/AlimentationScreen';
import { ActionSanteScreen } from '../screens/actions/SanteScreen';
import { ActionMouvementScreen } from '../screens/actions/MouvementScreen';
import { ActionEtatPoulesScreen } from '../screens/actions/EtatPoulesScreen';
import { PurchaseScreen } from '../screens/actions/PurchaseScreen';
import { RemindersScreen } from '../screens/RemindersScreen';
import { ActionReminderScreen } from '../screens/actions/ReminderScreen';
import { AddExpenseScreen } from '../screens/actions/AddExpenseScreen';
import { PreparationScreen } from '../screens/actions/PreparationScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { HelpScreen } from '../screens/HelpScreen';
import { GlobalHistoryScreen } from '../screens/GlobalHistoryScreen';
import { HealthAlertDetailScreen } from '../screens/HealthAlertDetailScreen';
import { InventoryScreen } from '../screens/InventoryScreen';
import { EmployeeRequestsScreen } from '../screens/EmployeeRequestsScreen';
import { EmployeePayrollScreen } from '../screens/EmployeePayrollScreen';

import { View, Text, StyleSheet, Image } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';

const Stack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();
const FarmsStack = createNativeStackNavigator();
const EmployeesStack = createNativeStackNavigator();

function EmployeesNavigator() {
  return (
    <EmployeesStack.Navigator screenOptions={{ headerShown: false }}>
      <EmployeesStack.Screen name="EmployeesList" component={EmployeesScreen} />
      <EmployeesStack.Screen name="CreateEmployee" component={CreateEmployeeScreen} />
      <EmployeesStack.Screen name="EmployeeDetail" component={EmployeeDetailScreen} />
      <EmployeesStack.Screen name="EditEmployee" component={EditEmployeeScreen} />
      <EmployeesStack.Screen name="Attendance" component={AttendanceScreen} />
      <EmployeesStack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} />
      <EmployeesStack.Screen name="Payroll" component={PayrollScreen} />
      <EmployeesStack.Screen name="CreatePayroll" component={CreatePayrollScreen} />
      <EmployeesStack.Screen name="CreateBonus" component={CreateBonusScreen} />
      <EmployeesStack.Screen name="Tasks" component={TasksScreen} />
      <EmployeesStack.Screen name="CreateTask" component={CreateTaskScreen} />
    </EmployeesStack.Navigator>
  );
}

function CustomDrawerContent({ userRole, ...props }: any) {
  const { userName, userImage, logout } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: theme.colors.surface }}>
      <View style={[styles.drawerHeader, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.avatarCircle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]}>
          {userImage ? (
            <Image source={{ uri: userImage }} style={styles.drawerAvatar} />
          ) : (
            <MaterialIcons name="person" size={40} color={theme.colors.primary} />
          )}
        </View>
        <Text style={[styles.userName, { color: theme.colors.text }]}>{userName || t('common.anonymous')}</Text>
        <Text style={[styles.userRole, { color: theme.colors.textSecondary }]}>{userRole === 'EMPLOYE' ? t('profile.employee') : t('profile.owner')}</Text>
      </View>
      <DrawerItemList {...props} />

      <View style={[styles.drawerDivider, { backgroundColor: theme.colors.border }]} />
      <DrawerItem
        label={t('common.logout')}
        onPress={async () => {
          await logout();
        }}
        icon={({ color, size }) => <MaterialIcons name="logout" color={theme.colors.danger} size={size} />}
        labelStyle={{ color: theme.colors.danger, fontWeight: 'bold' }}
      />
    </DrawerContentScrollView>
  );
}

function FarmsNavigator() {
  return (
    <FarmsStack.Navigator screenOptions={{ headerShown: false }}>
      <FarmsStack.Screen name="FarmsList" component={FarmsScreen} />
      <FarmsStack.Screen name="CreateFarm" component={CreateFarmScreen} />
      <FarmsStack.Screen name="FarmDetail" component={FarmDetailScreen} />
      <FarmsStack.Screen name="CreateLot" component={CreateLotScreen} />
      <FarmsStack.Screen name="LotDetail" component={LotDetailScreen} />
      <FarmsStack.Screen name="ActionProduction" component={ActionProductionScreen} />
      <FarmsStack.Screen name="ProductionConvert" component={ProductionConvertScreen} />
      <FarmsStack.Screen name="ActionVente" component={ActionVenteScreen} />
      <FarmsStack.Screen name="ActionVentePoules" component={ActionVentePoulesScreen} />
      <FarmsStack.Screen name="ActionAlimentation" component={ActionAlimentationScreen} />
      <FarmsStack.Screen name="ActionSante" component={ActionSanteScreen} />
      <FarmsStack.Screen name="ActionPreparation" component={PreparationScreen} />
      <FarmsStack.Screen name="ActionMouvement" component={ActionMouvementScreen} />
      <FarmsStack.Screen name="ActionEtatPoules" component={ActionEtatPoulesScreen} />
      <FarmsStack.Screen name="ActionReminder" component={ActionReminderScreen} />
      <FarmsStack.Screen name="LotHistory" component={LotHistoryScreen} />
    </FarmsStack.Navigator>
  );
}

function MainTabNavigator({ userRole }: { userRole: string | null }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 60,
          paddingBottom: 8,
        },
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'Farms') {
            return <MaterialCommunityIcons name="egg" size={size} color={color} />;
          }
          let iconName: any;
          if (route.name === 'Dashboard') iconName = 'home';
          else if (route.name === 'Finance') iconName = 'account-balance-wallet';
          else if (route.name === 'Plus' || route.name === 'Activités') iconName = 'menu';
          return <MaterialIcons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={userRole === 'EMPLOYE' ? EmployeeDashboardScreen : DashboardScreen}
        options={{ title: t('dashboard.title') }}
      />
      <Tab.Screen
        name="Farms"
        component={FarmsNavigator}
        options={{ title: userRole === 'EMPLOYE' ? t('profile.myFarm') : t('farms.title') }}
      />
      {userRole !== 'EMPLOYE' ? (
        <>
          <Tab.Screen name="Finance" component={FinanceScreen} options={{ title: t('finance.title') }} />
          <Tab.Screen
            name="Plus"
            component={View}
            listeners={({ navigation }: any) => ({
              tabPress: (e: any) => {
                e.preventDefault();
                navigation.openDrawer();
              },
            })}
          />
        </>
      ) : (
        <Tab.Screen
          name="Activités"
          component={View}
          listeners={({ navigation }: any) => ({
            tabPress: (e: any) => {
              e.preventDefault();
              navigation.openDrawer();
            },
          })}
        />
      )}
    </Tab.Navigator>
  );
}

function RootDrawerNavigator({ userRole }: { userRole: string | null }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  return (
    <Drawer.Navigator 
      drawerContent={(props) => <CustomDrawerContent {...props} userRole={userRole} />}
      screenOptions={{ 
        headerShown: false,
        drawerActiveTintColor: theme.colors.text,
        drawerActiveBackgroundColor: theme.colors.primary + '40',
        drawerInactiveTintColor: theme.colors.textSecondary,
        drawerLabelStyle: { fontWeight: '600' }
      }}
    >
      <Drawer.Screen
        name="MainTabs"
        options={{
          title: t('dashboard.title'),
          drawerIcon: ({ color, size }) => <MaterialIcons name="dashboard" color={color} size={size} />
        }}
      >
        {props => <MainTabNavigator {...props} userRole={userRole} />}
      </Drawer.Screen>
      <Drawer.Screen
        name="Reminders"
        component={RemindersScreen}
        options={{
          title: t('reminders.title'),
          drawerIcon: ({ color, size }) => <MaterialIcons name="notifications-active" color={color} size={size} />
        }}
      />
      <Drawer.Screen
        name="Profile"
        options={{
          title: t('profile.title'),
          drawerIcon: ({ color, size }) => <MaterialIcons name="person" color={color} size={size} />
        }}
      >
        {props => userRole === 'EMPLOYE' ? <EmployeeProfileScreen {...props} /> : <ProfileScreen {...props} />}
      </Drawer.Screen>
      {userRole === 'EMPLOYE' && (
        <>
          <Drawer.Screen
            name="Tasks"
            component={TasksScreen}
            options={{
              title: t('tasks.title'),
              drawerIcon: ({ color, size }) => <MaterialIcons name="assignment" color={color} size={size} />
            }}
          />
          <Drawer.Screen
            name="Attendance"
            component={AttendanceScreen}
            options={{
              title: t('attendance.title'),
              drawerIcon: ({ color, size }) => <MaterialIcons name="access-time" color={color} size={size} />
            }}
          />
          <Drawer.Screen
            name="Payroll"
            component={EmployeePayrollScreen}
            options={{
              title: t('payroll.mgtTitle'),
              drawerIcon: ({ color, size }) => <MaterialIcons name="payments" color={color} size={size} />
            }}
          />
        </>
      )}
      <Drawer.Screen
        name="Requests"
        component={EmployeeRequestsScreen}
        options={{
          title: userRole === 'EMPLOYE' ? t('requests.title') : t('requests.shortTitle'),
          drawerIcon: ({ color, size }) => <MaterialIcons name="send" color={color} size={size} />,
          drawerItemStyle: userRole !== 'EMPLOYE' ? { display: 'none' } : {}
        }}
      />
      <Drawer.Screen
        name="Statistics"
        component={StatisticsScreen}
        options={{
          title: t('statistics.title'),
          drawerIcon: ({ color, size }) => <MaterialIcons name="insert-chart" color={color} size={size} />
        }}
      />
      {userRole !== 'EMPLOYE' && (
        <>
          <Drawer.Screen
            name="Employees"
            component={EmployeesNavigator}
            options={{
              title: t('employees.title'),
              drawerIcon: ({ color, size }) => <MaterialIcons name="people" color={color} size={size} />
            }}
            listeners={({ navigation }: any) => ({
              drawerItemPress: (e: any) => {
                e.preventDefault();
                // S'assure que le navigateur d'employés revient à sa racine
                navigation.navigate('Employees', { screen: 'EmployeesList' });
              },
            })}
          />
          <Drawer.Screen
            name="GlobalHistory"
            component={GlobalHistoryScreen}
            options={{
              title: t('history.globalTitle'),
              drawerIcon: ({ color, size }) => <MaterialIcons name="history" color={color} size={size} />
            }}
          />
          <Drawer.Screen
            name="Database"
            component={DatabaseMgtScreen}
            options={{
              title: 'Base de données',
              drawerIcon: ({ color, size }) => <MaterialIcons name="storage" color={color} size={size} />
            }}
          />
        </>
      )}
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: t('settings.title'),
          drawerIcon: ({ color, size }) => <MaterialIcons name="settings" color={color} size={size} />
        }}
      />
      <Drawer.Screen
        name="Help"
        component={HelpScreen}
        options={{
          title: t('settings.help'),
          drawerIcon: ({ color, size }) => <MaterialIcons name="help" color={color} size={size} />
        }}
      />
      <Drawer.Screen
        name="ActionReminder"
        component={ActionReminderScreen}
        options={{
          drawerItemStyle: { display: 'none' },
          title: t('reminders.title')
        }}
      />
    </Drawer.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Welcome">
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

export const AppNavigator = () => {
  const { userToken, userRole, isLoading } = useAuth();
  const navigationRef = React.useRef<any>(null);

  useEffect(() => {
    // expo-notifications n'est pas supporté dans Expo Go (SDK 53+).
    // On ne l'active que dans les development builds ou apps standalone.
    if (Constants.appOwnership === 'expo') return;

    // Écouteur pour le clic sur la notification
    try {
      const subscription = Notifications.addNotificationResponseReceivedListener(response => {
        const { screen } = response.notification.request.content.data;
        if (screen === 'Reminders' && navigationRef.current) {
          navigationRef.current.navigate('Reminders');
        }
      });

      return () => subscription.remove();
    } catch {
      // Silencieux — les notifications ne sont pas disponibles
    }
  }, []);

  if (isLoading) return null;

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!userToken ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : (
          <>
            <Stack.Screen name="RootDrawer">
              {props => <RootDrawerNavigator {...props} userRole={userRole} />}
            </Stack.Screen>
            <Stack.Screen name="TransactionsHistory" component={TransactionsHistoryScreen} />
            <Stack.Screen name="AddExpense" component={AddExpenseScreen} />
            <Stack.Screen name="Purchase" component={PurchaseScreen} />
            <Stack.Screen name="HealthAlertDetail" component={HealthAlertDetailScreen} />
            <Stack.Screen name="Inventory" component={InventoryScreen} />
            <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} />
            <Stack.Screen name="EmployeeRequests" component={EmployeeRequestsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  drawerHeader: {
    padding: 24, // theme.spacing.l
    alignItems: 'center',
    marginBottom: 8, // theme.spacing.s
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16, // theme.spacing.m
    borderWidth: 0.8,
    overflow: 'hidden',
  },
  drawerAvatar: {
    width: '100%',
    height: '100%',
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  userRole: {
    fontSize: 14,
  },
  drawerDivider: {
    height: 0.8,
    marginVertical: 16, // theme.spacing.m
    marginHorizontal: 16, // theme.spacing.m
  }
});
