"use client";
import { formatDateDMY } from "@/lib/date-format";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getEmployee, getToken } from "@/lib/auth-client";
import toast from "react-hot-toast";
import {
  DEFAULT_LEAVE_TYPE,
  isAnticipatedPaidLeaveType,
  leaveOptionsForGender,
  isPaidLeaveType,
  type LeaveTypeValue,
} from "@/lib/leave-types";
import { countLeaveDaysInclusive, countLeaveDaysOverlapInYear } from "@/lib/leave-days";

type LeaveItem = {
  type: string;
  startDate: string;
  endDate: string;
  status: "SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
};

type CalendarBlackout = { startDate: string; endDate: string };
type CalendarHoliday = { date: string; label?: string | null };

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

function consumedDaysForYear(leaves: LeaveItem[], year: number, holidayDates: string[]) {
  let total = 0;
  for (const leave of leaves) {
    if (leave.status === "APPROVED" || leave.status === "PENDING" || leave.status === "SUBMITTED") {
      if (!isPaidLeaveType(leave.type)) continue;
      total += countLeaveDaysOverlapInYear({
        start: leave.startDate,
        end: leave.endDate,
        year,
        type: leave.type,
        holidays: holidayDates,
      });
    }
  }
  return total;
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
  const [advanceBalance, setAdvanceBalance] = useState<number>(0);
  const [borrowedDays, setBorrowedDays] = useState<number>(0);
  const [seniorityYears, setSeniorityYears] = useState<number>(0);
  const [seniorityBonusDays, setSeniorityBonusDays] = useState<number>(0);
  const [paidLeaveEligible, setPaidLeaveEligible] = useState(true);
  const [paidLeaveEligibilityDate, setPaidLeaveEligibilityDate] = useState<string | null>(null);
  const today = useMemo(() => toLocalDateInputValue(new Date()), []);
  const [current, setCurrent] = useState(() => new Date());
  const { year, month, cells } = useMemo(() => buildMonth(current), [current]);
  const monthLabel = formatDateDMY(new Date(current.getFullYear(), current.getMonth(), 1));
  const [blackouts, setBlackouts] = useState<CalendarBlackout[]>([]);
  const [holidays, setHolidays] = useState<CalendarHoliday[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const todayUtc = useMemo(() => toUtcDay(toLocalDateInputValue(new Date())), []);
  const daysRequested = useMemo(
    () =>
      startDate && endDate
        ? countLeaveDaysInclusive({ start: startDate, end: endDate, type, holidays: holidays.map((h) => h.date) })
        : 0,
    [startDate, endDate, holidays, type]
  );
  const isExhausted = balance <= 0;
  const employeeGender = getEmployee()?.gender ?? null;
  const canUseAnticipatedPaid = paidLeaveEligible && isExhausted && advanceBalance >= 1;
  const leaveOptions = useMemo(
    () =>
      leaveOptionsForGender(employeeGender, {
        remainingPaidLeaveDays: paidLeaveEligible ? balance : 0,
        canUseAnticipatedPaid,
      }),
    [balance, canUseAnticipatedPaid, employeeGender, paidLeaveEligible]
  );

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
        const consumedDays = consumedDaysForYear(nextLeaves, year, holidays.map((h) => h.date));
        return base - consumedDays;
      })()
    );
    setBaseAllowance(base);
    setBalance(remaining);
    setAdvanceBalance(Number(data?.availableWithAdvance ?? Math.max(0, remaining)));
    setBorrowedDays(Number(data?.alreadyBorrowed ?? Math.max(0, -remaining)));
    setSeniorityYears(Number(data?.seniorityYears ?? 0));
    setSeniorityBonusDays(Number(data?.seniorityBonusDays ?? 0));
    setPaidLeaveEligible(Boolean(data?.paidLeaveEligible ?? true));
    setPaidLeaveEligibilityDate(data?.paidLeaveEligibilityDate ?? null);
  }, [holidays]);

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
      const res = await fetch(`/api/leave-requests/calendar?year=${encodeURIComponent(String(year))}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBlackouts(data?.blackouts ?? []);
        setHolidays(data?.holidays ?? []);
      }
    };
    load();
  }, [year]);

  const goPrev = () => setCurrent((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNext = () => setCurrent((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const isToday = (day: number | null) => {
    if (!day) return false;
    const now = new Date();
    return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
  };

  const hasBlackout = useCallback(
    (day: number | null) => day != null && blackouts.some((b) => inRange(day, month, year, b.startDate, b.endDate)),
    [blackouts, month, year]
  );

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

  const selectedDateLabel = selectedDay != null ? formatDateDMY(new Date(year, month, selectedDay)) : "";

  const selectedBlackouts = useMemo(() => {
    if (selectedDay == null) return [];
    return blackouts.filter((b) => inRange(selectedDay, month, year, b.startDate, b.endDate));
  }, [blackouts, selectedDay, month, year]);

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, CalendarHoliday[]>();
    for (const holiday of holidays) {
      const key = String(holiday?.date ?? "").slice(0, 10);
      if (!key) continue;
      const next = map.get(key) ?? [];
      next.push(holiday);
      map.set(key, next);
    }
    return map;
  }, [holidays]);

  const selectedHolidays = useMemo(() => {
    if (selectedDay == null) return [];
    const value = toDateValueForDay(year, month, selectedDay);
    return holidaysByDate.get(value) ?? [];
  }, [holidaysByDate, month, selectedDay, year]);

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
        toast.error("La période chevauche une date bloquée. Veuillez ajuster.");
        return;
      }

      setEndDate(dateValue);
    },
    [endDate, hasBlackout, hasBlackoutOverlap, isPastDay, month, startDate, year]
  );

  const submit = async () => {
    if (!startDate || !endDate) {
      toast.error("Veuillez renseigner la date de début et la date de fin.");
      return;
    }
    const daysRequested = countLeaveDaysInclusive({
      start: startDate,
      end: endDate,
      type,
      holidays: holidays.map((h) => h.date),
    });
    if (daysRequested < 1) {
      toast.error("La période saisie est invalide.");
      return;
    }
    if (!paidLeaveEligible && isPaidLeaveType(type)) {
      toast.error(
        paidLeaveEligibilityDate
          ? `Vous aurez droit aux congés payés à partir du ${formatDateDMY(paidLeaveEligibilityDate)}.`
          : "Vous n'avez pas encore droit aux congés payés."
      );
      return;
    }
    const paidAvailable = isAnticipatedPaidLeaveType(type) ? advanceBalance : Math.max(0, balance);
    if (isPaidLeaveType(type) && daysRequested > paidAvailable) {
      toast.error(
        isAnticipatedPaidLeaveType(type)
          ? "La demande dépasse votre avance de congés disponible."
          : "La demande dépasse votre solde de congés payés."
      );
      return;
    }
    if (hasBlackoutOverlap(startDate, endDate)) {
      toast.error("La période choisie chevauche une période bloquée par le PDG.");
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
        toast.success("Demande envoyée. En attente de validation.", { id: t });
        setStartDate("");
        setEndDate("");
        setReason("");
        setType(DEFAULT_LEAVE_TYPE);
        refreshBalance();
        window.dispatchEvent(new Event("leave-requests-updated"));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(String(data?.error ?? "Erreur lors de l'envoi."), { id: t });
      }
    } catch {
      toast.error("Erreur réseau lors de l'envoi.", { id: t });
    }
  };

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Nouvelle demande</div>
      <div className="text-sm text-vdm-gold-700 mb-4">Soumettez votre demande de congé.</div>

      <div className="bg-white border border-vdm-gold-200 rounded-xl p-4 grid gap-3 md:grid-cols-2">
        {!paidLeaveEligible ? (
          <div className="md:col-span-2 text-sm text-amber-700">
            Congés payés disponibles à partir du{" "}
            {paidLeaveEligibilityDate ? formatDateDMY(paidLeaveEligibilityDate) : "premier anniversaire d'entrée"}.
          </div>
        ) : null}

        {paidLeaveEligible && isExhausted ? (
          <div className="md:col-span-2 text-sm text-amber-700">
            {canUseAnticipatedPaid
              ? `Votre solde de congés payés est épuisé. Congé anticipé disponible : ${formatLeaveDays(advanceBalance)} jour${
                  advanceBalance > 1 ? "s" : ""
                }.`
              : "Votre solde de congés payés est épuisé."}
          </div>
        ) : null}
        <div>
          <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LeaveTypeValue)}
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
            <div>
              Solde restant période : {formatLeaveDays(balance)} / {formatLeaveDays(baseAllowance)} JOURS
            </div>
            <div className="text-xs text-vdm-gold-600">
              Ancienneté : {seniorityYears} an{seniorityYears > 1 ? "s" : ""} | Bonus : +{formatLeaveDays(seniorityBonusDays)}{" "}
              {Number(seniorityBonusDays) === 1 ? "jour" : "jours"}
            </div>
            {paidLeaveEligible && isExhausted ? (
              <div className="text-xs text-amber-700">
                Avance disponible : {formatLeaveDays(advanceBalance)} jour{advanceBalance > 1 ? "s" : ""}
                {borrowedDays > 0 ? ` | Déjà emprunté : ${formatLeaveDays(borrowedDays)} jour${borrowedDays > 1 ? "s" : ""}` : ""}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={refreshBalance}
            className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
          >
            Rafraîchir
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Date début</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              const nextStart = e.target.value;
              setStartDate(nextStart);
              if (endDate && hasBlackoutOverlap(nextStart, endDate)) {
                toast.error("La période chevauche une date bloquée. Veuillez ajuster.");
                setEndDate("");
              }
            }}
            min={today}
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
                toast.error("La période chevauche une date bloquée. Veuillez ajuster.");
                return;
              }
              setEndDate(nextEnd);
            }}
            min={startDate || today}
            className="w-full border border-vdm-gold-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
          />
        </div>

        <div className="md:col-span-2">
          <div className="text-xs text-vdm-gold-700">
            {daysRequested > 0
              ? `Durée sélectionnée : ${daysRequested} jour${daysRequested > 1 ? "s" : ""}`
              : "Sélectionnez des dates pour calculer la durée."}
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Motif (optionnel)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-vdm-gold-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
            placeholder="Ex : repos, raison familiale..."
          />
        </div>

        <div className="md:col-span-2">
          <button
            onClick={submit}
            className="px-3 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800"
          >
            Envoyer
          </button>
        </div>

        <div className="md:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-vdm-gold-800">
                Calendrier des périodes bloquées (PDG)
              </div>
              <div className="text-xs text-vdm-gold-600">
                Consultez les dates bloquées avant de choisir votre période.
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
              Préc.
            </button>
            <div className="text-xs text-gray-500">{year}</div>
            <button
              onClick={goNext}
              className="px-2 py-1 rounded-md border border-vdm-gold-200 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
              type="button"
            >
              Suiv.
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
              const holidayItems = dateValue ? holidaysByDate.get(dateValue) ?? [] : [];
              const isHoliday = holidayItems.length > 0;
              const isSelectedStart = !!day && dateValue === startDate;
              const isSelectedEnd = !!day && dateValue === endDate;
              const inSelectedRange = !!day && !!startDate && !!endDate && rangesOverlap(dateValue, dateValue, startDate, endDate);
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
                  } ${isHoliday && day && !blackout && !past && !leaveClass ? "ring-1 ring-sky-400" : ""} ${
                    day && !blackout && !past ? "cursor-pointer" : "cursor-not-allowed"
                  }`}
                  title={
                    isHoliday
                      ? `Jour férié${holidayItems.some((h) => h.label) ? ` : ${holidayItems.map((h) => h.label).filter(Boolean).join(", ")}` : ""}`
                      : blackout
                      ? "Période bloquée"
                      : ""
                  }
                >
                  <div className="leading-none">{day ?? "-"}</div>
                  <div className="mt-1 flex gap-1">
                    {blackout ? <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> : null}
                    {!blackout && isHoliday ? <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs text-gray-600 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Périodes bloquées
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Jours validés
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Jours demandés
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Jours refusés
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Jours fériés
            </div>
            {selectedDay != null ? (
              <div className="text-vdm-gold-700">Sélection : {selectedDateLabel}</div>
            ) : (
              <div className="text-vdm-gold-700">Cliquez sur un jour pour voir le détail.</div>
            )}
          </div>
          <div className="mt-1 text-xs text-vdm-gold-700">
            Choisissez un jour pour le début, puis un autre pour la fin.
            <span className="ml-2">
              Période : {startDate ? formatDateDMY(startDate) : "-"} {" - "} {endDate ? formatDateDMY(endDate) : "-"}
            </span>
          </div>

          {selectedDay != null ? (
            <div className="mt-2 rounded-md border border-vdm-gold-100 bg-vdm-gold-50/50 p-3 text-xs text-gray-700">
              {selectedHolidays.length === 0 ? null : (
                <div className="mb-2">
                  <div className="font-semibold text-vdm-gold-800">Jour férié</div>
                  <ul className="mt-1 space-y-1">
                    {selectedHolidays.map((h, i) => (
                      <li key={`${h.date}-${i}`}>{h.label ? h.label : formatDateDMY(h.date)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedBlackouts.length === 0 ? (
                <div>Aucune période bloquée ce jour.</div>
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
