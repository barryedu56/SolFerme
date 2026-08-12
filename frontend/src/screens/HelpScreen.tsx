import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Linking, Alert, LayoutAnimation, UIManager, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { MaterialIcons } from '@expo/vector-icons';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

export const HelpScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const HelpItem = ({ title, icon, content }: any) => {
    const [expanded, setExpanded] = useState(false);
    
    const toggleExpand = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded(!expanded);
    };

    return (
      <Card style={styles.helpCard}>
        <TouchableOpacity onPress={toggleExpand} style={styles.helpHeaderRow}>
          <Text style={styles.helpIcon}>{icon}</Text>
          <View style={styles.helpTextContainer}>
            <Text style={styles.helpTitle}>{title}</Text>
            <Text style={styles.helpSubtitle}>{t('common.learnMore') || 'En savoir plus'}</Text>
          </View>
          <MaterialIcons name={expanded ? "expand-less" : "expand-more"} size={24} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        {expanded && (
          <View style={styles.helpExpandedContent}>
            <Text style={styles.helpExpandedText}>{content}</Text>
          </View>
        )}
      </Card>
    );
  };



  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()}>
          <MaterialIcons name="menu" size={24} color={theme.colors.primary} style={{marginRight: theme.spacing.m}} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('settings.help')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.searchBar}>
          <Text style={styles.searchText}>{t('settings.helpSearch')}</Text>
        </View>

        <Text style={styles.sectionLabel}>{t('settings.helpGuides')}</Text>

        {userRole === 'EMPLOYE' ? (
          <>
            <HelpItem
              title={t('settings.guides.employee.production.title')}
              icon="🥚"
              content={t('settings.guides.employee.production.content')}
            />
            <HelpItem
              title={t('settings.guides.employee.tasks.title')}
              icon="📋"
              content={t('settings.guides.employee.tasks.content')}
            />
            <HelpItem
              title={t('settings.guides.employee.lots.title')}
              icon="🏘️"
              content={t('settings.guides.employee.lots.content')}
            />
          </>
        ) : (
          <>
            <HelpItem
              title={t('settings.guides.farms.title')}
              icon="🐔"
              content={t('settings.guides.farms.content')}
            />
            <HelpItem
              title={t('settings.guides.production.title')}
              icon="🥚"
              content={t('settings.guides.production.content')}
            />
            <HelpItem
              title={t('settings.guides.staff.title')}
              icon="👥"
              content={t('settings.guides.staff.content')}
            />
          </>
        )}

        <HelpItem 
          title={t('settings.guides.offline.title')}
          icon="☁️" 
          content={t('settings.guides.offline.content')}
        />

        <Text style={styles.sectionLabel}>{t('settings.support') || 'Support'}</Text>
        <TouchableOpacity style={styles.supportButton} onPress={() => Linking.openURL('mailto:support@solferme.com')}>
          <Text style={styles.supportButtonText}>{t('settings.contactSupport')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.supportButtonSecondary} onPress={() => Alert.alert(t('settings.faq') || 'FAQ', t('settings.faqContent') || 'La FAQ complète est accessible sur www.solferme.com/faq')}>
          <Text style={styles.supportButtonTextSecondary}>{t('settings.consultFaq')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};


const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.m },
  menuIcon: { fontSize: 24, color: theme.colors.primary, marginRight: theme.spacing.m },
  title: { fontSize: 24, fontWeight: '900', color: theme.colors.text, textTransform: 'uppercase' },
  content: { padding: theme.spacing.m },
  searchBar: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.l,
    borderRadius: theme.borderRadius.l,
    marginBottom: theme.spacing.xl,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    ...theme.shadows.light
  },
  searchText: { fontSize: 16, fontWeight: '900', color: theme.colors.textSecondary, textTransform: 'uppercase' },
  sectionLabel: { fontSize: 14, fontWeight: '900', color: theme.colors.text, marginBottom: theme.spacing.m, textTransform: 'uppercase', letterSpacing: 1 },
  helpCard: {
    marginBottom: theme.spacing.s,
    borderWidth: 0.8,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.m,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface
  },
  helpHeaderRow: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.m },
  helpExpandedContent: {
    padding: theme.spacing.m,
    paddingTop: 0,
    borderTopWidth: 0.8,
    borderTopColor: theme.colors.border,
    marginTop: 8,
    backgroundColor: theme.colors.background
  },
  helpExpandedText: { fontSize: 14, color: theme.colors.text, lineHeight: 22, marginTop: 12, fontWeight: '600' },
  helpIcon: { fontSize: 24, marginRight: theme.spacing.m },
  helpTextContainer: { flex: 1 },
  helpTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text, textTransform: 'uppercase' },
  helpSubtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2, fontWeight: '700' },
  supportButton: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.l,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center',
    marginTop: theme.spacing.l,
    borderWidth: 1,
    borderColor: '#000000',
    ...theme.shadows.medium
  },
  supportButtonText: { color: '#000000', fontWeight: '900', fontSize: 16 },
  supportButtonSecondary: {
    padding: theme.spacing.l,
    alignItems: 'center',
    marginTop: theme.spacing.s,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: theme.colors.surface
  },
  supportButtonTextSecondary: { color: '#000000', fontWeight: 'bold', fontSize: 16 }
});
