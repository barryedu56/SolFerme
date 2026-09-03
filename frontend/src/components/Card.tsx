import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { radius, shadow, space } from './ui/tokens';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 'raised' (défaut) : ombre douce · 'flat' : bordure seule · 'ghost' : rien. */
  variant?: 'raised' | 'flat' | 'ghost';
  padding?: number;
}

export const Card: React.FC<CardProps> = ({ children, style, variant = 'raised', padding }) => {
  const { theme } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: radius.lg,
          borderWidth: variant === 'ghost' ? 0 : StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          padding: padding ?? space.md,
          marginBottom: space.md,
        },
        variant === 'raised' && (shadow.sm as any),
        style,
      ]}
    >
      {children}
    </View>
  );
};
