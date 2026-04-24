"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getToken } from "@/lib/auth-client";
import { formatDateDMY } from "@/lib/date-format";

type Holiday = {
  id: string;
  date: string;
  label?: string | null;
  createdAt?: string;
  isRecurring?: boolean | null;
};

function toDateInputValue(year: number, month: number, day: number) {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function buildMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startWeekday = (first.getDay() + 6) % 7; // lundi=0
  const daysInMonth = last.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return { year, month, cells };
}

export default function AccountantHolidaysPage() {
  const [items, setItems] = useState<Holiday[]>([]);
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const selectedYear = useMemo(() => calendarMonth.getFullYear(), [calendarMonth]);
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`/api/holidays?all=1`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setItems(Array.isArray(data?.holidays) ? data.holidays : []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const create = async () => {
    if (!date) {
      toast.error("Veuillez sélectionner une date.");
      return;
    }
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Ajout du jour férié...");
    const res = await fetch("/api/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date, label, recurring }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success("Jour férié ajouté.", { id: t });
      setDate("");
      setLabel("");
      load();
    } else {
      toast.error(data?.error || "Erreur lors de l'ajout.", { id: t });
    }
  };

  const remove = async (id: string) => {
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Suppression...");
    const res = await fetch(`/api/holidays/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      toast.success("Supprimé.", { id: t });
      setItems((prev) => prev.filter((x) => x.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || "Erreur lors de la suppression.", { id: t });
    }
  };

  const rows = useMemo(
    () =>
      items.map((h) => ({
        ...h,
        dateLabel: h.date ? formatDateDMY(h.date) : "-",
      })),
    [items]
  );
  const recurringRows = useMemo(() => rows.filter((h) => Boolean(h.isRecurring)), [rows]);
  const oneOffRows = useMemo(() => rows.filter((h) => !h.isRecurring), [rows]);
  const oneOffByYear = useMemo(() => {
    const map = new Map<string, typeof oneOffRows>();
    for (const h of oneOffRows) {
      const y = String(h.date ?? "").slice(0, 4) || "—";
      const next = map.get(y) ?? [];
      next.push(h);
      map.set(y, next);
    }
    return map;
  }, [oneOffRows]);
  const oneOffYears = useMemo(
    () => Array.from(oneOffByYear.keys()).sort((a, b) => Number(b) - Number(a)),
    [oneOffByYear]
  );

  useEffect(() => {
    // Ouvre l'année actuellement affichée dans le calendrier par défaut.
    setOpenYears((prev) => {
      const key = String(selectedYear);
      if (prev[key] != null) return prev;
      return { ...prev, [key]: true };
    });
  }, [selectedYear]);

  const { year, month, cells } = useMemo(() => buildMonth(calendarMonth), [calendarMonth]);
  const monthLabel = useMemo(() => formatDateDMY(new Date(year, month, 1)), [month, year]);
  const holidayDates = useMemo(() => new Set(items.map((h) => String(h.date).slice(0, 10))), [items]);

  const goPrevMonth = () => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNextMonth = () => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const selectDay = (day: number | null) => {
    if (!day) return;
    const value = toDateInputValue(year, month, day);
    setDate(value);
    if (holidayDates.has(value)) {
      const existing = items.find((h) => String(h.date).slice(0, 10) === value);
      if (existing?.label) setLabel(existing.label);
    }
  };

  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white border border-vdm-gold-200 rounded-xl p-5">
          <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Jours fériés</div>
          <div className="text-sm text-gray-600">
            Les jours fériés ne sont pas décomptés du solde des congés payés.
          </div>

          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-vdm-gold-200 bg-vdm-gold-50/40 p-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  className="px-2 py-1 rounded-lg border border-vdm-gold-200 bg-white text-vdm-gold-800 text-sm hover:bg-vdm-gold-50"
                >
                  ←
                </button>
                <div className="text-sm font-semibold text-vdm-gold-800">{monthLabel}</div>
                <button
                  type="button"
                  onClick={goNextMonth}
                  className="px-2 py-1 rounded-lg border border-vdm-gold-200 bg-white text-vdm-gold-800 text-sm hover:bg-vdm-gold-50"
                >
                  →
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-[11px] text-gray-500">
                {["L", "M", "M", "J", "V", "S", "D"].map((d) => (
                  <div key={d} className="text-center font-semibold">
                    {d}
                  </div>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-7 gap-1">
                {cells.map((day, idx) => {
                  const value = day ? toDateInputValue(year, month, day) : "";
                  const isHoliday = !!day && holidayDates.has(value);
                  const isSelected = !!day && value === date;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectDay(day)}
                      disabled={!day}
                      className={`h-9 rounded-lg text-sm font-semibold transition ${
                        !day
                          ? "bg-transparent"
                          : isSelected
                          ? "bg-vdm-gold-700 text-white"
                          : isHoliday
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                          : "bg-white border border-vdm-gold-200 text-vdm-gold-800 hover:bg-vdm-gold-50"
                      }`}
                      title={isHoliday ? "Jour férié" : "Sélectionner"}
                    >
                      {day ?? ""}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded bg-emerald-100 border border-emerald-200" />
                  Jour férié
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded bg-vdm-gold-700" />
                  Sélection
                </div>
              </div>
            </div>

            <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-vdm-gold-200 px-3 py-2 text-sm outline-none focus:border-vdm-gold-400"
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 select-none">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-4 w-4 accent-vdm-gold-700"
              />
              Chaque année (récurrent)
            </label>
            <div>
              <label className="text-xs font-semibold text-gray-600">Libellé (optionnel)</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex: Fête du travail"
                className="mt-1 w-full rounded-lg border border-vdm-gold-200 px-3 py-2 text-sm outline-none focus:border-vdm-gold-400"
              />
            </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={create}
              className="px-4 py-2 rounded-lg bg-vdm-gold-700 text-white font-semibold hover:bg-vdm-gold-800"
            >
              Ajouter
            </button>
          </div>
        </div>

        <div className="bg-white border border-vdm-gold-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-vdm-gold-200">
            <div className="text-sm font-semibold text-vdm-gold-800">Jours fériés ponctuels</div>
            <div className="text-xs text-gray-600">Définis pour une année précise.</div>
          </div>
          <div className="divide-y divide-vdm-gold-100">
            {oneOffYears.length === 0 ? (
              <div className="px-5 py-6 text-sm text-gray-500">Aucun jour férié ponctuel défini.</div>
            ) : (
              oneOffYears.map((y) => {
                const yearItems = oneOffByYear.get(y) ?? [];
                const isOpen = Boolean(openYears[y]);
                return (
                  <details
                    key={y}
                    open={isOpen}
                    onToggle={(e) => {
                      const nextOpen = (e.currentTarget as HTMLDetailsElement).open;
                      setOpenYears((prev) => ({ ...prev, [y]: nextOpen }));
                    }}
                    className="group"
                  >
                    <summary className="px-5 py-4 cursor-pointer select-none flex items-center justify-between">
                      <div className="text-sm font-semibold text-vdm-gold-800">{y}</div>
                      <div className="text-xs text-gray-600">
                        {yearItems.length} élément{yearItems.length > 1 ? "s" : ""}{" "}
                        <span className="ml-2 inline-block transition group-open:rotate-180">▾</span>
                      </div>
                    </summary>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-vdm-gold-50 text-vdm-gold-800">
                          <tr>
                            <th className="text-left px-5 py-3 font-semibold">Date</th>
                            <th className="text-left px-5 py-3 font-semibold">Libellé</th>
                            <th className="text-right px-5 py-3 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {yearItems.map((h) => (
                            <tr key={h.id} className="border-t border-vdm-gold-100">
                              <td className="px-5 py-3">{(h as any).dateLabel}</td>
                              <td className="px-5 py-3">{h.label || "—"}</td>
                              <td className="px-5 py-3 text-right">
                                <button
                                  onClick={() => remove(h.id)}
                                  className="px-2 py-1 rounded-md border border-red-200 text-red-700 text-xs hover:bg-red-50"
                                >
                                  Supprimer
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white border border-vdm-gold-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-vdm-gold-200">
            <div className="text-sm font-semibold text-vdm-gold-800">Jours fériés récurrents</div>
            <div className="text-xs text-gray-600">S’applique automatiquement à toutes les années.</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-vdm-gold-50 text-vdm-gold-800">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Date</th>
                  <th className="text-left px-5 py-3 font-semibold">Libellé</th>
                  <th className="text-right px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recurringRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-6 text-gray-500">
                      Aucun jour férié récurrent défini.
                    </td>
                  </tr>
                ) : (
                  recurringRows.map((h) => (
                    <tr key={h.id} className="border-t border-vdm-gold-100">
                      <td className="px-5 py-3">{(h as any).dateLabel}</td>
                      <td className="px-5 py-3">{h.label || "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => remove(h.id)}
                          className="px-2 py-1 rounded-md border border-red-200 text-red-700 text-xs hover:bg-red-50"
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
