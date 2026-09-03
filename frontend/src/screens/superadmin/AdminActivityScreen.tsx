import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { adminApi } from "../../api/adminApi";
import { A, AdminPage, AdminSearch, AdminEmpty, AdminLoading } from "./ui";

const MODULE_TONE: Record<string, string> = {
  Production: A.warning, Vente: A.success, Santé: A.danger,
  Alimentation: "#EA580C", Employés: A.purple, Finance: A.info, Tâches: "#0891B2",
};
const moduleColor = (m: string) => MODULE_TONE[m] || A.inkFaint;

export function AdminActivityScreen() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string, pageArg: number) => {
    try {
      const data = await adminApi.getActivity({ search: q || undefined, page: pageArg });
      const rows = Array.isArray(data) ? data : data.results ?? [];
      setActivities((prev) => (pageArg === 1 ? rows : [...prev, ...rows]));
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

  useEffect(() => {
    load("", 1);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [load]);

  const handleSearch = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setLoading(true); load(text, 1); }, 350);
  };

  const loadMore = () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    load(search, page + 1);
  };

  const renderActivity = ({ item, index }: { item: any; index: number }) => {
    const c = moduleColor(item.module);
    return (
      <View style={styles.row}>
        <View style={styles.rail}>
          <View style={[styles.dot, { backgroundColor: c, borderColor: c + "33" }]} />
          {index !== activities.length - 1 && <View style={styles.line} />}
        </View>
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.action} numberOfLines={2}>{item.action}</Text>
            <View style={[styles.moduleBadge, { backgroundColor: c + "18" }]}>
              <Text style={[styles.moduleTxt, { color: c }]}>{item.module || "Système"}</Text>
            </View>
          </View>
          {!!item.description && <Text style={styles.desc}>{item.description}</Text>}
          <View style={styles.meta}>
            <MaterialIcons name="person" size={13} color={A.inkFaint} />
            <Text style={styles.metaTxt}>{item.user_name || "Inconnu"}</Text>
            <Text style={styles.metaDot}>·</Text>
            <MaterialIcons name="schedule" size={13} color={A.inkFaint} />
            <Text style={styles.metaTxt}>{new Date(item.date).toLocaleString("fr-FR")}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <AdminPage title="Activité globale" subtitle="Flux temps réel des actions métier de la plateforme" scroll={false}>
      {loading && <AdminLoading />}
      {!loading && (
        <FlatList
          data={activities}
          keyExtractor={(a) => String(a.id)}
          renderItem={renderActivity}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListHeaderComponent={<View style={{ marginBottom: 18 }}><AdminSearch value={search} onChangeText={handleSearch} placeholder="Rechercher (action, module, description)…" /></View>}
          ListEmptyComponent={<AdminEmpty icon="bolt" title="Aucune activité trouvée" />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(search, 1); }} tintColor={A.primary} colors={[A.primary]} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={A.primary} style={{ marginVertical: 16 }} /> : null}
        />
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  rail: { width: 20, alignItems: "center" },
  dot: { width: 13, height: 13, borderRadius: 7, marginTop: 6, borderWidth: 3, zIndex: 2 },
  line: { width: 2, backgroundColor: A.border, flex: 1, marginTop: -2, marginBottom: -14 },
  card: { flex: 1, backgroundColor: A.surface, borderRadius: 14, borderWidth: 1, borderColor: A.borderSoft, padding: 15, marginBottom: 14 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 6 },
  action: { fontSize: 14.5, fontWeight: "800", color: A.ink, flex: 1 },
  moduleBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  moduleTxt: { fontSize: 11, fontWeight: "800" },
  desc: { fontSize: 13.5, color: A.inkSoft, marginBottom: 10, lineHeight: 19 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  metaTxt: { fontSize: 12, color: A.inkFaint },
  metaDot: { fontSize: 12, color: A.inkFaint, marginHorizontal: 4 },
});
