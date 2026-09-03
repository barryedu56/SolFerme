import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { adminApi } from "../../api/adminApi";
import {
  A, AdminPage, AdminCard, AdminKpi, AdminKpiGrid, AdminSectionTitle,
  AdminChart, AdminLoading, AdminError,
} from "./ui";

export function AdminDashboardScreen() {
  const [stats, setStats] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const [statsData, chartsData] = await Promise.all([adminApi.getOverview(), adminApi.getCharts()]);
      setStats(statsData);
      setCharts(chartsData);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError("Impossible de charger les données du tableau de bord.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const toSeries = (rows: any[]) =>
    (rows || []).map((r) => ({ label: String(r.month).substring(5), value: r.count }));

  if (loading) return <AdminPage title="Tableau de bord"><AdminLoading label="Chargement de la plateforme…" /></AdminPage>;
  if (error) return <AdminPage title="Tableau de bord"><AdminError message={error} onRetry={loadData} /></AdminPage>;

  return (
    <AdminPage
      title="Tableau de bord"
      subtitle="Vue globale de la plateforme SolFerme"
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); loadData(); }}
    >
      <AdminKpiGrid>
        <AdminKpi icon="group" tone="primary" label="Utilisateurs" value={stats.total_users} sub={`${stats.total_owners} propriétaires`} />
        <AdminKpi icon="person" tone="info" label="Propriétaires" value={stats.total_owners} />
        <AdminKpi icon="badge" tone="purple" label="Employés" value={stats.total_employees} />
        <AdminKpi icon="storefront" tone="success" label="Fermes actives" value={stats.active_farms} sub={`${stats.archived_farms} archivées`} />
        <AdminKpi icon="archive" tone="neutral" label="Fermes archivées" value={stats.archived_farms} />
        <AdminKpi icon="view-list" tone="warning" label="Lots totaux" value={stats.total_lots} />
      </AdminKpiGrid>

      <AdminSectionTitle icon="insights" title="Évolution" />
      <View style={styles.chartRow}>
        <View style={styles.chartCol}>
          <AdminChart title="Nouvelles inscriptions" subtitle="Par mois" kind="line" color={A.primary} data={toSeries(charts?.users_by_month)} />
        </View>
        <View style={styles.chartCol}>
          <AdminChart title="Créations de fermes" subtitle="Par mois" kind="bar" color={A.success} data={toSeries(charts?.farms_by_month)} />
        </View>
      </View>

      <AdminSectionTitle icon="favorite" title="État de la plateforme" />
      <AdminCard>
        <HealthRow icon="check-circle" tone={A.success} text={`API opérationnelle${lastUpdated ? ` — dernière réponse à ${lastUpdated.toLocaleTimeString("fr-FR")}` : ""}`} />
        <HealthRow icon="storage" tone={A.success} text={`Base MySQL connectée — ${stats?.total_users ?? 0} utilisateurs, ${stats?.total_farms ?? 0} fermes`} />
        <HealthRow icon="sync" tone={A.info} text={`${stats?.total_production ?? 0} casiers d'œufs produits au total`} last />
      </AdminCard>
    </AdminPage>
  );
}

function HealthRow({ icon, tone, text, last }: any) {
  return (
    <View style={[styles.healthRow, last && { borderBottomWidth: 0 }]}>
      <MaterialIcons name={icon} size={20} color={tone} />
      <Text style={styles.healthTxt}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chartRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginHorizontal: -2 },
  chartCol: { flexGrow: 1, flexBasis: 340, minWidth: 280, paddingHorizontal: 2 },
  healthRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  healthTxt: { flex: 1, fontSize: 14, color: A.ink, fontWeight: "500" },
});
