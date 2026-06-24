import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, TextInput, Switch, useWindowDimensions, ActivityIndicator, Image, Platform } from 'react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { getProfileImageUrl } from '../utils/media';

import { LinearGradient } from 'expo-linear-gradient';

export const ProfileScreen = ({ navigation, route }: any) => {
  const { themeMode, setThemeMode, isDarkMode, notifications, toggleNotifications, theme } = useTheme();
  const { language, setLanguage, t } = useTranslation();
  const { logout, updateUser } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width > 600;

  const styles = useMemo(() => createStyles(theme), [theme]);

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [farmCount, setFarmCount] = useState<number | null>(null);
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);

  // Form State
  const [editData, setEditData] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  });

  // Password State
  const [showPasswordModal, setShowPasswordModal] = useState(route.params?.showPasswordModal || false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (route.params?.showPasswordModal) {
      setShowPasswordModal(true);
    }
  }, [route.params]);

  const loadUser = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/auth/user/');
      setUser(res.data);
      setEditData({
        name: res.data.name || '',
        email: res.data.email || '',
        phone: res.data.phone || '',
        address: res.data.address || ''
      });
      if (res.data.profile_image) {
        setProfileImage(res.data.profile_image);
        await AsyncStorage.setItem('user_image', res.data.profile_image);
      }
      await AsyncStorage.setItem('user_data', JSON.stringify(res.data));
      await updateUser();

      // Fetch dynamic stats
      if (res.data.role === 'PROPRIETAIRE') {
        try {
          const [farmsRes, employeesRes] = await Promise.all([
            apiClient.get('/farms/'),
            apiClient.get('/employees/')
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
          name: parsed.name || '',
          email: parsed.email || '',
          phone: parsed.phone || '',
          address: parsed.address || ''
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
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('profile.cameraPermissionError', { defaultValue: 'Désolé, nous avons besoin des permissions pour accéder à vos photos.' }));
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setProfileImage(uri);
      handleUploadImage(uri);
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

      const res = await apiClient.patch('/auth/user/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUser(res.data);
      if (res.data.profile_image) {
        setProfileImage(res.data.profile_image);
      }
      await updateUser(); // Mettre à jour le contexte global
      Alert.alert(t('common.success'), t('profile.updatePhotoSuccess'));
    } catch (e) {
      console.error('Upload error:', e);
      Alert.alert(t('common.error'), t('profile.updatePhotoError'));
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!editData.name || !editData.email) {
      Alert.alert(t('common.error'), t('profile.fillRequired', { defaultValue: 'Le nom et l\'email sont obligatoires.' }));
      return;
    }

    setUpdating(true);
    try {
      const res = await apiClient.patch('/auth/user/', editData);
      setUser(res.data);
      setIsEditing(false);
      Alert.alert(t('common.success'), t('profile.saveChangesSuccess', { defaultValue: 'Profil mis à jour avec succès.' }));
      await AsyncStorage.setItem('user_data', JSON.stringify(res.data));
    } catch (e) {
      Alert.alert(t('common.error'), t('profile.updateError', { defaultValue: 'Échec de la mise à jour.' }));
    } finally {
      setUpdating(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      Alert.alert(t('common.error'), t('profile.fillAllFields', { defaultValue: 'Veuillez remplir tous les champs.' }));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('common.error'), t('profile.passwordMismatch', { defaultValue: 'Les mots de passe ne correspondent pas.' }));
      return;
    }

    setUpdating(true);
    try {
      await apiClient.post('/auth/change-password/', {
        old_password: oldPassword,
        new_password: newPassword
      });
      Alert.alert(t('common.success'), t('profile.passwordSuccess'));
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

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>{title}</Text>
  );

  const SettingRow = ({ icon, title, value, onPress, type = 'link', switchValue, onSwitchChange }: any) => (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      disabled={type === 'switch'}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.iconBox, { backgroundColor: isDarkMode ? '#2C2C2C' : '#F5F5F5' }]}>
          <MaterialIcons name={icon} size={20} color={theme.colors.primary} />
        </View>
        <View>
          <Text style={[styles.settingLabel, { color: theme.colors.text }]}>{title}</Text>
          {value && <Text style={[styles.settingValue, { color: theme.colors.textSecondary }]}>{value}</Text>}
        </View>
      </View>
      {type === 'link' && <MaterialIcons name="chevron-right" size={24} color={theme.colors.border} />}
      {type === 'switch' && (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: '#767577', true: theme.colors.primary }}
        />
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const displayImage = getProfileImageUrl(profileImage);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.primary + '80']}
          style={styles.upperHeader}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.iconButton}>
              <MaterialIcons name="menu" size={24} color="#000" />
            </TouchableOpacity>
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

          <View style={styles.profileInfoContainer}>
            <View style={[styles.avatarWrapper, { borderColor: '#FFF' }]}>
              <View style={[styles.avatar, { backgroundColor: '#FFF' }]}>
                {displayImage ? (
                  <Image source={{ uri: displayImage }} style={styles.avatarImage} />
                ) : (
                  <Text style={[styles.avatarInitial, { color: theme.colors.primary }]}>{user?.name?.[0]?.toUpperCase() || 'U'}</Text>
                )}
              </View>
              <TouchableOpacity style={styles.cameraBtn} onPress={pickImage}>
                <MaterialIcons name="photo-camera" size={16} color="#FFF" />
              </TouchableOpacity>
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
        </LinearGradient>

        <View style={[styles.contentOverlap, isTablet && styles.tabletContent]}>
          {isEditing ? (
            <Card style={styles.mainCard}>
              <Text style={styles.cardTitle}>{t('profile.editInfo')}</Text>
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
                  <MaterialIcons name="email" size={20} color={theme.colors.primary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.colors.text }]}
                    placeholder={t('profile.email')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={editData.email}
                    onChangeText={(v) => setEditData({...editData, email: v})}
                  />
                </View>
                <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#2C2C2C' : '#F5F5F5', borderColor: theme.colors.border }]}>
                  <MaterialIcons name="phone" size={20} color={theme.colors.primary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.colors.text }]}
                    placeholder={t('profile.phone')}
                    keyboardType="phone-pad"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={editData.phone}
                    onChangeText={(v) => setEditData({...editData, phone: v})}
                  />
                </View>
                <View style={[styles.inputContainer, { height: 100, alignItems: 'flex-start', paddingTop: 12, backgroundColor: isDarkMode ? '#2C2C2C' : '#F5F5F5', borderColor: theme.colors.border }]}>
                  <MaterialIcons name="location-on" size={20} color={theme.colors.primary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.colors.text, height: '100%' }]}
                    placeholder={t('profile.address')}
                    multiline
                    placeholderTextColor={theme.colors.textSecondary}
                    value={editData.address}
                    onChangeText={(v) => setEditData({...editData, address: v})}
                  />
                </View>
                <Button title={t('profile.saveChanges')} onPress={handleUpdateProfile} loading={updating} style={{marginTop: 10}} />
              </View>
            </Card>
          ) : (
            <>
              <Card style={styles.mainCard}>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <View style={[styles.statIconBox, { backgroundColor: theme.colors.primary + '15' }]}>
                      <MaterialCommunityIcons name="silo" size={24} color={theme.colors.primary} />
                    </View>
                    <Text style={[styles.statValue, { color: theme.colors.text }]}>
                      {user?.role === 'PROPRIETAIRE' ? (farmCount !== null ? farmCount : '...') : '1'}
                    </Text>
                    <Text style={styles.statLabel}>{user?.role === 'PROPRIETAIRE' ? t('profile.stats.farms') : t('profile.stats.position')}</Text>
                  </View>

                  <View style={styles.dividerVertical} />

                  {user?.role === 'PROPRIETAIRE' && (
                    <>
                      <View style={styles.statItem}>
                        <View style={[styles.statIconBox, { backgroundColor: '#4CAF5015' }]}>
                          <MaterialIcons name="people" size={24} color="#4CAF50" />
                        </View>
                        <Text style={[styles.statValue, { color: theme.colors.text }]}>
                          {employeeCount !== null ? employeeCount : '...'}
                        </Text>
                        <Text style={styles.statLabel}>{t('employees.title')}</Text>
                      </View>
                      <View style={styles.dividerVertical} />
                    </>
                  )}

                  <View style={styles.statItem}>
                    <View style={[styles.statIconBox, { backgroundColor: (user?.is_active !== false ? theme.colors.success : theme.colors.danger) + '15' }]}>
                      <MaterialIcons name="verified-user" size={24} color={user?.is_active !== false ? theme.colors.success : theme.colors.danger} />
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
                <View style={styles.divider} />
                <SettingRow icon="phone-android" title={t('profile.phone')} value={user?.phone || t('common.noData')} />
                <View style={styles.divider} />
                <SettingRow icon="map" title={t('profile.address')} value={user?.address || t('common.noData')} />
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
                          { text: "Français", onPress: () => setLanguage('fr') },
                          { text: "English", onPress: () => setLanguage('en') },
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

              <SectionHeader title={t('profile.security')} />
              <Card style={styles.sectionCard}>
                <SettingRow
                  icon="security"
                  title={t('profile.changePassword')}
                  value={t('profile.changePasswordDesc')}
                  onPress={() => setShowPasswordModal(true)}
                />
              </Card>

              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <MaterialIcons name="power-settings-new" size={22} color="#FFF" />
                <Text style={styles.logoutButtonText}>{t('common.logout')}</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.footer}>
            <Text style={styles.versionText}>SOLFERME • Version {Constants.expoConfig?.version || '1.0.0'}</Text>
            <Text style={styles.footerSub}>{t('profile.footerSlogan')}</Text>
          </View>
        </View>
      </ScrollView>

      {showPasswordModal && (
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>{t('profile.security')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: isDarkMode ? '#2C2C2C' : theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder={t('profile.oldPassword')}
              placeholderTextColor={theme.colors.textSecondary}
              secureTextEntry
              value={oldPassword}
              onChangeText={setOldPassword}
            />
            <TextInput
              style={[styles.input, { backgroundColor: isDarkMode ? '#2C2C2C' : theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder={t('profile.newPassword')}
              placeholderTextColor={theme.colors.textSecondary}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              style={[styles.input, { backgroundColor: isDarkMode ? '#2C2C2C' : theme.colors.background, color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder={t('profile.confirmPassword')}
              placeholderTextColor={theme.colors.textSecondary}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPasswordModal(false)}>
                <Text style={{ color: theme.colors.textSecondary }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <Button title={t('common.confirm')} onPress={handleChangePassword} loading={updating} style={{ flex: 1, marginLeft: 10 }} />
            </View>
          </Card>
        </View>
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
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
  profileInfoContainer: {
    alignItems: 'center',
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
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 10 },
      android: { elevation: 8 }
    }),
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
    width: 48,
    height: 48,
    borderRadius: 24,
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
  },
  dividerVertical: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.05)',
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
    width: 1,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
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
  versionText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#AAA',
    letterSpacing: 2,
  },
  footerSub: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
    zIndex: 2000
  },
  tabletContent: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  modalCard: { padding: 24, borderRadius: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modalActions: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  cancelBtn: { padding: 15, marginRight: 10 },
  // Missing styles from SettingRow and others
  sectionTitle: { fontSize: 14, fontWeight: 'bold', marginVertical: 10, paddingHorizontal: 5, textTransform: 'uppercase' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  settingLeft: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  settingLabel: { fontSize: 14, fontWeight: '600' },
  settingValue: { fontSize: 12, marginTop: 2 },
  sectionCard: { padding: 15, borderRadius: 16, marginBottom: 20 },
  scrollContent: { paddingBottom: 20 },
  avatarWrapper: { position: 'relative', width: 100, height: 100, borderRadius: 50, borderWidth: 4, padding: 2 },
  avatar: { width: '100%', height: '100%', borderRadius: 50, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 32, fontWeight: 'bold' },
  cameraBtn: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#000', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  editForm: { marginTop: 10 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 50, marginBottom: 15 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14 },
  footer: { alignItems: 'center', marginTop: 30, paddingBottom: 20 },
});
