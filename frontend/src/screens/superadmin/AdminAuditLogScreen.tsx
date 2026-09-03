import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { adminApi } from "../../api/adminApi";
import { A, AdminPage, AdminBanner, AdminEmpty, AdminLoading } from "./ui";

export function AdminAuditLogScreen() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (pageArg: number) => {
    try {
      const data = await adminApi.getAuditLogs({ page: pageArg });
      const rows = Array.isArray(data) ? data : data.results ?? [];
      setLogs((prev) => (pageArg === 1 ? rows : [...prev, ...rows]));
      setHasMore(!Array.isArray(data) && Boolean(data.next));
      setPage(pageArg);
    } catch {
      /* silencieux */
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const loadMore = () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    load(page + 1);
  };

  const renderLog = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.iconCol}>
        <MaterialIcons name="verified-user" size={20} color={A.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.head}>
          <Text style={styles.action} numberOfLines={2}>{item.action}</Text>
          <Text style={styles.date}>{new Date(item.created_at).toLocaleString("fr-FR")}</Text>
        </View>
        <View style={styles.targetPill}>
          <MaterialIcons name="my-location" size={12} color={A.warning} />
          <Text style={styles.targetTxt}>{item.target_type} · {item.target_id}</Text>
        </View>
        <View style={styles.meta}>
          <MaterialIcons name="person" size={12} color={A.inkFaint} />
          <Text style={styles.metaTxt}>{item.admin_user_name || "Système"}</Text>
          <Text style={styles.metaDot}>·</Text>
          <MaterialIcons name="dns" size={12} color={A.inkFaint} />
          <Text style={styles.metaTxt}>{item.ip_address || "IP inconnue"}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <AdminPage title="Journal d'audit" subtitle="Traçabilité des actions sensibles des SuperAdmins" scroll={false}>
      {loading && <AdminLoading />}
      {!loading && (
        <FlatList
          data={logs}
          keyExtractor={(l) => String(l.id)}
          renderItem={renderLog}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListHeaderComponent={<AdminBanner icon="info" tone="info" text="Ce journal enregistre chaque action sensible effectuée depuis la console d'administration." />}
          ListEmptyComponent={<AdminEmpty icon="verified-user" title="Aucun log d'audit disponible" />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={A.primary} colors={[A.primary]} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={A.primary} style={{ marginVertical: 16 }} /> : null}
        />
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: 14, backgroundColor: A.surface, borderRadius: 14, borderWidth: 1, borderColor: A.borderSoft, padding: 15, marginBottom: 12 },
  iconCol: { width: 42, height: 42, borderRadius: 12, backgroundColor: A.primarySoft, alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  action: { fontSize: 14.5, fontWeight: "800", color: A.ink, flex: 1 },
  date: { fontSize: 11.5, color: A.inkFaint },
  targetPill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: A.warningSoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, marginBottom: 8 },
  targetTxt: { fontSize: 11.5, fontWeight: "700", color: A.warning },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  metaTxt: { fontSize: 12, color: A.inkFaint },
  metaDot: { fontSize: 12, color: A.inkFaint, marginHorizontal: 4 },
});
