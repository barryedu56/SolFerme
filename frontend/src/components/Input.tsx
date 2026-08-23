import React, { useState, useRef, useCallback } from 'react';
import { TextInput, StyleSheet, TextInputProps, View, Text, TouchableOpacity, Platform, NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { formatNumber } from '../utils/formatters';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  isNumeric?: boolean;
  isPhone?: boolean; // 🔧 Téléphone guinéen : max 9 chiffres, pavé numérique
  containerStyle?: any;
}

export const Input: React.FC<InputProps> = ({ label, error, style, isNumeric, isPhone, value, onChangeText, containerStyle, secureTextEntry, onFocus, onBlur, ...props }) => {
  const { theme } = useTheme();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // 🔧 Suivi de la position du curseur pour le replacer correctement après formatage
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const isAdjustingCursor = useRef(false);

  // 🔧 Déduire les props du mode téléphone
  const effectiveMaxLength = isPhone ? 9 : props.maxLength;
  const effectiveKeyboardType = isPhone ? (Platform.OS === 'ios' ? 'number-pad' : 'numeric') : (isNumeric ? (Platform.OS === 'ios' ? 'decimal-pad' : 'numeric') : props.keyboardType);

  const handleChangeText = useCallback((text: string) => {
    // 🔧 Mode téléphone : chiffres uniquement, max 9
    if (isPhone && onChangeText) {
      const digitsOnly = text.replace(/\D/g, '');
      if (digitsOnly.length <= 9) {
        onChangeText(digitsOnly);
      }
      return;
    }

    if (isNumeric && onChangeText) {
      // Retirer tous les espaces (séparateurs de milliers) et remplacer la virgule par un point
      const cleanText = text.replace(/\s/g, '').replace(',', '.');

      // N'autoriser que les chiffres avec un seul point décimal
      if (!/^\d*[.]?\d*$/.test(cleanText) && cleanText !== '') {
        return;
      }

      // Valeur brute (sans espaces) PRÉCÉDENTE conservée dans l'état parent.
      // On l'utilise pour distinguer un « ajout en fin » d'une édition au milieu :
      // during a tap/type, onSelectionChange peut arriver APRÈS onChangeText, donc
      // selectionRef passage en fin d'ancien texte — sinon le curseur recule d'un
      // chiffre dès qu'un séparateur de milliers est inséré (ex: "3 500" → curseau au
      // milieu de "3 50" au lieu de rester en fin).
      const prevRaw = (value ?? '').toString().replace(/\s/g, '');

      // Nombre de chiffres qui doivent se trouver AVANT le curseur dans la valeur formatée.
      let digitsBeforeCursor: number;

      if (cleanText.startsWith(prevRaw) && cleanText.length >= prevRaw.length) {
        // Ajout en fin de saisie (ou texte identique) → le curseur doit rester après le dernier chiffre.
        digitsBeforeCursor = cleanText.length;
      } else if (prevRaw.startsWith(cleanText) && cleanText.length < prevRaw.length) {
        // Retour arrière depuis la fin → le curseur reste après le dernier chiffre restant.
        digitsBeforeCursor = cleanText.length;
      } else {
        // Édition au milieu du nombre : se fier à la sélection mémorisée.
        const cursorPos = selectionRef.current?.start ?? text.length;
        digitsBeforeCursor = (text.substring(0, cursorPos).replace(/\s/g, '').match(/\d/g) || []).length;
      }

      // Formater la valeur brute pour l'affichage immédiat
      const formatted = formatNumber(cleanText);

      // Recalculer la position du curseur dans la valeur formatée
      // en comptant les chiffres jusqu'à digitsBeforeCursor
      let newCursorPos = 0;
      if (digitsBeforeCursor === 0) {
        newCursorPos = 0;
      } else if (digitsBeforeCursor >= cleanText.length) {
        newCursorPos = formatted.length; // le curseur était après tous les chiffres → fin
      } else {
        let digitCount = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            digitCount++;
            if (digitCount === digitsBeforeCursor) {
              newCursorPos = i + 1;
              break;
            }
          }
        }
        if (digitCount < digitsBeforeCursor) {
          newCursorPos = formatted.length;
        }
      }

      // Appliquer la nouvelle position de curseur après le prochain rendu
      if (Platform.OS !== 'web') {
        isAdjustingCursor.current = true;
        setSelection({ start: newCursorPos, end: newCursorPos });

        // Remettre selection à undefined après application pour ne pas bloquer la navigation clavier
        setTimeout(() => {
          if (isAdjustingCursor.current) {
            isAdjustingCursor.current = false;
            setSelection(undefined);
          }
        }, 50);
      }

      // Appeler onChangeText avec la valeur BRUTE (sans espaces) — l'état parent reste propre
      onChangeText(cleanText);
    } else if (onChangeText) {
      onChangeText(text);
    }
  }, [isPhone, isNumeric, onChangeText, value]);

  const handleSelectionChange = useCallback((e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    if (!isAdjustingCursor.current) {
      selectionRef.current = e.nativeEvent.selection;
    }
    if (props.onSelectionChange) props.onSelectionChange(e);
  }, [props.onSelectionChange]);

  const handleFocus = (e: any) => {
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: any) => {
    setSelection(undefined);
    if (onBlur) onBlur(e);
  };

  // 🔧 CORRECTION PRINCIPALE : formatage PERMANENT pendant la saisie (plus uniquement hors focus)
  const displayValue = isNumeric ? formatNumber(value) : value;
  const isPasswordField = secureTextEntry;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>}
      <View style={styles.inputWrapper}>
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
            isPasswordField && { paddingRight: 52 },
            style
          ]}
          placeholderTextColor={theme.colors.textSecondary}
          value={displayValue}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSelectionChange={handleSelectionChange}
          selection={selection}
          maxLength={effectiveMaxLength}
          keyboardType={effectiveKeyboardType}
          secureTextEntry={isPasswordField && !isPasswordVisible}
          {...props}
        />
        {isPasswordField && (
          <TouchableOpacity
            style={styles.iconContainer}
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons
              name={isPasswordVisible ? 'eye-off' : 'eye'}
              size={24}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
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
  inputWrapper: {
    justifyContent: 'center',
  },
  input: {
    borderWidth: 0.8,
    padding: 16,
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    position: 'absolute',
    right: 12,
    height: '100%',
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});
