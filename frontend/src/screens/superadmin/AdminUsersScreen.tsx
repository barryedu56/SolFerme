import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, RefreshControl } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { adminApi } from "../../api/adminApi";
import { confirmAsync } from "../../utils/confirm";
import { toast } from "../../utils/toast";
import { A, AdminPage, AdminSearch, AdminBadge, AdminEmpty, AdminLoading, AdminError } from "./ui";

export function AdminUsersScreen() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigation = useNavigation<any>();

  const load = useCallback(async (q: string, pageArg: number) => {
    try {
      setError(null);
      const data = await adminApi.getUsers({ search: q || undefined, page: pageArg });
      const rows = Array.isArray(data) ? data : data.results ?? [];
      setUsers((prev) => (pageArg === 1 ? rows : [...prev, ...rows]));
      setHasMore(!Array.isArray(data) && Boolean(data.next));
      setPage(pageArg);
    } catch {
      setError("Impossible de charger les utilisateurs.");
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

  const handleToggleActive = async (user: any) => {
    if (busyId !== null) return;
    const actionStr = user.is_active ? "désactiver" : "activer";
    const ok = await confirmAsync(`Confirmer l'action`, `Voulez-vous ${actionStr} le compte de ${user.name} ?`);
    if (!ok) return;
    setBusyId(user.id);
    try {
      if (user.is_active) await adminApi.deactivateUser(user.id);
      else await adminApi.activateUser(user.id);
      toast.success(`Compte ${user.is_active ? "désactivé" : "activé"}.`);
      load(search, 1);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Action impossible.");
    } finally {
      setBusyId(null);
    }
  };

  const renderUser = ({ item }: { item: any }) => {
    const isOwner = item.role === "PROPRIETAIRE";
    return (
      <Pressable
        onPress={() => navigation.navigate("AdminUserDetails", { id: item.id })}
        style={({ hovered }: any) => [styles.card, hovered && styles.cardHover]}
      >
        <View style={[styles.avatar, { backgroundColor: isOwner ? A.info : A.purple }]}>
          <Text style={styles.avatarTxt}>{item.name?.[0]?.toUpperCase() ?? "?"}</Text>
        </View>

        <View style={styles.infoCol}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
          <View style={styles.badgeRow}>
            <AdminBadge label={isOwner ? "Propriétaire" : "Employé"} tone={isOwner ? "info" : "purple"} />
            {item.is_superuser && <AdminBadge label="SuperAdmin" tone="danger" />}
            <AdminBadge label={item.is_active ? "Actif" : "Désactivé"} tone={item.is_active ? "success" : "danger"} />
          </View>
        </View>

        {!item.is_superuser && (
          <Pressable
            style={[styles.actionBtn, { backgroundColor: item.is_active ? A.dangerSoft : A.successSoft }, busyId === item.id && { opacity: 0.5 }]}
            disabled={busyId !== null}
            onPress={(e) => { e.stopPropagation(); handleToggleActive(item); }}
          >
            {busyId === item.id
              ? <ActivityIndicator size="small" color={item.is_active ? A.danger : A.success} />
              : <MaterialIcons name={item.is_active ? "block" : "check-circle"} size={20} color={item.is_active ? A.danger : A.success} />}
          </Pressable>
        )}
        <MaterialIcons name="chevron-right" size={20} color={A.inkFaint} />
      </Pressable>
    );
  };

  return (
    <AdminPage title="Utilisateurs" subtitle="Comptes propriétaires et employés de la plateforme" scroll={false}>
      {loading && <AdminLoading />}
      {error && <AdminError message={error} onRetry={() => { setLoading(true); load(search, 1); }} />}
      {!loading && !error && (
        <FlatList
          data={users}
          keyExtractor={(u) => String(u.id)}
          renderItem={renderUser}
          style={{ marginHorizontal: -2 }}
          contentContainerStyle={{ paddingBottom: 80, paddingHorizontal: 2 }}
          ListHeaderComponent={<View style={{ marginBottom: 16 }}><AdminSearch value={search} onChangeText={handleSearch} placeholder="Rechercher un utilisateur (nom, email)…" /></View>}
          ListEmptyComponent={<AdminEmpty icon="group" title="Aucun utilisateur trouvé" />}
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
  card: {
    flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: A.surface,
    borderRadius: 14, borderWidth: 1, borderColor: A.borderSoft, padding: 14, marginBottom: 10,
  },
  cardHover: { borderColor: A.primary, backgroundColor: "#FAFBFF" },
  avatar: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#fff", fontWeight: "800", fontSize: 19 },
  infoCol: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontWeight: "800", fontSize: 15, color: A.ink },
  email: { fontSize: 12.5, color: A.inkSoft },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 5, flexWrap: "wrap" },
  actionBtn: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
