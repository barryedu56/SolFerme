import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, Image, TextInput, Alert, Switch, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toast } from '../utils/toast';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { repositoryProvider } from '../repositories';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from '../context/LanguageContext';
import { useWindowDimensions } from 'react-native';
import Constants from 'expo-constants';
import { getProfileImageUrl } from '../utils/media';
import { formatNumber } from '../utils/formatters';
import { useBreakpoint } from '../hooks/useBreakpoint';

import { LinearGradient } from 'expo-linear-gradient';

export const EmployeeProfileScreen = ({ navigation }: any) => {
  const { theme, themeMode, setThemeMode, notifications, toggleNotifications, isDarkMode } = useTheme();
  const { logout, updateUser } = useAuth();
  const { t, language, setLanguage } = useTranslation();
  const { width } = useWindowDimensions();
  const { isDesktop } = useBreakpoint();
  const isTablet = width > 600;

  const styles = useMemo(() => createStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [employeeData, setEmployeeData] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [editData, setEditData] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  });
  const [passwordData, setPasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const fetchProfile = async () => {
    try {
      const response = await repositoryProvider.api.get('/employees/me/');
      setEmployeeData(response.data);
      setEditData({
        name: response.data.user_name || '',
        email: response.data.user_email || '',
        phone: response.data.user_phone || '',
        address: response.data.address || ''
      });
      await AsyncStorage.setItem('employee_data', JSON.stringify(response.data));

      // Récupération des paiements
      const payRes = await repositoryProvider.api.get('/payrolls/').catch(err => {
          if (err.response?.status === 403) return { data: [] };
          return { data: [] };
      });
      // Filtrer pour être sûr de ne voir que les siens si l'API ne le fait pas déjà
      const myPayrolls = Array.isArray(payRes.data)
        ? payRes.data.filter((p: any) => p.employee === response.data.id || p.employee_name === response.data.user_name)
        : [];
      setPayrolls(myPayrolls);
      await AsyncStorage.setItem('employee_payrolls', JSON.stringify(myPayrolls));

    } catch (error) {
      console.log('Erreur fetch profil employé:', error);
      const cachedData = await AsyncStorage.getItem('employee_data');
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        setEmployeeData(parsed);
        setEditData({
          name: parsed.user_name || '',
          email: parsed.user_email || '',
          phone: parsed.user_phone || '',
          address: parsed.address || ''
        });
      }
      const cachedPayrolls = await AsyncStorage.getItem('employee_payrolls');
      if (cachedPayrolls) {
        setPayrolls(JSON.parse(cachedPayrolls));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile();
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('profile.cameraPermissionError'));
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      handleUploadImage(result.assets[0].uri);
    }
  };

  const handleUploadImage = async (uri: string) => {
    try {
      setUpdating(true);
      const formData = new FormData();
      const filename = uri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename || '');
      const type = match ? `image/${match[1]}` : `image`;

      // @ts-ignore
      formData.append('profile_image', {
        uri: uri,
        name: filename || 'profile.jpg',
        type: type,
      });

      await repositoryProvider.api.patch('/auth/user/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      await fetchProfile();
      await updateUser();
      toast.success(t('common.success'), t('profile.updatePhotoSuccess'));
    } catch (e) {
      console.error('Upload error:', e);
      toast.error(t('common.error'), t('profile.updatePhotoError'));
    } finally {
      setUpdating(false);
    }
  };

  const handleRemoveImage = async () => {
    try {
      setUpdating(true);
      await repositoryProvider.api.patch('/auth/user/', { profile_image: null });
      await fetchProfile();
      await updateUser();
      toast.success(t('common.success'), t('profile.removePhotoSuccess'));
    } catch (e) {
      console.error('Remove error:', e);
      toast.error(t('common.error'), t('profile.removePhotoError'));
    } finally {
      setUpdating(false);
    }
  };

  const showImageOptions = () => {
    if (!employeeData?.user_image) {
      pickImage();
      return;
    }

    Alert.alert(
      t('profile.photoTitle'),
      t('profile.photoOption'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.removePhoto'), onPress: handleRemoveImage, style: 'destructive' },
        { text: t('profile.changePhoto'), onPress: pickImage }
      ]
    );
  };

  const handleUpdateProfile = async () => {
    if (!editData.name || !editData.email) {
      toast.error(t('common.error'), t('profile.fillRequired'));
      return;
    }

    setUpdating(true);
    try {
      // 1. Update user info
      await repositoryProvider.api.patch('/auth/user/', {
        name: editData.name,
        email: editData.email,
        phone: editData.phone
      });

      // 2. Update employee address
      await repositoryProvider.api.patch(`/employees/${employeeData.id}/`, {
        address: editData.address
      });

      await fetchProfile();
      await updateUser();
      setIsEditing(false);
      toast.success(t('common.success'), t('profile.saveChangesSuccess'));
    } catch (e) {
      toast.error(t('common.error'), t('profile.updateError'));
    } finally {
      setUpdating(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.oldPassword || !passwordData.newPassword) {
      toast.error(t('common.error'), t('profile.fillAllFields'));
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error(t('common.error'), t('profile.passwordMismatch'));
      return;
    }

    setUpdating(true);
    try {
      await repositoryProvider.api.post('/auth/change-password/', {
        old_password: passwordData.oldPassword,
        new_password: passwordData.newPassword
      });

      setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setIsChangingPassword(false);
      toast.success(t('common.success'), t('profile.passwordSuccess'));
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || t('profile.passwordError');
      toast.error(t('common.error'), errorMsg);
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      t('common.logout'),
      t('profile.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.logout'), style: 'destructive', onPress: async () => await logout() }
      ]
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const displayImage = getProfileImageUrl(employeeData?.user_image);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.primary + '80']}
          style={styles.upperHeader}
        >
          <View style={styles.headerTop}>
            {!isDesktop && Platform.OS !== 'web' && (
              <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.iconButton}>
                <MaterialIcons name="menu" size={24} color="#000" />
              </TouchableOpacity>
            )}
            <Text style={styles.headerTitleText}>{t('profile.title')}</Text>
            <TouchableOpacity
              onPress={() => setIsEditing(!isEditing)}
              style={styles.iconButton}
            >
              <MaterialIcons
                name={isEditing ? "close" : "edit"}
                size={24}
                color={isEditing ? "#D32F2F" : "#000"}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.avatarSection}>
             <View style={styles.avatarWrapper}>
                <View style={[styles.avatarCircle, { borderColor: '#FFF' }]}>
                   {displayImage ? (
                     <Image source={{ uri: displayImage }} style={styles.avatarImage} />
                   ) : (
                     <MaterialIcons name="person" size={60} color={theme.colors.primary} />
                   )}
                   {updating && (
                     <View style={styles.avatarLoading}>
                       <ActivityIndicator color="#FFF" />
                     </View>
                   )}
                </View>
                <TouchableOpacity style={styles.cameraBadge} onPress={showImageOptions}>
                   <MaterialIcons name="photo-camera" size={16} color="#FFF" />
                </TouchableOpacity>
             </View>

             {!isEditing && (
               <View style={{ alignItems: 'center' }}>
                 <Text style={styles.userNameHeader}>{employeeData?.user_name}</Text>
                 <View style={styles.badgeHeader}>
                    <Text style={styles.badgeTextHeader}>{employeeData?.position}</Text>
                 </View>
               </View>
             )}
          </View>
        </LinearGradient>

        <View style={[styles.contentOverlap, isTablet && styles.tabletContent]}>
            {isEditing ? (
            <Card style={styles.mainCard}>
               <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('profile.editInfo')}</Text>
               <View style={styles.editForm}>
                  <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#2C2C2C' : '#F5F5F5', borderColor: theme.colors.border }]}>
                    <MaterialIcons name="person" size={20} color={theme.colors.primary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { color: theme.colors.text }]}
                      placeholder={t('profile.fullName')}
                      placeholderTextColor={theme.colors.textSecondary}
                      value={editData.name}
                      onChangeText={(v) => setEditData({...editData, name: v})}
                    />
                  </View>
                  <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#2C2C2C' : '#F5F5F5', borderColor: theme.colors.border }]}>
                    <MaterialIcons name="phone" size={20} color={theme.colors.primary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { color: theme.colors.text }]}
                      placeholder={t('profile.phone')}
                      placeholderTextColor={theme.colors.textSecondary}
                      keyboardType="phone-pad"
                      maxLength={9}
                      value={editData.phone}
                      onChangeText={(v) => setEditData({...editData, phone: v})}
                    />
                  </View>
                  <View style={[styles.inputContainer, { height: 100, alignItems: 'flex-start', paddingTop: 12, backgroundColor: isDarkMode ? '#2C2C2C' : '#F5F5F5', borderColor: theme.colors.border }]}>
                    <MaterialIcons name="place" size={20} color={theme.colors.primary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { color: theme.colors.text, height: '100%' }]}
                      placeholder={t('profile.address')}
                      placeholderTextColor={theme.colors.textSecondary}
                      value={editData.address}
                      multiline
                      onChangeText={(v) => setEditData({...editData, address: v})}
                    />
                  </View>
                  <Button title={t('profile.saveChanges')} onPress={handleUpdateProfile} loading={updating} />
               </View>
            </Card>
          ) : isChangingPassword ? (
            <Card style={styles.mainCard}>
               <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('profile.changePassword')}</Text>
               <View style={styles.editForm}>
                  <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#2C2C2C' : '#F5F5F5', borderColor: theme.colors.border }]}>
                    <TextInput
                      style={[styles.input, { color: theme.colors.text }]}
                      placeholder={t('profile.oldPassword')}
                      placeholderTextColor={theme.colors.textSecondary}
                      secureTextEntry={!showOldPassword}
                      value={passwordData.oldPassword}
                      onChangeText={(v) => setPasswordData({...passwordData, oldPassword: v})}
                    />
                    <TouchableOpacity onPress={() => setShowOldPassword(!showOldPassword)}>
                      <MaterialIcons name={showOldPassword ? "visibility-off" : "visibility"} size={20} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#2C2C2C' : '#F5F5F5', borderColor: theme.colors.border }]}>
                    <TextInput
                      style={[styles.input, { color: theme.colors.text }]}
                      placeholder={t('profile.newPassword')}
                      placeholderTextColor={theme.colors.textSecondary}
                      secureTextEntry={!showNewPassword}
                      value={passwordData.newPassword}
                      onChangeText={(v) => setPasswordData({...passwordData, newPassword: v})}
                    />
                    <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                      <MaterialIcons name={showNewPassword ? "visibility-off" : "visibility"} size={20} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#2C2C2C' : '#F5F5F5', borderColor: theme.colors.border }]}>
                    <TextInput
                      style={[styles.input, { color: theme.colors.text }]}
                      placeholder={t('profile.confirmPassword')}
                      placeholderTextColor={theme.colors.textSecondary}
                      secureTextEntry={!showConfirmPassword}
                      value={passwordData.confirmPassword}
                      onChangeText={(v) => setPasswordData({...passwordData, confirmPassword: v})}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                      <MaterialIcons name={showConfirmPassword ? "visibility-off" : "visibility"} size={20} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <Button title={t('profile.changePassword')} onPress={handleChangePassword} loading={updating} />
                  <TouchableOpacity
                      style={{ marginTop: 15, alignItems: 'center' }}
                      onPress={() => setIsChangingPassword(false)}
                  >
                      <Text style={{ color: theme.colors.textSecondary }}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
               </View>
            </Card>
          ) : (
            <>
              <Card style={styles.mainCard}>
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                       <View style={[styles.statIconBox, { backgroundColor: theme.colors.primary + '15' }]}>
                          <MaterialIcons name="payments" size={24} color={theme.colors.primary} />
                       </View>
                       <Text style={[styles.statValue, {color: theme.colors.text}]}>{payrolls.length}</Text>
                       <Text style={styles.statLabel}>{t('profile.stats.payments')}</Text>
                    </View>

                    <View style={styles.dividerVertical} />

                    <View style={styles.statItem}>
                       <View style={[styles.statIconBox, { backgroundColor: '#2196F315' }]}>
                          <MaterialIcons name="assignment" size={24} color="#2196F3" />
                       </View>
                       <Text style={[styles.statValue, {color: theme.colors.text}]}>{employeeData?.lots_detail?.length || 0}</Text>
                       <Text style={styles.statLabel}>{t('profile.stats.batchesTracked')}</Text>
                    </View>

                    <View style={styles.dividerVertical} />

                    <View style={styles.statItem}>
                      <View style={[styles.statIconBox, { backgroundColor: (employeeData?.is_active !== false ? theme.colors.success : theme.colors.danger) + '15' }]}>
                        <MaterialIcons name="verified-user" size={24} color={employeeData?.is_active !== false ? theme.colors.success : theme.colors.danger} />
                      </View>
                      <Text style={[styles.statValue, { color: theme.colors.text }]}>
                        {employeeData?.is_active !== false ? t('profile.active') : t('profile.inactive')}
                      </Text>
                      <Text style={styles.statLabel}>{t('profile.stats.status')}</Text>
                    </View>
                </View>
              </Card>

              <SectionHeader title={t('profile.personalInfo')} />
              <Card style={styles.sectionCard}>
                <InfoRow icon="email" label={t('profile.email')} value={employeeData?.user_email} theme={theme} />
                <View style={styles.divider} />
                <InfoRow icon="phone" label={t('profile.phone')} value={employeeData?.user_phone} theme={theme} />
                <View style={styles.divider} />
                <InfoRow icon="place" label={t('profile.address')} value={employeeData?.address || t('common.noData')} theme={theme} />
              </Card>

              <SectionHeader title={t('profile.jobDetails')} />
              <Card style={styles.sectionCard}>
                <InfoRow icon="business" label={t('farms.title')} value={employeeData?.farm_name} theme={theme} />
                <View style={styles.divider} />
                <InfoRow icon="event" label={t('profile.hiredAt')} value={employeeData?.hired_at ? new Date(employeeData.hired_at).toLocaleDateString() : 'N/A'} theme={theme} />
                <View style={styles.divider} />
                <InfoRow icon="layers" label={t('profile.assignedLots')} value={employeeData?.lots_detail?.map((l:any) => l.name).join(', ') || t('common.noData')} theme={theme} />
              </Card>

              <SectionHeader title={t('profile.paymentHistory')} />
              <Card style={styles.sectionCard}>
                 {payrolls.length > 0 ? (
                   payrolls.map((pay, index) => (
                     <View key={pay.id}>
                       <View style={styles.paymentRow}>
                          <View style={styles.paymentInfo}>
                            <Text style={[styles.paymentPeriod, { color: theme.colors.text }]}>{t('profile.period')}: {pay.month || pay.date}</Text>
                            <Text style={[styles.paymentDate, { color: theme.colors.textSecondary }]}>{t('profile.paidOn')} {new Date(pay.date || pay.created_at).toLocaleDateString()}</Text>
                          </View>
                          <View style={styles.paymentAmountBox}>
                            <Text style={styles.paymentAmount}>{formatNumber(pay.amount_paid)} FCFA</Text>
                            <View style={styles.statusBadge}>
                               <Text style={styles.statusText}>{pay.status === 'PAID' ? t('profile.paidStatus') : t('profile.pendingStatus')}</Text>
                            </View>
                          </View>
                       </View>
                       {index !== payrolls.length - 1 && <View style={styles.divider} />}
                     </View>
                   ))
                 ) : (
                   <Text style={{ textAlign: 'center', color: theme.colors.textSecondary, padding: 20 }}>{t('profile.noPayments')}</Text>
                 )}
              </Card>

              <SectionHeader title={t('profile.accountSecurity')} />
              <Card style={styles.sectionCard}>
                <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => {
                        setIsChangingPassword(true);
                        setIsEditing(false);
                    }}
                >
                    <View style={[styles.iconBox, { backgroundColor: theme.colors.primary + '15' }]}>
                      <MaterialIcons name="lock-outline" size={20} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.actionLabel, { color: theme.colors.text }]}>{t('profile.changePassword')}</Text>
                        <Text style={styles.actionSub}>{t('profile.changePasswordDesc')}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color={theme.colors.border} />
                </TouchableOpacity>
              </Card>

              <SectionHeader title={t('profile.settings')} />
              <Card style={styles.sectionCard}>
                <View style={styles.compactSettingsRow}>
                  <TouchableOpacity
                    style={styles.compactBtn}
                    onPress={() => {
                      Alert.alert(
                        t('profile.chooseTheme'),
                        "",
                        [
                          { text: t('settings.themeLight'), onPress: () => setThemeMode('light') },
                          { text: t('settings.themeDark'), onPress: () => setThemeMode('dark') },
                          { text: t('settings.themeAuto'), onPress: () => setThemeMode('auto') },
                          { text: t('common.cancel'), style: 'cancel' }
                        ]
                      );
                    }}
                  >
                    <View style={[styles.compactIconBox, { backgroundColor: theme.colors.primary + '15' }]}>
                      <MaterialIcons name="palette" size={22} color={theme.colors.primary} />
                    </View>
                    <Text style={[styles.compactBtnText, { color: theme.colors.text }]}>{t('profile.appearance')}</Text>
                  </TouchableOpacity>

                  <View style={styles.dividerVerticalSmall} />

                  <TouchableOpacity
                    style={styles.compactBtn}
                    onPress={() => {
                      Alert.alert(
                        t('profile.chooseLanguage'),
                        "",
                        [
                          { text: t('settings.langFrench'), onPress: () => setLanguage('fr') },
                          { text: t('settings.langEnglish'), onPress: () => setLanguage('en') },
                          { text: t('settings.langAuto'), onPress: () => setLanguage('auto') },
                          { text: t('common.cancel'), style: 'cancel' }
                        ]
                      );
                    }}
                  >
                    <View style={[styles.compactIconBox, { backgroundColor: theme.colors.primary + '15' }]}>
                      <MaterialIcons name="language" size={22} color={theme.colors.primary} />
                    </View>
                    <Text style={[styles.compactBtnText, { color: theme.colors.text }]}>{t('profile.language')}</Text>
                  </TouchableOpacity>

                  <View style={styles.dividerVerticalSmall} />

                  <View style={styles.compactBtn}>
                    <Switch
                      value={notifications}
                      onValueChange={toggleNotifications}
                      trackColor={{ false: '#767577', true: theme.colors.primary }}
                      style={{ transform: [{ scale: 0.8 }] }}
                    />
                    <Text style={[styles.compactBtnText, { color: theme.colors.text }]}>{t('profile.notifications')}</Text>
                  </View>
                </View>
              </Card>

              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <MaterialIcons name="power-settings-new" size={22} color="#FFF" />
                <Text style={styles.logoutButtonText}>{t('common.logout')}</Text>
              </TouchableOpacity>

              <View style={styles.footer}>
                <Text style={styles.versionText}>SOLFERME • Version {Constants.expoConfig?.version || '1.0.0'}</Text>
                <Text style={styles.footerSub}>{t('profile.footerSlogan')}</Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const SectionHeader = ({ title }: { title: string }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>{title}</Text>;
};

const InfoRow = ({ icon, label, value, theme }: any) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.infoRowStyled}>
      <View style={[styles.iconBox, { backgroundColor: theme.colors.primary + '15' }]}>
        <MaterialIcons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <View style={styles.infoTexts}>
        <Text style={styles.infoLabelStyled}>{label}</Text>
        <Text style={[styles.infoValueStyled, { color: theme.colors.text }]}>{value}</Text>
      </View>
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  upperHeader: {
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSection: { alignItems: 'center' },
  avatarWrapper: {
    position: 'relative',
    width: 100,
    height: 100,
    marginBottom: 12,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 0.8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFF',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#333',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: '#FFF',
    zIndex: 10
  },
  userNameHeader: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 10,
  },
  badgeHeader: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 5,
  },
  badgeTextHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  contentOverlap: {
    marginTop: -40,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  mainCard: {
    borderRadius: 20,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
    textAlign: 'center'
  },
  dividerVertical: {
    width: 0.8,
    height: 40,
    backgroundColor: theme.colors.border,
  },
  compactSettingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 15,
  },
  compactBtn: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 8,
  },
  compactIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  compactBtnText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dividerVerticalSmall: {
    width: 0.8,
    height: 20,
    backgroundColor: theme.colors.border,
  },
  logoutButton: {
    backgroundColor: theme.colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    marginTop: 30,
    marginHorizontal: 10,
    elevation: 4,
    shadowColor: theme.colors.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  logoutButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  scroll: { paddingBottom: 20 },
  scrollDesktop: { maxWidth: 800, width: '100%', alignSelf: 'center' },
  editForm: { width: '100%' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 15,
    height: 55,
    borderWidth: 0.8,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  inputSimple: {
    borderWidth: 0.8,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  sectionCard: { padding: 0, overflow: 'hidden', borderRadius: 20 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 25,
    marginBottom: 12,
    color: '#888',
    marginLeft: 5,
  },
  infoRowStyled: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  infoTexts: { flex: 1 },
  infoLabelStyled: { fontSize: 12, color: '#888' },
  infoValueStyled: { fontSize: 15, fontWeight: '500' },
  divider: { height: 0.8, backgroundColor: theme.colors.border, marginLeft: 70 },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  paymentInfo: { flex: 1 },
  paymentPeriod: { fontSize: 14, fontWeight: 'bold' },
  paymentDate: { fontSize: 11, marginTop: 2 },
  paymentAmountBox: { alignItems: 'flex-end' },
  paymentAmount: { fontSize: 15, fontWeight: 'bold', color: '#2E7D32' },
  statusBadge: {
    backgroundColor: theme.colors.success + '15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  statusText: { fontSize: 9, fontWeight: 'bold', color: theme.colors.success },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  actionLabel: { fontSize: 16, fontWeight: '600' },
  actionSub: { fontSize: 12, color: '#888', marginTop: 2 },
  tabletContent: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  footer: {
    alignItems: 'center',
    marginTop: 40,
  },
  footerIcon: {
    width: 40,
    height: 40,
    opacity: 0.8,
    marginBottom: 10,
  },
  versionText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#888',
  },
  footerSub: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 4,
  },
});