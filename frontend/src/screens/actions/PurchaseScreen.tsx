import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { MaterialIcons } from '@expo/vector-icons';

export const PurchaseScreen = ({ route, navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const { type = 'feed', farmId } = route.params || {}; // 'feed' or 'health'

  useEffect(() => {
    if (userRole === 'EMPLOYE') {
      Alert.alert("Accès refusé", "Seul le propriétaire peut enregistrer des achats.");
      navigation.goBack();
    }
  }, [userRole]);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [loading, setLoading] = useState(false);
  const [farms, setFarms] = useState<any[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState(farmId);

  useEffect(() => {
    if (!farmId) {
      fetchFarms();
    }
  }, [farmId]);

  const fetchFarms = async () => {
    try {
      const res = await apiClient.get('/farms/');
      setFarms(res.data);
      if (res.data.length > 0 && !selectedFarmId) {
        setSelectedFarmId(res.data[0].id);
      }
    } catch (e) {
      console.error("Erreur lors de la récupération des fermes", e);
    }
  };

  const handleSubmit = async () => {
    if (!productName || !quantity || !totalPrice || !selectedFarmId) {
      Alert.alert(t('common.error'), 'Veuillez remplir tous les champs obligatoires.');
      return;
    }

    setLoading(true);
    const endpoint = type === 'feed' ? '/feed-purchases/' : '/health-purchases/';
    const payload = {
      farm: selectedFarmId,
      date,
      supplier,
      total_price: parseFloat(totalPrice),
      ...(type === 'feed'
        ? { feed_type: productName, quantity_kg: parseFloat(quantity) }
        : { product_name: productName, quantity: parseFloat(quantity) }
      )
    };

    try {
      await apiClient.post(endpoint, payload);
      Alert.alert(t('common.success'), 'Achat enregistré et stock mis à jour !');
      navigation.goBack();
    } catch (e: any) {
      console.error(e);
      Alert.alert(t('common.error'), "Impossible d'enregistrer l'achat.");
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {type === 'feed' ? 'Achat d\'Aliment' : 'Achat de Produit Santé'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Card style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nom du produit / Type</Text>
              <Input
                placeholder={type === 'feed' ? "Ex: Ponte 1" : "Ex: Vaccin Gumboro"}
                value={productName}
                onChangeText={setProductName}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Quantité {type === 'feed' ? '(kg)' : ''}</Text>
                <Input
                  placeholder="0"
                  value={quantity}
                  onChangeText={setQuantity}
                  isNumeric
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Prix Total (GNF)</Text>
                <Input
                  placeholder="0"
                  value={totalPrice}
                  onChangeText={setTotalPrice}
                  isNumeric
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Fournisseur (Optionnel)</Text>
              <Input
                placeholder="Ex: Comptoir Avicole"
                value={supplier}
                onChangeText={setSupplier}
              />
            </View>

            <DatePicker label="Date de l'achat" value={date} onChange={setDate} />
          </Card>

          <Button
            title="Enregistrer l'achat"
            onPress={handleSubmit}
            loading={loading}
            style={styles.submitBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.spacing.m, paddingTop: theme.spacing.l },
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.surface, ...theme.shadows.light },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m },
  formCard: { padding: theme.spacing.m, borderRadius: theme.borderRadius.xl, marginBottom: theme.spacing.l },
  inputGroup: { marginBottom: theme.spacing.m },
  label: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8, fontWeight: '600' },
  row: { flexDirection: 'row' },
  submitBtn: { height: 56, borderRadius: theme.borderRadius.xl, marginTop: theme.spacing.m },
});
