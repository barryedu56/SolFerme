import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DatePicker } from '../components/DatePicker';
import { useTheme } from '../context/ThemeContext';
import { apiClient } from '../api/client';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from '../context/LanguageContext';

export const CreateLotScreen = ({ route, navigation }: any) => {
  const { farmId, farmName, lot } = route.params || {};
  const isEditing = !!lot;
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [name, setName] = useState(lot?.name || '');
  const [animalType, setAnimalType] = useState(lot?.animal_type || 'Pondeuses');

  const breedParts = lot?.breed ? lot.breed.split(' - ') : ['Poule'];
  const [species, setSpecies] = useState(breedParts[0]);
  const [strain, setStrain] = useState(breedParts[1] || '');

  const [arrivalDate, setArrivalDate] = useState(lot?.purchase_date || new Date().toISOString().split('T')[0]);
  const [initialQuantity, setInitialQuantity] = useState(lot?.initial_quantity?.toString() || '');
  const [currentQuantity, setCurrentQuantity] = useState(lot?.current_quantity?.toString() || '');
  const [purchasePrice, setPurchasePrice] = useState(lot?.purchase_price?.toString() || '');
  const [supplier, setSupplier] = useState(lot?.supplier || '');
  const [notes, setNotes] = useState(lot?.notes || '');
  const [status, setStatus] = useState(lot?.status || 'EN_PRODUCTION');

  const [loading, setLoading] = useState(false);
  const [showStrainSuggestions, setShowStrainSuggestions] = useState(false);

  const ANIMAL_TYPES = ['Pondeuses', 'Poulets de chair', 'Coqs', 'Pintades'];
  const STRAIN_SUGGESTIONS = ['ISA Brown', 'Lohmann Brown', 'Hy-Line Brown', 'Leghorn', 'Cobb'];
  const STATUS_OPTIONS = [
    { label: 'En préparation', value: 'EN_PREPARATION' },
    { label: 'En production', value: 'EN_PRODUCTION' },
    { label: 'Terminé', value: 'TERMINE' },
    { label: 'Vendu', value: 'VENDU' },
  ];

  const handleSave = async () => {
    if (!name) {
      Alert.alert(t('common.error'), 'Veuillez entrer le nom du lot.');
      return;
    }
    const qty = parseInt(initialQuantity);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert(t('common.error'), 'Veuillez entrer un nombre de poules valide (supérieur à 0).');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        farm: farmId || lot?.farm,
        name,
        animal_type: animalType,
        breed: strain ? `${species} - ${strain}` : species,
        purchase_date: arrivalDate,
        purchase_price: parseFloat(purchasePrice) || 0,
        initial_quantity: qty,
        current_quantity: isEditing ? parseInt(currentQuantity) : qty,
        supplier,
        notes,
        status: status
      };

      if (isEditing) {
        await apiClient.put(`/lots/${lot.id}/`, payload);
        Alert.alert(t('common.success'), 'Le lot a été mis à jour !');
      } else {
        await apiClient.post('/lots/', payload);
        Alert.alert(t('common.success'), 'Le lot a été ajouté avec succès !');
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert(t('common.error'), `Impossible de ${isEditing ? 'modifier' : 'ajouter'} le lot.`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('common.delete'),
      "Supprimer ce lot effacera également toutes ses productions et dépenses rattachées. Continuer ?",
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('common.delete'),
          style: "destructive",
          onPress: async () => {
            try {
              await apiClient.delete(`/lots/${lot.id}/`);
              Alert.alert(t('common.success'), "Lot supprimé");
              navigation.pop(2);
            } catch (e) {
              Alert.alert(t('common.error'), "Impossible de supprimer le lot");
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? 'Modifier le Lot' : 'Nouveau Lot'}</Text>
          {isEditing ? (
            <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
              <MaterialIcons name="delete-outline" size={24} color={theme.colors.danger} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card style={styles.farmContextCard}>
             <MaterialIcons name="business" size={20} color={theme.colors.primary} />
             <Text style={styles.farmContextText}>Affectation: <Text style={{fontWeight: 'bold'}}>{farmName || 'Ferme rattachée'}</Text></Text>
          </Card>

          <Text style={styles.sectionTitle}>Type d'élevage</Text>
          <View style={styles.typeSelector}>
            {ANIMAL_TYPES.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.typeButton, animalType === t && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
                onPress={() => setAnimalType(t)}
              >
                <Text style={[styles.typeButtonText, animalType === t && { color: theme.colors.text, fontWeight: 'bold' }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Identité du lot</Text>
          <Card style={styles.formCard}>
             <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="label" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>Nom du lot / Identifiant *</Text>
                </View>
                <Input
                  placeholder="Ex: Bande PONTE-2024-B"
                  value={name}
                  onChangeText={setName}
                  style={styles.fieldInput}
                />
             </View>

             <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                   <View style={styles.labelRow}>
                     <MaterialIcons name="egg" size={18} color={theme.colors.primary} />
                     <Text style={styles.label}>Espèce</Text>
                   </View>
                   <Input
                     placeholder="Poule"
                     value={species}
                     onChangeText={setSpecies}
                     style={styles.fieldInput}
                   />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                   <View style={styles.labelRow}>
                     <MaterialCommunityIcons name="dna" size={18} color={theme.colors.primary} />
                     <Text style={styles.label}>Souche</Text>
                   </View>
                   <Input
                     placeholder="ISA Brown"
                     value={strain}
                     onChangeText={(text) => {
                        setStrain(text);
                        setShowStrainSuggestions(text.length > 0);
                     }}
                     style={styles.fieldInput}
                   />
                   {showStrainSuggestions && (
                     <View style={styles.suggestionsContainer}>
                        {STRAIN_SUGGESTIONS.filter(s => s.toLowerCase().includes(strain.toLowerCase())).map((item) => (
                           <TouchableOpacity
                             key={item}
                             style={styles.suggestionItem}
                             onPress={() => {
                               setStrain(item);
                               setShowStrainSuggestions(false);
                             }}
                           >
                              <Text style={styles.suggestionText}>{item}</Text>
                           </TouchableOpacity>
                        ))}
                     </View>
                   )}
                </View>
             </View>
          </Card>

          <Text style={styles.sectionTitle}>Statut du lot</Text>
          <View style={styles.typeSelector}>
            {STATUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.typeButton, status === opt.value && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
                onPress={() => setStatus(opt.value)}
              >
                <Text style={[styles.typeButtonText, status === opt.value && { color: theme.colors.text, fontWeight: 'bold' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Détails d'entrée</Text>
          <Card style={styles.formCard}>
             <DatePicker
               label="Date de mise en place *"
               value={arrivalDate}
               onChange={setArrivalDate}
             />

             <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                    <View style={styles.labelRow}>
                      <MaterialIcons name="group-add" size={18} color={theme.colors.primary} />
                      <Text style={styles.label}>Qté initiale *</Text>
                    </View>
                    <Input
                      placeholder="0"
                      value={initialQuantity}
                      onChangeText={setInitialQuantity}
                      isNumeric
                      style={styles.fieldInput}
                    />
                </View>
                {isEditing && (
                   <View style={[styles.inputGroup, { flex: 1 }]}>
                      <View style={styles.labelRow}>
                        <MaterialIcons name="groups" size={18} color={theme.colors.primary} />
                        <Text style={styles.label}>Qté actuelle</Text>
                      </View>
                      <Input
                        placeholder="0"
                        value={currentQuantity}
                        onChangeText={setCurrentQuantity}
                        isNumeric
                        style={styles.fieldInput}
                      />
                   </View>
                )}
             </View>

             <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="payments" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>Prix d'achat total (GNF)</Text>
                </View>
                <Input
                  placeholder="0"
                  value={purchasePrice}
                  onChangeText={setPurchasePrice}
                  isNumeric
                  style={styles.fieldInput}
                />
             </View>

             <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <MaterialCommunityIcons name="egg" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>Fournisseur / Couvoir</Text>
                </View>
                <Input
                  placeholder="Nom de la source"
                  value={supplier}
                  onChangeText={setSupplier}
                  style={styles.fieldInput}
                />
             </View>

             <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                <View style={styles.labelRow}>
                  <MaterialIcons name="notes" size={18} color={theme.colors.primary} />
                  <Text style={styles.label}>Notes (optionnel)</Text>
                </View>
                <Input
                  placeholder="Observations sur ce lot..."
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                  style={[styles.fieldInput, { height: 80, textAlignVertical: 'top' }]}
                />
             </View>
          </Card>

          <Button
            title={isEditing ? "Mettre à jour le lot" : "Enregistrer le lot"}
            onPress={handleSave}
            loading={loading}
            style={styles.submitBtn}
          />

          <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
             <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
    paddingTop: theme.spacing.l,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.light,
  },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.danger + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  scroll: { padding: theme.spacing.m, paddingBottom: 40 },
  farmContextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    marginBottom: theme.spacing.l,
    backgroundColor: theme.colors.surface,
  },
  farmContextText: {
    marginLeft: 10,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
    marginLeft: 4,
  },
  formCard: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.l,
  },
  inputGroup: { marginBottom: theme.spacing.m },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginLeft: 8,
  },
  fieldInput: {
    marginBottom: 0,
    backgroundColor: theme.colors.background + '40',
    borderRadius: theme.borderRadius.m,
  },
  row: { flexDirection: 'row' },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: theme.spacing.l,
  },
  typeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
  },
  typeButtonText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  submitBtn: {
    height: 56,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    marginTop: theme.spacing.m,
    ...theme.shadows.medium,
  },
  cancelBtn: {
    marginTop: theme.spacing.m,
    alignItems: 'center',
    padding: theme.spacing.m,
  },
  cancelText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  suggestionsContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.m,
    marginTop: 4,
    borderWidth: 1,
    borderColor: theme.colors.border + '40',
    zIndex: 1000,
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border + '20',
  },
  suggestionText: {
    fontSize: 13,
    color: theme.colors.text,
  }
});
