"use client";

import { usePathname } from "next/navigation";
import NotificationBell from "./NotificationBell";
import { useNotificationBellContext } from "./notification-bell-context";

const HIDDEN_PATHS = ["/login"] as const;

function shouldShowNotificationBell(pathname: string | null) {
  if (!pathname) return false;
  return !HIDDEN_PATHS.some((hidden) => pathname.startsWith(hidden));
}

export default function GlobalNotificationBell() {
  const pathname = usePathname();
  const { hasDedicatedBell } = useNotificationBellContext();
  if (!shouldShowNotificationBell(pathname)) return null;
  if (hasDedicatedBell) return null;
  return <NotificationBell />;
}
