import React from 'react';
import { TextInput, StyleSheet, TextInputProps, View, Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { formatNumber, parseFormattedNumber } from '../utils/formatters';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  isNumeric?: boolean;
}

export const Input: React.FC<InputProps> = ({ label, error, style, isNumeric, value, onChangeText, ...props }) => {
  const { theme } = useTheme();

  const handleChangeText = (text: string) => {
    if (isNumeric && onChangeText) {
      const rawValue = parseFormattedNumber(text);
      // Allow digits and one decimal point/comma
      if (/^\d*[.,]?\d*$/.test(rawValue)) {
        onChangeText(rawValue.replace(',', '.'));
      }
    } else if (onChangeText) {
      onChangeText(text);
    }
  };

  const displayValue = isNumeric ? formatNumber(value) : value;

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.inputBackground,
            borderColor: theme.colors.border,
            borderRadius: theme.borderRadius.m,
            color: theme.colors.text
          },
          error && { borderColor: theme.colors.danger },
          style
        ]}
        placeholderTextColor={theme.colors.textSecondary}
        value={displayValue}
        onChangeText={handleChangeText}
        keyboardType={isNumeric ? 'numeric' : props.keyboardType}
        {...props}
      />
      {error && <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
    marginLeft: 4,
  },
  input: {
    borderWidth: 1,
    padding: 16,
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});
