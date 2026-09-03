import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { adminApi } from "../../api/adminApi";
import {
  A, AdminPage, AdminCard, AdminKpi, AdminKpiGrid, AdminSectionTitle,
  AdminSegmented, AdminChart, AdminButton, AdminLoading, AdminIconButton,
} from "./ui";

type Period = "1d" | "7d" | "30d" | "90d" | "180d" | "365d";
const PERIODS: { key: Period; label: string }[] = [
  { key: "1d", label: "Auj." }, { key: "7d", label: "7j" }, { key: "30d", label: "30j" },
  { key: "90d", label: "3 mois" }, { key: "180d", label: "6 mois" }, { key: "365d", label: "1 an" },
];
type ChartMetric = "users" | "farms" | "activity";
const MODULE_TONE: Record<string, string> = {
  Production: A.warning, Vente: A.success, Santé: A.danger,
  Alimentation: "#EA580C", Employés: A.purple, Finance: A.info, Tâches: "#0891B2",
};
const moduleColor = (m: string) => MODULE_TONE[m] || A.inkFaint;

export function AdminReportsScreen() {
  const [period, setPeriod] = useState<Period>("30d");
  const [reports, setReports] = useState<any>(null);
  const [moduleUsage, setModuleUsage] = useState<any[]>([]);
  const [userDist, setUserDist] = useState<any>(null);
  const [farmDist, setFarmDist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("users");

  const loadAll = useCallback(async (p: Period) => {
    try {
      const [rep, usage, ud, fd] = await Promise.all([
        adminApi.getReports(p),
        adminApi.getModuleUsage(p),
        adminApi.getUserDistribution(),
        adminApi.getFarmDistribution(),
      ]);
      setReports(rep);
      setModuleUsage(usage?.usage || []);
      setUserDist(ud);
      setFarmDist(fd);
    } catch {
      /* garde les données précédentes */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(period); }, [period, loadAll]);

  const handleExportUsers = async () => {
    try {
      const blob = await adminApi.exportUsers();
      const url = (window as any).URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "utilisateurs_solferme.pdf");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert("Impossible de générer l'export.");
    }
  };

  if (loading) return <AdminPage title="Rapports & Statistiques"><AdminLoading label="Chargement des analytics…" /></AdminPage>;

  const kpi = reports?.kpi || {};
  const evolution = reports?.evolution?.[chartMetric] || [];
  const evoSeries = evolution.slice(-8).map((d: any) => {
    const date = new Date(d.day);
    return { label: `${date.getDate()}/${date.getMonth() + 1}`, value: d.count };
  });
  const topModules = moduleUsage.slice(0, 7);
  const moduleSeries = topModules.map((m: any) => ({ label: (m.module || "—").substring(0, 6), value: m.count }));

  return (
    <AdminPage
      title="Rapports & Statistiques"
      subtitle="Analytics de la plateforme SolFerme"
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); loadAll(period); }}
      actions={<AdminIconButton icon="refresh" onPress={() => { setRefreshing(true); loadAll(period); }} />}
    >
      <View style={{ marginBottom: 18 }}>
        <AdminSegmented options={PERIODS} value={period} onChange={setPeriod} />
      </View>

      <AdminSectionTitle icon="speed" title="Indicateurs clés" />
      <AdminKpiGrid>
        <AdminKpi icon="group" tone="info" label="Nouveaux utilisateurs" value={kpi.new_users ?? 0} sub={`${kpi.total_users ?? 0} au total`} trend={kpi.new_users_variation} />
        <AdminKpi icon="storefront" tone="success" label="Nouvelles fermes" value={kpi.new_farms ?? 0} sub={`${kpi.total_farms ?? 0} au total`} trend={kpi.new_farms_variation} />
        <AdminKpi icon="view-list" tone="purple" label="Nouveaux lots" value={kpi.new_lots ?? 0} trend={kpi.new_lots_variation} />
        <AdminKpi icon="egg" tone="warning" label="Production (casiers)" value={kpi.production ?? 0} trend={kpi.production_variation} />
        <AdminKpi icon="payments" tone="success" label="Chiffre d'affaires" value={`${Number(kpi.sales_revenue ?? 0).toLocaleString("fr-FR")} GNF`} trend={kpi.sales_variation} />
        <AdminKpi icon="bolt" tone="primary" label="Actions effectuées" value={kpi.activity_count ?? 0} trend={kpi.activity_variation} />
      </AdminKpiGrid>

      <AdminSectionTitle icon="insights" title="Tendances" />
      <AdminChart
        title="Évolution de la plateforme"
        subtitle="8 derniers points"
        kind="line"
        color={A.primary}
        data={evoSeries}
        right={
          <AdminSegmented
            size="sm"
            value={chartMetric}
            onChange={setChartMetric}
            options={[
              { key: "users" as ChartMetric, label: "Utilisateurs" },
              { key: "farms" as ChartMetric, label: "Fermes" },
              { key: "activity" as ChartMetric, label: "Activité" },
            ]}
          />
        }
      />

      {topModules.length > 0 && (
        <>
          <AdminChart title="Utilisation des modules" subtitle="Nombre d'actions" kind="bar" color={A.purple} data={moduleSeries} />
          <AdminCard style={{ marginTop: -6, marginBottom: 18 }}>
            {topModules.map((m: any, i: number) => (
              <View key={i} style={[styles.moduleRow, i === topModules.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.moduleName}>
                  <View style={[styles.moduleDot, { backgroundColor: moduleColor(m.module) }]} />
                  <Text style={styles.moduleTxt}>{m.module || "—"}</Text>
                </View>
                <Text style={styles.moduleCount}>{m.count} actions</Text>
              </View>
            ))}
          </AdminCard>
        </>
      )}

      <AdminSectionTitle icon="pie-chart" title="Répartitions" />
      <View style={styles.distRow}>
        {userDist && (
          <AdminCard style={styles.distCard}>
            <Text style={styles.distTitle}>Utilisateurs</Text>
            <DistItem label="Propriétaires" value={userDist.proprietaires} color={A.info} />
            <DistItem label="Employés" value={userDist.employes} color={A.purple} />
            <DistItem label="Actifs" value={userDist.actifs} color={A.success} />
            <DistItem label="Désactivés" value={userDist.inactifs} color={A.danger} last />
          </AdminCard>
        )}
        {farmDist && (
          <AdminCard style={styles.distCard}>
            <Text style={styles.distTitle}>Fermes</Text>
            <DistItem label="Actives" value={farmDist.actives} color={A.success} />
            <DistItem label="Archivées" value={farmDist.archivees} color={A.inkFaint} last />
          </AdminCard>
        )}
      </View>

      {reports?.recent_activity?.length > 0 && (
        <>
          <AdminSectionTitle icon="bolt" title="Activité récente" />
          <AdminCard pad={0}>
            {reports.recent_activity.map((log: any, i: number) => (
              <View key={i} style={[styles.actRow, i === reports.recent_activity.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.actDot, { backgroundColor: moduleColor(log.module) }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.actAction}>{log.action}</Text>
                  <Text style={styles.actMeta}>
                    {log["user__name"] || "—"}
                    {log["farm__name"] ? ` · Ferme : ${log["farm__name"]}` : ""}
                    {log.date ? ` · ${new Date(log.date).toLocaleString("fr-FR")}` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </AdminCard>
        </>
      )}

      <AdminSectionTitle icon="file-download" title="Exports" />
      {Platform.OS === "web" ? (
        <AdminButton label="Exporter les utilisateurs (PDF)" icon="picture-as-pdf" variant="dark" onPress={handleExportUsers} style={{ alignSelf: "flex-start" }} />
      ) : (
        <AdminCard flat><Text style={styles.actMeta}>Les exports PDF sont disponibles depuis la version web de la console.</Text></AdminCard>
      )}
    </AdminPage>
  );
}

function DistItem({ label, value, color, last }: { label: string; value: number; color: string; last?: boolean }) {
  return (
    <View style={[styles.distItem, last && { borderBottomWidth: 0 }]}>
      <View style={[styles.distDot, { backgroundColor: color }]} />
      <Text style={styles.distLabel}>{label}</Text>
      <Text style={styles.distValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  moduleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  moduleName: { flexDirection: "row", alignItems: "center", gap: 9 },
  moduleDot: { width: 8, height: 8, borderRadius: 4 },
  moduleTxt: { fontSize: 13.5, color: A.ink, fontWeight: "600" },
  moduleCount: { fontSize: 13, color: A.inkSoft },

  distRow: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  distCard: { flexGrow: 1, flexBasis: 260, minWidth: 220 },
  distTitle: { fontSize: 15, fontWeight: "800", color: A.ink, marginBottom: 8 },
  distItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  distDot: { width: 10, height: 10, borderRadius: 5 },
  distLabel: { flex: 1, fontSize: 13.5, color: A.inkSoft },
  distValue: { fontSize: 15, fontWeight: "800", color: A.ink },

  actRow: { flexDirection: "row", paddingVertical: 12, paddingHorizontal: 18, gap: 12, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  actDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  actAction: { fontSize: 13, fontWeight: "700", color: A.ink },
  actMeta: { fontSize: 11.5, color: A.inkFaint, marginTop: 3 },
});
