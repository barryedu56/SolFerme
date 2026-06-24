import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Card } from '../components/Card';
import { apiClient } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency } from '../utils/formatters';

export const TransactionsHistoryScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const [salesRes, expensesRes] = await Promise.all([
          apiClient.get('/sales/'),
          apiClient.get('/expenses/'),
        ]);

        const salesTrans = salesRes.data.map((s: any) => ({
          id: `s-${s.id}`,
          title: `Vente ${s.product_type} - ${s.customer_name}`,
          amount: parseFloat(s.amount_paid),
          date: s.date,
          type: 'income'
        }));

        const expenseTrans = expensesRes.data.map((e: any) => ({
          id: `e-${e.id}`,
          title: e.description || 'Dépense',
          amount: -parseFloat(e.amount),
          date: e.date,
          type: 'expense'
        }));

        const allTransactions = [...salesTrans, ...expenseTrans]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        setTransactions(allTransactions);
      } catch (error) {
        console.log(error);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, []);

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historique des Transactions</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Card style={styles.transactionCard}>
               <View style={styles.transactionIconCircle}>
                  <MaterialIcons
                    name={item.type === 'income' ? 'add-shopping-cart' : 'payments'}
                    size={20}
                    color={item.type === 'income' ? '#2E7D32' : theme.colors.danger}
                  />
               </View>
               <View style={styles.transactionInfo}>
                  <Text style={styles.transactionTitle}>{item.title}</Text>
                  <Text style={styles.transactionDate}>{new Date(item.date).toLocaleDateString('fr-FR')}</Text>
               </View>
               <Text style={[styles.transactionAmount, { color: item.type === 'income' ? '#2E7D32' : theme.colors.danger }]}>
                  {item.amount > 0 ? '+' : ''}{formatCurrency(item.amount)}
               </Text>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: theme.spacing.m, paddingTop: theme.spacing.l, backgroundColor: theme.colors.background,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface,
    justifyContent: 'center', alignItems: 'center', ...theme.shadows.light,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  list: { padding: theme.spacing.m, paddingBottom: 40 },
  transactionCard: {
    flexDirection: 'row', alignItems: 'center', padding: theme.spacing.m,
    marginBottom: theme.spacing.s, borderRadius: theme.borderRadius.xl,
    borderWidth: 1, borderColor: theme.colors.border + '40',
  },
  transactionIconCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.background,
    justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.m,
  },
  transactionInfo: { flex: 1 },
  transactionTitle: { fontSize: 14, fontWeight: 'bold', color: theme.colors.text },
  transactionDate: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  transactionAmount: { fontSize: 15, fontWeight: 'bold' }
});
