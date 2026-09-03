import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef, CommonActions, DrawerActions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';
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
import { HealthAlertsScreen } from '../screens/HealthAlertsScreen';
import { InventoryScreen } from '../screens/InventoryScreen';
import { EmployeeRequestsScreen } from '../screens/EmployeeRequestsScreen';
import { EmployeePayrollScreen } from '../screens/EmployeePayrollScreen';
import { AdminLoginScreen } from '../screens/superadmin/AdminLoginScreen';
import { SuperAdminNavigator } from './SuperAdminNavigator';

import { View, Text, StyleSheet, Image, Platform, Pressable } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { ResponsiveShell } from '../components/layout/ResponsiveShell';
import { useBreakpoint } from '../hooks/useBreakpoint';

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

// Regroupement visuel des routes du tiroir mobile — même découpage / mêmes
// libellés que la <DesktopSidebar/> Web, pour une identité cohérente entre
// plateformes. Une route absente de la table tombe dans le groupe "nav" par
// défaut (filet de sécurité si un écran est ajouté sans être classé).
const DRAWER_GROUP_BY_ROUTE: Record<string, 'nav' | 'team' | 'ops' | 'account'> = {
  MainTabs: 'nav',
  Statistics: 'nav',
  Employees: 'team',
  Tasks: 'team',
  Attendance: 'team',
  Payroll: 'team',
  Requests: 'team',
  Reminders: 'ops',
  GlobalHistory: 'ops',
  Database: 'ops',
  Profile: 'account',
  Settings: 'account',
  Help: 'account',
};
const DRAWER_GROUP_ORDER: Array<'nav' | 'team' | 'ops' | 'account'> = ['nav', 'team', 'ops', 'account'];

function CustomDrawerContent({ userRole, ...props }: any) {
  const { userName, userImage, logout } = useAuth();
  const { theme, isDarkMode } = useTheme();
  const { t } = useTranslation();
  const { state, navigation, descriptors } = props;

  const groupLabels: Record<string, string> = {
    nav: t('dashboard.title'),
    team: t('employees.title'),
    ops: t('reminders.title'),
    account: t('profile.title'),
  };

  const visibleRoutes = state.routes.filter((route: any) => {
    const style = descriptors[route.key]?.options?.drawerItemStyle;
    return style?.display !== 'none';
  });

  const groups = DRAWER_GROUP_ORDER
    .map((key) => ({
      key,
      label: groupLabels[key],
      routes: visibleRoutes.filter((route: any) => (DRAWER_GROUP_BY_ROUTE[route.name] || 'nav') === key),
    }))
    .filter((g) => g.routes.length > 0);

  const focusedKey = state.routes[state.index].key;
  const hoverBg = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)';

  // Reproduit exactement la navigation d'un DrawerItem natif (émission de
  // l'event `drawerItemPress`, respecté par les listeners existants comme
  // celui d'"Employees" qui force le retour à la liste).
  const navigateToRoute = (route: any, focused: boolean) => {
    const event = navigation.emit({ type: 'drawerItemPress', target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) return;
    navigation.dispatch({
      ...(focused ? DrawerActions.closeDrawer() : CommonActions.navigate(route.name, route.params)),
      target: state.key,
    });
  };

  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: theme.colors.surface }} contentContainerStyle={{ paddingTop: 0 }}>
      <View style={[styles.drawerHeader, { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.border }]}>
        <View style={[styles.avatarCircle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]}>
          {userImage ? (
            <Image source={{ uri: userImage }} style={styles.drawerAvatar} />
          ) : (
            <MaterialIcons name="person" size={36} color={theme.colors.primary} />
          )}
        </View>
        <Text style={[styles.userName, { color: theme.colors.text }]} numberOfLines={1}>{userName || t('common.anonymous')}</Text>
        <View style={[styles.roleChip, { backgroundColor: theme.colors.primary + '18' }]}>
          <MaterialCommunityIcons name={userRole === 'EMPLOYE' ? 'account-hard-hat' : 'shield-account'} size={12} color={theme.colors.primary} />
          <Text style={[styles.userRole, { color: theme.colors.primary }]}>{userRole === 'EMPLOYE' ? t('profile.employee') : t('profile.owner')}</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 10, paddingTop: 8 }}>
        {groups.map((group) => (
          <View key={group.key} style={{ marginBottom: 4 }}>
            <Text style={[styles.groupTitle, { color: theme.colors.textSecondary }]}>{group.label}</Text>
            {group.routes.map((route: any) => {
              const { options } = descriptors[route.key];
              const label = options.drawerLabel !== undefined ? options.drawerLabel : (options.title !== undefined ? options.title : route.name);
              const focused = route.key === focusedKey;
              const iconColor = focused ? '#1A1A1A' : theme.colors.textSecondary;
              return (
                <Pressable
                  key={route.key}
                  onPress={() => navigateToRoute(route, focused)}
                  style={({ pressed }: any) => [
                    styles.drawerNavItem,
                    pressed && !focused && { backgroundColor: hoverBg },
                    focused && { backgroundColor: theme.colors.primary },
                  ]}
                >
                  {options.drawerIcon?.({ focused, color: iconColor, size: 21 })}
                  <Text style={[styles.drawerNavLabel, { color: focused ? '#1A1A1A' : theme.colors.text }, focused && { fontWeight: '800' }]} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={[styles.drawerDivider, { backgroundColor: theme.colors.border }]} />
      <Pressable
        onPress={async () => { await logout(); }}
        style={({ pressed }: any) => [styles.drawerLogoutItem, pressed && { backgroundColor: theme.colors.danger + '14' }]}
      >
        <MaterialIcons name="logout" size={21} color={theme.colors.danger} />
        <Text style={[styles.drawerNavLabel, { color: theme.colors.danger, fontWeight: '800' }]}>{t('common.logout')}</Text>
      </Pressable>
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
  const { isDesktop, isDesktopOrTablet } = useBreakpoint();

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
          display: isDesktopOrTablet && Platform.OS === 'web' ? 'none' : 'flex',
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
  const { isDesktopOrTablet } = useBreakpoint();
  // Sur le Web en Desktop/Tablette, la navigation passe par la <DesktopSidebar/>
  // rendue par <ResponsiveShell/>. Le tiroir de react-navigation ne doit alors
  // servir QUE de routeur (aucune barre latérale visible, aucun overlay, aucun
  // swipe) — sinon deux barres latérales s'affichent en même temps.
  // Android / iOS : comportement inchangé (tiroir mobile classique).
  const webSidebar = Platform.OS === 'web' && isDesktopOrTablet;
  return (
    <Drawer.Navigator
      drawerContent={webSidebar ? () => null : (props) => <CustomDrawerContent {...props} userRole={userRole} />}
      screenOptions={{
        headerShown: false,
        ...(webSidebar
          ? {
              drawerType: 'front' as const,
              swipeEnabled: false,
              overlayColor: 'transparent',
              drawerStyle: { width: 0, display: 'none' as const },
            }
          : null),
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
              title: 'Exports & Sauvegardes',
              drawerIcon: ({ color, size }) => <MaterialIcons name="backup" color={color} size={size} />
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

/**
 * Route d'entrée de la pile d'authentification.
 * - Utilisateurs métier : arrivent sur "Welcome" → "Login".
 * - SuperAdmin : accède à l'URL dédiée /admin/login (web) — AUCUN lien visible
 *   depuis l'accueil public. Le backend reste seul juge (is_superuser).
 */
const getAuthInitialRoute = (): 'Welcome' | 'AdminLogin' => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (/^\/admin(\/login)?\/?$/i.test(window.location.pathname || '')) {
      return 'AdminLogin';
    }
  }
  return 'Welcome';
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }} initialRouteName={getAuthInitialRoute()}>
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      {/* Route dédiée SuperAdmin — atteignable UNIQUEMENT via l'URL /admin/login
          (aucun bouton/lien depuis l'accueil). Authentification via
          /api/admin/auth/login/ ; le SuperAdmin n'utilise jamais le login normal. */}
      <AuthStack.Screen name="AdminLogin" component={AdminLoginScreen} />
    </AuthStack.Navigator>
  );
}

export const navigationRef = createNavigationContainerRef<any>();

export const AppNavigator = () => {
  const { userToken, userRole, isSuperAdmin, authChecked, isLoading } = useAuth();
  const { isDesktopOrTablet } = useBreakpoint();
  // Sur le parcours SuperAdmin (URL /admin/*), on attend la confirmation serveur
  // du statut avant de choisir l'espace — évite un flash de l'UI métier.
  const adminContext = Platform.OS === 'web' && typeof window !== 'undefined'
    && /^\/admin/i.test(window.location.pathname || '');
  const [currentRouteName, setCurrentRouteName] = useState<string | undefined>(undefined);

  // ── Web : garder l'URL cohérente avec l'espace affiché ──────────────────
  // Le routeur métier n'utilise pas de `linking` config : on synchronise donc
  // manuellement l'URL /admin. Dès qu'on quitte l'espace SuperAdmin (retour
  // accueil, déconnexion…), on nettoie l'URL pour qu'elle ne reste pas figée
  // sur /admin/login.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // `currentRouteName` reste `undefined` tant que `NavigationContainer` n'a
    // pas terminé son montage initial (avant `onReady`) — y compris pendant
    // la phase `isLoading` où `AppNavigator` ne rend encore que `null`. Cet
    // effet tourne quand même à chaque render (React ne saute pas les effets
    // d'un composant qui retourne `null`). Sans cette garde, un accès direct
    // à /admin/login réécrivait l'URL vers "/" AVANT même que
    // `AuthStack.Navigator` ne lise `window.location.pathname` pour choisir
    // sa route initiale (`getAuthInitialRoute()`) — qui retombait alors sur
    // "Welcome" au lieu de "AdminLogin". D'où la redirection vers l'accueil.
    if (currentRouteName === undefined) return;
    const path = window.location.pathname || '';
    const onAdminUrl = /^\/admin/i.test(path);
    const inAdminSpace = isSuperAdmin || currentRouteName === 'AdminLogin';
    if (onAdminUrl && !inAdminSpace) {
      window.history.replaceState(null, '', '/');
    } else if (isSuperAdmin && /^\/admin\/login\/?$/i.test(path)) {
      // Connecté à la console : URL propre (/admin) plutôt que /admin/login.
      window.history.replaceState(null, '', '/admin');
    }
  }, [currentRouteName, isSuperAdmin]);

  useEffect(() => {
    // expo-notifications n'est pas supporté dans Expo Go (SDK 53+).
    // On ne l'active que dans les development builds ou apps standalone.
    if (Constants.appOwnership === 'expo') return;

    // Écouteur pour le clic sur une notification (locale OU push distante).
    try {
      const subscription = Notifications.addNotificationResponseReceivedListener(response => {
        const data: any = response.notification.request.content.data || {};
        if (!navigationRef.isReady()) return;
        if (data.screen === 'Reminders') {
          navigationRef.navigate('Reminders');
        } else if (data.screen === 'HealthAlerts') {
          navigationRef.navigate('HealthAlerts');
        }
      });

      return () => subscription.remove();
    } catch {
      // Silencieux — les notifications ne sont pas disponibles
    }
  }, []);

  if (isLoading) return null;
  if (adminContext && userToken && !authChecked) return null;

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        setCurrentRouteName(navigationRef.getCurrentRoute()?.name);
      }}
      onStateChange={() => {
        setCurrentRouteName(navigationRef.getCurrentRoute()?.name);
      }}
    >
      <ResponsiveShell enabled={!!userToken && !isSuperAdmin} currentRouteName={currentRouteName}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!userToken ? (
            <Stack.Screen name="Auth" component={AuthNavigator} />
          ) : isSuperAdmin ? (
            // SuperAdmin ONLINE-ONLY : espace totalement séparé, aucune sync métier.
            <Stack.Screen name="SuperAdminRoot" component={SuperAdminNavigator} />
          ) : (
            <>
              <Stack.Screen name="RootDrawer">
                {props => <RootDrawerNavigator {...props} userRole={userRole} />}
              </Stack.Screen>
              <Stack.Screen name="TransactionsHistory" component={TransactionsHistoryScreen} />
              <Stack.Screen name="AddExpense" component={AddExpenseScreen} />
              <Stack.Screen name="Purchase" component={PurchaseScreen} />
              <Stack.Screen name="HealthAlertDetail" component={HealthAlertDetailScreen} />
              <Stack.Screen name="HealthAlerts" component={HealthAlertsScreen} />
              <Stack.Screen name="Inventory" component={InventoryScreen} />
              <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} />
              <Stack.Screen name="EmployeeRequests" component={EmployeeRequestsScreen} />
            </>
          )}
        </Stack.Navigator>
      </ResponsiveShell>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  drawerHeader: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    overflow: 'hidden',
  },
  drawerAvatar: {
    width: '100%',
    height: '100%',
  },
  userName: {
    fontSize: 17,
    fontWeight: '800',
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  userRole: {
    fontSize: 12,
    fontWeight: '700',
  },
  groupTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    opacity: 0.7,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 6,
  },
  drawerNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  drawerNavLabel: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  drawerDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
    marginHorizontal: 16,
  },
  drawerLogoutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 22,
    marginBottom: 8,
  },
});
