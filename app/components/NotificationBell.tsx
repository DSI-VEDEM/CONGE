"use client";

import { Bell, Check, Circle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { getToken } from "@/lib/auth-client";
import type { NotificationCategory } from "@/generated/prisma/client";

type NotificationSummary = {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  createdAt: string;
  isRead: boolean;
};

const CATEGORY_LABELS: Record<NotificationCategory, { text: string; color: string }> = {
  INFO: { text: "Info", color: "bg-vdm-gold-100 text-vdm-gold-800" },
  ALERT: { text: "Alerte", color: "bg-red-100 text-red-800" },
  ACTION: { text: "Action", color: "bg-sky-100 text-sky-800" },
};

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export default function NotificationBell() {
  const token = getToken();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    setIsBusy(true);
    try {
      const response = await fetch("/api/notifications?take=6", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data?.error ?? "Impossible de charger les notifications.");
        return;
      }
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch {
      toast.error("Impossible de charger les notifications.");
    } finally {
      setIsBusy(false);
    }
  }, [token]);

  const markAllRead = async () => {
    if (!token || unreadCount === 0) return;
    setIsBusy(true);
    try {
      const response = await fetch("/api/notifications/mark-read", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ markAll: true }),
      });
      if (!response.ok) throw new Error("update failed");
      setNotifications((prev) => prev.map((notification) => ({ ...notification, isRead: true })));
      setUnreadCount(0);
      toast.success("Notifications marquées comme lues.");
    } catch {
      toast.error("Impossible de marquer les notifications comme lues.");
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchNotifications();
    const interval = window.setInterval(fetchNotifications, 30_000);
    return () => window.clearInterval(interval);
  }, [fetchNotifications, token]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: MouseEvent) => {
      if (!panelRef.current) return;
      if (event.target instanceof Node && !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const visibleNotifications = useMemo(() => notifications.slice(0, 6), [notifications]);

  if (!token) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
        }}
        className="relative inline-flex items-center justify-center rounded-full bg-gray-100 p-2 text-gray-700 hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vdm-gold-500"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-widest text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-3 w-80 rounded-2xl border border-gray-100 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 p-3">
            <div>
              <p className="text-sm font-semibold text-vdm-gold-800">Notifications</p>
              <p className="text-xs text-gray-500">{unreadCount} non lues</p>
            </div>
            <button
              type="button"
              disabled={isBusy || unreadCount === 0}
              onClick={markAllRead}
              className="text-xs font-semibold text-blue-600 enabled:hover:text-blue-800 disabled:text-gray-400"
            >
              Tout lire
            </button>
          </div>

          <div className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
            {visibleNotifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">Aucune notification pour le moment.</div>
            ) : (
              visibleNotifications.map((notification) => {
                const label = CATEGORY_LABELS[notification.category];
                return (
                  <div
                    key={notification.id}
                    className={`group flex items-start gap-3 px-4 py-3 transition-colors ${notification.isRead ? "bg-white" : "bg-gray-50"}`}
                  >
                    <span className="mt-1">
                      <Circle className={`h-3 w-3 ${notification.isRead ? "text-gray-300" : "text-vdm-gold-500"}`} />
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-800">{notification.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${label.color}`}>
                          {label.text}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">{notification.body}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-gray-400">
                        {formatDate(notification.createdAt)}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <Check className="h-4 w-4 text-vdm-gold-600" aria-hidden />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
