import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

/** Règles alignées sur le backend : ≥ 8, majuscule, minuscule, chiffre, spécial. */
export const passwordChecks = (pw: string) => ({
  length: pw.length >= 8,
  upper: /[A-Z]/.test(pw),
  lower: /[a-z]/.test(pw),
  digit: /[0-9]/.test(pw),
  special: /[!@#$%^&*(),.?":{}|<>_\-\[\]/\\+=;'`~]/.test(pw),
});

export const isPasswordStrong = (pw: string) =>
  Object.values(passwordChecks(pw)).every(Boolean);

interface Props {
  value: string;
  /** Affiche la liste détaillée des critères sous les barres. */
  showChecklist?: boolean;
}

export const PasswordStrengthBar: React.FC<Props> = ({ value, showChecklist = true }) => {
  const { theme } = useTheme();
  const { score, label, color, checks } = useMemo(() => {
    const c = passwordChecks(value);
    const s = Object.values(c).filter(Boolean).length;
    const map = [
      { label: '', color: theme.colors.border },
      { label: 'Très faible', color: '#D32F2F' },
      { label: 'Faible', color: '#F57C00' },
      { label: 'Moyen', color: '#FBC02D' },
      { label: 'Bon', color: '#7CB342' },
      { label: 'Fort', color: '#2E7D32' },
    ];
    return { score: s, ...map[s], checks: c };
  }, [value, theme]);

  if (!value) return null;

  const items: [keyof ReturnType<typeof passwordChecks>, string][] = [
    ['length', '8 caractères'],
    ['upper', 'Une majuscule'],
    ['lower', 'Une minuscule'],
    ['digit', 'Un chiffre'],
    ['special', 'Un caractère spécial'],
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.bars}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { backgroundColor: i < score ? color : theme.colors.border },
            ]}
          />
        ))}
      </View>
      {!!label && <Text style={[styles.label, { color }]}>{label}</Text>}
      {showChecklist && (
        <View style={styles.checklist}>
          {items.map(([key, text]) => (
            <View key={key} style={styles.checkItem}>
              <Text style={[styles.checkDot, { color: checks[key] ? '#2E7D32' : theme.colors.textSecondary }]}>
                {checks[key] ? '✓' : '•'}
              </Text>
              <Text style={[styles.checkText, { color: checks[key] ? theme.colors.text : theme.colors.textSecondary }]}>
                {text}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: -6, marginBottom: 14 },
  bars: { flexDirection: 'row', gap: 5 },
  bar: { flex: 1, height: 5, borderRadius: 3 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  checklist: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  checkDot: { fontSize: 12, fontWeight: '800', width: 12, textAlign: 'center' },
  checkText: { fontSize: 12 },
});
