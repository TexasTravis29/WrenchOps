"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [tekmetricShopId, setTekmetricShopId] = useState("");
  const [shopName, setShopName] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState("free");

  // Derived webhook URL — same for every user
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/tekmetric`
      : "";

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const res = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.status === 401) { router.push("/login"); return; }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setEmail(data.email ?? "");
      setShopName(data.shopName ?? "");
      setTekmetricShopId(String(data.tekmetricShopId ?? ""));
      setSubscriptionStatus(data.subscriptionStatus ?? "free");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to load settings." });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setMessage(null);

    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const payload: Record<string, any> = {};
      if (email) payload.email = email;
      if (newPassword) payload.password = newPassword;
      if (tekmetricShopId) payload.tekmetricShopId = Number(tekmetricShopId);

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setMessage({ type: "success", text: "Settings saved successfully." });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 p-6">
        <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow">
          <p className="text-gray-700">Loading settings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-800">Settings</h1>
          <Link
            href="/"
            className="rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Webhook URL Card */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-1 text-lg font-semibold text-gray-800">
            Tekmetric Webhook URL
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            Paste this URL into your Tekmetric webhook settings.
            Tekmetric - Settings - Integrations - Webhooks

          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {webhookUrl}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Screenshot helper */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
              Where to paste it in Tekmetric:
            </p>
            <img
              src="/tekmetric-webhook-screenshot.png"
              alt="Tekmetric webhook settings location"
              className="rounded border border-gray-200 w-full shadow-sm"
            />
          </div>

        {/* Account Settings Card */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">
            Account Settings
          </h2>

          <div className="space-y-4">
            {/* Email */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* New Password */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Confirm Password */}
            {newPassword && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* Shop Settings Card */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">
            Shop Settings
          </h2>

          <div className="space-y-4">
            {/* Shop Name (read-only for now) */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Shop Name
              </label>
              <input
                type="text"
                value={shopName}
                disabled
                className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-400">Contact support to change shop name.</p>
            </div>

            {/* Tekmetric Shop ID */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Tekmetric Shop ID
              </label>
              <input
                type="number"
                value={tekmetricShopId}
                onChange={(e) => setTekmetricShopId(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                This must match the Shop ID Tekmetric uses in tekmetric URL when logged into tekmetric.
              </p>
            </div>
          </div>
        </div>

        {/* Subscription Card */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-1 text-lg font-semibold text-gray-800">
            Subscription
          </h2>
          <p className="mb-3 text-sm text-gray-500">
            Current subscription level.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-sm">
            <span className="h-2 w-2 rounded-full bg-green-400"></span>
            <span className="font-medium capitalize text-gray-700">
              {subscriptionStatus}
            </span>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

      </div>
    </main>
  );
}