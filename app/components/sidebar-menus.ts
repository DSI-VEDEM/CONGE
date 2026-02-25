import type { SidebarSection } from "./sidebar-types";

export const employeeMenu: SidebarSection[] = [
  { title: null, links: [{ label: "Tableau de bord", icon: "home", to: "/dashboard/employee" }] },
  {
    title: "Congés",
    links: [
      { label: "Nouvelle demande", icon: "clipboard", to: "/dashboard/employee/new" },
      { label: "Mes demandes", icon: "clock", to: "/dashboard/employee/requests" },
    ],
  },
  {
    title: "Documents",
    links: [
      { label: "Mes bulletins", icon: "clipboard", to: "/dashboard/employee/payslips" },
      { label: "Mes contrats", icon: "shield", to: "/dashboard/employee/administration/contracts" },
    ],
    
  },
  { title: "Compte", links: [{ label: "Profil", icon: "user", to: "/dashboard/employee/profile" }] },
];

export const accountantMenu: SidebarSection[] = [
  { title: null, links: [{ label: "Tableau de bord", icon: "home", to: "/dashboard/accountant" }] },
  {
    title: "Congés",
    links: [
      { label: "Nouvelle demande", icon: "clipboard", to: "/dashboard/accountant/leave/new" },
      { label: "Mes demandes", icon: "clock", to: "/dashboard/accountant/requests" },
    ],
  },
  {
    title: "Demandes",
    links: [
      { label: "Demandes reçues", icon: "clipboard", to: "/dashboard/accountant/inbox" },
    ],
  },
  {
    title: "Département DAF",
    links: [
      { label: "Employés DAF", icon: "users", to: "/dashboard/accountant/department/employees" },
      {
        label: "Historique des employés",
        icon: "clock",
        to: "/dashboard/accountant/department/employees-history",
      },
    ],
  },
  {
    title: "Documents",
    links: [
      { label: "Mes contrats", icon: "shield", to: "/dashboard/accountant/administration/contracts" },
      { label: "Mes bulletins", icon: "clipboard", to: "/dashboard/accountant/payslips" },
    ],
  },
  {
    title: "Administration",
    links: [
      { label: "Contrats à ajouter", icon: "shield", to: "/dashboard/accountant/administration/contracts/types", },
      { label: "Documents contractuels", icon: "file-text", to: "/dashboard/accountant/administration/contracts/documents", },
      { label: "Bulletins à ajouter", icon: "shield", to: "/dashboard/accountant/payslips/imported" },
      { label: "Bulletins employés", icon: "file-text", to: "/dashboard/accountant/payslips/imported/by-year" },
      { label: "Documents RH employés", icon: "file-text", to: "/dashboard/accountant/documents/employees", },
    ],
  },
  {
    title: "Compte",
    links: [{ label: "Profil", icon: "user", to: "/dashboard/accountant/profile" }],
  },
];

export const managerMenu: SidebarSection[] = [
  { title: null, links: [{ label: "Tableau de bord", icon: "home", to: "/dashboard/manager" }] },
  {
    title: "Sous-direction",
    links: [
      { label: "Demandes transmises", icon: "clipboard", to: "/dashboard/manager/inbox" },
      { label: "Historique des employés", icon: "clock", to: "/dashboard/manager/department/employees-history" },
      { label: "Équipe", icon: "users", to: "/dashboard/manager/team" },
    ],
  },
  {
    title: "Documents",
    links: [
      { label: "Mes bulletins", icon: "clipboard", to: "/dashboard/manager/payslips" },
      { label: "Mes contrats", icon: "shield", to: "/dashboard/manager/administration/contracts" },
    ],
  },
  {
    title: "Compte",
    links: [{ label: "Profil", icon: "user", to: "/dashboard/manager/profile" }],
  },
];

export const ceoMenu: SidebarSection[] = [
  { title: null, links: [{ label: "Tableau de bord", icon: "home", to: "/dashboard/ceo" }] },
  {
    title: "CONGÉS",
    links: [
      { label: "Demandes Reçues", icon: "clipboard", to: "/dashboard/ceo/inbox" },
      { label: "Historique congés", icon: "clock", to: "/dashboard/ceo/leaves/history" },
      { label: "Périodes bloquées", icon: "shield", to: "/dashboard/ceo/blackouts" },
    ],
  },
  {
    title: "Employés",
    links: [
      { label: "Tous les employés", icon: "users", to: "/dashboard/ceo/employees" },
    ],
  },
  {
    title: "Département Autres",
    links: [
      { label: "Employés", icon: "users", to: "/dashboard/ceo/department/others/employees" },
      { label: "Historique des employés", icon: "clock", to: "/dashboard/ceo/department/others/employees-history", },
    ],
  },
  { title: "ADMINISTRATION", 
    links: [
      { label: "Bulletins à signer", icon: "shield", to: "/dashboard/ceo/payslips/sign" },
      { label: "Bulletins employés", icon: "file-text", to: "/dashboard/ceo/payslips/imported/by-year" },
      { label: "Documents contractuels", icon: "file-text", to: "/dashboard/ceo/administration/contracts/documents", },
      { label: "Documents RH", icon: "file-text", to: "/dashboard/ceo/documents" },
    ], 
  },
  { title: "Compte", links: [{ label: "Profil", icon: "user", to: "/dashboard/ceo/profile" }], },
];
