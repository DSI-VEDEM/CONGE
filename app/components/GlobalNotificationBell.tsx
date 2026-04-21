"use client";

import { usePathname } from "next/navigation";
import NotificationBell from "./NotificationBell";
import { useNotificationBellContext } from "./notification-bell-context";

function shouldShowNotificationBell(pathname: string | null) {
  if (!pathname) return false;
  return pathname.startsWith("/dashboard");
}

export default function GlobalNotificationBell() {
  const pathname = usePathname();
  const { hasDedicatedBell } = useNotificationBellContext();
  if (!shouldShowNotificationBell(pathname)) return null;
  if (hasDedicatedBell) return null;
  return <NotificationBell />;
}
