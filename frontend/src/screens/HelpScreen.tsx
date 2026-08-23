import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Linking, Alert, LayoutAnimation, UIManager, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { helpCategories, faqItems, HelpArticle, FAQItem } from '../data/helpContent';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

export const HelpScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const { isDesktop, isTablet, isDesktopOrTablet } = useBreakpoint();
  const styles = useMemo(() => createStyles(theme, isDesktop, isTablet, isDesktopOrTablet), [theme, isDesktop, isTablet, isDesktopOrTablet]);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFAQ, setShowFAQ] = useState(false);
  const [expandedFAQ, setExpandedFAQ] = useState<Set<number>>(new Set());

  // Filter categories based on user role
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

  // Filter articles based on search
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

  // Filter FAQ based on search
  const filteredFAQ = useMemo(() => {
    if (!searchQuery.trim()) return faqItems;
    const query = searchQuery.toLowerCase();
    return faqItems.filter(item =>
      item.question.toLowerCase().includes(query) ||
      item.answer.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const toggleFAQ = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newExpanded = new Set(expandedFAQ);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedFAQ(newExpanded);
  };

  const handleNavigateToScreen = (screenName: string) => {
    // Navigate to the correct nested screen in the Tab Navigator
    navigation.navigate('MainTabs', { screen: screenName });
  };

  const renderCategoryItem = (category: any) => (
    <TouchableOpacity
      key={category.id}
      style={[styles.categoryItem, selectedCategory === category.id && styles.categoryItemSelected]}
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSelectedCategory(category.id);
        setSelectedArticle(null);
        setShowFAQ(false);
      }}
    >
      {category.icon.includes('-') ? (
        <MaterialCommunityIcons name={category.icon as any} size={20} color={selectedCategory === category.id ? theme.colors.primary : theme.colors.text} style={{marginRight: theme.spacing.m}} />
      ) : (
        <MaterialIcons name={category.icon as any} size={20} color={selectedCategory === category.id ? theme.colors.primary : theme.colors.text} style={{marginRight: theme.spacing.m}} />
      )}
      <Text style={[styles.categoryTitle, selectedCategory === category.id && styles.categoryTitleSelected]}>
        {category.title}
      </Text>
      <MaterialIcons 
        name={selectedCategory === category.id ? "chevron-right" : "chevron-left"} 
        size={20} 
        color={selectedCategory === category.id ? theme.colors.primary : theme.colors.textSecondary} 
      />
    </TouchableOpacity>
  );

  const renderArticleItem = (article: HelpArticle) => (
    <TouchableOpacity
      key={article.id}
      style={styles.articleItem}
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSelectedArticle(article);
      }}
    >
      {article.icon.includes('-') ? (
        <MaterialCommunityIcons name={article.icon as any} size={24} color={theme.colors.primary} style={{marginRight: theme.spacing.m}} />
      ) : (
        <MaterialIcons name={article.icon as any} size={24} color={theme.colors.primary} style={{marginRight: theme.spacing.m}} />
      )}
      <View style={styles.articleTextContainer}>
        <Text style={styles.articleTitle}>{article.title}</Text>
        <Text style={styles.articlePurpose} numberOfLines={2}>{article.purpose}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
    </TouchableOpacity>
  );

  const renderArticleDetail = (article: HelpArticle) => (
    <ScrollView style={styles.articleDetail}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => setSelectedArticle(null)}
      >
        <MaterialIcons name="arrow-back" size={24} color={theme.colors.primary} />
        <Text style={styles.backButtonText}>Retour</Text>
      </TouchableOpacity>

      <View style={styles.articleHeader}>
        {article.icon.includes('-') ? (
          <MaterialCommunityIcons name={article.icon as any} size={48} color={theme.colors.primary} />
        ) : (
          <MaterialIcons name={article.icon as any} size={48} color={theme.colors.primary} />
        )}
        <Text style={styles.articleDetailTitle}>{article.title}</Text>
      </View>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>À quoi ça sert ?</Text>
        <Text style={styles.sectionContent}>{article.purpose}</Text>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Comment faire ?</Text>
        {article.steps.map((step, index) => (
          <View key={index} style={styles.stepItem}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </Card>

      <Card style={[styles.sectionCard, styles.keyPointCard]}>
        <Text style={styles.keyPointLabel}>À retenir</Text>
        <Text style={styles.keyPointText}>{article.keyPoint}</Text>
      </Card>

      {article.warning && (
        <Card style={[styles.sectionCard, styles.warningCard]}>
          <View style={styles.warningHeader}>
            <MaterialIcons name="warning" size={20} color={theme.colors.warning} />
            <Text style={styles.warningLabel}>Attention</Text>
          </View>
          <Text style={styles.warningText}>{article.warning}</Text>
        </Card>
      )}

      {article.relatedArticles && article.relatedArticles.length > 0 && (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Articles associés</Text>
          {article.relatedArticles.map((relatedId, index) => {
            const related = filteredCategories
              .flatMap(cat => cat.articles)
              .find(a => a.id === relatedId);
            if (!related) return null;
            return (
              <TouchableOpacity
                key={index}
                style={styles.relatedItem}
                onPress={() => setSelectedArticle(related)}
              >
                <Text style={styles.relatedText}>{related.title}</Text>
                <MaterialIcons name="chevron-right" size={16} color={theme.colors.primary} />
              </TouchableOpacity>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );

  const renderFAQItem = (item: FAQItem, index: number) => (
    <Card key={index} style={styles.faqCard}>
      <TouchableOpacity onPress={() => toggleFAQ(index)} style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{item.question}</Text>
        <MaterialIcons 
          name={expandedFAQ.has(index) ? "expand-less" : "expand-more"} 
          size={24} 
          color={theme.colors.primary} 
        />
      </TouchableOpacity>
      {expandedFAQ.has(index) && (
        <View style={styles.faqAnswer}>
          <Text style={styles.faqAnswerText}>{item.answer}</Text>
        </View>
      )}
    </Card>
  );

  // Main content view
  if (selectedArticle) {
    return (
      <SafeAreaView style={styles.container}>
        {renderArticleDetail(selectedArticle)}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {!isDesktop && Platform.OS !== 'web' && (
          <TouchableOpacity onPress={() => navigation.openDrawer()}>
            <MaterialIcons name="menu" size={24} color={theme.colors.primary} style={{marginRight: theme.spacing.m}} />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>{t('settings.help')}</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <MaterialIcons name="search" size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher..."
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="close" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {searchQuery.trim() ? (
        // Search results view
        <ScrollView style={styles.content}>
          <Text style={styles.sectionLabel}>Résultats de recherche</Text>
          
          {searchResults.length > 0 && (
            <>
              <Text style={styles.subsectionLabel}>Articles</Text>
              {searchResults.map(({ article, category }) => (
                <TouchableOpacity key={article.id} style={styles.searchResultItem} onPress={() => setSelectedArticle(article)}>
                  <Text style={styles.searchResultCategory}>{category}</Text>
                  <Text style={styles.searchResultTitle}>{article.title}</Text>
                  <Text style={styles.searchResultExcerpt} numberOfLines={2}>{article.purpose}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {filteredFAQ.length > 0 && (
            <>
              <Text style={styles.subsectionLabel}>FAQ</Text>
              {filteredFAQ.map((item, index) => renderFAQItem(item, index))}
            </>
          )}

          {searchResults.length === 0 && filteredFAQ.length === 0 && (
            <Card style={styles.noResultsCard}>
              <Text style={styles.noResultsText}>Aucun résultat pour "{searchQuery}"</Text>
            </Card>
          )}
        </ScrollView>
      ) : (
        // Normal view with categories
        <View style={styles.mainContent}>
          {/* Categories sidebar for Desktop/Tablet */}
          {(isDesktopOrTablet) && (
            <ScrollView style={styles.categoriesSidebar}>
              <TouchableOpacity
                style={[styles.categoryItem, !selectedCategory && !showFAQ && styles.categoryItemSelected]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSelectedCategory(null);
                  setShowFAQ(false);
                }}
              >
                <MaterialIcons name="home" size={20} color={!selectedCategory && !showFAQ ? theme.colors.primary : theme.colors.text} style={{marginRight: theme.spacing.m}} />
                <Text style={[styles.categoryTitle, !selectedCategory && !showFAQ && styles.categoryTitleSelected]}>
                  Accueil
                </Text>
              </TouchableOpacity>
              
              {filteredCategories.map(renderCategoryItem)}
              
              <TouchableOpacity
                style={[styles.categoryItem, showFAQ && styles.categoryItemSelected]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSelectedCategory(null);
                  setShowFAQ(true);
                }}
              >
                <MaterialIcons name="help" size={20} color={showFAQ ? theme.colors.primary : theme.colors.text} style={{marginRight: theme.spacing.m}} />
                <Text style={[styles.categoryTitle, showFAQ && styles.categoryTitleSelected]}>
                  FAQ
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Main content area */}
          <ScrollView style={styles.contentArea}>
            {!selectedCategory && !showFAQ && (
              <View style={styles.welcomeSection}>
                <Text style={styles.welcomeTitle}>Bienvenue dans le Centre d'aide</Text>
                <Text style={styles.welcomeText}>
                  SolFerme est là pour vous aider à gérer votre exploitation avicole.
                  Sélectionnez une catégorie ci-à-dessus ou utilisez la recherche pour trouver ce que vous cherchez.
                </Text>
                
                {!isDesktopOrTablet && (
                  <View style={styles.mobileCategories}>
                    <Text style={styles.sectionLabel}>Catégories</Text>
                    {filteredCategories.map(renderCategoryItem)}
                    
                    <TouchableOpacity
                      style={[styles.categoryItem, showFAQ && styles.categoryItemSelected]}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setShowFAQ(true);
                      }}
                    >
                      <MaterialIcons name="help" size={20} color={showFAQ ? theme.colors.primary : theme.colors.text} style={{marginRight: theme.spacing.m}} />
                      <Text style={[styles.categoryTitle, showFAQ && styles.categoryTitleSelected]}>
                        FAQ
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Card style={styles.quickActionsCard}>
                  <Text style={styles.quickActionsTitle}>Actions rapides</Text>
                  <TouchableOpacity style={styles.quickActionButton} onPress={() => handleNavigateToScreen('Farms')}>
                    <MaterialIcons name="agriculture" size={24} color={theme.colors.primary} />
                    <Text style={styles.quickActionText}>Gérer mes fermes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickActionButton} onPress={() => handleNavigateToScreen('Dashboard')}>
                    <MaterialIcons name="dashboard" size={24} color={theme.colors.primary} />
                    <Text style={styles.quickActionText}>Voir le tableau de bord</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickActionButton} onPress={() => handleNavigateToScreen('Finance')}>
                    <MaterialIcons name="account-balance-wallet" size={24} color={theme.colors.primary} />
                    <Text style={styles.quickActionText}>Consulter les finances</Text>
                  </TouchableOpacity>
                </Card>
              </View>
            )}

            {selectedCategory && (
              <View style={styles.categoryContent}>
                <Text style={styles.categoryContentTitle}>
                  {filteredCategories.find(c => c.id === selectedCategory)?.title}
                </Text>
                {filteredCategories
                  .find(c => c.id === selectedCategory)
                  ?.articles.map(renderArticleItem)}
              </View>
            )}

            {showFAQ && (
              <View style={styles.faqSection}>
                <Text style={styles.categoryContentTitle}>Questions Fréquentes</Text>
                {filteredFAQ.map((item, index) => renderFAQItem(item, index))}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      <View style={styles.supportSection}>
        <TouchableOpacity style={styles.supportButton} onPress={() => Linking.openURL('mailto:support@solferme.com')}>
          <MaterialIcons name="email" size={20} color="#000000" style={{marginRight: 8}} />
          <Text style={styles.supportButtonText}>Contacter le support</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (theme: any, isDesktop: boolean = false, isTablet: boolean = false, isDesktopOrTablet: boolean = false) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.m },
  title: { fontSize: 24, fontWeight: '900', color: theme.colors.text, textTransform: 'uppercase' },
  
  // Search
  searchContainer: { paddingHorizontal: theme.spacing.m, paddingBottom: theme.spacing.m },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    paddingHorizontal: theme.spacing.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchIcon: { marginRight: theme.spacing.s },
  searchInput: {
    flex: 1,
    paddingVertical: theme.spacing.m,
    fontSize: 16,
    color: theme.colors.text,
  },
  
  // Main layout
  mainContent: {
    flex: 1,
    flexDirection: isDesktopOrTablet ? 'row' : 'column',
  },
  
  // Categories sidebar
  categoriesSidebar: {
    width: isDesktop ? 280 : 200,
    backgroundColor: theme.colors.surface,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  
  // Category items
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border + '30',
  },
  categoryItemSelected: {
    backgroundColor: theme.colors.primary + '15',
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  categoryIcon: { marginRight: theme.spacing.m },
  categoryTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  categoryTitleSelected: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  
  // Content area
  contentArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: theme.spacing.m,
  },
  
  // Welcome section
  welcomeSection: {
    padding: theme.spacing.m,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
  },
  welcomeText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
  },
  
  // Mobile categories
  mobileCategories: {
    marginTop: theme.spacing.l,
  },
  
  // Quick actions
  quickActionsCard: {
    marginTop: theme.spacing.l,
    padding: theme.spacing.m,
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.m,
    marginBottom: theme.spacing.s,
  },
  quickActionText: {
    marginLeft: theme.spacing.m,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  
  // Category content
  categoryContent: {
    padding: theme.spacing.m,
  },
  categoryContentTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
  },
  
  // Article items
  articleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.m,
    marginBottom: theme.spacing.s,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  articleIcon: { marginRight: theme.spacing.m },
  articleTextContainer: { flex: 1 },
  articleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  articlePurpose: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  
  // FAQ
  faqSection: {
    padding: theme.spacing.m,
  },
  faqCard: {
    marginBottom: theme.spacing.s,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginRight: theme.spacing.m,
  },
  faqAnswer: {
    padding: theme.spacing.m,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  faqAnswerText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  
  // Search results
  sectionLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
    textTransform: 'uppercase',
  },
  subsectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
    marginTop: theme.spacing.l,
    marginBottom: theme.spacing.m,
  },
  searchResultItem: {
    padding: theme.spacing.m,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.m,
    marginBottom: theme.spacing.s,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchResultCategory: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: 4,
  },
  searchResultTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  searchResultExcerpt: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  noResultsCard: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  
  // Article detail
  articleDetail: {
    flex: 1,
    padding: theme.spacing.m,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.l,
  },
  backButtonText: {
    marginLeft: theme.spacing.s,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  articleHeader: {
    alignItems: 'center',
    marginBottom: theme.spacing.l,
  },
  articleDetailIcon: {
    marginBottom: theme.spacing.m,
  },
  articleDetailTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.colors.text,
    textAlign: 'center',
  },
  sectionCard: {
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
  },
  sectionContent: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 22,
  },
  stepItem: {
    flexDirection: 'row',
    marginBottom: theme.spacing.m,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
  keyPointCard: {
    backgroundColor: theme.colors.primary + '10',
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  keyPointLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: theme.spacing.s,
  },
  keyPointText: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
  warningCard: {
    backgroundColor: theme.colors.warning + '10',
    borderWidth: 1,
    borderColor: theme.colors.warning + '30',
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.s,
  },
  warningLabel: {
    marginLeft: theme.spacing.s,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.warning,
  },
  warningText: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
  relatedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.s,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border + '30',
  },
  relatedText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  
  // Support section
  supportSection: {
    padding: theme.spacing.m,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: '#000000',
  },
  supportButtonText: {
    color: '#000000',
    fontWeight: '900',
    fontSize: 16,
  },
});
