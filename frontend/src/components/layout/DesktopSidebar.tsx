import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { navigationRef } from '../../navigation/AppNavigator';

interface DesktopSidebarProps {
  currentRouteName?: string;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ currentRouteName }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userName, userRole, userImage, logout } = useAuth();

  const menuItems = [
    { id: 'Dashboard', label: t('dashboard.title'), icon: 'dashboard', type: 'material' },
    { id: 'Farms', label: t('farms.title'), icon: 'egg', type: 'community' },
    { id: 'Finance', label: t('finance.title'), icon: 'account-balance-wallet', type: 'material', ownerOnly: true },
    { id: 'Employees', label: t('employees.title'), icon: 'people', type: 'material', ownerOnly: true },
    { id: 'Statistics', label: t('statistics.title'), icon: 'insert-chart', type: 'material' },
    { id: 'Reminders', label: t('reminders.title'), icon: 'notifications-active', type: 'material' },
    { id: 'Tasks', label: t('tasks.title'), icon: 'assignment', type: 'material', employeeOnly: true },
    { id: 'Attendance', label: t('attendance.title'), icon: 'access-time', type: 'material', employeeOnly: true },
    { id: 'Payroll', label: t('payroll.mgtTitle'), icon: 'payments', type: 'material', employeeOnly: true },
    { id: 'Requests', label: t('requests.title'), icon: 'send', type: 'material', employeeOnly: true },
    { id: 'GlobalHistory', label: t('history.globalTitle'), icon: 'history', type: 'material', ownerOnly: true },
    { id: 'Database', label: 'Base de données', icon: 'storage', type: 'material', ownerOnly: true },
    { id: 'Profile', label: t('profile.title'), icon: 'person', type: 'material' },
    { id: 'Settings', label: t('settings.title'), icon: 'settings', type: 'material' },
    { id: 'Help', label: t('settings.help'), icon: 'help', type: 'material' },
  ];

  const filteredItems = menuItems.filter(item => {
    if (item.ownerOnly && userRole === 'EMPLOYE') return false;
    if (item.employeeOnly && userRole !== 'EMPLOYE') return false;
    return true;
  });

  const activeRoute = currentRouteName;

  const handleNavigate = (routeName: string) => {
    if (!navigationRef.isReady()) return;

    const targetMap: Record<string, any> = {
      Dashboard: { screen: 'RootDrawer', params: { screen: 'MainTabs', params: { screen: 'Dashboard' } } },
      Farms: { screen: 'RootDrawer', params: { screen: 'MainTabs', params: { screen: 'Farms' } } },
      Finance: { screen: 'RootDrawer', params: { screen: 'MainTabs', params: { screen: 'Finance' } } },
      Employees: { screen: 'RootDrawer', params: { screen: 'Employees', params: { screen: 'EmployeesList' } } },
      Statistics: { screen: 'RootDrawer', params: { screen: 'Statistics' } },
      Reminders: { screen: 'RootDrawer', params: { screen: 'Reminders' } },
      Tasks: { screen: 'RootDrawer', params: { screen: 'Tasks' } },
      Attendance: { screen: 'RootDrawer', params: { screen: 'Attendance' } },
      Payroll: { screen: 'RootDrawer', params: { screen: 'Payroll' } },
      Requests: { screen: 'RootDrawer', params: { screen: 'Requests' } },
      GlobalHistory: { screen: 'RootDrawer', params: { screen: 'GlobalHistory' } },
      Database: { screen: 'RootDrawer', params: { screen: 'Database' } },
      Profile: { screen: 'RootDrawer', params: { screen: 'Profile' } },
      Settings: { screen: 'RootDrawer', params: { screen: 'Settings' } },
      Help: { screen: 'RootDrawer', params: { screen: 'Help' } },
    };

    const target = targetMap[routeName] || { screen: routeName };
    navigationRef.navigate(target.screen, target.params);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderRightColor: theme.colors.border }]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => handleNavigate('Profile')}
        activeOpacity={0.7}
      >
        <View style={[styles.avatarContainer, { borderColor: theme.colors.primary }]}>
          {userImage ? (
            <Image source={{ uri: userImage }} style={styles.avatar} />
          ) : (
            <MaterialIcons name="person" size={32} color={theme.colors.primary} />
          )}
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.userName, { color: theme.colors.text }]} numberOfLines={1}>{userName}</Text>
          <Text style={[styles.userRole, { color: theme.colors.textSecondary }]}>
            {userRole === 'EMPLOYE' ? t('profile.employee') : t('profile.owner')}
          </Text>
        </View>
      </TouchableOpacity>

      <ScrollView style={styles.scroll}>
        {filteredItems.map((item) => {
          const isActive = activeRoute === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.menuItem,
                isActive && { backgroundColor: theme.colors.primary + '20' }
              ]}
              onPress={() => handleNavigate(item.id)}
            >
              {item.type === 'material' ? (
                <MaterialIcons
                  name={item.icon as any}
                  size={24}
                  color={isActive ? theme.colors.primary : theme.colors.textSecondary}
                />
              ) : (
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={24}
                  color={isActive ? theme.colors.primary : theme.colors.textSecondary}
                />
              )}
              <Text style={[
                styles.menuLabel,
                { color: isActive ? theme.colors.primary : theme.colors.text },
                isActive && { fontWeight: 'bold' }
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <MaterialIcons name="logout" size={24} color={theme.colors.danger} />
          <Text style={[styles.logoutLabel, { color: theme.colors.danger }]}>{t('common.logout')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 280,
    height: '100%',
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  header: {
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  userRole: {
    fontSize: 12,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  menuLabel: {
    marginLeft: 16,
    fontSize: 15,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  logoutLabel: {
    marginLeft: 16,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
