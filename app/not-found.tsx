 "use client";

import Link from "next/link";
import { getEmployee, routeForRole } from "@/lib/auth-client";

export default function NotFoundPage() {
  const employee = getEmployee();
  const target = employee
    ? routeForRole(employee.role, employee.isDsiAdmin, employee.departmentType ?? null)
    : "/login";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-vdm-gold-100/20 via-white to-white px-4 text-center">
      <div className="max-w-lg rounded-3xl border border-vdm-gold-200 bg-white/90 p-10 shadow-2xl shadow-vdm-gold-200/50 backdrop-blur">
        <img src="/logo.jpeg" alt="Logo Veilleur des Médias" className="mx-auto mb-8 h-20 w-20 rounded-full object-cover" />
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-vdm-gold-900">Veilleur des Médias</p>
        <h1 className="mt-4 text-4xl font-bold leading-tight text-vdm-gold-900">404 · Page introuvable</h1>
        <p className="mt-3 text-sm text-vdm-gold-600">
          Oups, la page que vous cherchez a disparu dans les couloirs numériques du Veilleur. Revenez sur le tableau de bord pour retrouver vos documents.
        </p>
        <Link
          href={target}
          className="mt-8 inline-flex items-center justify-center rounded-full border border-vdm-gold-500 bg-vdm-gold-600 px-6 py-3 text-sm font-semibold uppercase tracking-wider text-white transition hover:bg-vdm-gold-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vdm-gold-700"
        >
          Retourner au tableau de bord
        </Link>
      </div>
    </main>
  );
}
