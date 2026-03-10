"use client";

import { Bell, Check, Circle, Trash, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { getToken } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import type { NotificationCategory } from "@/generated/prisma/client";

type NotificationSummary = {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  createdAt: string;
  isRead: boolean;
  metadata?: Record<string, unknown> | null;
};

function extractRequesterName(metadata?: Record<string, unknown> | null) {
  const candidate = metadata?.["requesterName"];
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

function extractActionPath(metadata?: Record<string, unknown> | null) {
  const candidate = metadata?.["actionPath"];
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

function extractActionLabel(metadata?: Record<string, unknown> | null) {
  const candidate = metadata?.["actionLabel"];
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

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
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotificationSummary | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [isClearingRead, setIsClearingRead] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
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

  const markNotificationRead = useCallback(
    async (notification: NotificationSummary) => {
      if (!token || notification.isRead) return;
      try {
        const response = await fetch("/api/notifications/mark-read", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notificationIds: [notification.id] }),
        });
        if (!response.ok) throw new Error("update failed");
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        setSelectedNotification((prev) =>
          prev?.id === notification.id ? { ...prev, isRead: true } : prev
        );
      } catch {
        toast.error("Impossible de marquer la notification comme lue.");
      }
    },
    [token]
  );

  const deleteNotification = useCallback(
    async (id: string) => {
      if (!token || deletingIds.includes(id)) return;
      setDeletingIds((prev) => [...prev, id]);
      try {
        const response = await fetch(`/api/notifications/${id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) throw new Error("delete failed");
        setNotifications((prev) => prev.filter((notification) => notification.id !== id));
        setSelectedNotification((prev) => (prev?.id === id ? null : prev));
      } catch {
        toast.error("Impossible de supprimer la notification.");
      } finally {
        setDeletingIds((prev) => prev.filter((notificationId) => notificationId !== id));
      }
    },
    [token, deletingIds]
  );

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

  useEffect(() => {
    if (!selectedNotification) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedNotification(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedNotification]);

  const sortedNotifications = useMemo(() => {
    return [...notifications].sort((a, b) => {
      if (a.isRead === b.isRead) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return a.isRead ? 1 : -1;
    });
  }, [notifications]);
  const visibleNotifications = useMemo(() => sortedNotifications.slice(0, 6), [sortedNotifications]);
  const selectedRequesterName = selectedNotification ? extractRequesterName(selectedNotification.metadata) : undefined;
  const selectedActionPath = selectedNotification ? extractActionPath(selectedNotification.metadata) : undefined;
  const selectedActionLabel = selectedNotification ? extractActionLabel(selectedNotification.metadata) : undefined;
  const readNotificationsCount = useMemo(() => notifications.filter((notification) => notification.isRead).length, [notifications]);
  const hasNotifications = notifications.length > 0;
  const handleNotificationClick = useCallback(
    (notification: NotificationSummary) => {
      setSelectedNotification(notification);
      void markNotificationRead(notification);
    },
    [markNotificationRead]
  );
  const hasReadNotifications = readNotificationsCount > 0;
  const clearReadNotifications = useCallback(async () => {
    if (!token || isClearingRead || readNotificationsCount === 0) return;
    setIsClearingRead(true);
    try {
      const response = await fetch("/api/notifications/clear-read", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("clear failed");
      setNotifications((prev) => prev.filter((notification) => !notification.isRead));
      setSelectedNotification((prev) => (prev && prev.isRead ? null : prev));
    } catch {
      toast.error("Impossible de supprimer les notifications lues.");
    } finally {
      setIsClearingRead(false);
    }
  }, [token, isClearingRead, readNotificationsCount]);

  const clearAllNotifications = useCallback(async () => {
    if (!token || isClearingAll || !hasNotifications) return;
    setIsClearingAll(true);
    try {
      const response = await fetch("/api/notifications/clear-all", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("clear failed");
      setNotifications([]);
      setDeletingIds([]);
      setSelectedNotification(null);
      setUnreadCount(0);
      toast.success("Toutes les notifications ont été supprimées.");
    } catch {
      toast.error("Impossible de supprimer les notifications.");
    } finally {
      setIsClearingAll(false);
    }
  }, [token, isClearingAll, hasNotifications]);

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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-3">
            <div>
              <p className="text-sm font-semibold text-vdm-gold-800">Notifications</p>
              <p className="text-xs text-gray-500">{unreadCount} non lues</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!hasReadNotifications || isClearingRead}
                onClick={clearReadNotifications}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Supprimer les lues
              </button>
              <button
                type="button"
                disabled={!hasNotifications || isClearingAll}
                onClick={clearAllNotifications}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isClearingAll ? "Suppression..." : "Tout supprimer"}
              </button>
              <button
                type="button"
                disabled={isBusy || unreadCount === 0}
                onClick={markAllRead}
                className="text-xs font-semibold text-blue-600 enabled:hover:text-blue-800 disabled:text-gray-400"
              >
                Tout lire
              </button>
            </div>
          </div>

          <div className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
            {visibleNotifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">Aucune notification pour le moment.</div>
            ) : (
              visibleNotifications.map((notification) => {
                const label = CATEGORY_LABELS[notification.category];
                const requesterName = extractRequesterName(notification.metadata);
                return (
                  <div
                    key={notification.id}
                    className={`group flex items-start gap-3 px-4 py-3 transition-colors ${notification.isRead ? "bg-white" : "bg-gray-50"} cursor-pointer`}
                    onClick={() => handleNotificationClick(notification)}
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
                      {requesterName ? (
                        <p className="mt-1 text-[10px] text-gray-500">Demande par {requesterName}</p>
                      ) : null}
                      <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-gray-400">
                        {formatDate(notification.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      {!notification.isRead ? (
                        <Check className="h-4 w-4 text-vdm-gold-600" aria-hidden />
                      ) : (
                        <button
                          type="button"
                          disabled={deletingIds.includes(notification.id)}
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteNotification(notification.id);
                          }}
                          className="rounded-full border border-gray-200 p-1 text-gray-500 transition hover:border-gray-300 hover:text-gray-700 disabled:cursor-progress disabled:opacity-60"
                          aria-label="Supprimer la notification"
                        >
                          <Trash className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      {selectedNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-vdm-gold-800">{selectedNotification.title}</p>
              {selectedRequesterName && (
                <p className="text-xs text-gray-500">Demandeur : {selectedRequesterName}</p>
              )}
              <p className="text-xs text-gray-500">{formatDate(selectedNotification.createdAt)}</p>
            </div>
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                className="rounded-full border border-gray-200 p-2 text-gray-600 hover:text-gray-800"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className="mt-4 text-sm text-gray-700">{selectedNotification.body}</p>
            <div className="mt-6 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-gray-400">
              <span>{CATEGORY_LABELS[selectedNotification.category].text}</span>
              <span>{formatDate(selectedNotification.createdAt)}</span>
            </div>
            {selectedActionPath && (
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNotification(null);
                    router.push(selectedActionPath);
                  }}
                  className="rounded-lg bg-vdm-gold-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-sm transition hover:bg-vdm-gold-800"
                >
                  {selectedActionLabel ?? "Voir la demande"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
