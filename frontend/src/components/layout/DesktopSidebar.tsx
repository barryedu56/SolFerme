import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { navigationRef } from '../../navigation/AppNavigator';
import { BrandLogo } from '../BrandLogo';

interface DesktopSidebarProps {
  currentRouteName?: string;
}

type Item = { id: string; label: string; icon: string; lib?: 'material' | 'community'; ownerOnly?: boolean; employeeOnly?: boolean };

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ currentRouteName }) => {
  const { theme, isDarkMode } = useTheme();
  const { t } = useTranslation();
  const { userName, userRole, userImage, logout } = useAuth();

  const groups: { title: string; items: Item[] }[] = [
    {
      title: t('dashboard.title'),
      items: [
        { id: 'Dashboard', label: t('dashboard.title'), icon: 'view-dashboard-outline', lib: 'community' },
        { id: 'Farms', label: t('farms.title'), icon: 'egg-outline', lib: 'community' },
        { id: 'Finance', label: t('finance.title'), icon: 'wallet-outline', lib: 'community', ownerOnly: true },
        { id: 'Statistics', label: t('statistics.title'), icon: 'chart-box-outline', lib: 'community' },
      ],
    },
    {
      title: t('employees.title'),
      items: [
        { id: 'Employees', label: t('employees.title'), icon: 'account-group-outline', lib: 'community', ownerOnly: true },
        { id: 'Tasks', label: t('tasks.title'), icon: 'clipboard-text-outline', lib: 'community', employeeOnly: true },
        { id: 'Attendance', label: t('attendance.title'), icon: 'clock-outline', lib: 'community', employeeOnly: true },
        { id: 'Payroll', label: t('payroll.mgtTitle'), icon: 'cash-multiple', lib: 'community', employeeOnly: true },
        { id: 'Requests', label: t('requests.title'), icon: 'send-outline', lib: 'community', employeeOnly: true },
      ],
    },
    {
      title: t('reminders.title'),
      items: [
        { id: 'Reminders', label: t('reminders.title'), icon: 'bell-ring-outline', lib: 'community' },
        { id: 'GlobalHistory', label: t('history.globalTitle'), icon: 'history', lib: 'community', ownerOnly: true },
        { id: 'Database', label: 'Exports & Sauvegardes', icon: 'cloud-upload-outline', lib: 'community', ownerOnly: true },
      ],
    },
    {
      title: t('profile.title'),
      items: [
        { id: 'Profile', label: t('profile.title'), icon: 'account-circle-outline', lib: 'community' },
        { id: 'Settings', label: t('settings.title'), icon: 'cog-outline', lib: 'community' },
        { id: 'Help', label: t('settings.help'), icon: 'help-circle-outline', lib: 'community' },
      ],
    },
  ];

  const visible = (item: Item) => {
    if (item.ownerOnly && userRole === 'EMPLOYE') return false;
    if (item.employeeOnly && userRole !== 'EMPLOYE') return false;
    return true;
  };

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

  const s = createStyles(theme, isDarkMode);
  const hoverBg = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)';

  return (
    <View style={s.container}>
      <View style={s.brandRow}>
        <BrandLogo size={32} shape="squircle" background={theme.colors.background} />
        <Text style={s.brandName}>SolFerme</Text>
      </View>

      <Pressable style={({ hovered }: any) => [s.userCard, hovered && { backgroundColor: hoverBg }]} onPress={() => handleNavigate('Profile')}>
        <View style={s.avatar}>
          {userImage ? <Image source={{ uri: userImage }} style={s.avatarImg} /> : <MaterialIcons name="person" size={26} color={theme.colors.primary} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.userName} numberOfLines={1}>{userName}</Text>
          <View style={s.roleChip}>
            <MaterialCommunityIcons name={userRole === 'EMPLOYE' ? 'account-hard-hat' : 'shield-account'} size={11} color={theme.colors.primary} />
            <Text style={s.roleTxt}>{userRole === 'EMPLOYE' ? t('profile.employee') : t('profile.owner')}</Text>
          </View>
        </View>
      </Pressable>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        {groups.map((g, gi) => {
          const items = g.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <View key={gi} style={{ marginBottom: 4 }}>
              <Text style={s.groupTitle}>{g.title}</Text>
              {items.map((item) => {
                const active = currentRouteName === item.id;
                const color = active ? '#1A1A1A' : theme.colors.textSecondary;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleNavigate(item.id)}
                    style={({ hovered }: any) => [
                      s.item,
                      hovered && !active && { backgroundColor: hoverBg },
                      active && { backgroundColor: theme.colors.primary },
                    ]}
                  >
                    {item.lib === 'community' ? (
                      <MaterialCommunityIcons name={item.icon as any} size={20} color={color} />
                    ) : (
                      <MaterialIcons name={item.icon as any} size={20} color={color} />
                    )}
                    <Text style={[s.itemLabel, { color: active ? '#1A1A1A' : theme.colors.text }, active && { fontWeight: '800' }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <View style={s.footer}>
        <Pressable style={({ hovered }: any) => [s.logoutBtn, hovered && { backgroundColor: theme.colors.danger + '18' }]} onPress={logout}>
          <MaterialIcons name="logout" size={19} color={theme.colors.danger} />
          <Text style={s.logoutLabel}>{t('common.logout')}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const createStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: {
    width: 268,
    height: '100%',
    backgroundColor: theme.colors.surface,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    overflow: 'hidden',
  },
  brandRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  brandName: { fontSize: 17, fontWeight: '800', letterSpacing: 0.2, color: theme.colors.text },

  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 12, marginTop: 14, marginBottom: 6, padding: 10, borderRadius: 14,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 12, overflow: 'hidden',
    backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  userName: { fontSize: 14.5, fontWeight: '800', color: theme.colors.text },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  roleTxt: { fontSize: 11, fontWeight: '700', color: theme.colors.primary, textTransform: 'capitalize' },

  scroll: { flex: 1, paddingHorizontal: 10 },
  groupTitle: {
    fontSize: 10, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase',
    color: theme.colors.textSecondary, opacity: 0.7, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 6,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 2,
  },
  itemLabel: { fontSize: 14, fontWeight: '600', flex: 1 },

  footer: { borderTopWidth: 1, borderTopColor: theme.colors.border, padding: 12 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10 },
  logoutLabel: { fontSize: 14, fontWeight: '800', color: theme.colors.danger },
});
