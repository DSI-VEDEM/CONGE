import type { SidebarSection } from "./sidebar-types";

export const dsiMenu: SidebarSection[] = [
  {
    title: null,
    links: [{ label: "Tableau de bord", icon: "home", to: "/dashboard/dsi" }],
  },
  {
    title: "Mes congés",
    links: [
      { label: "Demander un congé", icon: "clipboard", to: "/dashboard/dsi/leave/new" },
      { label: "Historique", icon: "clock", to: "/dashboard/dsi/leave/history" },
    ],
  },
  {
    title: "Département Informatique",
    links: [
      { label: "Employés DSI", icon: "users", to: "/dashboard/dsi/department/employees" },
      { label: "Historique congés DSI", icon: "clock", to: "/dashboard/dsi/department/employees-history" },
      { label: "Demandes DSI", icon: "clipboard", to: "/dashboard/dsi/inbox" },
    ],
  },
  {
    title: "Direction des opérations",
    links: [
      { label: "Employés DO", icon: "users", to: "/dashboard/dsi/operations/employees" },
      { label: "Historique congés DO", icon: "clock", to: "/dashboard/dsi/operations/employees-history" },
      { label: "Demandes opérations", icon: "clipboard", to: "/dashboard/dsi/operations/inbox" },
    ],
  },
  {
    title: "Administration",
    links: [
      { label: "Validation des comptes", icon: "shield", to: "/dashboard/dsi/accounts/pending" },
      { label: "Emails et matricules", icon: "users", to: "/dashboard/dsi/accounts/identity" },
      { label: "Réinitialisation des mots de passe", icon: "shield", to: "/dashboard/dsi/password-reset" },
      { label: "Jours fériés", icon: "calendar", to: "/dashboard/dsi/holidays" },
    ],
  },
  {
    title: "Documents",
    links: [
      { label: "Mes bulletins", icon: "clipboard", to: "/dashboard/dsi/payslips" },
      { label: "Mes contrats", icon: "shield", to: "/dashboard/dsi/administration/contracts" },
    ],
  },
  {
    title: "Compte",
    links: [{ label: "Profil", icon: "user", to: "/dashboard/dsi/profile" }],
  },
];
