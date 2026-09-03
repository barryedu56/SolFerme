import React from "react";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { View, Text, Pressable, StyleSheet, ScrollView, Platform } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../context/AuthContext";
import { navigationRef } from "./AppNavigator";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { A } from "../screens/superadmin/ui";

import { AdminDashboardScreen } from "../screens/superadmin/AdminDashboardScreen";
import { AdminUsersScreen } from "../screens/superadmin/AdminUsersScreen";
import { AdminUserDetailsScreen } from "../screens/superadmin/AdminUserDetailsScreen";
import { AdminFarmsScreen } from "../screens/superadmin/AdminFarmsScreen";
import { AdminFarmDetailsScreen } from "../screens/superadmin/AdminFarmDetailsScreen";
import { AdminAuditLogScreen } from "../screens/superadmin/AdminAuditLogScreen";
import { AdminActivityScreen } from "../screens/superadmin/AdminActivityScreen";
import { AdminReportsScreen } from "../screens/superadmin/AdminReportsScreen";
import { AdminProfileScreen } from "../screens/superadmin/AdminProfileScreen";
import { AdminSettingsScreen } from "../screens/superadmin/AdminSettingsScreen";

const Drawer = createDrawerNavigator();

const GROUPS: { title: string; items: { name: string; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] }[] = [
  {
    title: "Pilotage",
    items: [
      { name: "AdminDashboard", label: "Tableau de bord", icon: "dashboard" },
      { name: "AdminReports", label: "Rapports & Stats", icon: "insights" },
    ],
  },
  {
    title: "Gestion",
    items: [
      { name: "AdminUsers", label: "Utilisateurs", icon: "group" },
      { name: "AdminFarms", label: "Fermes", icon: "storefront" },
    ],
  },
  {
    title: "Supervision",
    items: [
      { name: "AdminActivity", label: "Activité globale", icon: "bolt" },
      { name: "AdminAuditLog", label: "Journal d'audit", icon: "verified-user" },
    ],
  },
  {
    title: "Compte",
    items: [
      { name: "AdminProfile", label: "Mon profil", icon: "person" },
      { name: "AdminSettings", label: "Paramètres", icon: "tune" },
    ],
  },
];

function AdminSidebar({ navigation, state }: any) {
  const { logout, userName } = useAuth();
  const activeRoute = state?.routeNames?.[state.index];

  const handleLogout = async () => {
    await logout();
    setTimeout(() => {
      if (navigationRef.isReady()) navigationRef.navigate("AdminLogin");
    }, 100);
  };

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <BrandLogo size={44} shape="squircle" background="#FFFFFF" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.brandName}>SolFerme</Text>
          <View style={styles.consolePill}>
            <MaterialIcons name="shield" size={10} color={A.primarySoft} />
            <Text style={styles.consoleTxt}>CONSOLE ADMIN</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 12 }} showsVerticalScrollIndicator={false}>
        {GROUPS.map((g) => (
          <View key={g.title} style={{ marginBottom: 6 }}>
            <Text style={styles.groupTitle}>{g.title}</Text>
            {g.items.map((item) => {
              const active = activeRoute === item.name
                || (item.name === "AdminUsers" && activeRoute === "AdminUserDetails")
                || (item.name === "AdminFarms" && activeRoute === "AdminFarmDetails");
              return (
                <Pressable
                  key={item.name}
                  onPress={() => navigation.navigate(item.name)}
                  style={({ hovered }: any) => [
                    styles.item,
                    hovered && !active && styles.itemHover,
                    active && styles.itemActive,
                  ]}
                >
                  {active && <View style={styles.activeBar} />}
                  <MaterialIcons name={item.icon} size={20} color={active ? "#FFFFFF" : A.sidebarInk} />
                  <Text style={[styles.itemLabel, active && { color: "#FFFFFF", fontWeight: "700" }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.userRow}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarTxt}>{userName?.[0]?.toUpperCase() ?? "A"}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
            <Text style={styles.userRole}>SuperAdmin</Text>
          </View>
        </View>
        <Pressable onPress={handleLogout} style={({ hovered }: any) => [styles.logoutBtn, hovered && { backgroundColor: "rgba(220,38,38,0.16)" }]}>
          <MaterialIcons name="logout" size={18} color="#F87171" />
          <Text style={styles.logoutTxt}>Déconnexion</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SuperAdminNavigator() {
  const { isDesktopOrTablet } = useBreakpoint();
  return (
    <Drawer.Navigator
      drawerContent={(props) => <AdminSidebar {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: isDesktopOrTablet ? "permanent" : "front",
        drawerStyle: { width: 264, borderRightWidth: 0, backgroundColor: A.sidebar },
        sceneStyle: { backgroundColor: A.bg },
      }}
    >
      <Drawer.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Drawer.Screen name="AdminUsers" component={AdminUsersScreen} />
      <Drawer.Screen name="AdminUserDetails" component={AdminUserDetailsScreen} />
      <Drawer.Screen name="AdminFarms" component={AdminFarmsScreen} />
      <Drawer.Screen name="AdminFarmDetails" component={AdminFarmDetailsScreen} />
      <Drawer.Screen name="AdminReports" component={AdminReportsScreen} />
      <Drawer.Screen name="AdminActivity" component={AdminActivityScreen} />
      <Drawer.Screen name="AdminAuditLog" component={AdminAuditLogScreen} />
      <Drawer.Screen name="AdminProfile" component={AdminProfileScreen} />
      <Drawer.Screen name="AdminSettings" component={AdminSettingsScreen} />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  sidebar: { flex: 1, backgroundColor: A.sidebar },
  brand: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: Platform.OS === "web" ? 24 : 52, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  brandName: { color: "#FFFFFF", fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  consolePill: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  consoleTxt: { color: A.sidebarInk, fontSize: 9, fontWeight: "800", letterSpacing: 1 },

  groupTitle: { color: "#475569", fontSize: 10, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", paddingHorizontal: 22, paddingTop: 14, paddingBottom: 6 },
  item: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 11, paddingHorizontal: 22, marginHorizontal: 10, borderRadius: 10 },
  itemHover: { backgroundColor: "rgba(255,255,255,0.05)" },
  itemActive: { backgroundColor: A.primary },
  activeBar: { position: "absolute", left: -10, top: 8, bottom: 8, width: 3, borderRadius: 3, backgroundColor: "#FFFFFF" },
  itemLabel: { color: A.sidebarInk, fontSize: 14, fontWeight: "600" },

  footer: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", padding: 14, gap: 10 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 6 },
  userAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: A.primary, alignItems: "center", justifyContent: "center" },
  userAvatarTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
  userName: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "700" },
  userRole: { color: A.sidebarInk, fontSize: 11, marginTop: 1 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(220,38,38,0.10)" },
  logoutTxt: { color: "#F87171", fontSize: 13, fontWeight: "700" },
});
