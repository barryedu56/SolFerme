import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ViewStyle, StyleProp } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { radius, shadow, space } from './tokens';

/* ─────────────────────────── FilterScroll ───────────────────────────
 * Rangée de filtres défilable horizontalement.
 * IMPORTANT : react-native-web donne à <ScrollView> un `flexGrow: 1` par
 * défaut → dans un conteneur colonne, la rangée « mange » toute la hauteur
 * disponible et les puces s'étirent verticalement. On force `flexGrow: 0`
 * et `alignItems: 'center'` pour garder des puces de hauteur naturelle. */
export const FilterScroll: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}> = ({ children, style, contentStyle }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    style={[fsStyles.scroll, style]}
    contentContainerStyle={[fsStyles.content, contentStyle]}
  >
    {children}
  </ScrollView>
);
const fsStyles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0, alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: space.sm },
});

/* ─────────────────────────── SectionHeader ─────────────────────────── */
export const SectionHeader: React.FC<{
  title: string;
  action?: { label: string; onPress: () => void };
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  style?: StyleProp<ViewStyle>;
}> = ({ title, action, icon, style }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.sectionRow, style]}>
      <View style={styles.sectionTitleWrap}>
        {icon && <MaterialCommunityIcons name={icon} size={16} color={theme.colors.primary} />}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
      </View>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={[styles.sectionAction, { color: theme.colors.primary }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
};

/* ─────────────────────────── StatTile ─────────────────────────── */
export const StatTile: React.FC<{
  label: string;
  value: string | number;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  accent?: string;
  /** Variation en % (nombre) — badge ↑/↓ coloré. */
  trend?: number | null;
  hint?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}> = ({ label, value, icon, accent, trend, hint, onPress, style }) => {
  const { theme } = useTheme();
  const a = accent ?? theme.colors.primary;
  const up = (trend ?? 0) >= 0;
  const trendColor = trend == null ? theme.colors.textSecondary : up ? '#2E7D32' : '#C62828';

  const Body = (
    <View
      style={[
        styles.tile,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        shadow.sm as any,
        style,
      ]}
    >
      <View style={styles.tileTop}>
        {icon && (
          <View style={[styles.tileIcon, { backgroundColor: a + '1F' }]}>
            <MaterialCommunityIcons name={icon} size={18} color={a} />
          </View>
        )}
        {trend != null && (
          <View style={[styles.trendBadge, { backgroundColor: trendColor + '18' }]}>
            <MaterialIcons name={up ? 'trending-up' : 'trending-down'} size={13} color={trendColor} />
            <Text style={[styles.trendText, { color: trendColor }]}>{Math.abs(trend)}%</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tileValue, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.tileLabel, { color: theme.colors.textSecondary }]} numberOfLines={2}>
        {label}
      </Text>
      {!!hint && <Text style={[styles.tileHint, { color: theme.colors.textSecondary }]} numberOfLines={1}>{hint}</Text>}
    </View>
  );

  if (!onPress) return Body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.85 }]}>
      {Body}
    </Pressable>
  );
};

/* ─────────────────────────── Chip ─────────────────────────── */
export const Chip: React.FC<{
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  color?: string;
}> = ({ label, active, onPress, icon, color }) => {
  const { theme } = useTheme();
  const c = color ?? theme.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ hovered }: any) => [
        styles.chip,
        { borderColor: active ? c : theme.colors.border, backgroundColor: active ? c : theme.colors.surface },
        hovered && !active && { backgroundColor: theme.colors.border + '33' },
      ]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={14} color={active ? '#1A1A1A' : theme.colors.textSecondary} />}
      <Text style={[styles.chipText, { color: active ? '#1A1A1A' : theme.colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
};

/* ─────────────────────────── Badge ─────────────────────────── */
export const Badge: React.FC<{ label: string; color: string; solid?: boolean }> = ({ label, color, solid }) => (
  <View style={[styles.badge, solid ? { backgroundColor: color } : { backgroundColor: color + '1E' }]}>
    <Text style={[styles.badgeText, { color: solid ? '#fff' : color }]}>{label}</Text>
  </View>
);

/* ─────────────────────────── EmptyState ─────────────────────────── */
export const EmptyState: React.FC<{
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}> = ({ icon = 'inbox-outline', title, description, action }) => {
  const { theme } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.colors.primary + '14' }]}>
        <MaterialCommunityIcons name={icon} size={34} color={theme.colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>{title}</Text>
      {!!description && (
        <Text style={[styles.emptyDesc, { color: theme.colors.textSecondary }]}>{description}</Text>
      )}
      {action && (
        <Pressable onPress={action.onPress} style={[styles.emptyBtn, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.emptyBtnText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
};

/* ─────────────────────────── Skeleton ─────────────────────────── */
export const Skeleton: React.FC<{ height?: number; width?: number | string; radius?: number; style?: StyleProp<ViewStyle> }> = ({
  height = 16, width = '100%', radius: r = 8, style,
}) => {
  const { theme } = useTheme();
  return <View style={[{ height, width, borderRadius: r, backgroundColor: theme.colors.border + '80' }, style as any]} />;
};

const styles = StyleSheet.create({
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  sectionAction: { fontSize: 13, fontWeight: '700' },

  tile: { flex: 1, minWidth: 140, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 34 },
  tileIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill },
  trendText: { fontSize: 11.5, fontWeight: '800' },
  tileValue: { fontSize: 22, fontWeight: '800', letterSpacing: 0.2 },
  tileLabel: { fontSize: 12.5, fontWeight: '600', lineHeight: 16 },
  tileHint: { fontSize: 11, fontWeight: '500' },

  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '700' },

  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 10 },
  emptyIcon: { width: 68, height: 68, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16.5, fontWeight: '800', textAlign: 'center' },
  emptyDesc: { fontSize: 13.5, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  emptyBtn: { marginTop: 6, paddingHorizontal: 20, paddingVertical: 11, borderRadius: radius.md },
  emptyBtnText: { color: '#1A1A1A', fontWeight: '800', fontSize: 14 },
});
