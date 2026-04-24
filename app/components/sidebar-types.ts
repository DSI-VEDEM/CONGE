export type SidebarIconKey =
  | "home"
  | "clipboard"
  | "clock"
  | "calendar"
  | "users"
  | "user"
  | "shield"
  | "lock"
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
