import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { CONTENT_MAX, CONTENT_MAX_NARROW, GUTTER, GUTTER_WIDE } from './tokens';

interface Action {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  label?: string;
  tint?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Bouton menu (écrans de tiroir). Ignoré si onBack est fourni. */
  onMenu?: () => void;
  actions?: Action[];
  right?: React.ReactNode;
  width?: 'wide' | 'narrow';
  /** Style « large » : gros titre sur sa ligne (dashboards). */
  large?: boolean;
}

export const ScreenHeader: React.FC<Props> = ({
  title, subtitle, onBack, onMenu, actions = [], right, width = 'wide', large = false,
}) => {
  const { theme } = useTheme();
  const { isDesktopOrTablet } = useBreakpoint();
  const max = width === 'narrow' ? CONTENT_MAX_NARROW : CONTENT_MAX;
  const gutter = isDesktopOrTablet ? GUTTER_WIDE : GUTTER;

  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.border }]}>
      <View style={[styles.inner, { maxWidth: max, paddingHorizontal: gutter }]}>
        <View style={styles.row}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={10}
              style={({ hovered }: any) => [styles.iconBtn, hovered && { backgroundColor: theme.colors.border + '55' }]}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <MaterialIcons name="arrow-back" size={22} color={theme.colors.text} />
            </Pressable>
          ) : onMenu ? (
            <Pressable
              onPress={onMenu}
              hitSlop={10}
              style={({ hovered }: any) => [styles.iconBtn, hovered && { backgroundColor: theme.colors.border + '55' }]}
              accessibilityRole="button"
              accessibilityLabel="Menu"
            >
              <MaterialIcons name="menu" size={24} color={theme.colors.text} />
            </Pressable>
          ) : null}

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={[large ? styles.titleLarge : styles.title, { color: theme.colors.text }]}
            >
              {title}
            </Text>
            {!!subtitle && (
              <Text numberOfLines={1} style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                {subtitle}
              </Text>
            )}
          </View>

          {right}
          {actions.map((a, i) => (
            <Pressable
              key={i}
              onPress={a.onPress}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              style={({ hovered }: any) => [styles.iconBtn, hovered && { backgroundColor: theme.colors.border + '55' }]}
            >
              <MaterialIcons name={a.icon} size={22} color={a.tint ?? theme.colors.text} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, ...(Platform.OS === 'web' ? { zIndex: 10 } : null) },
  inner: { width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 56, paddingVertical: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  titleLarge: { fontSize: 24, fontWeight: '800', letterSpacing: 0.2 },
  subtitle: { fontSize: 12.5, fontWeight: '500', marginTop: 1 },
});
