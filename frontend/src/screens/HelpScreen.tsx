import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Linking, Alert, LayoutAnimation, UIManager, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
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
            <Text style={styles.helpSubtitle}>En savoir plus</Text>
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

  const styles = createStyles(theme);

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
        <HelpItem 
          title={t('settings.guides.offline.title')}
          icon="☁️" 
          content={t('settings.guides.offline.content')}
        />

        <Text style={styles.sectionLabel}>Support</Text>
        <TouchableOpacity style={styles.supportButton} onPress={() => Linking.openURL('mailto:support@solferme.com')}>
          <Text style={styles.supportButtonText}>{t('settings.contactSupport')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.supportButtonSecondary} onPress={() => Alert.alert('FAQ', 'La FAQ complète est accessible sur www.solferme.com/faq')}>
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
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text },
  content: { padding: theme.spacing.m },
  searchBar: { backgroundColor: theme.colors.surface, padding: theme.spacing.l, borderRadius: theme.borderRadius.l, marginBottom: theme.spacing.xl, ...theme.shadows.light },
  searchText: { color: theme.colors.textSecondary, fontSize: 16 },
  sectionLabel: { fontSize: 14, fontWeight: 'bold', color: theme.colors.textSecondary, marginBottom: theme.spacing.m, textTransform: 'uppercase' },
  helpCard: { marginBottom: theme.spacing.s },
  helpHeaderRow: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.m },
  helpExpandedContent: { padding: theme.spacing.m, paddingTop: 0, borderTopWidth: 1, borderTopColor: theme.colors.border + '40', marginTop: 8 },
  helpExpandedText: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22, marginTop: 12 },
  helpIcon: { fontSize: 24, marginRight: theme.spacing.m },
  helpTextContainer: { flex: 1 },
  helpTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  helpSubtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  supportButton: { backgroundColor: theme.colors.primary, padding: theme.spacing.l, borderRadius: theme.borderRadius.xl, alignItems: 'center', marginTop: theme.spacing.l },
  supportButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  supportButtonSecondary: { padding: theme.spacing.l, alignItems: 'center', marginTop: theme.spacing.s },
  supportButtonTextSecondary: { color: theme.colors.primary, fontWeight: '600', fontSize: 16 }
});
