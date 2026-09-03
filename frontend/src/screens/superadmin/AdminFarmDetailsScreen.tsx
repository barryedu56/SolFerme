import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { adminApi } from "../../api/adminApi";
import { useRoute, useNavigation } from "@react-navigation/native";
import {
  A, AdminPage, AdminCard, AdminBadge, AdminKpi, AdminKpiGrid,
  AdminInfoRow, AdminSectionTitle, AdminLoading, AdminError,
} from "./ui";

export function AdminFarmDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { id } = route.params;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      setError(null);
      const stats = await adminApi.getFarmStats(id);
      setData(stats);
    } catch {
      setError("Impossible de charger les données de cette ferme.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, [id]);

  const back = { label: "Retour aux fermes", onPress: () => navigation.navigate("AdminFarms") };

  if (loading) return <AdminPage back={back}><AdminLoading /></AdminPage>;
  if (error || !data) return <AdminPage back={back}><AdminError message={error || "Données indisponibles."} onRetry={loadStats} /></AdminPage>;

  const { farm, owner, kpi, lots, recent_activity } = data;
  const active = farm.status === "ACTIF";
  const gnf = (v: any) => Number(v || 0).toLocaleString("fr-FR");

  return (
    <AdminPage back={back}>
      <AdminCard style={{ marginBottom: 18 }}>
        <View style={styles.hero}>
          <View style={[styles.iconBox, { backgroundColor: active ? A.successSoft : "#EEF2F6" }]}>
            <MaterialIcons name="storefront" size={30} color={active ? A.success : A.inkSoft} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.farmName}>{farm.name}</Text>
            <View style={styles.locRow}>
              <MaterialIcons name="place" size={13} color={A.inkFaint} />
              <Text style={styles.loc}>{farm.location || "Localisation non renseignée"}</Text>
            </View>
            <View style={styles.badges}>
              <AdminBadge label={farm.status} tone={active ? "success" : "neutral"} solid />
              <AdminBadge label={`Capacité : ${farm.capacity}`} tone="info" />
            </View>
          </View>
        </View>
      </AdminCard>

      <AdminSectionTitle icon="person" title="Propriétaire" />
      <AdminCard>
        <AdminInfoRow icon="person" label="Nom" value={owner.name} />
        <AdminInfoRow icon="mail-outline" label="Email" value={owner.email} />
        <AdminInfoRow icon="phone" label="Téléphone" value={owner.phone || "Non renseigné"} />
        <AdminInfoRow
          icon={owner.is_active ? "check-circle" : "block"}
          label="Statut du compte"
          value={owner.is_active ? "Actif" : "Désactivé"}
          valueColor={owner.is_active ? A.success : A.danger}
          last
        />
      </AdminCard>

      <AdminSectionTitle icon="bar-chart" title="Statistiques de la ferme" />
      <AdminKpiGrid>
        <AdminKpi icon="view-list" tone="info" label="Lots totaux" value={kpi.lots_total} />
        <AdminKpi icon="check-circle" tone="success" label="Lots actifs" value={kpi.lots_actifs} />
        <AdminKpi icon="done-all" tone="neutral" label="Lots terminés" value={kpi.lots_termines} />
        <AdminKpi icon="badge" tone="purple" label="Employés" value={kpi.employees_total} />
        <AdminKpi icon="egg" tone="warning" label="Production (casiers)" value={kpi.production_total} />
        <AdminKpi icon="shopping-cart" tone="info" label="Ventes" value={kpi.sales_count} />
        <AdminKpi icon="payments" tone="success" label="CA (GNF)" value={gnf(kpi.sales_total)} />
        <AdminKpi icon="money-off" tone="danger" label="Dépenses (GNF)" value={gnf(kpi.expenses_total)} />
        <AdminKpi icon="medical-services" tone="warning" label="Interventions santé" value={kpi.health_records} />
      </AdminKpiGrid>

      {lots && lots.length > 0 && (
        <>
          <AdminSectionTitle icon="view-list" title={`Lots (${lots.length})`} />
          <AdminCard pad={0}>
            {lots.map((lot: any, i: number) => (
              <View key={lot.id} style={[styles.lotRow, i === lots.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.lotName}>{lot.name}</Text>
                  <Text style={styles.lotSub}>{lot.breed} — {lot.current_quantity} sujets</Text>
                </View>
                <AdminBadge
                  label={lot.status}
                  tone={lot.status === "ACTIF" ? "success" : lot.status === "TERMINE" ? "neutral" : "danger"}
                />
              </View>
            ))}
          </AdminCard>
        </>
      )}

      {recent_activity && recent_activity.length > 0 && (
        <>
          <AdminSectionTitle icon="bolt" title="Activité récente" />
          <AdminCard pad={0}>
            {recent_activity.map((log: any, i: number) => (
              <View key={i} style={[styles.actRow, i === recent_activity.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.actDot} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.actAction}>{log.action}</Text>
                  {!!log.description && <Text style={styles.actDesc}>{log.description}</Text>}
                  <Text style={styles.actMeta}>
                    Par {log["user__name"] || "—"} · {log.date ? new Date(log.date).toLocaleString("fr-FR") : "—"}
                  </Text>
                </View>
              </View>
            ))}
          </AdminCard>
        </>
      )}

      <AdminSectionTitle icon="info" title="Informations système" />
      <AdminCard>
        <AdminInfoRow icon="event" label="Créée le" value={
          farm.created_at ? new Date(farm.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—"
        } />
        <AdminInfoRow icon="update" label="Dernière mise à jour" value={farm.updated_at ? new Date(farm.updated_at).toLocaleString("fr-FR") : "—"} last />
      </AdminCard>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 18 },
  iconBox: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  farmName: { fontSize: 21, fontWeight: "800", color: A.ink },
  locRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  loc: { fontSize: 13, color: A.inkSoft },
  badges: { flexDirection: "row", gap: 7, marginTop: 10, flexWrap: "wrap" },
  lotRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: A.borderSoft, gap: 10 },
  lotName: { fontSize: 14.5, fontWeight: "700", color: A.ink },
  lotSub: { fontSize: 12.5, color: A.inkSoft, marginTop: 2 },
  actRow: { flexDirection: "row", paddingVertical: 13, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: A.borderSoft, gap: 12 },
  actDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: A.primary, marginTop: 6 },
  actAction: { fontSize: 13.5, fontWeight: "700", color: A.ink },
  actDesc: { fontSize: 12.5, color: A.inkSoft, marginTop: 2 },
  actMeta: { fontSize: 11.5, color: A.inkFaint, marginTop: 4 },
});
