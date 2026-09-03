import { apiClient } from "./client";

/**
 * adminApi — Appels API Online-only pour le SuperAdmin.
 * N'utilise PAS la couche SQLite / syncManager.
 * Toutes les requêtes passent directement par le backend Django REST API.
 */

export const adminApi = {
  // ── Statistiques Dashboard ─────────────────────────────────────────────────
  getOverview: async () => {
    const res = await apiClient.get("/admin/overview/");
    return res.data;
  },

  getCharts: async () => {
    const res = await apiClient.get("/admin/charts/");
    return res.data;
  },

  // ── Profil SuperAdmin ──────────────────────────────────────────────────────
  getProfile: async () => {
    const res = await apiClient.get("/admin/profile/");
    return res.data;
  },

  updateProfile: async (data: { name?: string; phone?: string; address?: string }) => {
    const res = await apiClient.patch("/admin/profile/", data);
    return res.data;
  },

  changePassword: async (data: {
    old_password: string;
    new_password: string;
    confirm_password: string;
  }) => {
    const res = await apiClient.post("/admin/profile/change-password/", data);
    return res.data;
  },

  // ── Utilisateurs ──────────────────────────────────────────────────────────
  getUsers: async (params?: { search?: string; page?: number }) => {
    const res = await apiClient.get("/admin/users/", { params });
    return res.data;
  },

  getUserById: async (id: number) => {
    const res = await apiClient.get(`/admin/users/${id}/`);
    return res.data;
  },

  activateUser: async (id: number) => {
    const res = await apiClient.post(`/admin/users/${id}/activate/`);
    return res.data;
  },

  deactivateUser: async (id: number) => {
    const res = await apiClient.post(`/admin/users/${id}/deactivate/`);
    return res.data;
  },

  exportUsers: async () => {
    const res = await apiClient.get("/admin/users/export/", { responseType: "blob" });
    return res.data;
  },

  // ── Fermes ────────────────────────────────────────────────────────────────
  getFarms: async (params?: { search?: string; page?: number }) => {
    const res = await apiClient.get("/admin/farms/", { params });
    return res.data;
  },

  getFarmById: async (id: number) => {
    const res = await apiClient.get(`/admin/farms/${id}/`);
    return res.data;
  },

  getFarmStats: async (id: number) => {
    const res = await apiClient.get(`/admin/farms/${id}/stats/`);
    return res.data;
  },

  // ── Rapports & Analytics ──────────────────────────────────────────────────
  getReports: async (period: string = "30d") => {
    const res = await apiClient.get("/admin/reports/", { params: { period } });
    return res.data;
  },

  getModuleUsage: async (period: string = "30d") => {
    const res = await apiClient.get("/admin/reports/module_usage/", { params: { period } });
    return res.data;
  },

  getUserDistribution: async () => {
    const res = await apiClient.get("/admin/reports/user_distribution/");
    return res.data;
  },

  getFarmDistribution: async () => {
    const res = await apiClient.get("/admin/reports/farm_distribution/");
    return res.data;
  },

  // ── Activité globale ──────────────────────────────────────────────────────
  getActivity: async (params?: { page?: number; search?: string }) => {
    const res = await apiClient.get("/admin/activity/", { params });
    return res.data;
  },

  // ── Journal d'audit ───────────────────────────────────────────────────────
  getAuditLogs: async (params?: { page?: number }) => {
    const res = await apiClient.get("/admin/audit-logs/", { params });
    return res.data;
  },
};
