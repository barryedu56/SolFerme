import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { adminApi } from "../../api/adminApi";
import { useRoute, useNavigation } from "@react-navigation/native";
import { confirmAsync } from "../../utils/confirm";
import { toast } from "../../utils/toast";
import {
  A, AdminPage, AdminCard, AdminBadge, AdminInfoRow, AdminSectionTitle,
  AdminBanner, AdminLoading,
} from "./ui";

export function AdminUserDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { id } = route.params;

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadUser = async () => {
    try {
      const data = await adminApi.getUserById(id);
      setUser(data);
    } catch {
      toast.error("Impossible de charger l'utilisateur.");
      navigation.navigate("AdminUsers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUser(); }, [id]);

  const handleToggleActive = async () => {
    if (!user || actionLoading) return;
    const willDeactivate = user.is_active;
    const actionStr = willDeactivate ? "désactiver" : "activer";
    const confirmed = await confirmAsync("Confirmer l'action", `Voulez-vous ${actionStr} le compte de ${user.name} ?`);
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = willDeactivate ? await adminApi.deactivateUser(user.id) : await adminApi.activateUser(user.id);
      if (res?.user) setUser(res.user);
      else await loadUser();
      toast.success(willDeactivate ? "Le compte a été désactivé." : "Le compte a été activé.");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Action impossible.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <AdminPage title="Utilisateur" back={{ label: "Retour aux utilisateurs", onPress: () => navigation.navigate("AdminUsers") }}><AdminLoading /></AdminPage>;
  if (!user) return null;

  const isOwner = user.role === "PROPRIETAIRE";
  const initials = user.name
    ? user.name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase()
    : "?";

  return (
    <AdminPage back={{ label: "Retour aux utilisateurs", onPress: () => navigation.navigate("AdminUsers") }}>
      <AdminCard style={{ marginBottom: 18 }}>
        <View style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: isOwner ? A.info : A.purple }]}>
            <Text style={styles.avatarTxt}>{initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>
            <View style={styles.badges}>
              <AdminBadge label={isOwner ? "Propriétaire" : "Employé"} tone={isOwner ? "info" : "purple"} solid />
              {user.is_superuser && <AdminBadge label="SuperAdmin" tone="danger" solid />}
              <AdminBadge label={user.is_active ? "Actif" : "Désactivé"} tone={user.is_active ? "success" : "danger"} />
            </View>
          </View>
        </View>
      </AdminCard>

      <AdminSectionTitle icon="badge" title="Informations du compte" />
      <AdminCard>
        <AdminInfoRow icon="mail-outline" label="Email" value={user.email} />
        <AdminInfoRow icon="phone" label="Téléphone" value={user.phone || "Non renseigné"} />
        <AdminInfoRow icon="place" label="Adresse" value={user.address || "Non renseignée"} />
        <AdminInfoRow icon="event" label="Inscrit le" value={
          user.created_at
            ? new Date(user.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
            : "—"
        } />
        <AdminInfoRow
          icon={user.is_active ? "check-circle" : "block"}
          label="Statut"
          value={user.is_active ? "Compte actif" : "Compte désactivé"}
          valueColor={user.is_active ? A.success : A.danger}
          last
        />
      </AdminCard>

      {!user.is_superuser && (
        <>
          <AdminSectionTitle icon="admin-panel-settings" title="Actions administratives" />
          <Pressable
            onPress={handleToggleActive}
            disabled={actionLoading}
            style={({ hovered }: any) => [
              styles.actionCard,
              { backgroundColor: user.is_active ? A.dangerSoft : A.successSoft, borderColor: (user.is_active ? A.danger : A.success) + "33" },
              actionLoading && { opacity: 0.6 },
              hovered && { opacity: 0.9 },
            ]}
          >
            {actionLoading ? (
              <ActivityIndicator color={user.is_active ? A.danger : A.success} />
            ) : (
              <>
                <MaterialIcons name={user.is_active ? "block" : "check-circle"} size={24} color={user.is_active ? A.danger : A.success} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.actionTitle, { color: user.is_active ? A.danger : A.success }]}>
                    {user.is_active ? "Désactiver ce compte" : "Activer ce compte"}
                  </Text>
                  <Text style={styles.actionDesc}>
                    {user.is_active
                      ? "L'utilisateur ne pourra plus se connecter à SolFerme."
                      : "Restaurer l'accès de cet utilisateur à SolFerme."}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={A.inkFaint} />
              </>
            )}
          </Pressable>
        </>
      )}

      {user.is_superuser && (
        <AdminBanner icon="shield" tone="info" text="Ce compte SuperAdmin ne peut pas être désactivé depuis cette interface." />
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 18 },
  avatar: { width: 68, height: 68, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#fff", fontSize: 24, fontWeight: "800" },
  name: { fontSize: 20, fontWeight: "800", color: A.ink },
  email: { fontSize: 13, color: A.inkSoft, marginTop: 2 },
  badges: { flexDirection: "row", gap: 7, marginTop: 10, flexWrap: "wrap" },
  actionCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: 14, borderWidth: 1 },
  actionTitle: { fontSize: 15, fontWeight: "800" },
  actionDesc: { fontSize: 12.5, color: A.inkSoft, marginTop: 3 },
});
