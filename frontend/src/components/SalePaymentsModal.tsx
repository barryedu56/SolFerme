import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { repositoryProvider } from '../repositories';
import { formatCurrency } from '../utils/formatters';
import { getErrorMessage } from '../utils/errors';
import { Input } from './Input';
import { Button } from './Button';
import { toast } from '../utils/toast';
import { useBreakpoint } from '../hooks/useBreakpoint';

/**
 * Identifiant d'idempotence envoyé avec chaque paiement.
 * Côté backend, la vente (sale, reference) est dédupliquée sur status='ACTIVE'
 * afin qu'une perte de connexion pendant l'encaissement (POST traité mais
 * réponse perdue → ré-inscription offline) ne crée pas un double paiement.
 */
const generatePaymentReference = (): string => {
  // UUID v4 généré sans dépendance externe (RN), monotone et unique en pratique.
  const randomHex = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return (
    `pay-${Date.now().toString(36)}-${randomHex()}${randomHex()}-` +
    `${randomHex()}${randomHex()}${randomHex()}${randomHex()}`
  );
};

interface SalePaymentsModalProps {
  visible: boolean;
  onClose: () => void;
  saleId: number;
  lotId: number;
  farmId?: number;
  totalAmount: number;
  onPaymentAdded: () => void;
}

export const SalePaymentsModal = ({ visible, onClose, saleId, lotId, farmId, totalAmount, onPaymentAdded }: SalePaymentsModalProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newAmount, setNewAmount] = useState('');

  const styles = createStyles(theme);

  useEffect(() => {
    if (visible && saleId) {
      fetchPayments();
    }
  }, [visible, saleId]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const res: any = await repositoryProvider.salePayments.list({ sale: saleId });
      setPayments(res.results || res);
    } catch (error) {
      console.log('Erreur fetch payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const isPaymentActive = (status?: string) => ['ACTIF', 'ACTIVE'].includes(String(status || '').toUpperCase());
  const isPaymentCancelled = (status?: string) => ['ANNULEE', 'ANNULÉ', 'CANCELLED'].includes(String(status || '').toUpperCase());

  // 🔒 Ne compter QUE les paiements ACTIFS dans le "déjà payé".
  // Un paiement annulé (status='ANNULEE') doit rester visible dans l'historique
  // (opération traçable) mais ne doit PAS contribuer au total payé / à la créance.
  const activePayments = payments.filter((p: any) => isPaymentActive(p.status));
  const amountPaid = activePayments.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
  const reste = totalAmount - amountPaid;

  const handleAddPayment = async () => {
    const amount = parseFloat(newAmount.replace(/\s/g, ''));
    if (!amount || amount <= 0) {
      toast.error('Erreur', 'Veuillez entrer un montant valide.');
      return;
    }
    if (amount > reste) {
      toast.error('Erreur', 'Le montant ne peut pas dépasser le reste à payer.');
      return;
    }

    setAdding(true);
    try {
      await repositoryProvider.salePayments.create({
        sale: saleId,
        lot: lotId,
        farm: farmId,
        amount: amount,
        payment_method: 'CASH',
        payment_date: new Date().toISOString().split('T')[0],
        reference: generatePaymentReference(),
      });
      toast.success('Succès', 'Paiement ajouté avec succès.');
      setNewAmount('');
      await fetchPayments();
      onPaymentAdded();
    } catch (e: any) {
      toast.error('Erreur', getErrorMessage(e, 'Impossible d\'ajouter le paiement.'));
    } finally {
      setAdding(false);
    }
  };

  const renderPaymentItem = ({ item }: { item: any }) => {
    const isCancelled = isPaymentCancelled(item.status);
    return (
      <View style={[styles.paymentItem, isCancelled && { opacity: 0.6 }]}>
        <View>
          <Text style={[styles.paymentAmount, isCancelled && styles.paymentAmountCancelled]}>
            {formatCurrency(item.amount)}
          </Text>
          <Text style={styles.paymentDate}>{item.payment_date} - {item.payment_method}</Text>
        </View>
        {isCancelled ? (
          <View style={styles.cancelledBadge}>
            <Text style={styles.cancelledText}>{t('common.cancelled')}</Text>
          </View>
        ) : (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.overlay, isDesktop && styles.overlayDesktop]}>
        <View style={[styles.modalContent, isDesktop && styles.modalContentDesktop]}>
          <View style={styles.header}>
            <Text style={styles.title}>Historique des paiements</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryBox}>
            <Text style={styles.summaryText}>Total à payer : {formatCurrency(totalAmount)}</Text>
            <Text style={styles.summaryText}>Total payé : {formatCurrency(amountPaid)}</Text>
            <Text style={[styles.summaryText, { color: reste > 0 ? theme.colors.danger : theme.colors.success }]}>
              Reste à payer : {formatCurrency(reste > 0 ? reste : 0)}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={theme.colors.primary} style={{ margin: 20 }} />
          ) : (
            <FlatList
              data={payments}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderPaymentItem}
              ListEmptyComponent={<Text style={styles.emptyText}>Aucun paiement enregistré.</Text>}
              style={styles.list}
            />
          )}

          {reste > 0 && (
            <View style={styles.addPaymentBox}>
              <Input
                placeholder="Montant du nouveau paiement"
                value={newAmount}
                onChangeText={setNewAmount}
                isNumeric
                // 🔧 Le flex:1 est placé sur le wrapper (containerStyle) car c'est ce
                // conteneur qui est le « flex item » de la rangée addPaymentBox.
                // Auparavant le flex:1 était sur le TextInput interne : le champ
                // restait de largeur quasi nulle et la valeur saisie, bien stockée,
                // n'était pas visible (texte rogné hors de la zone affichée).
                containerStyle={{ flex: 1 }}
                style={{ marginBottom: 0 }}
              />
              <Button
                title="Ajouter"
                onPress={handleAddPayment}
                loading={adding}
                style={{ marginLeft: 10, paddingHorizontal: 20 }}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  overlayDesktop: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalContentDesktop: {
    maxWidth: 600,
    width: '100%',
    borderRadius: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  summaryBox: {
    backgroundColor: theme.colors.surface,
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 5,
  },
  list: {
    maxHeight: 250,
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  paymentAmountCancelled: {
    color: theme.colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  paymentDate: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  statusBadge: {
    backgroundColor: theme.colors.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  cancelledBadge: {
    backgroundColor: theme.colors.danger + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  cancelledText: {
    fontSize: 12,
    color: theme.colors.danger,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    padding: 20,
  },
  addPaymentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: 15,
  },
});
