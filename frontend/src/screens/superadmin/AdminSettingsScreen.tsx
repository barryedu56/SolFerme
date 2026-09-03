import React, { useState, useEffect } from "react";
import { adminApi } from "../../api/adminApi";
import { AdminPage, AdminCard, AdminInfoRow, AdminSectionTitle, A } from "./ui";

export function AdminSettingsScreen() {
  const [lastLogin, setLastLogin] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getProfile().then((data) => {
      if (data?.last_login) setLastLogin(data.last_login);
    }).catch(() => {});
  }, []);

  return (
    <AdminPage title="Paramètres système" subtitle="Informations sur la session et la plateforme">
      <AdminSectionTitle icon="security" title="Session & sécurité" />
      <AdminCard>
        <AdminInfoRow icon="login" label="Dernière connexion" value={lastLogin ? new Date(lastLogin).toLocaleString("fr-FR") : "Information non disponible"} />
        <AdminInfoRow icon="admin-panel-settings" label="Niveau d'accès" value="SuperAdmin — Accès total en lecture" />
        <AdminInfoRow icon="verified-user" label="Authentification" value="JWT — Session sécurisée active" valueColor={A.success} last />
      </AdminCard>

      <AdminSectionTitle icon="info" title="À propos de la plateforme" />
      <AdminCard>
        <AdminInfoRow icon="agriculture" label="Application" value="SolFerme — Gestion avicole" />
        <AdminInfoRow icon="api" label="Backend" value="Django REST Framework + MySQL" last />
      </AdminCard>
    </AdminPage>
  );
}
