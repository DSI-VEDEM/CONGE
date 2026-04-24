"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Home,
  ClipboardCheck,
  Clock,
  CalendarDays,
  User,
  LogOut,
  Menu,
  X,
  Users,
  ShieldCheck,
  FileText,
  Lock,
} from "lucide-react";

import type { SidebarIconKey, SidebarSection } from "./sidebar-types";
import type { EmployeeSession } from "@/lib/auth-client";
import { getEmployee, logout } from "@/lib/auth-client";

const sidebarIconMap: Record<SidebarIconKey, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  home: Home,
  clipboard: ClipboardCheck,
  clock: Clock,
  calendar: CalendarDays,
  users: Users,
  user: User,
  shield: ShieldCheck,
  lock: Lock,
  "file-text": FileText,
};

export function Sidebar({
  brandTitle = "Mon espace RH",
  brandSubtitle = "Gestion des demandes",
  sections,
}: {
  brandTitle: string;
  brandSubtitle: string;
  sections: SidebarSection[];
  showOrgSwitcher?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isMounted, setIsMounted] = useState(false);
  const employee = useMemo(() => getEmployee(), []);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const handleLogout = useCallback(() => {
    setShowLogoutModal(true);
  }, []);
  const confirmLogout = useCallback(() => {
    setShowLogoutModal(false);
    logout();
    router.replace("/login");
  }, [router]);
  const cancelLogout = useCallback(() => setShowLogoutModal(false), []);


  const subtitleLine = employee ? String(employee.jobTitle ?? "").trim() : "";

  const [menuHeight, setMenuHeight] = useState(0);
  useEffect(() => {
    if (menuRef.current) {
      const vh = window.innerHeight;
      const navbarH = 72;
      setMenuHeight(vh - navbarH);
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
    };
    if (orgDropdownOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [orgDropdownOpen]);

  const isDashboardRoot = (to: string) =>
    to === "/dashboard/dsi" ||
    to === "/dashboard/operations" ||
    to === "/dashboard/manager" ||
    to === "/dashboard/employee" ||
    to === "/dashboard/accountant" ||
    to === "/dashboard/ceo";

  const normalizeOpsPath = (path: string, to: string) => {
    if (to.startsWith("/dashboard/manager") && path.startsWith("/dashboard/operations")) {
      return `/dashboard/manager${path.slice("/dashboard/operations".length)}`;
    }
    return path;
  };

  const flatLinks = useMemo(() => sections.flatMap((section) => section.links), [sections]);

  const getBestActiveLink = useCallback(
    (path: string) => {
      const candidates = flatLinks.filter((link) => {
        const normalizedPath = normalizeOpsPath(path, link.to);
        if (isDashboardRoot(link.to)) return normalizedPath === link.to;
        return normalizedPath === link.to || normalizedPath.startsWith(`${link.to}/`);
      });
      if (candidates.length === 0) return null;
      return candidates.reduce((best, cur) => (cur.to.length > best.to.length ? cur : best), candidates[0]);
    },
    [flatLinks]
  );

  const activeLink = useMemo(() => getBestActiveLink(pathname), [pathname, getBestActiveLink]);

  return (
    <>
      {/* MOBILE TOPBAR */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-vdm-gold-900 shadow px-4 py-3 flex items-center justify-between border-b border-vdm-gold-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-vdm-gold-800 flex items-center justify-center overflow-hidden">
            <Image src="/logo.jpeg" alt="Logo" width={40} height={40} className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="text-base font-bold text-vdm-gold-100 tracking-tight">{brandTitle}</div>
            <div className="text-xs text-vdm-gold-200 font-medium">{brandSubtitle}</div>
          </div>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-xl bg-vdm-gold-800 text-white hover:bg-vdm-gold-700 transition border border-vdm-gold-900 hover:text-white"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* MOBILE OVERLAY */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setIsOpen(false)} />
      )}

      {/* MOBILE MENU */}
      <div
        ref={menuRef}
        style={{ maxHeight: isOpen ? `${menuHeight}px` : "0px" }}
        className="lg:hidden fixed top-[72px] left-0 right-0 bottom-0 z-40 bg-vdm-gold-900 overflow-y-auto transition-all duration-300 ease-out shadow-lg"
      >
        <div className="p-4 space-y-4">
          <div className="px-2">
            <div className="text-sm font-semibold text-vdm-gold-100">
              {isMounted && employee ? `${employee.firstName} ${employee.lastName}` : "Utilisateur"}
            </div>
            <div className="text-xs text-vdm-gold-200">{isMounted ? subtitleLine : ""}</div>
          </div>

          {sections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {section.title && (
                <div className="px-2 mb-1">
                  <div className="text-xs font-bold text-vdm-gold-200 uppercase tracking-widest">{section.title}</div>
                </div>
              )}

              {section.links.map((link) => {
                const isActive = activeLink?.to === link.to;
                const Icon = sidebarIconMap[link.icon];
                return (
                  <Link
                    key={link.to}
                    href={link.to}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl transition hover:text-white ${
                      isActive ? "bg-vdm-gold-700 text-white hover:text-white" : "text-vdm-gold-100 hover:bg-vdm-gold-800 hover:text-white"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-semibold">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-red-300 hover:bg-red-700/20 transition w-full font-semibold"
          >
            <LogOut className="w-5 h-5" />
            Déconnexion
          </button>
        </div>
      </div>

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex lg:flex-col fixed left-0 top-0 h-screen w-64 bg-vdm-gold-900 shadow-lg z-30">
        <div className="p-5 border-b border-vdm-gold-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-vdm-gold-800 flex items-center justify-center overflow-hidden">
              <Image src="/logo.jpeg" alt="Logo" width={40} height={40} className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="text-lg font-bold text-vdm-gold-100 tracking-tight">{brandTitle}</div>
              <div className="text-[11px] text-vdm-gold-200 font-semibold">{brandSubtitle}</div>
            </div>
          </div>

          <div className="px-1 mb-3">
            <div className="text-sm font-semibold text-vdm-gold-100">
              {isMounted && employee ? `${employee.firstName} ${employee.lastName}` : "Utilisateur"}
            </div>
            <div className="text-xs text-vdm-gold-200">{isMounted ? subtitleLine : ""}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-3">
          {sections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {section.title && (
                <div className="px-2 mb-1">
                  <div className="text-[10px] font-bold text-vdm-gold-200 uppercase tracking-widest">{section.title}</div>
                </div>
              )}

              {section.links.map((link) => {
                const isActive = activeLink?.to === link.to;
                const Icon = sidebarIconMap[link.icon];
                return (
                  <Link
                    key={link.to}
                    href={link.to}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl transition hover:text-white ${
                      isActive ? "bg-vdm-gold-700 text-white hover:text-white" : "text-vdm-gold-100 hover:bg-vdm-gold-800 hover:text-white"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-semibold">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-vdm-gold-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-vdm-gold-100 hover:bg-vdm-gold-800 transition w-full font-semibold"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Déconnexion</span>
          </button>
        </div>
        {showLogoutModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={cancelLogout}
          >
            <div
              className="w-full max-w-sm rounded-[28px] bg-gradient-to-b from-vdm-gold-600/90 to-vdm-gold-500/90 p-6 shadow-[0_30px_60px_rgba(0,0,0,0.35)] backdrop-blur"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-lg font-semibold text-white">Confirmation de déconnexion</p>
              <p className="mt-2 text-sm text-white/80">
                Vous allez être déconnecté. Souhaitez-vous vraiment quitter l’application ?
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={confirmLogout}
                  className="flex-1 rounded-2xl bg-white/90 py-2 text-sm font-semibold text-vdm-gold-700 transition hover:bg-white"
                >
                  Me déconnecter
                </button>
                <button
                  onClick={cancelLogout}
                  className="flex-1 rounded-2xl border border-white/60 py-2 text-sm font-semibold text-white transition hover:border-white"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
