import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { apiClient } from '../../api/client';
import { MaterialIcons } from '@expo/vector-icons';

const CATEGORIES = ['Électricité', 'Eau', 'Loyer', 'Transport', 'Main d\'œuvre', 'Maintenance', 'Divers'];

export const AddExpenseScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Divers');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!description || !amount) {
      Alert.alert(t('common.error'), 'Veuillez remplir la description et le montant.');
      return;
    }

    // On récupère la ferme par défaut (la première pour cet utilisateur ou via un sélecteur)
    // Dans SolFerme, on suppose souvent une seule ferme ou on récupère l'id de la ferme active.
    // Pour simplifier ici, on va chercher les fermes d'abord si nécessaire,
    // ou utiliser l'ID stocké/passé.
    // Comme c'est une dépense "Générale", elle doit être liée à une Farm.

    setLoading(true);
    try {
      const farmsRes = await apiClient.get('/farms/');
      if (farmsRes.data.length === 0) {
        Alert.alert('Erreur', 'Aucune ferme trouvée pour associer la dépense.');
        setLoading(false);
        return;
      }

      const payload = {
        farm: farmsRes.data[0].id,
        category,
        description,
        amount: parseFloat(amount),
        date,
      };

      await apiClient.post('/expenses/', payload);
      Alert.alert(t('common.success'), 'Dépense enregistrée avec succès !');
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert(t('common.error'), 'Impossible d\'enregistrer la dépense.');
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
          <Text style={styles.headerTitle}>Nouvelle Dépense</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Card style={styles.formCard}>
            <View style={styles.inputGroup}>
               <Text style={styles.label}>Catégorie</Text>
               <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                 {CATEGORIES.map(cat => (
                   <TouchableOpacity
                     key={cat}
                     style={[styles.categoryBtn, category === cat && styles.categoryBtnActive]}
                     onPress={() => setCategory(cat)}
                   >
                     <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>{cat}</Text>
                   </TouchableOpacity>
                 ))}
               </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description</Text>
              <Input placeholder="Ex: Facture EDG Juin" value={description} onChangeText={setDescription} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Montant (GNF)</Text>
              <Input placeholder="0" value={amount} onChangeText={setAmount} isNumeric />
            </View>

            <DatePicker label="Date de la dépense" value={date} onChange={setDate} />
          </Card>

          <Button title="Enregistrer la dépense" onPress={handleSubmit} loading={loading} style={styles.submitBtn} />
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
  categoryScroll: { flexDirection: 'row', marginBottom: 8 },
  categoryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.colors.background, marginRight: 8, borderWidth: 1, borderColor: theme.colors.border },
  categoryBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  categoryText: { fontSize: 13, color: theme.colors.textSecondary },
  categoryTextActive: { color: theme.colors.text, fontWeight: 'bold' },
  submitBtn: { height: 56, borderRadius: theme.borderRadius.xl, marginTop: theme.spacing.m },
});
