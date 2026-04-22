"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  shop_id: number | null;
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

type LabelSortKey = "label" | "count" | "totalMinutes" | "avgMinutes";
type LabelSortDirection = "asc" | "desc";
type RoSortKey = "ro" | "label" | "started_at" | "ended_at" | "duration_minutes";

const MAX_REASONABLE_MINUTES = 60 * 24 * 30; // 30 days

const normalizeLabel = (label: string | null | undefined) => {
  const cleaned = (label || "No Label").trim().replace(/\s+/g, " ");
  if (cleaned === "R.A.C.E Inspection") return "R.A.C.E. Inspection";
  return cleaned || "No Label";
};

const isValidDuration = (minutes: number | null | undefined) => {
  return (
    minutes !== null &&
    minutes !== undefined &&
    Number.isFinite(minutes) &&
    minutes >= 0 &&
    minutes <= MAX_REASONABLE_MINUTES
  );
};

const toDateInputValue = (date: Date) => {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().slice(0, 10);
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const parseDateInputRange = (value: string, mode: "start" | "end") => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return mode === "start" ? startOfDay(parsed) : endOfDay(parsed);
};

const formatMinutes = (minutes: number) => {
  return Math.round(minutes).toLocaleString();
};

export default function ReportPage() {
  const router = useRouter();

  const [rows, setRows] = useState<ActionItem[]>([]);
  const [view, setView] = useState<"ro" | "label">("ro");

  const [roSearch, setRoSearch] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [labelSortKey, setLabelSortKey] = useState<LabelSortKey>("avgMinutes");
  const [labelSortDirection, setLabelSortDirection] = useState<LabelSortDirection>("desc");

  const [roSortKey, setRoSortKey] = useState<RoSortKey>("started_at");
  const [roSortDirection, setRoSortDirection] = useState<LabelSortDirection>("desc");

  const [pageLoading, setPageLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [shopName, setShopName] = useState("");
  const [tekmetricShopId, setTekmetricShopId] = useState<number | null>(null);

  useEffect(() => {
    loadReportPage();
  }, []);

  const loadReportPage = async () => {
    try {
      setPageLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email || "");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("shop_id, email")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profile) {
        console.error("Profile lookup failed:", profileError);
        router.push("/login");
        return;
      }

      const { data: shop, error: shopError } = await supabase
        .from("shops")
        .select("id, tekmetric_shop_id, shop_name")
        .eq("id", profile.shop_id)
        .single();

      if (shopError || !shop) {
        console.error("Shop lookup failed:", shopError);
        router.push("/login");
        return;
      }

      setShopName(shop.shop_name || "");
      setTekmetricShopId(shop.tekmetric_shop_id);

      const { data: actionData, error: actionError } = await supabase
        .from("action_items")
        .select("*")
        .eq("shop_id", shop.tekmetric_shop_id)
        .order("updated_at", { ascending: false });

      if (actionError) {
        console.error("Error fetching report rows:", actionError);
        return;
      }

      setRows(actionData || []);
    } catch (error) {
      console.error("Error loading report rows:", error);
    } finally {
      setPageLoading(false);
    }
  };

  const fetchRows = async () => {
    try {
      if (!tekmetricShopId) return;

      const { data, error } = await supabase
        .from("action_items")
        .select("*")
        .eq("shop_id", tekmetricShopId)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching report rows:", error);
        return;
      }

      setRows(data || []);
    } catch (error) {
      console.error("Error fetching report rows:", error);
    }
  };

  const validRows = useMemo(() => {
    return rows.filter((row) => {
      if (!isValidDuration(row.duration_minutes)) return false;
      if (!row.started_at) return false;
      const started = new Date(row.started_at);
      return !Number.isNaN(started.getTime());
    });
  }, [rows]);

  const allLabels = useMemo(() => {
    return Array.from(
      new Set(validRows.map((row) => normalizeLabel(row.custom_label)))
    ).sort((a, b) => a.localeCompare(b));
  }, [validRows]);

  const filteredRows = useMemo(() => {
    const search = roSearch.trim().toLowerCase();
    const parsedStart = parseDateInputRange(startDate, "start");
    const parsedEnd = parseDateInputRange(endDate, "end");

    return validRows.filter((row) => {
      const label = normalizeLabel(row.custom_label);
      const startedAt = row.started_at ? new Date(row.started_at) : null;

      if (!startedAt || Number.isNaN(startedAt.getTime())) return false;
      if (search && !String(row.ro || "").toLowerCase().includes(search)) return false;
      if (selectedLabel !== "all" && label !== selectedLabel) return false;
      if (parsedStart && startedAt < parsedStart) return false;
      if (parsedEnd && startedAt > parsedEnd) return false;

      return true;
    });
  }, [validRows, roSearch, selectedLabel, startDate, endDate]);

  const previousPeriodRows = useMemo(() => {
    if (!startDate || !endDate) return [];

    const currentStart = parseDateInputRange(startDate, "start");
    const currentEnd = parseDateInputRange(endDate, "end");

    if (!currentStart || !currentEnd) return [];

    const currentDurationMs = currentEnd.getTime() - currentStart.getTime();
    if (currentDurationMs < 0) return [];

    const previousEnd = new Date(currentStart.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - currentDurationMs);

    return validRows.filter((row) => {
      const label = normalizeLabel(row.custom_label);
      const startedAt = row.started_at ? new Date(row.started_at) : null;

      if (!startedAt || Number.isNaN(startedAt.getTime())) return false;

      if (roSearch.trim()) {
        const search = roSearch.trim().toLowerCase();
        if (!String(row.ro || "").toLowerCase().includes(search)) return false;
      }

      if (selectedLabel !== "all" && label !== selectedLabel) return false;

      return startedAt >= previousStart && startedAt <= previousEnd;
    });
  }, [validRows, startDate, endDate, roSearch, selectedLabel]);

  const roRows: RoSummary[] = useMemo(() => {
    const mapped = filteredRows.map((row) => ({
      ro: row.ro,
      label: normalizeLabel(row.custom_label),
      started_at: row.started_at,
      ended_at: row.ended_at,
      duration_minutes: row.duration_minutes,
    }));

    mapped.sort((a, b) => {
      let comparison = 0;
      switch (roSortKey) {
        case "ro":
          comparison = String(a.ro).localeCompare(String(b.ro), undefined, { numeric: true });
          break;
        case "label":
          comparison = a.label.localeCompare(b.label);
          break;
        case "started_at":
          comparison = (a.started_at ?? "").localeCompare(b.started_at ?? "");
          break;
        case "ended_at":
          comparison = (a.ended_at ?? "").localeCompare(b.ended_at ?? "");
          break;
        case "duration_minutes":
          comparison = (a.duration_minutes ?? -1) - (b.duration_minutes ?? -1);
          break;
      }
      return roSortDirection === "asc" ? comparison : -comparison;
    });

    return mapped;
  }, [filteredRows, roSortKey, roSortDirection]);

  const labelRowsBase: LabelSummary[] = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();

    for (const row of filteredRows) {
      const label = normalizeLabel(row.custom_label);
      const minutes = row.duration_minutes;

      if (!isValidDuration(minutes)) continue;

      const safeMinutes = minutes ?? 0;
      const current = map.get(label) || { total: 0, count: 0 };
      current.total += safeMinutes;
      current.count += 1;
      map.set(label, current);
    }

    return Array.from(map.entries()).map(([label, value]) => ({
      label,
      totalMinutes: Math.round(value.total),
      count: value.count,
      avgMinutes: Math.round(value.total / value.count),
    }));
  }, [filteredRows]);

  const labelRows = useMemo(() => {
    const sorted = [...labelRowsBase];

    sorted.sort((a, b) => {
      let comparison = 0;
      switch (labelSortKey) {
        case "label":
          comparison = a.label.localeCompare(b.label);
          break;
        case "count":
          comparison = a.count - b.count;
          break;
        case "totalMinutes":
          comparison = a.totalMinutes - b.totalMinutes;
          break;
        case "avgMinutes":
          comparison = a.avgMinutes - b.avgMinutes;
          break;
      }
      return labelSortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [labelRowsBase, labelSortKey, labelSortDirection]);

  const maxAvg = Math.max(...labelRows.map((r) => r.avgMinutes), 1);

  const currentAverageMinutes = useMemo(() => {
    if (!filteredRows.length) return 0;
    const total = filteredRows.reduce((sum, row) => sum + (row.duration_minutes || 0), 0);
    return Math.round(total / filteredRows.length);
  }, [filteredRows]);

  const previousAverageMinutes = useMemo(() => {
    if (!previousPeriodRows.length) return 0;
    const total = previousPeriodRows.reduce((sum, row) => sum + (row.duration_minutes || 0), 0);
    return Math.round(total / previousPeriodRows.length);
  }, [previousPeriodRows]);

  const comparisonText = useMemo(() => {
    if (!startDate || !endDate || !filteredRows.length || !previousPeriodRows.length) return null;

    const diff = currentAverageMinutes - previousAverageMinutes;
    const absDiff = Math.abs(diff);

    if (diff === 0) return `Average time is unchanged versus the previous period (${currentAverageMinutes} min).`;
    if (diff < 0) return `Average time improved by ${absDiff} min versus the previous period (${previousAverageMinutes} → ${currentAverageMinutes}).`;
    return `Average time increased by ${absDiff} min versus the previous period (${previousAverageMinutes} → ${currentAverageMinutes}).`;
  }, [startDate, endDate, filteredRows.length, previousPeriodRows.length, currentAverageMinutes, previousAverageMinutes]);

  const exportCsv = () => {
    if (view === "ro") {
      const headers = ["RO", "Label", "Started At", "Ended At", "Duration Minutes"];
      const csvRows = [
        headers.join(","),
        ...roRows.map((row) =>
          [
            row.ro,
            `"${row.label.replace(/"/g, '""')}"`,
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
      link.setAttribute("download", "tekmetric-report-by-ro.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    const headers = ["Label", "Count", "Total Minutes", "Avg Minutes"];
    const csvRows = [
      headers.join(","),
      ...labelRows.map((row) =>
        [`"${row.label.replace(/"/g, '""')}"`, row.count, row.totalMinutes, row.avgMinutes].join(",")
      ),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "tekmetric-report-by-label.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const applyPreset = (preset: "today" | "yesterday" | "last7" | "last30" | "thisMonth") => {
    const now = new Date();

    if (preset === "today") {
      const today = toDateInputValue(now);
      setStartDate(today);
      setEndDate(today);
      return;
    }
    if (preset === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const value = toDateInputValue(yesterday);
      setStartDate(value);
      setEndDate(value);
      return;
    }
    if (preset === "last7") {
      const end = toDateInputValue(now);
      const start = new Date();
      start.setDate(start.getDate() - 6);
      setStartDate(toDateInputValue(start));
      setEndDate(end);
      return;
    }
    if (preset === "last30") {
      const end = toDateInputValue(now);
      const start = new Date();
      start.setDate(start.getDate() - 29);
      setStartDate(toDateInputValue(start));
      setEndDate(end);
      return;
    }
    if (preset === "thisMonth") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toDateInputValue(firstDay));
      setEndDate(toDateInputValue(now));
    }
  };

  const clearFilters = () => {
    setRoSearch("");
    setSelectedLabel("all");
    setStartDate("");
    setEndDate("");
  };

  const handleLabelSort = (key: LabelSortKey) => {
    if (labelSortKey === key) {
      setLabelSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setLabelSortKey(key);
    setLabelSortDirection(key === "label" ? "asc" : "desc");
  };

  const handleRoSort = (key: RoSortKey) => {
    if (roSortKey === key) {
      setRoSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setRoSortKey(key);
    setRoSortDirection(key === "ro" || key === "label" ? "asc" : "desc");
  };

  const sortIndicator = (key: LabelSortKey) => {
    if (labelSortKey !== key) return "";
    return labelSortDirection === "asc" ? " ▲" : " ▼";
  };

  const roSortIndicator = (key: RoSortKey) => {
    if (roSortKey !== key) return "";
    return roSortDirection === "asc" ? " ▲" : " ▼";
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (pageLoading) {
    return (
      <main className="min-h-screen bg-gray-100 p-6">
        <div className="mx-auto max-w-7xl rounded-lg bg-white p-6 shadow">
          <p className="text-gray-700">Loading reports...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-gray-800">Reports</h1>
          <div className="mt-2 text-sm text-gray-600">
            <div>Shop: {shopName || "Unknown Shop"}</div>
            <div>User: {userEmail}</div>
            <div>Tekmetric Shop ID: {tekmetricShopId ?? "Unknown"}</div>
          </div>
        </div>

        <div className="flex gap-3">
          <Link href="/" className="rounded bg-slate-700 px-4 py-2 text-white hover:bg-slate-800">
            Back to Dashboard
          </Link>
          <button onClick={exportCsv} className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700">
            Export CSV
          </button>
          <Link href="/settings" className="round bg-slate-700 px-4 py-2 text-white hover:bg-slate-800">
            Settings
          </Link>
          <button onClick={handleLogout} className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-800">
            Logout
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-lg bg-white p-4 shadow">
        <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-800">RO Search</label>
            <input
              type="text"
              value={roSearch}
              onChange={(e) => setRoSearch(e.target.value)}
              placeholder="Search RO"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-800">Label</label>
            <select
              value={selectedLabel}
              onChange={(e) => setSelectedLabel(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
            >
              <option value="all">All Labels</option>
              {allLabels.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-800">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-800">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => applyPreset("today")} className="rounded bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">Today</button>
          <button onClick={() => applyPreset("yesterday")} className="rounded bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">Yesterday</button>
          <button onClick={() => applyPreset("last7")} className="rounded bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">Last 7 Days</button>
          <button onClick={() => applyPreset("last30")} className="rounded bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">Last 30 Days</button>
          <button onClick={() => applyPreset("thisMonth")} className="rounded bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">This Month</button>
          <button onClick={clearFilters} className="rounded bg-gray-500 px-3 py-2 text-sm font-medium text-white hover:bg-gray-600">Clear Filters</button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm text-gray-600">Filtered Rows</p>
            <p className="text-2xl font-bold text-gray-900">{filteredRows.length}</p>
          </div>
          <div className="rounded border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm text-gray-600">Current Avg Minutes</p>
            <p className="text-2xl font-bold text-gray-900">{formatMinutes(currentAverageMinutes)}</p>
          </div>
          <div className="rounded border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm text-gray-600">Previous Period Avg</p>
            <p className="text-2xl font-bold text-gray-900">
              {previousPeriodRows.length ? formatMinutes(previousAverageMinutes) : "—"}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm text-gray-700">
            Showing <span className="font-semibold">{filteredRows.length}</span> filtered valid tracked rows out of{" "}
            <span className="font-semibold">{validRows.length}</span> valid rows and{" "}
            <span className="font-semibold">{rows.length}</span> total rows.
          </p>
          {comparisonText && (
            <p className="mt-2 text-sm font-medium text-gray-800">{comparisonText}</p>
          )}
        </div>
      </div>

      <div className="mb-6 flex gap-3">
        <button
          onClick={() => setView("ro")}
          className={`rounded px-4 py-2 text-white ${view === "ro" ? "bg-blue-500" : "bg-blue-300"}`}
        >
          By RO
        </button>
        <button
          onClick={() => setView("label")}
          className={`rounded px-4 py-2 text-white ${view === "label" ? "bg-gray-600" : "bg-gray-400"}`}
        >
          By Label
        </button>
      </div>

      {view === "ro" ? (
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="min-w-full text-sm text-gray-900">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">
                  <button onClick={() => handleRoSort("ro")} className="font-semibold text-gray-900 hover:text-blue-600">
                    RO{roSortIndicator("ro")}
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button onClick={() => handleRoSort("label")} className="font-semibold text-gray-900 hover:text-blue-600">
                    Label{roSortIndicator("label")}
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button onClick={() => handleRoSort("started_at")} className="font-semibold text-gray-900 hover:text-blue-600">
                    Started{roSortIndicator("started_at")}
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button onClick={() => handleRoSort("ended_at")} className="font-semibold text-gray-900 hover:text-blue-600">
                    Ended{roSortIndicator("ended_at")}
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <button onClick={() => handleRoSort("duration_minutes")} className="font-semibold text-gray-900 hover:text-blue-600">
                    Minutes{roSortIndicator("duration_minutes")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {roRows.map((row, index) => (
                <tr key={`${row.ro}-${row.label}-${index}`} className="border-t">
                  <td className="px-4 py-3">{row.ro}</td>
                  <td className="px-4 py-3">{row.label}</td>
                  <td className="px-4 py-3">
                    {row.started_at ? new Date(row.started_at).toLocaleString() : ""}
                  </td>
                  <td className="px-4 py-3">
                    {row.ended_at ? new Date(row.ended_at).toLocaleString() : ""}
                  </td>
                  <td className="px-4 py-3">{row.duration_minutes ?? ""}</td>
                </tr>
              ))}
              {!roRows.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    No rows match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-lg bg-white shadow">
            <table className="min-w-full text-sm text-gray-900">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">
                    <button onClick={() => handleLabelSort("label")} className="font-semibold text-gray-900 hover:text-blue-600">
                      Label{sortIndicator("label")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button onClick={() => handleLabelSort("count")} className="font-semibold text-gray-900 hover:text-blue-600">
                      Count{sortIndicator("count")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button onClick={() => handleLabelSort("totalMinutes")} className="font-semibold text-gray-900 hover:text-blue-600">
                      Total Minutes{sortIndicator("totalMinutes")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button onClick={() => handleLabelSort("avgMinutes")} className="font-semibold text-gray-900 hover:text-blue-600">
                      Avg Minutes{sortIndicator("avgMinutes")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {labelRows.map((row) => (
                  <tr key={row.label} className="border-t">
                    <td className="px-4 py-3">{row.label}</td>
                    <td className="px-4 py-3">{row.count}</td>
                    <td className="px-4 py-3">{formatMinutes(row.totalMinutes)}</td>
                    <td className="px-4 py-3">{formatMinutes(row.avgMinutes)}</td>
                  </tr>
                ))}
                {!labelRows.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                      No rows match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-2xl font-bold text-gray-800">Average Time by Label</h2>
            <div className="space-y-4">
              {labelRows.map((row) => {
                const widthPercent = maxAvg > 0 ? (row.avgMinutes / maxAvg) * 100 : 0;
                return (
                  <div key={row.label}>
                    <div className="mb-1 flex justify-between text-sm font-medium text-gray-900">
                      <span>{row.label}</span>
                      <span>{formatMinutes(row.avgMinutes)} min</span>
                    </div>
                    <div className="h-6 w-full rounded bg-gray-200">
                      <div className="h-6 rounded bg-blue-500" style={{ width: `${widthPercent}%` }} />
                    </div>
                  </div>
                );
              })}
              {!labelRows.length && (
                <p className="text-sm text-gray-500">No label data available for the current filters.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}