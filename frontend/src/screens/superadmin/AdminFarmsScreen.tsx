import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, RefreshControl } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { adminApi } from "../../api/adminApi";
import { A, AdminPage, AdminSearch, AdminBadge, AdminEmpty, AdminLoading, AdminError } from "./ui";

export function AdminFarmsScreen() {
  const [farms, setFarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigation = useNavigation<any>();

  const load = useCallback(async (q: string, pageArg: number) => {
    try {
      setError(null);
      const data = await adminApi.getFarms({ search: q || undefined, page: pageArg });
      const rows = Array.isArray(data) ? data : data.results ?? [];
      setFarms((prev) => (pageArg === 1 ? rows : [...prev, ...rows]));
      setHasMore(!Array.isArray(data) && Boolean(data.next));
      setPage(pageArg);
    } catch {
      setError("Impossible de charger les fermes.");
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

  const renderFarm = ({ item }: { item: any }) => {
    const active = item.status === "ACTIF";
    return (
      <Pressable
        onPress={() => navigation.navigate("AdminFarmDetails", { id: item.id })}
        style={({ hovered }: any) => [styles.card, hovered && styles.cardHover]}
      >
        <View style={styles.cardHead}>
          <View style={styles.titleRow}>
            <View style={[styles.iconBox, { backgroundColor: active ? A.successSoft : A.dangerSoft }]}>
              <MaterialIcons name="storefront" size={22} color={active ? A.success : A.danger} />
            </View>
            <Text style={styles.farmName} numberOfLines={1}>{item.name}</Text>
          </View>
          <AdminBadge label={item.status} tone={active ? "success" : "neutral"} solid />
        </View>

        <View style={styles.cardBody}>
          <Meta icon="person" text={item.owner_name || "Sans propriétaire"} />
          <Meta icon="place" text={item.location || "Localisation non renseignée"} />
          <Meta icon="grid-view" text={`Capacité : ${item.capacity || 0}`} />
        </View>

        <View style={styles.cardFoot}>
          <Text style={styles.footTxt}>Créée le {new Date(item.created_at).toLocaleDateString("fr-FR")}</Text>
          <MaterialIcons name="chevron-right" size={20} color={A.inkFaint} />
        </View>
      </Pressable>
    );
  };

  return (
    <AdminPage title="Fermes" subtitle="Exploitations enregistrées sur la plateforme" scroll={false}>
      {loading && <AdminLoading />}
      {error && <AdminError message={error} onRetry={() => { setLoading(true); load(search, 1); }} />}
      {!loading && !error && (
        <FlatList
          data={farms}
          keyExtractor={(f) => String(f.id)}
          renderItem={renderFarm}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListHeaderComponent={<View style={{ marginBottom: 16 }}><AdminSearch value={search} onChangeText={handleSearch} placeholder="Rechercher une ferme (nom, lieu)…" /></View>}
          ListEmptyComponent={<AdminEmpty icon="storefront" title="Aucune ferme trouvée" />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(search, 1); }} tintColor={A.primary} colors={[A.primary]} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={A.primary} style={{ marginVertical: 16 }} /> : null}
        />
      )}
    </AdminPage>
  );
}

function Meta({ icon, text }: any) {
  return (
    <View style={styles.metaRow}>
      <MaterialIcons name={icon} size={15} color={A.inkFaint} />
      <Text style={styles.metaTxt} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: A.surface, borderRadius: 16, borderWidth: 1, borderColor: A.borderSoft, marginBottom: 14, overflow: "hidden" },
  cardHover: { borderColor: A.primary },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  iconBox: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  farmName: { fontSize: 15.5, fontWeight: "800", color: A.ink, flex: 1 },
  cardBody: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaTxt: { fontSize: 13.5, color: A.inkSoft, flex: 1 },
  cardFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: A.surfaceAlt, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: A.borderSoft },
  footTxt: { fontSize: 12, color: A.inkFaint },
});
