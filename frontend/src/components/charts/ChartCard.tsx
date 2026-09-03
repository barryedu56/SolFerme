import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { radius, shadow, space } from '../ui/tokens';

interface Props {
  title?: string;
  subtitle?: string;
  legend?: { label: string; color: string }[];
  /** rendu enfant reçoit la largeur mesurée du contenu. */
  children: (width: number) => React.ReactNode;
  height?: number;
  footer?: React.ReactNode;
  empty?: boolean;
  emptyLabel?: string;
}

/** Conteneur standard pour un graphique : titre, légende, largeur mesurée
 *  (responsive Android/web/iOS), fond et ombre cohérents. */
export const ChartCard: React.FC<Props> = ({
  title, subtitle, legend, children, height = 200, footer, empty, emptyLabel = 'Aucune donnée sur cette période',
}) => {
  const { theme } = useTheme();
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, shadow.sm as any]}>
      {(title || legend) && (
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {!!title && <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>{title}</Text>}
            {!!subtitle && <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>}
          </View>
          {!!legend && legend.length > 0 && (
            <View style={styles.legend}>
              {legend.map((l) => (
                <View key={l.label} style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: l.color }]} />
                  <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>{l.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={{ height }} onLayout={onLayout}>
        {empty ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>{emptyLabel}</Text>
          </View>
        ) : w > 0 ? (
          children(w)
        ) : null}
      </View>

      {footer}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: space.sm },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 3 },
  legendText: { fontSize: 11.5, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, fontWeight: '500' },
});
