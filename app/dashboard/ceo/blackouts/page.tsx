"use client";
import { formatDateDMY } from "@/lib/date-format";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getToken } from "@/lib/auth-client";

type Department = { id: string; type: string; name: string };
type EmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  matricule?: string | null;
  role: string;
  departmentId?: string | null;
};
type Blackout = {
  id: string;
  title?: string | null;
  reason?: string | null;
  startDate: string;
  endDate: string;
  departmentId?: string | null;
  employeeIds?: string[] | null;
  targetEmployees?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    matricule?: string | null;
  }> | null;
  department?: { id: string; type: string; name: string } | null;
};
type BlackoutsResponse = { blackouts?: Blackout[] };
type DepartmentsResponse = { departments?: Department[] };
type EmployeesResponse = { employees?: EmployeeOption[] };

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
  const startWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = last.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return { year, month, cells };
}

function inRange(value: string, start: string, end: string) {
  return value >= start && value <= end;
}

export default function CeoBlackouts() {
  const [items, setItems] = useState<Blackout[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetScope, setTargetScope] = useState<"ALL" | "DEPARTMENT" | "PEOPLE">("ALL");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const { year, month, cells } = useMemo(() => buildMonth(calendarMonth), [calendarMonth]);
  const monthLabel = useMemo(() => formatDateDMY(new Date(year, month, 1)), [year, month]);

  const deptOptions = useMemo(
    () => [{ id: "ALL", type: "ALL", name: "Tous les départements" }, ...departments],
    [departments]
  );

  const load = async () => {
    const token = getToken();
    if (!token) return;
    const [blackoutRes, deptRes, empRes] = await Promise.all([
      fetch("/api/leave-blackouts", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/departments", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/employees/options?take=150", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const blackoutData = (await blackoutRes.json().catch(() => ({}))) as BlackoutsResponse;
    const deptData = (await deptRes.json().catch(() => ({}))) as DepartmentsResponse;
    const empData = (await empRes.json().catch(() => ({}))) as EmployeesResponse;
    if (blackoutRes.ok) setItems(blackoutData?.blackouts ?? []);
    if (deptRes.ok) {
      setDepartments(
        (deptData?.departments ?? []).map((d) => ({
          id: d.id,
          type: d.type ?? d.name ?? d.id,
          name: d.name ?? d.type ?? d.id,
        }))
      );
    }
    if (empRes.ok) {
      setEmployees(
        (empData?.employees ?? [])
          .filter((e) => e?.role !== "CEO")
          .map((e) => ({
            id: e.id,
            firstName: e.firstName,
            lastName: e.lastName,
            matricule: e.matricule ?? null,
            role: e.role,
            departmentId: e.departmentId ?? null,
          }))
      );
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []); 

  const createBlackout = async () => {
    if (!startDate || !endDate) {
      toast.error("Veuillez renseigner la date de début et la date de fin.");
      return;
    }
    if (targetScope === "DEPARTMENT" && departmentId === "ALL") {
      toast.error("Veuillez sélectionner un département.");
      return;
    }
    if (targetScope === "PEOPLE" && selectedEmployeeIds.length === 0) {
      toast.error("Veuillez sélectionner au moins une personne.");
      return;
    }
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Création de la période...");
    const res = await fetch("/api/leave-blackouts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title,
        reason,
        startDate,
        endDate,
        departmentId: targetScope === "DEPARTMENT" ? departmentId : null,
        employeeIds: targetScope === "PEOPLE" ? selectedEmployeeIds : [],
      }),
    });
    if (res.ok) {
      toast.success("Période bloquée créée.", { id: t });
      setTitle("");
      setReason("");
      setStartDate("");
      setEndDate("");
      setTargetScope("ALL");
      setDepartmentId("ALL");
      setSelectedEmployeeIds([]);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || "Erreur lors de la création.", { id: t });
    }
  };

  const toggleEmployee = (id: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const goPrevMonth = () => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNextMonth = () => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const selectDay = (day: number | null) => {
    if (!day) return;
    const value = toDateInputValue(year, month, day);

    if (!startDate || (startDate && endDate)) {
      setStartDate(value);
      setEndDate("");
      return;
    }

    if (value < startDate) {
      setStartDate(value);
      return;
    }

    setEndDate(value);
  };

  const dayStatus = (day: number | null) => {
    if (!day) return { selected: false, boundary: false, existing: false, dateValue: "" };
    const dateValue = toDateInputValue(year, month, day);
    const existing = items.some((b) => inRange(dateValue, b.startDate.slice(0, 10), b.endDate.slice(0, 10)));
    const boundary = dateValue === startDate || dateValue === endDate;
    const selected =
      !!startDate &&
      (endDate
        ? inRange(dateValue, startDate <= endDate ? startDate : endDate, startDate <= endDate ? endDate : startDate)
        : dateValue === startDate);
    return { selected, boundary, existing, dateValue };
  };

  const targetLabel = (b: Blackout) => {
    const targets = b.targetEmployees ?? [];
    if (targets.length > 0) {
      const first = targets
        .slice(0, 3)
        .map((e) => `${e.firstName} ${e.lastName}`.trim())
        .join(", ");
      return targets.length > 3 ? `Personnes: ${first} +${targets.length - 3}` : `Personnes: ${first}`;
    }
    if (b.department?.type) return `Département: ${b.department.type}`;
    return "Global";
  };

  const removeBlackout = async (id: string) => {
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Suppression...");
    const res = await fetch(`/api/leave-blackouts/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      toast.success("Période supprimée.", { id: t });
      setItems((prev) => prev.filter((x) => x.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || "Erreur lors de la suppression.", { id: t });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-xl font-semibold text-vdm-gold-800">Périodes bloquées</div>
        <div className="text-sm text-vdm-gold-700">
          Le PDG peut bloquer certaines dates pour empêcher les demandes de congé.
        </div>
      </div>

      <div className="bg-white border border-vdm-gold-200 rounded-xl p-4 grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Titre</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-vdm-gold-200 rounded-md p-2"
            placeholder="Ex : inventaire annuel"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Ciblage</label>
          <select
            value={targetScope}
            onChange={(e) => {
              const next = e.target.value as "ALL" | "DEPARTMENT" | "PEOPLE";
              setTargetScope(next);
              if (next !== "DEPARTMENT") setDepartmentId("ALL");
              if (next !== "PEOPLE") setSelectedEmployeeIds([]);
            }}
            className="w-full border border-vdm-gold-200 rounded-md p-2 bg-white"
          >
            <option value="ALL">Global (tout le monde)</option>
            <option value="DEPARTMENT">Département</option>
            <option value="PEOPLE">Personne(s)</option>
          </select>
        </div>
        {targetScope === "DEPARTMENT" ? (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Département ciblé</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full border border-vdm-gold-200 rounded-md p-2 bg-white"
            >
              {deptOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.type}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {targetScope === "PEOPLE" ? (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-vdm-gold-800 mb-1">
              Personnes ciblées
            </label>
            <div className="max-h-40 overflow-auto border border-vdm-gold-200 rounded-md p-2 grid gap-1">
              {employees.length === 0 ? (
                <div className="text-sm text-gray-500">Aucun employé disponible.</div>
              ) : (
                employees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-2 text-sm text-vdm-gold-900">
                    <input
                      type="checkbox"
                      checked={selectedEmployeeIds.includes(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                    />
                    <span>
                      {emp.firstName} {emp.lastName}
                      {emp.matricule ? ` (${emp.matricule})` : ""}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        ) : null}
        <div>
          <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Date début</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border border-vdm-gold-200 rounded-md p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Date de fin</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border border-vdm-gold-200 rounded-md p-2"
          />
        </div>
        <div className="md:col-span-2 border border-vdm-gold-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-vdm-gold-800">Calendrier de sélection</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrevMonth}
                className="px-2 py-1 rounded-md border border-vdm-gold-200 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
              >
                Prec
              </button>
              <div className="text-xs text-vdm-gold-700 capitalize min-w-[120px] text-center">{monthLabel}</div>
              <button
                type="button"
                onClick={goNextMonth}
                className="px-2 py-1 rounded-md border border-vdm-gold-200 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
              >
                Suiv
              </button>
            </div>
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
              const { selected, boundary, existing } = dayStatus(day);
              return (
                <button
                  key={`${day ?? "x"}-${idx}`}
                  type="button"
                  onClick={() => selectDay(day)}
                  disabled={!day}
                  className={`h-9 rounded-md text-sm relative ${
                    day ? "text-vdm-gold-900 hover:bg-vdm-gold-50" : "text-transparent cursor-default"
                  } ${selected ? "bg-vdm-gold-200" : ""} ${boundary ? "ring-1 ring-vdm-gold-700 font-semibold" : ""}`}
                >
                  {day ?? "—"}
                  {existing && day ? (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-red-500" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-vdm-gold-200 ring-1 ring-vdm-gold-700" />
              Période sélectionnée
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Dates déjà bloquées
            </div>
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Motif</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-vdm-gold-200 rounded-md p-2"
            placeholder="Ex : période chargée"
          />
        </div>
        <div className="md:col-span-2">
          <button
            onClick={createBlackout}
            className="px-3 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800"
          >
            Bloquer la période
          </button>
        </div>
      </div>

      <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
        <div className="grid gap-2">
          {items.length === 0 ? (
            <div className="text-sm text-gray-500">Aucune période bloquée.</div>
          ) : (
            items.map((b) => (
              <div
                key={b.id}
                className="border border-vdm-gold-100 rounded-lg bg-white/60 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-vdm-gold-900">{b.title || "Période bloquée"}</div>
                    <div className="text-xs text-vdm-gold-700">
                      {formatDateDMY(b.startDate)} - {formatDateDMY(b.endDate)}
                    </div>
                  </div>
                  <button
                    onClick={() => removeBlackout(b.id)}
                    className="px-2 py-1 rounded-md border border-red-300 text-red-600 text-xs hover:bg-red-50"
                  >
                    Supprimer
                  </button>
                </div>
                <div className="text-xs text-gray-600">
                  {targetLabel(b)}
                </div>
                {b.reason ? (
                  <div className="text-xs text-gray-600">
                    <span className="font-semibold text-vdm-gold-800">Motif :</span> {b.reason}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
