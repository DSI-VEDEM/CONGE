export type SidebarIconKey =
  | "home"
  | "clipboard"
  | "clock"
  | "users"
  | "user"
  | "shield"
  | "file-text";

export type SidebarLink = {
  label: string;
  to: string;
  icon: SidebarIconKey;
};

export type SidebarSection = {
  title: string | null;
  links: SidebarLink[];
};
