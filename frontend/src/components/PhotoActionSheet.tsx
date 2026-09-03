import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

/**
 * Feuille d'actions "photo de profil" (changer / supprimer / annuler).
 *
 * `Alert.alert(title, message, buttons)` avec plusieurs boutons ne fait
 * RIEN sur Web — react-native-web l'implémente en no-op total (aucune boîte
 * de dialogue, aucun callback appelé). D'où le bouton photo qui semblait
 * "mort" sur Web : le clic déclenchait bien `Alert.alert`, mais aucun bouton
 * n'existait pour appeler `pickImage`/`handleRemoveImage`. Cette feuille
 * personnalisée fonctionne à l'identique sur Android, iOS et Web.
 */
interface Props {
  visible: boolean;
  onClose: () => void;
  onChangePhoto: () => void;
  onRemovePhoto?: () => void;
  title: string;
  subtitle?: string;
  changeLabel: string;
  removeLabel?: string;
  cancelLabel: string;
}

export const PhotoActionSheet: React.FC<Props> = ({
  visible, onClose, onChangePhoto, onRemovePhoto, title, subtitle, changeLabel, removeLabel, cancelLabel,
}) => {
  const { theme } = useTheme();

  const Row = ({ icon, label, onPress, danger }: any) => (
    <Pressable
      style={({ hovered }: any) => [
        styles.row,
        { borderColor: theme.colors.border },
        hovered && { backgroundColor: theme.colors.background },
      ]}
      onPress={() => { onClose(); onPress(); }}
    >
      <View style={[styles.iconBox, { backgroundColor: (danger ? theme.colors.danger : theme.colors.primary) + '18' }]}>
        <MaterialIcons name={icon} size={19} color={danger ? theme.colors.danger : theme.colors.primary} />
      </View>
      <Text style={[styles.rowLabel, { color: danger ? theme.colors.danger : theme.colors.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* stopPropagation via View interne non-Pressable : le tap sur la feuille ne doit pas fermer */}
        <Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {!!subtitle && <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text>}

          <View style={styles.rows}>
            <Row icon="photo-camera" label={changeLabel} onPress={onChangePhoto} />
            {onRemovePhoto && removeLabel && <Row icon="delete-outline" label={removeLabel} onPress={onRemovePhoto} danger />}
          </View>

          <Pressable
            style={({ hovered }: any) => [styles.cancelBtn, { backgroundColor: theme.colors.background }, hovered && { opacity: 0.85 }]}
            onPress={onClose}
          >
            <Text style={[styles.cancelText, { color: theme.colors.text }]}>{cancelLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%', maxWidth: 420, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 10, paddingHorizontal: 18, paddingBottom: 22,
    ...(Platform.OS === 'web' ? { borderBottomLeftRadius: 22, borderBottomRightRadius: 22, marginBottom: 24 } : null),
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.35)', alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  rows: { marginTop: 16, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 12 },
  iconBox: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '700' },
  cancelBtn: { marginTop: 14, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '800' },
});
