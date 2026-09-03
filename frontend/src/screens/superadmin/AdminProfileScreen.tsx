import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { adminApi } from "../../api/adminApi";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../utils/toast";
import {
  A, AdminPage, AdminCard, AdminBadge, AdminInfoRow, AdminSegmented,
  AdminInput, AdminButton, AdminBanner, AdminLoading,
} from "./ui";

type Tab = "info" | "edit" | "security";

export function AdminProfileScreen() {
  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { updateUser } = useAuth();

  const loadProfile = async () => {
    try {
      const data = await adminApi.getProfile();
      setProfile(data);
      setEditName(data.name || "");
      setEditPhone(data.phone || "");
      setEditAddress(data.address || "");
    } catch {
      toast.error("Impossible de charger le profil.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProfile(); }, []);

  const handleSaveProfile = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await adminApi.updateProfile({ name: editName, phone: editPhone || undefined, address: editAddress || undefined });
      await loadProfile();
      if (updateUser) await updateUser();
      toast.success("Profil mis à jour avec succès.");
      setActiveTab("info");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Impossible de sauvegarder.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (saving) return;
    if (!oldPassword || !newPassword || !confirmPassword) { toast.error("Tous les champs sont requis."); return; }
    if (newPassword !== confirmPassword) { toast.error("La confirmation du mot de passe ne correspond pas."); return; }
    if (newPassword.length < 8) { toast.error("Le nouveau mot de passe doit contenir au moins 8 caractères."); return; }
    setSaving(true);
    try {
      await adminApi.changePassword({ old_password: oldPassword, new_password: newPassword, confirm_password: confirmPassword });
      toast.success("Mot de passe modifié avec succès.");
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
      setActiveTab("info");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Échec du changement de mot de passe.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AdminPage title="Mon profil"><AdminLoading /></AdminPage>;

  return (
    <AdminPage title="Mon profil" subtitle="Compte SuperAdmin de la console">
      <AdminCard style={{ marginBottom: 18 }}>
        <View style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{profile?.name?.[0]?.toUpperCase() ?? "A"}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name}>{profile?.name}</Text>
            <Text style={styles.email}>{profile?.email}</Text>
            <View style={styles.badges}>
              <AdminBadge label="SuperAdmin" tone="danger" solid />
              <AdminBadge label={profile?.is_active ? "Actif" : "Inactif"} tone={profile?.is_active ? "success" : "danger"} />
            </View>
          </View>
        </View>
      </AdminCard>

      <View style={{ marginBottom: 16 }}>
        <AdminSegmented
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { key: "info" as Tab, label: "Vue d'ensemble" },
            { key: "edit" as Tab, label: "Modifier" },
            { key: "security" as Tab, label: "Sécurité" },
          ]}
        />
      </View>

      {activeTab === "info" && (
        <AdminCard>
          <AdminInfoRow icon="person" label="Nom complet" value={profile?.name} />
          <AdminInfoRow icon="mail-outline" label="Adresse e-mail" value={profile?.email} />
          <AdminInfoRow icon="phone" label="Téléphone" value={profile?.phone || "Non renseigné"} />
          <AdminInfoRow icon="place" label="Adresse" value={profile?.address || "Non renseignée"} />
          <AdminInfoRow icon="event" label="Compte créé le" value={
            profile?.created_at
              ? new Date(profile.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
              : "—"
          } />
          <AdminInfoRow icon="login" label="Dernière connexion" value={profile?.last_login ? new Date(profile.last_login).toLocaleString("fr-FR") : "—"} last />
        </AdminCard>
      )}

      {activeTab === "edit" && (
        <AdminCard pad={22}>
          <Text style={styles.cardTitle}>Informations personnelles</Text>
          <AdminInput label="Nom complet" icon="person" value={editName} onChangeText={setEditName} placeholder="Votre nom complet" />
          <AdminInput label="Téléphone" icon="phone" value={editPhone} onChangeText={setEditPhone} placeholder="Numéro de téléphone" keyboardType="phone-pad" />
          <AdminInput label="Adresse postale" icon="place" value={editAddress} onChangeText={setEditAddress} placeholder="Adresse complète" multiline />
          <AdminButton label="Enregistrer les modifications" icon="check" onPress={handleSaveProfile} loading={saving} style={{ marginTop: 6 }} />
        </AdminCard>
      )}

      {activeTab === "security" && (
        <AdminCard pad={22}>
          <Text style={styles.cardTitle}>Sécuriser votre compte</Text>
          <AdminBanner icon="shield" tone="success" text="Pour votre sécurité, utilisez un mot de passe d'au moins 8 caractères, unique à cette console." />
          <AdminInput label="Mot de passe actuel" icon="lock-outline" value={oldPassword} onChangeText={setOldPassword} secureTextEntry placeholder="••••••••" />
          <AdminInput label="Nouveau mot de passe" icon="lock" value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="••••••••" />
          <AdminInput label="Confirmer le mot de passe" icon="check-circle" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="••••••••" />
          <AdminButton label="Mettre à jour le mot de passe" icon="lock-reset" variant="dark" onPress={handleChangePassword} loading={saving} style={{ marginTop: 6 }} />
        </AdminCard>
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 18 },
  avatar: { width: 68, height: 68, borderRadius: 20, backgroundColor: A.ink, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#fff", fontSize: 26, fontWeight: "800" },
  name: { fontSize: 21, fontWeight: "800", color: A.ink },
  email: { fontSize: 13, color: A.inkSoft, marginTop: 2 },
  badges: { flexDirection: "row", gap: 7, marginTop: 10, flexWrap: "wrap" },
  cardTitle: { fontSize: 16, fontWeight: "800", color: A.ink, marginBottom: 16 },
});
