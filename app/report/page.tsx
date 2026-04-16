"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type ActionItem = {
  id: string;
  ro: string;
  custom_label: string | null;
  event_text: string | null;
  updated_at: string | null;
  created_at: string | null;
  is_completed: boolean | null;
  is_active: boolean | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  completed_at: string | null;
};

type LabelSummary = {
  label: string;
  avgMinutes: number;
  totalMinutes: number;
  count: number;
};

type RoSummary = {
  ro: string;
  label: string;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
};

export default function ReportPage() {
  const [rows, setRows] = useState<ActionItem[]>([]);
  const [view, setView] = useState<"ro" | "label">("ro");

  useEffect(() => {
    fetchRows();
  }, []);

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("action_items")
      .select("*")
      .not("duration_minutes", "is", null)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching report rows:", error);
      return;
    }

    setRows(data || []);
  };

  const roRows: RoSummary[] = useMemo(() => {
    return rows.map((row) => ({
      ro: row.ro,
      label: row.custom_label || "No Label",
      started_at: row.started_at,
      ended_at: row.ended_at,
      duration_minutes: row.duration_minutes,
    }));
  }, [rows]);

  const labelRows: LabelSummary[] = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();

    for (const row of rows) {
      const label = row.custom_label || "No Label";
      const minutes = row.duration_minutes || 0;

      const current = map.get(label) || { total: 0, count: 0 };
      current.total += minutes;
      current.count += 1;
      map.set(label, current);
    }

    return Array.from(map.entries())
      .map(([label, value]) => ({
        label,
        totalMinutes: Math.round(value.total),
        count: value.count,
        avgMinutes: Math.round(value.total / value.count),
      }))
      .sort((a, b) => b.avgMinutes - a.avgMinutes);
  }, [rows]);

  const maxAvg = Math.max(...labelRows.map((r) => r.avgMinutes), 1);

  const exportCsv = () => {
    const headers = ["RO", "Label", "Started At", "Ended At", "Duration Minutes"];
    const csvRows = [
      headers.join(","),
      ...roRows.map((row) =>
        [
          row.ro,
          `"${row.label}"`,
          row.started_at || "",
          row.ended_at || "",
          row.duration_minutes ?? "",
        ].join(",")
      ),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "tekmetric-label-report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold text-gray-800">Reports</h1>

        <div className="flex gap-3">
          <Link
            href="/"
            className="rounded bg-slate-700 px-4 py-2 text-white hover:bg-slate-800"
          >
            Back to Dashboard
          </Link>

          <button
            onClick={exportCsv}
            className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-3">
        <button
          onClick={() => setView("ro")}
          className={`rounded px-4 py-2 text-white ${
            view === "ro" ? "bg-blue-500" : "bg-blue-300"
          }`}
        >
          By RO
        </button>

        <button
          onClick={() => setView("label")}
          className={`rounded px-4 py-2 text-white ${
            view === "label" ? "bg-gray-600" : "bg-gray-400"
          }`}
        >
          By Label
        </button>
      </div>

      {view === "ro" ? (
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="px-4 py-3">RO</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Ended</th>
                <th className="px-4 py-3">Minutes</th>
              </tr>
            </thead>
            <tbody>
              {roRows.map((row, index) => (
                <tr key={`${row.ro}-${row.label}-${index}`} className="border-t">
                  <td className="px-4 py-3">{row.ro}</td>
                  <td className="px-4 py-3">{row.label}</td>
                  <td className="px-4 py-3">
                    {row.started_at
                      ? new Date(row.started_at).toLocaleString()
                      : ""}
                  </td>
                  <td className="px-4 py-3">
                    {row.ended_at ? new Date(row.ended_at).toLocaleString() : ""}
                  </td>
                  <td className="px-4 py-3">{row.duration_minutes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-lg bg-white shadow">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Count</th>
                  <th className="px-4 py-3">Total Minutes</th>
                  <th className="px-4 py-3">Avg Minutes</th>
                </tr>
              </thead>
              <tbody>
                {labelRows.map((row) => (
                  <tr key={row.label} className="border-t">
                    <td className="px-4 py-3">{row.label}</td>
                    <td className="px-4 py-3">{row.count}</td>
                    <td className="px-4 py-3">{row.totalMinutes}</td>
                    <td className="px-4 py-3">{row.avgMinutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-2xl font-bold text-gray-800">
              Average Time by Label
            </h2>

            <div className="space-y-4">
              {labelRows.map((row) => {
                const widthPercent = (row.avgMinutes / maxAvg) * 100;

                return (
                  <div key={row.label}>
                    <div className="mb-1 flex justify-between text-sm text-gray-700">
                      <span>{row.label}</span>
                      <span>{row.avgMinutes} min</span>
                    </div>
                    <div className="h-6 w-full rounded bg-gray-200">
                      <div
                        className="h-6 rounded bg-blue-500"
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}