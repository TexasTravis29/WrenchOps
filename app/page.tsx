"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

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

export default function Home() {
  const router = useRouter();

  const [actions, setActions] = useState<ActionItem[]>([]);
  const [filter, setFilter] = useState<"pending" | "completed">("pending");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [shopName, setShopName] = useState("");
  const [tekmetricShopId, setTekmetricShopId] = useState<number | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
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
        .select("shop_id")
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

      await fetchActions(shop.tekmetric_shop_id);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setPageLoading(false);
    }
  };

  const fetchActions = async (shopId?: number | null) => {
    const idToUse = shopId ?? tekmetricShopId;
    if (!idToUse) return;

    try {
      const { data, error } = await supabase
        .from("action_items")
        .select("*")
        .eq("shop_id", idToUse)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching actions:", error);
        return;
      }

      setActions(data || []);
    } catch (error) {
      console.error("Error fetching actions:", error);
    }
  };

  const markDone = async (item: ActionItem) => {
    const now = new Date();

    try {
      const { error } = await supabase
        .from("action_items")
        .update({
          is_completed: true,
          is_active: false,
          completed_at: now.toISOString(),
        })
        .eq("id", item.id)
        .eq("shop_id", tekmetricShopId);

      if (error) {
        console.error("Error marking action complete:", error);
        return;
      }

      fetchActions();
    } catch (error) {
      console.error("Error marking action complete:", error);
    }
  };

  const markPending = async (id: string) => {
    try {
      const { error } = await supabase
        .from("action_items")
        .update({
          is_completed: false,
          completed_at: null,
        })
        .eq("id", id)
        .eq("shop_id", tekmetricShopId);

      if (error) {
        console.error("Error marking action pending:", error);
        return;
      }

      fetchActions();
    } catch (error) {
      console.error("Error marking action pending:", error);
    }
  };

  const clearAll = async () => {
    const pendingItems = actions.filter((a) => !a.is_completed);
    if (pendingItems.length === 0) return;

    setLoading(true);

    try {
      const now = new Date();

      for (const item of pendingItems) {
        const { error } = await supabase
          .from("action_items")
          .update({
            is_completed: true,
            is_active: false,
            completed_at: now.toISOString(),
          })
          .eq("id", item.id)
          .eq("shop_id", tekmetricShopId);

        if (error) {
          console.error("Error clearing item:", error);
        }
      }

      fetchActions();
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const filteredActions = actions.filter((action) =>
    filter === "pending" ? !action.is_completed : Boolean(action.is_completed)
  );

  if (pageLoading) {
    return (
      <main className="min-h-screen bg-gray-100 p-6">
        <div className="mx-auto max-w-5xl rounded-lg bg-white p-6 shadow">
          <p className="text-gray-700">Loading dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <img
            src="/WrenchOps_Logo.png"
            alt="WrenchOps"
            className="h-20 w-auto"
          />
          <p className="mt-1 text-sm font-medium text-gray-500 uppercase tracking-widest">
            Shop Activity Dashboard
          </p>
          <div className="mt-2 text-sm text-gray-600">
            <div>Shop: {shopName || "Unknown Shop"}</div>
            <div>User: {userEmail}</div>
            <div>Tekmetric Shop ID: {tekmetricShopId ?? "Unknown"}</div>
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            href="/report"
            className="rounded bg-slate-700 px-4 py-2 text-white hover:bg-slate-800"
          >
            Reports
          </Link>

          <Link
            href="/settings"
            className="rounded bg-slate-700 px-4 py-2 text-white hover:bg-slate-800"
          >
            Settings
          </Link>

          <button
            onClick={clearAll}
            disabled={loading}
            className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-50"
          >
            {loading ? "Clearing..." : "Clear All"}
          </button>

          <button
            onClick={handleLogout}
            className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-800"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-3">
        <button
          onClick={() => setFilter("pending")}
          className={`rounded px-4 py-2 text-white ${
            filter === "pending" ? "bg-blue-500" : "bg-blue-300"
          }`}
        >
          Pending
        </button>

        <button
          onClick={() => setFilter("completed")}
          className={`rounded px-4 py-2 text-white ${
            filter === "completed" ? "bg-gray-500" : "bg-gray-300"
          }`}
        >
          Completed
        </button>
      </div>

      <div className="space-y-4">
        {filteredActions.map((action) => (
          <div
            key={action.id}
            className="flex items-start justify-between rounded-lg bg-white p-4 shadow"
          >
            <div>
              <div className="text-lg font-semibold text-gray-800">
                RO #{action.ro}
              </div>

              <div className="mt-1 text-sm text-blue-600">
                {action.custom_label || "No Label"}
              </div>

              <div className="mt-2 text-sm text-gray-700">
                {action.event_text || "No Event Text"}
              </div>

              <div className="mt-2 text-xs text-gray-500">
                Updated:{" "}
                {action.updated_at
                  ? new Date(action.updated_at).toLocaleString()
                  : "No Updated Date"}
              </div>

              {action.duration_minutes !== null && (
                <div className="mt-1 text-xs text-emerald-600">
                  Minutes in label: {action.duration_minutes}
                </div>
              )}

              {action.completed_at && (
                <div className="mt-1 text-xs text-gray-500">
                  Completed: {new Date(action.completed_at).toLocaleString()}
                </div>
              )}
            </div>

            {!action.is_completed ? (
              <button
                onClick={() => markDone(action)}
                className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
              >
                Done
              </button>
            ) : (
              <button
                onClick={() => markPending(action.id)}
                className="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
              >
                Reopen
              </button>
            )}
          </div>
        ))}

        {!filteredActions.length && (
          <div className="rounded-lg bg-white p-6 text-center text-gray-500 shadow">
            No action items found for this shop.
          </div>
        )}
      </div>
    </main>
  );
}