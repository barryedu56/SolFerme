import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { apiClient } from '../../api/client';
import { MaterialIcons } from '@expo/vector-icons';

export const ProductionConvertScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { production } = route.params;

  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);

  const nonVendables = production.casiers_produits - production.casiers_vendables;

  const handleConvert = async () => {
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert(t('common.error'), t('production.convertQuantity') || "Veuillez saisir une quantité valide.");
      return;
    }

    if (qty > nonVendables) {
      Alert.alert(t('common.error'), t('production.errorVendables') || "Quantité supérieure au stock non vendable.");
      return;
    }

    setLoading(true);
    try {
      await apiClient.post(`/productions/${production.id}/convert_to_vendable/`, { quantity: qty });
      Alert.alert(t('common.success'), t('production.convertSuccess') || "Conversion réussie !");
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || t('production.convertError') || "Erreur lors de la conversion.");
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('production.convertTitle') || "Rendre vendable"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.infoCard}>
          <Text style={styles.infoLabel}>Production du {new Date(production.date).toLocaleDateString('fr-FR')}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{production.casiers_produits}</Text>
              <Text style={styles.statLabel}>Produits</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.colors.success }]}>{production.casiers_vendables}</Text>
              <Text style={styles.statLabel}>Vendables</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.colors.danger }]}>{nonVendables}</Text>
              <Text style={styles.statLabel}>Non Vendables</Text>
            </View>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>{t('production.convertQuantity') || "Quantité à convertir"}</Text>
        <Card style={styles.formCard}>
          <Input
            value={quantity}
            onChangeText={setQuantity}
            isNumeric
            placeholder="Nombre de casiers"
            style={styles.input}
          />
          <Text style={styles.hint}>
            Ces casiers seront ajoutés au stock vendable et pourront être vendus.
          </Text>
        </Card>

        <Button
          title={t('common.confirm') || "Confirmer la conversion"}
          onPress={handleConvert}
          loading={loading}
          style={styles.submitBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: theme.spacing.m, paddingTop: theme.spacing.l, backgroundColor: theme.colors.background,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface,
    justifyContent: 'center', alignItems: 'center', ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m },
  infoCard: { padding: theme.spacing.m, marginBottom: theme.spacing.l },
  infoLabel: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: theme.spacing.m, textAlign: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.m },
  formCard: { padding: theme.spacing.m, marginBottom: theme.spacing.l },
  input: { fontSize: 20, textAlign: 'center', fontWeight: 'bold' },
  hint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: theme.spacing.s, textAlign: 'center' },
  submitBtn: { marginTop: theme.spacing.m }
});
