import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, TextInput, Switch, ActivityIndicator, Image, Platform } from 'react-native';
import { toast } from '../utils/toast';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { repositoryProvider } from '../repositories';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { appendImageToFormData, MULTIPART_HEADERS } from '../utils/imageUpload';
import { PhotoActionSheet } from '../components/PhotoActionSheet';
import Constants from 'expo-constants';
import { getProfileImageUrl } from '../utils/media';
import { getErrorMessage } from '../utils/errors';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, useContentWidth, space, radius } from '../components/ui';

export const ProfileScreen = ({ navigation, route }: any) => {
  const { setThemeMode, isDarkMode, notifications, toggleNotifications, theme } = useTheme();
  const { setLanguage, t } = useTranslation();
  const { logout, updateUser } = useAuth();
  const contentW = useContentWidth('narrow');
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [farmCount, setFarmCount] = useState<number | null>(null);
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);

  const [editData, setEditData] = useState({ name: '', email: '', phone: '', address: '' });

  const [showPasswordModal, setShowPasswordModal] = useState(route.params?.showPasswordModal || false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => { loadUser(); }, []);
  useEffect(() => { if (route.params?.showPasswordModal) setShowPasswordModal(true); }, [route.params]);

  const loadUser = async () => {
    try {
      setLoading(true);
      const res = await repositoryProvider.api.get('/auth/user/');
      setUser(res.data);
      setEditData({
        name: res.data.name || '', email: res.data.email || '',
        phone: res.data.phone || '', address: res.data.address || '',
      });
      if (res.data.profile_image) {
        setProfileImage(res.data.profile_image);
        await AsyncStorage.setItem('user_image', res.data.profile_image);
      }
      await AsyncStorage.setItem('user_data', JSON.stringify(res.data));
      await updateUser();

      if (res.data.role === 'PROPRIETAIRE') {
        try {
          const [farmsRes, employeesRes] = await Promise.all([
            repositoryProvider.api.get('/farms/'),
            repositoryProvider.api.get('/employees/'),
          ]);
          const fCount = Array.isArray(farmsRes.data) ? farmsRes.data.length : 0;
          const eCount = Array.isArray(employeesRes.data) ? employeesRes.data.length : 0;
          setFarmCount(fCount);
          setEmployeeCount(eCount);
          await AsyncStorage.setItem('owner_stats', JSON.stringify({ farmCount: fCount, employeeCount: eCount }));
        } catch (e) {
          const cachedStats = await AsyncStorage.getItem('owner_stats');
          if (cachedStats) {
            const parsed = JSON.parse(cachedStats);
            setFarmCount(parsed.farmCount);
            setEmployeeCount(parsed.employeeCount);
          }
        }
      }
    } catch (e) {
      const cached = await AsyncStorage.getItem('user_data');
      if (cached) {
        const parsed = JSON.parse(cached);
        setUser(parsed);
        setEditData({
          name: parsed.name || '', email: parsed.email || '',
          phone: parsed.phone || '', address: parsed.address || '',
        });
        if (parsed.profile_image) setProfileImage(parsed.profile_image);
      }
      const cachedStats = await AsyncStorage.getItem('owner_stats');
      if (cachedStats) {
        const parsed = JSON.parse(cachedStats);
        setFarmCount(parsed.farmCount);
        setEmployeeCount(parsed.employeeCount);
      }
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('common.error'), t('profile.cameraPermissionError')); return; }
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setProfileImage(asset.uri);
      handleUploadImage(asset);
    }
  };

  const handleUploadImage = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      setUpdating(true);
      const formData = new FormData();
      appendImageToFormData(formData, asset, 'profile_image');
      const res = await repositoryProvider.api.patch('/auth/user/', formData, {
        headers: MULTIPART_HEADERS,
      });
      setUser(res.data);
      if (res.data.profile_image) setProfileImage(res.data.profile_image);
      await updateUser();
      toast.success(t('common.success'), t('profile.updatePhotoSuccess'));
    } catch (e) {
      console.error('Upload error:', e);
      toast.error(t('common.error'), getErrorMessage(e, t('profile.updatePhotoError')));
    } finally {
      setUpdating(false);
    }
  };

  const handleRemoveImage = async () => {
    try {
      setUpdating(true);
      const res = await repositoryProvider.api.patch('/auth/user/', { profile_image: null });
      setUser(res.data);
      setProfileImage(null);
      await updateUser();
      toast.success(t('common.success'), t('profile.removePhotoSuccess'));
    } catch (e) {
      console.error('Remove error:', e);
      toast.error(t('common.error'), getErrorMessage(e, t('profile.removePhotoError')));
    } finally {
      setUpdating(false);
    }
  };

  // `Alert.alert(title, message, buttons)` avec plusieurs boutons ne fait rien
  // sur Web (no-op de react-native-web) — d'où le bouton photo "mort" quand
  // une photo existait déjà. On passe par une feuille d'actions maison,
  // identique sur Android/iOS/Web (voir <PhotoActionSheet/>).
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const showImageOptions = () => {
    if (!profileImage) { pickImage(); return; }
    setPhotoSheetVisible(true);
  };

  const handleUpdateProfile = async () => {
    if (!editData.name || !editData.email) { toast.error(t('common.error'), t('profile.fillRequired')); return; }
    setUpdating(true);
    try {
      const res = await repositoryProvider.api.patch('/auth/user/', editData);
      setUser(res.data);
      setIsEditing(false);
      toast.success(t('common.success'), t('profile.saveChangesSuccess'));
      await AsyncStorage.setItem('user_data', JSON.stringify(res.data));
    } catch (e) {
      toast.error(t('common.error'), getErrorMessage(e, t('profile.updateError')));
    } finally {
      setUpdating(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) { toast.error(t('common.error'), t('profile.fillAllFields')); return; }
    if (newPassword !== confirmPassword) { toast.error(t('common.error'), t('profile.passwordMismatch')); return; }
    setUpdating(true);
    try {
      await repositoryProvider.api.post('/auth/change-password/', { old_password: oldPassword, new_password: newPassword });
      toast.success(t('common.success'), t('profile.passwordSuccess'));
      setShowPasswordModal(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      const msg = e.response?.data?.error || t('profile.passwordError');
      Alert.alert(t('common.error'), msg);
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = () => {
    // Alert.alert à boutons multiples ne fait rien sur Web (no-op de
    // react-native-web) — sans ce branchement, ce bouton était mort sur Web.
    if (Platform.OS === 'web') {
      if (window.confirm(t('profile.logoutConfirm'))) logout();
      return;
    }
    Alert.alert(t('common.logout'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.logout'), style: 'destructive', onPress: () => logout() },
    ]);
  };

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>{title}</Text>
  );

  const SettingRow = ({ icon, title, value, onPress }: any) => (
    <Pressable style={styles.settingRow} onPress={onPress}>
      <View style={styles.settingLeft}>
        <View style={[styles.iconBox, { backgroundColor: isDarkMode ? '#2C2C2C' : '#F5F5F5' }]}>
          <MaterialIcons name={icon} size={19} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.settingLabel, { color: theme.colors.text }]}>{title}</Text>
          {value ? <Text style={[styles.settingValue, { color: theme.colors.textSecondary }]} numberOfLines={1}>{value}</Text> : null}
        </View>
      </View>
      {onPress && <MaterialIcons name="chevron-right" size={22} color={theme.colors.border} />}
    </Pressable>
  );

  if (loading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.centered}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      </Screen>
    );
  }

  const displayImage = getProfileImageUrl(profileImage);

  return (
    <Screen scroll padded={false} width="wide" edges={['top']}>
      <LinearGradient colors={[theme.colors.primary, theme.colors.primary + '80']} style={styles.upperHeader}>
        <View style={[styles.headerInner, contentW]}>
          <View style={styles.headerTop}>
            {Platform.OS !== 'web' && (
              <Pressable onPress={() => navigation.openDrawer()} style={styles.iconButton}>
                <MaterialIcons name="menu" size={22} color="#000" />
              </Pressable>
            )}
            <Text style={styles.headerTitleText}>{t('profile.title')}</Text>
            <Pressable onPress={() => setIsEditing(!isEditing)} style={styles.iconButton}>
              <MaterialIcons name={isEditing ? 'close' : 'edit'} size={22} color={isEditing ? '#D32F2F' : '#000'} />
            </Pressable>
          </View>

          <View style={styles.profileInfoContainer}>
            <View style={[styles.avatarWrapper, { borderColor: '#FFF' }]}>
              <View style={[styles.avatar, { backgroundColor: '#FFF' }]}>
                {displayImage ? (
                  <Image source={{ uri: displayImage }} style={styles.avatarImage} />
                ) : (
                  <Text style={[styles.avatarInitial, { color: theme.colors.primary }]}>{user?.name?.[0]?.toUpperCase() || 'U'}</Text>
                )}
              </View>
              <Pressable style={styles.cameraBtn} onPress={showImageOptions}>
                <MaterialIcons name="photo-camera" size={15} color="#FFF" />
              </Pressable>
            </View>

            {!isEditing && (
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.userNameHeader}>{user?.name}</Text>
                <View style={styles.badgeHeader}>
                  <Text style={styles.badgeTextHeader}>{user?.role === 'PROPRIETAIRE' ? t('profile.owner') : t('profile.employee')}</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.contentOverlap, contentW]}>
        {isEditing ? (
          <Card style={styles.mainCard}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('profile.editInfo')}</Text>
            <View style={{ marginTop: space.sm }}>
              {([
                ['person', t('profile.fullName'), 'name', {}],
                ['email', t('profile.email'), 'email', { keyboardType: 'email-address', autoCapitalize: 'none' }],
                ['phone', t('profile.phone'), 'phone', { keyboardType: 'phone-pad', maxLength: 9 }],
              ] as any[]).map(([icon, ph, key, extra]) => (
                <View key={key} style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#2C2C2C' : '#F5F5F5', borderColor: theme.colors.border }]}>
                  <MaterialIcons name={icon} size={19} color={theme.colors.primary} style={{ marginRight: 10 }} />
                  <TextInput
                    style={[styles.input, { color: theme.colors.text }]}
                    placeholder={ph}
                    placeholderTextColor={theme.colors.textSecondary}
                    value={(editData as any)[key]}
                    onChangeText={(v) => setEditData({ ...editData, [key]: v })}
                    {...extra}
                  />
                </View>
              ))}
              <View style={[styles.inputContainer, { height: 100, alignItems: 'flex-start', paddingTop: 12, backgroundColor: isDarkMode ? '#2C2C2C' : '#F5F5F5', borderColor: theme.colors.border }]}>
                <MaterialIcons name="location-on" size={19} color={theme.colors.primary} style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.input, { color: theme.colors.text, height: '100%' }]}
                  placeholder={t('profile.address')}
                  multiline
                  placeholderTextColor={theme.colors.textSecondary}
                  value={editData.address}
                  onChangeText={(v) => setEditData({ ...editData, address: v })}
                />
              </View>
              <Button title={t('profile.saveChanges')} onPress={handleUpdateProfile} loading={updating} style={{ marginTop: space.sm }} />
            </View>
          </Card>
        ) : (
          <>
            <Card style={styles.mainCard}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <View style={[styles.statIconBox, { backgroundColor: theme.colors.primary + '15' }]}>
                    <MaterialCommunityIcons name="silo" size={22} color={theme.colors.primary} />
                  </View>
                  <Text style={[styles.statValue, { color: theme.colors.text }]}>
                    {user?.role === 'PROPRIETAIRE' ? (farmCount !== null ? farmCount : '...') : '1'}
                  </Text>
                  <Text style={styles.statLabel}>{user?.role === 'PROPRIETAIRE' ? t('profile.stats.farms') : t('profile.stats.position')}</Text>
                </View>
                <View style={[styles.dividerVertical, { backgroundColor: theme.colors.border }]} />
                {user?.role === 'PROPRIETAIRE' && (
                  <>
                    <View style={styles.statItem}>
                      <View style={[styles.statIconBox, { backgroundColor: '#4CAF5015' }]}>
                        <MaterialIcons name="people" size={22} color="#4CAF50" />
                      </View>
                      <Text style={[styles.statValue, { color: theme.colors.text }]}>{employeeCount !== null ? employeeCount : '...'}</Text>
                      <Text style={styles.statLabel}>{t('employees.title')}</Text>
                    </View>
                    <View style={[styles.dividerVertical, { backgroundColor: theme.colors.border }]} />
                  </>
                )}
                <View style={styles.statItem}>
                  <View style={[styles.statIconBox, { backgroundColor: (user?.is_active !== false ? '#2E7D32' : theme.colors.danger) + '15' }]}>
                    <MaterialIcons name="verified-user" size={22} color={user?.is_active !== false ? '#2E7D32' : theme.colors.danger} />
                  </View>
                  <Text style={[styles.statValue, { color: theme.colors.text }]}>
                    {user?.is_active !== false ? t('profile.active') : t('profile.inactive')}
                  </Text>
                  <Text style={styles.statLabel}>{t('profile.stats.status')}</Text>
                </View>
              </View>
            </Card>

            <SectionHeader title={t('profile.contact')} />
            <Card style={styles.sectionCard}>
              <SettingRow icon="alternate-email" title={t('profile.email')} value={user?.email} />
              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              <SettingRow icon="phone-android" title={t('profile.phone')} value={user?.phone || t('common.noData')} />
              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              <SettingRow icon="map" title={t('profile.address')} value={user?.address || t('common.noData')} />
            </Card>

            <SectionHeader title={t('profile.settings')} />
            <Card style={styles.sectionCard}>
              <View style={styles.compactSettingsRow}>
                <Pressable
                  style={styles.compactBtn}
                  onPress={() => {
                    // Alert.alert à boutons multiples ne fait rien sur Web.
                    if (Platform.OS === 'web') {
                      const choice = window.prompt(
                        `${t('profile.chooseTheme')}\n\n1: ${t('settings.themeLight')}\n2: ${t('settings.themeDark')}\n3: ${t('settings.themeAuto')}\n\nEntrez 1, 2 ou 3:`,
                        '',
                      );
                      if (choice === '1') setThemeMode('light');
                      else if (choice === '2') setThemeMode('dark');
                      else if (choice === '3') setThemeMode('auto');
                      return;
                    }
                    Alert.alert(t('profile.chooseTheme'), '', [
                      { text: t('settings.themeLight'), onPress: () => setThemeMode('light') },
                      { text: t('settings.themeDark'), onPress: () => setThemeMode('dark') },
                      { text: t('settings.themeAuto'), onPress: () => setThemeMode('auto') },
                      { text: t('common.cancel'), style: 'cancel' },
                    ]);
                  }}
                >
                  <View style={[styles.compactIconBox, { backgroundColor: theme.colors.primary + '15' }]}>
                    <MaterialIcons name="palette" size={20} color={theme.colors.primary} />
                  </View>
                  <Text style={[styles.compactBtnText, { color: theme.colors.text }]}>{t('profile.appearance')}</Text>
                </Pressable>
                <View style={[styles.dividerVerticalSmall, { backgroundColor: theme.colors.border }]} />
                <Pressable
                  style={styles.compactBtn}
                  onPress={() => {
                    // Alert.alert à boutons multiples ne fait rien sur Web.
                    if (Platform.OS === 'web') {
                      const choice = window.prompt(
                        `${t('profile.chooseLanguage')}\n\n1: Français\n2: English\n3: ${t('settings.langAuto')}\n\nEntrez 1, 2 ou 3:`,
                        '',
                      );
                      if (choice === '1') setLanguage('fr');
                      else if (choice === '2') setLanguage('en');
                      else if (choice === '3') setLanguage('auto');
                      return;
                    }
                    Alert.alert(t('profile.chooseLanguage'), '', [
                      { text: 'Français', onPress: () => setLanguage('fr') },
                      { text: 'English', onPress: () => setLanguage('en') },
                      { text: t('settings.langAuto'), onPress: () => setLanguage('auto') },
                      { text: t('common.cancel'), style: 'cancel' },
                    ]);
                  }}
                >
                  <View style={[styles.compactIconBox, { backgroundColor: theme.colors.primary + '15' }]}>
                    <MaterialIcons name="language" size={20} color={theme.colors.primary} />
                  </View>
                  <Text style={[styles.compactBtnText, { color: theme.colors.text }]}>{t('profile.language')}</Text>
                </Pressable>
                <View style={[styles.dividerVerticalSmall, { backgroundColor: theme.colors.border }]} />
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

            <SectionHeader title={t('profile.security')} />
            <Card style={styles.sectionCard}>
              <SettingRow icon="security" title={t('profile.changePassword')} value={t('profile.changePasswordDesc')} onPress={() => setShowPasswordModal(true)} />
            </Card>

            <Pressable style={[styles.logoutButton, { backgroundColor: theme.colors.danger }]} onPress={handleLogout}>
              <MaterialIcons name="power-settings-new" size={20} color="#FFF" />
              <Text style={styles.logoutButtonText}>{t('common.logout')}</Text>
            </Pressable>
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.versionText}>SOLFERME • Version {Constants.expoConfig?.version || '1.0.0'}</Text>
          <Text style={styles.footerSub}>{t('profile.footerSlogan')}</Text>
        </View>
      </View>

      {showPasswordModal && (
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>{t('profile.security')}</Text>
            {([
              [t('profile.oldPassword'), oldPassword, setOldPassword, showOldPassword, setShowOldPassword],
              [t('profile.newPassword'), newPassword, setNewPassword, showNewPassword, setShowNewPassword],
              [t('profile.confirmPassword'), confirmPassword, setConfirmPassword, showConfirmPassword, setShowConfirmPassword],
            ] as any[]).map(([ph, val, setVal, show, setShow], i) => (
              <View key={i} style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#2C2C2C' : theme.colors.background, borderColor: theme.colors.border }]}>
                <TextInput
                  style={[styles.input, { color: theme.colors.text }]}
                  placeholder={ph}
                  placeholderTextColor={theme.colors.textSecondary}
                  secureTextEntry={!show}
                  value={val}
                  onChangeText={setVal}
                />
                <Pressable onPress={() => setShow(!show)}>
                  <MaterialIcons name={show ? 'visibility-off' : 'visibility'} size={19} color={theme.colors.textSecondary} />
                </Pressable>
              </View>
            ))}
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowPasswordModal(false)}>
                <Text style={{ color: theme.colors.textSecondary }}>{t('common.cancel')}</Text>
              </Pressable>
              <Button title={t('common.confirm')} onPress={handleChangePassword} loading={updating} style={{ flex: 1, marginLeft: 10 }} />
            </View>
          </Card>
        </View>
      )}

      <PhotoActionSheet
        visible={photoSheetVisible}
        onClose={() => setPhotoSheetVisible(false)}
        onChangePhoto={pickImage}
        onRemovePhoto={handleRemoveImage}
        title={t('profile.photoTitle')}
        subtitle={t('profile.photoOption')}
        changeLabel={t('profile.changePhoto')}
        removeLabel={t('profile.removePhoto')}
        cancelLabel={t('common.cancel')}
      />
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  upperHeader: { paddingTop: space.lg, paddingBottom: space.xxl + 20, width: '100%' },
  headerInner: { paddingHorizontal: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  headerTitleText: { fontSize: 18, fontWeight: '800', color: '#000' },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  profileInfoContainer: { alignItems: 'center' },
  userNameHeader: { fontSize: 23, fontWeight: '800', color: '#000', marginTop: 10 },
  badgeHeader: { backgroundColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill, marginTop: 5 },
  badgeTextHeader: { fontSize: 12, fontWeight: '800', color: '#000' },
  contentOverlap: { marginTop: -40, paddingHorizontal: 20, paddingBottom: 40 },
  mainCard: { borderRadius: radius.xl, padding: space.lg },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: space.md, textAlign: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  statItem: { alignItems: 'center', flex: 1 },
  statIconBox: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statValue: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 2, textTransform: 'uppercase', fontWeight: '700', textAlign: 'center' },
  dividerVertical: { width: StyleSheet.hairlineWidth, height: 40 },
  compactSettingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: space.md },
  compactBtn: { alignItems: 'center', flex: 1, paddingVertical: 8, gap: 6 },
  compactIconBox: { width: 44, height: 44, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  compactBtnText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  dividerVerticalSmall: { width: StyleSheet.hairlineWidth, height: 20 },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: radius.md, marginTop: space.xl, gap: 10 },
  logoutButtonText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  versionText: { fontSize: 12, fontWeight: '900', color: '#AAA', letterSpacing: 2 },
  footerSub: { fontSize: 12, color: '#AAA', marginTop: 4, textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20, zIndex: 2000 },
  modalCard: { padding: space.lg, borderRadius: radius.xl, alignSelf: 'center', width: '100%', maxWidth: 460 },
  modalTitle: { fontSize: 19, fontWeight: '800', marginBottom: space.md, textAlign: 'center' },
  modalActions: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm },
  cancelBtn: { padding: 15, marginRight: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '800', marginVertical: 10, paddingHorizontal: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, gap: 8 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  iconBox: { width: 36, height: 36, borderRadius: radius.sm, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 14, fontWeight: '600' },
  settingValue: { fontSize: 12, marginTop: 2 },
  sectionCard: { padding: space.md, borderRadius: radius.lg, marginBottom: space.lg },
  avatarWrapper: { position: 'relative', width: 96, height: 96, borderRadius: 48, borderWidth: 1, padding: 2 },
  avatar: { width: '100%', height: '100%', borderRadius: 46, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 30, fontWeight: '800' },
  cameraBtn: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#000', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FFF' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, height: 50, marginBottom: space.md },
  input: { flex: 1, fontSize: 14 },
  footer: { alignItems: 'center', marginTop: space.xl, paddingBottom: space.lg },
});
