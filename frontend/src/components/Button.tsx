import React from 'react';
import { TouchableOpacity, Text, StyleSheet, TouchableOpacityProps, ActivityIndicator, View, TextStyle, StyleProp } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'outline';
  textColor?: string;
  textStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
  leftIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  loading = false,
  variant = 'primary',
  style,
  disabled,
  textColor: customTextColor,
  textStyle,
  icon,
  leftIcon,
  ...props
}) => {
  const { theme } = useTheme();

  const getBackgroundColor = () => {
    if (disabled) return theme.colors.border;
    switch (variant) {
      case 'primary': return theme.colors.primary;
      case 'secondary': return theme.colors.surface;
      case 'danger': return theme.colors.danger;
      case 'success': return theme.colors.success || '#4CAF50';
      case 'warning': return theme.colors.warning || '#FF9800';
      case 'outline': return 'transparent';
      default: return theme.colors.primary;
    }
  };

  const getBorderColor = () => {
    if (disabled) return theme.colors.border;
    if (variant === 'outline') return theme.colors.primary;
    return theme.colors.border;
  };

  const getTextColor = () => {
    if (customTextColor) return customTextColor;
    if (disabled) return theme.colors.textSecondary;
    switch (variant) {
      case 'secondary': return theme.colors.text;
      case 'danger':
      case 'success':
      case 'outline':
        return theme.colors.primary;
      case 'warning':
        return '#000000';
      case 'primary': return '#000000';
      default: return theme.colors.text;
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: getBackgroundColor(),
          borderRadius: theme.borderRadius.xl,
          borderWidth: 0.8,
          borderColor: getBorderColor()
        },
        style
      ]}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <View style={styles.content}>
          {(icon || leftIcon) && <View style={styles.iconContainer}>{icon || leftIcon}</View>}
          <Text style={[styles.text, { color: getTextColor() }, textStyle]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: 8,
  },
  text: {
    fontSize: 15,
    fontWeight: 'bold',
  },
});
