import React from 'react';
import {
  View, ScrollView, StyleSheet, RefreshControl, Platform,
  StyleProp, ViewStyle, ScrollViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { CONTENT_MAX, CONTENT_MAX_NARROW, GUTTER, GUTTER_WIDE, space } from './tokens';

interface ScreenProps {
  children: React.ReactNode;
  /** Bandeau d'en-tête (voir <ScreenHeader/>), rendu hors de la zone scrollable. */
  header?: React.ReactNode;
  /** true : enveloppe le contenu dans un ScrollView. false : conteneur flex
   *  (pour les écrans à FlatList — utiliser `contentContainerStyle` via useContentWidth). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** 'wide' (listes/dashboard) ou 'narrow' (formulaires/détail). */
  width?: 'wide' | 'narrow';
  /** Padding vertical/horizontal automatique du contenu (scroll uniquement). */
  padded?: boolean;
  background?: string;
  contentStyle?: StyleProp<ViewStyle>;
  scrollProps?: Partial<ScrollViewProps>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

/** Largeur de contenu standardisée + gouttières — à étaler dans le
 *  `contentContainerStyle` d'une FlatList / SectionList. */
export const useContentWidth = (variant: 'wide' | 'narrow' = 'wide') => {
  const { isDesktopOrTablet } = useBreakpoint();
  const max = variant === 'narrow' ? CONTENT_MAX_NARROW : CONTENT_MAX;
  return {
    width: '100%' as const,
    maxWidth: max,
    alignSelf: 'center' as const,
    paddingHorizontal: isDesktopOrTablet ? GUTTER_WIDE : GUTTER,
  };
};

export const Screen: React.FC<ScreenProps> = ({
  children, header, scroll = false, refreshing, onRefresh,
  width = 'wide', padded = true, background, contentStyle, scrollProps, edges = ['top'],
}) => {
  const { theme } = useTheme();
  const { isDesktopOrTablet } = useBreakpoint();
  const bg = background ?? theme.colors.background;
  const max = width === 'narrow' ? CONTENT_MAX_NARROW : CONTENT_MAX;
  const gutter = isDesktopOrTablet ? GUTTER_WIDE : GUTTER;

  const centered: ViewStyle = {
    width: '100%',
    maxWidth: max,
    alignSelf: 'center',
  };

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        { flexGrow: 1 },
        centered,
        padded && { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xxl },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={Platform.OS === 'web'}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        ) : undefined
      }
      {...scrollProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, centered, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={edges}>
      {header}
      {body}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
});
