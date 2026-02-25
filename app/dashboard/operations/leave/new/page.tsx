"use client";
import { formatDateDMY } from "@/lib/date-format";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getEmployee, getToken } from "@/lib/auth-client";
import toast from "react-hot-toast";
import { DEFAULT_LEAVE_TYPE, leaveOptionsForGender, type LeaveTypeValue } from "@/lib/leave-types";

type LeaveItem = {
  startDate: string;
  endDate: string;
  status: "SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
};

type CalendarBlackout = { startDate: string; endDate: string };

const BASE_ALLOWANCE = 25;

function toLocalDateInputValue(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toUtcDay(value: string | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function overlapDaysInYear(start: string, end: string, year: number) {
  const startUtc = toUtcDay(start);
  const endUtc = toUtcDay(end);
  if (startUtc == null || endUtc == null) return 0;
  if (endUtc < startUtc) return 0;
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year, 11, 31);
  const s = Math.max(startUtc, yearStart);
  const e = Math.min(endUtc, yearEnd);
  if (s > e) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

function consumedDaysForYear(leaves: LeaveItem[], year: number) {
  let total = 0;
  for (const leave of leaves) {
    if (leave.status === "APPROVED" || leave.status === "PENDING" || leave.status === "SUBMITTED") {
      total += overlapDaysInYear(leave.startDate, leave.endDate, year);
    }
  }
  return total;
}

function daysBetweenInclusive(start: string, end: string) {
  const s = toUtcDay(start);
  const e = toUtcDay(end);
  if (s == null || e == null) return 0;
  if (e < s) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

function rangesOverlap(start: string, end: string, blackoutStart: string, blackoutEnd: string) {
  const s = toUtcDay(start);
  const e = toUtcDay(end);
  const bs = toUtcDay(blackoutStart);
  const be = toUtcDay(blackoutEnd);
  if (s == null || e == null || bs == null || be == null) return false;
  return s <= be && e >= bs;
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

function toUtcDateValue(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function inRange(day: number, month: number, year: number, start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
  const dUtc = Date.UTC(year, month, day);
  const sUtc = toUtcDateValue(s);
  const eUtc = toUtcDateValue(e);
  return dUtc >= sUtc && dUtc <= eUtc;
}

function toDateValueForDay(year: number, month: number, day: number) {
  return toLocalDateInputValue(new Date(year, month, day));
}

function formatLeaveDays(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

export default function OperationsLeaveNew() {
  const [type, setType] = useState<LeaveTypeValue>(DEFAULT_LEAVE_TYPE);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [leaves, setLeaves] = useState<LeaveItem[]>([]);
  const [baseAllowance, setBaseAllowance] = useState<number>(BASE_ALLOWANCE);
  const [balance, setBalance] = useState<number>(BASE_ALLOWANCE);
  const [seniorityYears, setSeniorityYears] = useState<number>(0);
  const [seniorityBonusDays, setSeniorityBonusDays] = useState<number>(0);
  const today = useMemo(() => toLocalDateInputValue(new Date()), []);
  const [current, setCurrent] = useState(() => new Date());
  const { year, month, cells } = useMemo(() => buildMonth(current), [current]);
  const monthLabel = formatDateDMY(new Date(current.getFullYear(), current.getMonth(), 1));
  const [blackouts, setBlackouts] = useState<CalendarBlackout[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const todayUtc = useMemo(() => toUtcDay(toLocalDateInputValue(new Date())), []);
  const daysRequested = useMemo(
    () => (startDate && endDate ? daysBetweenInclusive(startDate, endDate) : 0),
    [startDate, endDate]
  );
  const isExhausted = balance <= 0;
  const employeeGender = getEmployee()?.gender ?? null;
  const leaveOptions = useMemo(() => leaveOptionsForGender(employeeGender), [employeeGender]);

  useEffect(() => {
    if (leaveOptions.length && !leaveOptions.some((option) => option.value === type)) {
      setType(leaveOptions[0].value);
    }
  }, [leaveOptions, type]);

  const refreshBalance = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch("/api/leave-requests/my", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const nextLeaves = (data?.leaves ?? []) as LeaveItem[];
    setLeaves(nextLeaves);
    const base = Number(data?.annualLeaveBalance ?? data?.employee?.leaveBalance ?? BASE_ALLOWANCE);
    const remaining = Number(
      data?.remainingCurrentYear ??
      (() => {
        const year = new Date().getFullYear();
        const consumedDays = consumedDaysForYear(nextLeaves, year);
        return Math.max(0, base - consumedDays);
      })()
    );
    setBaseAllowance(base);
    setBalance(Math.max(0, remaining));
    setSeniorityYears(Number(data?.seniorityYears ?? 0));
    setSeniorityBonusDays(Number(data?.seniorityBonusDays ?? 0));
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!active) return;
      await refreshBalance();
    };
    load();
    const intervalId = setInterval(load, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshBalance]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const load = async () => {
      const res = await fetch("/api/leave-requests/calendar", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setBlackouts(data?.blackouts ?? []);
    };
    load();
  }, []);

  const goPrev = () => setCurrent((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNext = () => setCurrent((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const isToday = (day: number | null) => {
    if (!day) return false;
    const now = new Date();
    return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
  };

  const hasBlackout = (day: number | null) =>
    day && blackouts.some((b) => inRange(day, month, year, b.startDate, b.endDate));

  const leaveStatusForDay = useCallback(
    (day: number | null) => {
      if (!day) return null;
      const dateValue = toDateValueForDay(year, month, day);
      const priority = ["APPROVED", "PENDING", "SUBMITTED", "REJECTED"] as const;
      type PriorityStatus = (typeof priority)[number];
      let best: (typeof priority)[number] | null = null;
      for (const leave of leaves) {
        if (!rangesOverlap(dateValue, dateValue, leave.startDate, leave.endDate)) continue;
        const status = leave.status;
        if (!priority.includes(status as PriorityStatus)) continue;
        const statusPriority = priority.indexOf(status as PriorityStatus);
        if (best == null || statusPriority < priority.indexOf(best)) {
          best = status as PriorityStatus;
        }
      }
      return best;
    },
    [leaves, month, year]
  );

  const selectedDateLabel =
    selectedDay != null ? formatDateDMY(new Date(year, month, selectedDay)) : "";

  const selectedBlackouts = useMemo(() => {
    if (selectedDay == null) return [];
    return blackouts.filter((b) => inRange(selectedDay, month, year, b.startDate, b.endDate));
  }, [blackouts, selectedDay, month, year]);

  const hasBlackoutOverlap = useCallback(
    (start: string, end: string) => blackouts.some((b) => rangesOverlap(start, end, b.startDate, b.endDate)),
    [blackouts]
  );

  const isPastDay = useCallback(
    (day: number | null) => {
      if (!day || todayUtc == null) return false;
      return Date.UTC(year, month, day) < todayUtc;
    },
    [month, todayUtc, year]
  );

  const handleCalendarSelect = useCallback(
    (day: number | null) => {
      if (!day) return;
      setSelectedDay(day);
      if (isPastDay(day) || hasBlackout(day)) return;

      const dateValue = toDateValueForDay(year, month, day);
      if (!startDate || (startDate && endDate)) {
        setStartDate(dateValue);
        setEndDate("");
        return;
      }

      if (dateValue < startDate) {
        setStartDate(dateValue);
        return;
      }

      if (hasBlackoutOverlap(startDate, dateValue)) {
        toast.error("La periode chevauche une date bloquee. Veuillez ajuster.");
        return;
      }

      setEndDate(dateValue);
    },
    [endDate, hasBlackout, hasBlackoutOverlap, isPastDay, month, startDate, year]
  );

  const submit = async () => {
    if (isExhausted) {
      toast.error("Solde de conges epuise.");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Veuillez renseigner la date de debut et la date de fin.");
      return;
    }
    const daysRequested = daysBetweenInclusive(startDate, endDate);
    if (daysRequested < 1) {
      toast.error("La periode saisie est invalide.");
      return;
    }
    if (daysRequested > balance) {
      toast.error("La demande depasse votre solde de conges.");
      return;
    }
    if (hasBlackoutOverlap(startDate, endDate)) {
      toast.error("La periode choisie chevauche une periode bloquee par le PDG.");
      return;
    }

    const token = getToken();
    if (!token) return;
    const t = toast.loading("Envoi en cours...");
    try {
      const res = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type,
          startDate,
          endDate,
          reason,
        }),
      });
      if (res.ok) {
        toast.success("Demande envoyee. En attente de validation.", { id: t });
        setStartDate("");
        setEndDate("");
        setReason("");
        setType(DEFAULT_LEAVE_TYPE);
        refreshBalance();
        window.dispatchEvent(new Event("leave-requests-updated"));
      } else {
        toast.error("Erreur lors de l'envoi.", { id: t });
      }
    } catch {
      toast.error("Erreur reseau lors de l'envoi.", { id: t });
    }
  };

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Nouvelle demande</div>
      <div className="text-sm text-vdm-gold-700 mb-4">Soumettez votre demande de conge.</div>

      <div className="bg-white border border-vdm-gold-200 rounded-xl p-4 grid gap-3 md:grid-cols-2">
        {isExhausted ? (
          <div className="md:col-span-2 text-sm text-red-600">
            Votre solde de conges est epuise. Impossible de soumettre une nouvelle demande.
          </div>
        ) : null}
        <div>
          <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LeaveTypeValue)}
            disabled={isExhausted}
            className="w-full border border-vdm-gold-200 rounded-md p-2 bg-white focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
          >
            {leaveOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end justify-between gap-2 text-sm text-vdm-gold-700">
          <div className="space-y-0.5">
            <div>Solde restant annuel : {formatLeaveDays(balance)} / {formatLeaveDays(baseAllowance)} JOURS</div>
            <div className="text-xs text-vdm-gold-600">
              Ancienneté : {seniorityYears} an{seniorityYears > 1 ? "s" : ""} | Bonus : +{formatLeaveDays(seniorityBonusDays)}{" "}
              {Number(seniorityBonusDays) === 1 ? "jour" : "jours"}
            </div>
          </div>
          <button
            type="button"
            onClick={refreshBalance}
            className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
          >
            Rafraichir
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Date debut</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              const nextStart = e.target.value;
              setStartDate(nextStart);
              if (endDate && hasBlackoutOverlap(nextStart, endDate)) {
                toast.error("La periode chevauche une date bloquee. Veuillez ajuster.");
                setEndDate("");
              }
            }}
            min={today}
            disabled={isExhausted}
            className="w-full border border-vdm-gold-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Date fin</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              const nextEnd = e.target.value;
              if (startDate && hasBlackoutOverlap(startDate, nextEnd)) {
                toast.error("La periode chevauche une date bloquee. Veuillez ajuster.");
                return;
              }
              setEndDate(nextEnd);
            }}
            min={startDate || today}
            disabled={isExhausted}
            className="w-full border border-vdm-gold-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
          />
        </div>

        <div className="md:col-span-2">
          <div className="text-xs text-vdm-gold-700">
            {daysRequested > 0
              ? `Duree selectionnee: ${daysRequested} jour${daysRequested > 1 ? "s" : ""}`
              : "Selectionnez des dates pour calculer la duree."}
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Motif (optionnel)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isExhausted}
            className="w-full border border-vdm-gold-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
            placeholder="Ex: repos, raison familiale..."
          />
        </div>

        <div className="md:col-span-2">
          <button
            onClick={submit}
            disabled={isExhausted}
            className="px-3 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800"
          >
            Envoyer
          </button>
        </div>

        <div className="md:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-vdm-gold-800">Calendrier des periodes bloquees (PDG)</div>
              <div className="text-xs text-vdm-gold-600">
                Consultez les dates bloquees avant de choisir votre periode.
              </div>
            </div>
            <div className="text-xs text-vdm-gold-700 capitalize">{monthLabel}</div>
          </div>

          <div className="flex items-center justify-between mt-3 mb-2">
            <button
              onClick={goPrev}
              className="px-2 py-1 rounded-md border border-vdm-gold-200 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
              type="button"
            >
              Prec
            </button>
            <div className="text-xs text-gray-500">{year}</div>
            <button
              onClick={goNext}
              className="px-2 py-1 rounded-md border border-vdm-gold-200 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
              type="button"
            >
              Suiv
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-xs text-center text-vdm-gold-700 mb-2">
            {"L M M J V S D".split(" ").map((d, i) => (
              <div key={`${d}-${i}`} className="py-1 font-semibold">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {cells.map((day, idx) => {
              const blackout = hasBlackout(day);
              const past = isPastDay(day);
              const dateValue = day != null ? toDateValueForDay(year, month, day) : "";
              const isSelectedStart = !!day && dateValue === startDate;
              const isSelectedEnd = !!day && dateValue === endDate;
              const inSelectedRange =
                !!day &&
                !!startDate &&
                !!endDate &&
                rangesOverlap(dateValue, dateValue, startDate, endDate);
              const leaveStatus = leaveStatusForDay(day);
              const leaveClass =
                leaveStatus === "APPROVED"
                  ? "bg-emerald-200 text-emerald-900"
                  : leaveStatus === "REJECTED"
                    ? "bg-red-200 text-red-900"
                    : leaveStatus
                      ? "bg-amber-200 text-amber-900"
                      : "";
              return (
                <button
                  key={`${day ?? "x"}-${idx}`}
                  type="button"
                  onClick={() => handleCalendarSelect(day)}
                  className={`h-9 flex flex-col items-center justify-center rounded-md text-sm ${
                    day ? "text-vdm-gold-900" : "text-transparent"
                  } ${
                    isSelectedStart || isSelectedEnd
                      ? "bg-vdm-gold-700 text-white font-semibold"
                      : inSelectedRange
                        ? "bg-vdm-gold-100"
                        : leaveClass
                          ? leaveClass
                          : isToday(day)
                            ? "bg-vdm-gold-200 font-semibold"
                            : "hover:bg-vdm-gold-50"
                  } ${blackout ? "bg-gray-200 text-gray-500" : ""} ${
                    past ? "bg-vdm-gold-50/70 text-vdm-gold-400" : ""
                  } ${day && !blackout && !past ? "cursor-pointer" : "cursor-not-allowed"}`}
                >
                  <div className="leading-none">{day ?? "-"}</div>
                  <div className="mt-1 flex gap-1">
                    {blackout ? <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs text-gray-600 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Periodes bloquees
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Jours valides
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Jours demandes
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Jours refuses
            </div>
            {selectedDay != null ? (
              <div className="text-vdm-gold-700">Selection: {selectedDateLabel}</div>
            ) : (
              <div className="text-vdm-gold-700">Cliquez sur un jour pour voir le detail.</div>
            )}
          </div>
          <div className="mt-1 text-xs text-vdm-gold-700">
            Choisissez un jour pour le debut, puis un autre pour la fin.
            <span className="ml-2">
              Periode: {startDate ? formatDateDMY(startDate) : "-"} {" - "} {endDate ? formatDateDMY(endDate) : "-"}
            </span>
          </div>

          {selectedDay != null ? (
            <div className="mt-2 rounded-md border border-vdm-gold-100 bg-vdm-gold-50/50 p-3 text-xs text-gray-700">
              {selectedBlackouts.length === 0 ? (
                <div>Aucune periode bloquee ce jour.</div>
              ) : (
                <ul className="space-y-1">
                  {selectedBlackouts.map((b, i) => (
                    <li key={`${b.startDate}-${b.endDate}-${i}`}>
                      {formatDateDMY(b.startDate)} - {formatDateDMY(b.endDate)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
