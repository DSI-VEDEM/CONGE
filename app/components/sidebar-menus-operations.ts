import type { SidebarSection } from "./sidebar-types";

export const operationsMenu: SidebarSection[] = [
  {
    title: null,
    links: [{ label: "Tableau de bord", icon: "home", to: "/dashboard/operations" }],
  },
  {
    title: "Mes congés",
    links: [
      { label: "Demander un congé", icon: "clipboard", to: "/dashboard/operations/leave/new" },
      { label: "Historique", icon: "clock", to: "/dashboard/operations/leave/history" },
    ],
  },
  {
    title: "Direction des opérations",
    links: [
      { label: "Employés (actuels)", icon: "users", to: "/dashboard/operations/department/employees" },
      {
        label: "Historique des employés",
        icon: "users",
        to: "/dashboard/operations/department/employees-history",
      },
      { label: "Demandes transmises", icon: "clipboard", to: "/dashboard/operations/inbox" },
    ],
  },
  {
    title: "Documents",
    links: [
      { label: "Mes bulletins", icon: "clipboard", to: "/dashboard/operations/payslips" },
      { label: "Mes contrats", icon: "shield", to: "/dashboard/operations/documents/contracts" },
    ],
  },
  {
    title: "Compte",
    links: [{ label: "Profil", icon: "user", to: "/dashboard/operations/profile" }],
  },
];
