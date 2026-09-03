import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Linking, LayoutAnimation, UIManager, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { helpCategories, faqItems, HelpArticle, FAQItem, HelpCategory } from '../data/helpContent';
import { Screen, ScreenHeader, Card, SectionHeader, EmptyState, space, radius, shadow } from '../components/ui';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

export const HelpScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const { isDesktop, isDesktopOrTablet } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFAQ, setShowFAQ] = useState(false);
  const [expandedFAQ, setExpandedFAQ] = useState<Set<number>>(new Set());

  const filteredCategories = useMemo(() => {
    return helpCategories.map(category => ({
      ...category,
      articles: category.articles.filter(article => {
        if (article.ownerOnly && userRole !== 'PROPRIETAIRE') return false;
        if (article.employeeOnly && userRole !== 'EMPLOYE') return false;
        return true;
      })
    })).filter(category => category.articles.length > 0);
  }, [userRole]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const results: { article: HelpArticle; category: string }[] = [];
    filteredCategories.forEach(category => {
      category.articles.forEach(article => {
        if (
          article.title.toLowerCase().includes(query) ||
          article.purpose.toLowerCase().includes(query) ||
          article.keyPoint.toLowerCase().includes(query) ||
          article.steps.some(step => step.toLowerCase().includes(query))
        ) {
          results.push({ article, category: category.title });
        }
      });
    });
    return results;
  }, [searchQuery, filteredCategories]);

  const filteredFAQ = useMemo(() => {
    if (!searchQuery.trim()) return faqItems;
    const query = searchQuery.toLowerCase();
    return faqItems.filter(item =>
      item.question.toLowerCase().includes(query) ||
      item.answer.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const toggleFAQ = (index: number) => {
    animate();
    const newExpanded = new Set(expandedFAQ);
    if (newExpanded.has(index)) newExpanded.delete(index);
    else newExpanded.add(index);
    setExpandedFAQ(newExpanded);
  };

  const handleNavigateToScreen = (screenName: string) => {
    navigation.navigate('MainTabs', { screen: screenName });
  };

  const goHome = () => {
    animate();
    setSelectedCategory(null);
    setShowFAQ(false);
  };

  const openCategory = (id: string) => {
    animate();
    setSelectedCategory(id);
    setSelectedArticle(null);
    setShowFAQ(false);
  };

  const openFAQ = () => {
    animate();
    setSelectedCategory(null);
    setShowFAQ(true);
  };

  // Icônes MaterialCommunityIcons si le nom contient un tiret, sinon MaterialIcons.
  const Icon = ({ name, size, color }: { name: string; size: number; color: string }) =>
    name.includes('-')
      ? <MaterialCommunityIcons name={name as any} size={size} color={color} />
      : <MaterialIcons name={name as any} size={size} color={color} />;

  /* ── Lignes réutilisables ─────────────────────────────────────────── */
  const NavRow = ({ icon, label, active, onPress }: any) => (
    <TouchableOpacity style={[styles.navRow, active && { backgroundColor: theme.colors.primary + '16' }]} onPress={onPress}>
      <View style={[styles.navIconBox, { backgroundColor: active ? theme.colors.primary + '22' : theme.colors.background }]}>
        <Icon name={icon} size={18} color={active ? theme.colors.primary : theme.colors.textSecondary} />
      </View>
      <Text style={[styles.navLabel, { color: active ? theme.colors.primary : theme.colors.text }, active && { fontWeight: '800' }]} numberOfLines={1}>
        {label}
      </Text>
      <MaterialIcons name="chevron-right" size={19} color={active ? theme.colors.primary : theme.colors.border} />
    </TouchableOpacity>
  );

  const renderCategoryItem = (category: HelpCategory) => (
    <NavRow key={category.id} icon={category.icon} label={category.title} active={selectedCategory === category.id} onPress={() => openCategory(category.id)} />
  );

  const renderArticleItem = (article: HelpArticle) => (
    <TouchableOpacity key={article.id} style={styles.articleItem} onPress={() => { animate(); setSelectedArticle(article); }}>
      <View style={[styles.articleIconBox, { backgroundColor: theme.colors.primary + '16' }]}>
        <Icon name={article.icon} size={22} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.articleTitle, { color: theme.colors.text }]}>{article.title}</Text>
        <Text style={styles.articlePurpose} numberOfLines={2}>{article.purpose}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
    </TouchableOpacity>
  );

  const renderFAQItem = (item: FAQItem, index: number) => (
    <Card key={index} style={styles.faqCard} padding={0}>
      <TouchableOpacity onPress={() => toggleFAQ(index)} style={styles.faqHeader}>
        <Text style={[styles.faqQuestion, { color: theme.colors.text }]}>{item.question}</Text>
        <MaterialIcons name={expandedFAQ.has(index) ? 'expand-less' : 'expand-more'} size={22} color={theme.colors.primary} />
      </TouchableOpacity>
      {expandedFAQ.has(index) && (
        <View style={[styles.faqAnswer, { borderTopColor: theme.colors.border }]}>
          <Text style={styles.faqAnswerText}>{item.answer}</Text>
        </View>
      )}
    </Card>
  );

  const SupportButton = () => (
    <TouchableOpacity style={[styles.supportButton, { backgroundColor: theme.colors.primary }]} onPress={() => Linking.openURL('mailto:support@solferme.com')}>
      <MaterialIcons name="support-agent" size={20} color="#1A1A1A" />
      <Text style={styles.supportButtonText}>Contacter le support</Text>
    </TouchableOpacity>
  );

  /* ── Vue détail d'un article ──────────────────────────────────────── */
  if (selectedArticle) {
    const article = selectedArticle;
    return (
      <Screen scroll width="narrow" header={<ScreenHeader title={article.title} onBack={() => setSelectedArticle(null)} />}>
        <View style={styles.articleHero}>
          <View style={[styles.articleHeroIcon, { backgroundColor: theme.colors.primary + '18' }]}>
            <Icon name={article.icon} size={38} color={theme.colors.primary} />
          </View>
        </View>

        <SectionHeader title="À quoi ça sert ?" icon="help-circle-outline" />
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionContent}>{article.purpose}</Text>
        </Card>

        <SectionHeader title="Comment faire ?" icon="format-list-numbered" />
        <Card style={styles.sectionCard}>
          {article.steps.map((step, index) => (
            <View key={index} style={[styles.stepItem, index === article.steps.length - 1 && { marginBottom: 0 }]}>
              <View style={[styles.stepNumber, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </Card>

        <Card style={[styles.sectionCard, styles.keyPointCard, { backgroundColor: theme.colors.primary + '10', borderColor: theme.colors.primary + '30' }]}>
          <View style={styles.calloutHead}>
            <MaterialIcons name="lightbulb-outline" size={18} color={theme.colors.primary} />
            <Text style={[styles.keyPointLabel, { color: theme.colors.primary }]}>À retenir</Text>
          </View>
          <Text style={styles.keyPointText}>{article.keyPoint}</Text>
        </Card>

        {article.warning && (
          <Card style={[styles.sectionCard, styles.warningCard, { backgroundColor: theme.colors.warning + '10', borderColor: theme.colors.warning + '30' }]}>
            <View style={styles.calloutHead}>
              <MaterialIcons name="warning-amber" size={18} color={theme.colors.warning} />
              <Text style={[styles.warningLabel, { color: theme.colors.warning }]}>Attention</Text>
            </View>
            <Text style={styles.warningText}>{article.warning}</Text>
          </Card>
        )}

        {article.relatedArticles && article.relatedArticles.length > 0 && (
          <>
            <SectionHeader title="Articles associés" icon="link-variant" />
            <Card style={styles.sectionCard} padding={0}>
              {article.relatedArticles.map((relatedId, index, arr) => {
                const related = filteredCategories.flatMap(cat => cat.articles).find(a => a.id === relatedId);
                if (!related) return null;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[styles.relatedItem, { borderBottomColor: theme.colors.border }, index === arr.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => { animate(); setSelectedArticle(related); }}
                  >
                    <Text style={[styles.relatedText, { color: theme.colors.primary }]}>{related.title}</Text>
                    <MaterialIcons name="chevron-right" size={17} color={theme.colors.primary} />
                  </TouchableOpacity>
                );
              })}
            </Card>
          </>
        )}
      </Screen>
    );
  }

  /* ── Vue principale ───────────────────────────────────────────────── */
  const showBack = !isDesktopOrTablet && !searchQuery.trim() && (selectedCategory || showFAQ);

  const CategoryContent = () => (
    <View>
      <Text style={[styles.categoryContentTitle, { color: theme.colors.text }]}>
        {filteredCategories.find(c => c.id === selectedCategory)?.title}
      </Text>
      {filteredCategories.find(c => c.id === selectedCategory)?.articles.map(renderArticleItem)}
    </View>
  );

  const FAQContent = () => (
    <View>
      <Text style={[styles.categoryContentTitle, { color: theme.colors.text }]}>Questions fréquentes</Text>
      {filteredFAQ.map((item, index) => renderFAQItem(item, index))}
    </View>
  );

  const WelcomeContent = () => (
    <View>
      <Text style={[styles.welcomeTitle, { color: theme.colors.text }]}>Bienvenue dans le Centre d'aide</Text>
      <Text style={styles.welcomeText}>
        SolFerme est là pour vous aider à gérer votre exploitation avicole. Choisissez une catégorie
        ou utilisez la recherche pour trouver ce que vous cherchez.
      </Text>

      {!isDesktopOrTablet && (
        <View style={{ marginTop: space.md }}>
          <SectionHeader title="Catégories" icon="shape-outline" />
          <Card style={styles.navCard} padding={0}>
            {filteredCategories.map(renderCategoryItem)}
            <NavRow icon="help-circle-outline" label="FAQ" active={showFAQ} onPress={openFAQ} />
          </Card>
        </View>
      )}

      <SectionHeader title="Actions rapides" icon="lightning-bolt-outline" />
      <View style={styles.quickGrid}>
        <TouchableOpacity style={styles.quickAction} onPress={() => handleNavigateToScreen('Farms')}>
          <View style={[styles.quickIconBox, { backgroundColor: theme.colors.primary + '16' }]}>
            <MaterialIcons name="agriculture" size={22} color={theme.colors.primary} />
          </View>
          <Text style={[styles.quickActionText, { color: theme.colors.text }]}>Gérer mes fermes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => handleNavigateToScreen('Dashboard')}>
          <View style={[styles.quickIconBox, { backgroundColor: theme.colors.primary + '16' }]}>
            <MaterialIcons name="dashboard" size={22} color={theme.colors.primary} />
          </View>
          <Text style={[styles.quickActionText, { color: theme.colors.text }]}>Tableau de bord</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => handleNavigateToScreen('Finance')}>
          <View style={[styles.quickIconBox, { backgroundColor: theme.colors.primary + '16' }]}>
            <MaterialIcons name="account-balance-wallet" size={22} color={theme.colors.primary} />
          </View>
          <Text style={[styles.quickActionText, { color: theme.colors.text }]}>Finances</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Screen
      scroll={false}
      header={<ScreenHeader title={t('settings.help')} large onMenu={Platform.OS !== 'web' ? () => navigation.openDrawer() : undefined} />}
    >
      <View style={styles.searchContainer}>
        <View style={[styles.searchInputWrapper, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <MaterialIcons name="search" size={19} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text }]}
            placeholder="Rechercher..."
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={(v) => { setSearchQuery(v); if (v.trim()) { setSelectedCategory(null); setShowFAQ(false); } }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <MaterialIcons name="close" size={19} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {searchQuery.trim() ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollPad}>
          <SectionHeader title="Résultats de recherche" icon="magnify" />
          {searchResults.length > 0 && (
            <>
              <Text style={[styles.subsectionLabel, { color: theme.colors.primary }]}>Articles</Text>
              {searchResults.map(({ article, category }) => (
                <TouchableOpacity key={article.id} style={styles.searchResultItem} onPress={() => { animate(); setSelectedArticle(article); }}>
                  <Text style={[styles.searchResultCategory, { color: theme.colors.primary }]}>{category}</Text>
                  <Text style={[styles.searchResultTitle, { color: theme.colors.text }]}>{article.title}</Text>
                  <Text style={styles.searchResultExcerpt} numberOfLines={2}>{article.purpose}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
          {filteredFAQ.length > 0 && (
            <>
              <Text style={[styles.subsectionLabel, { color: theme.colors.primary }]}>FAQ</Text>
              {filteredFAQ.map((item, index) => renderFAQItem(item, index))}
            </>
          )}
          {searchResults.length === 0 && filteredFAQ.length === 0 && (
            <EmptyState icon="magnify-close" title={`Aucun résultat pour « ${searchQuery} »`} />
          )}
          <SupportButton />
        </ScrollView>
      ) : isDesktopOrTablet ? (
        <View style={styles.splitRow}>
          <ScrollView style={[styles.sidebar, { width: isDesktop ? 260 : 220, backgroundColor: theme.colors.surface, borderRightColor: theme.colors.border }]} contentContainerStyle={{ padding: space.sm }}>
            <NavRow icon="home-variant-outline" label="Accueil" active={!selectedCategory && !showFAQ} onPress={goHome} />
            <View style={{ height: space.xs }} />
            {filteredCategories.map(renderCategoryItem)}
            <View style={{ height: space.xs }} />
            <NavRow icon="help-circle-outline" label="FAQ" active={showFAQ} onPress={openFAQ} />
          </ScrollView>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollPad}>
            {!selectedCategory && !showFAQ && <WelcomeContent />}
            {selectedCategory && <CategoryContent />}
            {showFAQ && <FAQContent />}
            <SupportButton />
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollPad}>
          {showBack && (
            <TouchableOpacity style={styles.mobileBackRow} onPress={goHome}>
              <MaterialIcons name="arrow-back" size={20} color={theme.colors.primary} />
              <Text style={[styles.mobileBackText, { color: theme.colors.primary }]}>{t('common.back') || 'Retour'}</Text>
            </TouchableOpacity>
          )}
          {!selectedCategory && !showFAQ && <WelcomeContent />}
          {selectedCategory && <CategoryContent />}
          {showFAQ && <FAQContent />}
          <SupportButton />
        </ScrollView>
      )}
    </Screen>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  // Search
  searchContainer: { paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.sm },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    borderWidth: 1,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 15, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null) },
  scrollPad: { padding: space.md, paddingBottom: space.xxl },

  // Split desktop layout
  splitRow: { flex: 1, flexDirection: 'row' },
  sidebar: { borderRightWidth: StyleSheet.hairlineWidth },

  // Nav rows (catégories / FAQ)
  navCard: { borderRadius: radius.lg, overflow: 'hidden', marginBottom: space.md },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderRadius: radius.sm, marginBottom: 2 },
  navIconBox: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  navLabel: { flex: 1, fontSize: 14, fontWeight: '600' },

  // Welcome
  welcomeTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  welcomeText: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 21 },

  // Quick actions
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  quickAction: {
    flexGrow: 1, flexBasis: 150, minWidth: 0, alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.surface, borderRadius: radius.lg, paddingVertical: space.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, ...(shadow.xs as any),
  },
  quickIconBox: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  quickActionText: { fontSize: 12.5, fontWeight: '700', textAlign: 'center' },

  // Category content
  categoryContentTitle: { fontSize: 18, fontWeight: '800', marginBottom: space.sm },

  // Articles
  articleItem: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md,
    backgroundColor: theme.colors.surface, borderRadius: radius.md, marginBottom: space.xs,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
  },
  articleIconBox: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  articleTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  articlePurpose: { fontSize: 12.5, color: theme.colors.textSecondary, lineHeight: 17 },

  // FAQ
  faqCard: { marginBottom: space.xs, borderRadius: radius.md, overflow: 'hidden' },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, gap: space.sm },
  faqQuestion: { flex: 1, fontSize: 14, fontWeight: '700' },
  faqAnswer: { padding: space.md, paddingTop: 0, borderTopWidth: StyleSheet.hairlineWidth },
  faqAnswerText: { fontSize: 13.5, color: theme.colors.textSecondary, lineHeight: 20 },

  // Search results
  subsectionLabel: { fontSize: 12.5, fontWeight: '800', marginTop: space.md, marginBottom: space.sm, textTransform: 'uppercase', letterSpacing: 0.4 },
  searchResultItem: {
    padding: space.md, backgroundColor: theme.colors.surface, borderRadius: radius.md, marginBottom: space.xs,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
  },
  searchResultCategory: { fontSize: 11, fontWeight: '800', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.3 },
  searchResultTitle: { fontSize: 14.5, fontWeight: '700', marginBottom: 3 },
  searchResultExcerpt: { fontSize: 12.5, color: theme.colors.textSecondary },

  // Mobile back
  mobileBackRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.sm },
  mobileBackText: { fontSize: 14.5, fontWeight: '700' },

  // Article detail
  articleHero: { alignItems: 'center', marginBottom: space.md },
  articleHeroIcon: { width: 84, height: 84, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  sectionCard: { marginBottom: space.md, borderRadius: radius.lg },
  sectionContent: { fontSize: 14, color: theme.colors.text, lineHeight: 21 },
  stepItem: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: space.sm },
  stepNumber: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 12, fontWeight: '800', color: '#1A1A1A' },
  stepText: { flex: 1, fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  calloutHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  keyPointCard: { borderWidth: 1 },
  keyPointLabel: { fontSize: 13.5, fontWeight: '800' },
  keyPointText: { fontSize: 13.5, color: theme.colors.text, lineHeight: 20 },
  warningCard: { borderWidth: 1 },
  warningLabel: { fontSize: 13.5, fontWeight: '800' },
  warningText: { fontSize: 13.5, color: theme.colors.text, lineHeight: 20 },
  relatedItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  relatedText: { fontSize: 14, fontWeight: '700' },

  // Support
  supportButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: space.md, borderRadius: radius.lg, marginTop: space.sm,
  },
  supportButtonText: { color: '#1A1A1A', fontWeight: '800', fontSize: 15 },
});
