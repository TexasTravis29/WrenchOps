import { createClient } from "@supabase/supabase-js";

const EXCLUDED_LABELS = ["Vehicle Not Here", "Appointment", "Ready to Post"];

type TekmetricWebhookBody = {
  event?: string;
  data?: {
    repairOrderNumber?: string | number | null;
    repairOrderCustomLabel?: {
      name?: string | null;
    } | null;
    updatedDate?: string | null;
  } | null;
};

const normalizeLabel = (label: string | null | undefined) => {
  const cleaned = (label || "No Label").trim().replace(/\s+/g, " ");

  if (cleaned === "R.A.C.E Inspection") return "R.A.C.E. Inspection";

  return cleaned || "No Label";
};

/**
 * Parse the top-level updatedDate from the Tekmetric payload.
 * This is the closest timestamp we have to when the label actually changed,
 * since the label change is what triggers the RO's updatedDate to update.
 * Always returned as a UTC ISO string. Falls back to server receipt time
 * if the field is missing or unparseable.
 */
const parseTekmetricTime = (
  updatedDate: string | null | undefined,
  fallback: string
): string => {
  if (!updatedDate) return fallback;

  const parsed = new Date(updatedDate);
  if (!Number.isFinite(parsed.getTime())) return fallback;

  // Tekmetric sends dates with a Z suffix (UTC) — preserve that
  return parsed.toISOString();
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TekmetricWebhookBody;

    console.log("Tekmetric webhook received:");
    console.log(JSON.stringify(body, null, 2));

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const data = body.data || {};

    const roNumber = data.repairOrderNumber?.toString() || "N/A";
    const customLabel = normalizeLabel(data.repairOrderCustomLabel?.name);
    const eventText = body.event || "No Event";

    // Server receipt time — only used for event_received_at (audit trail)
    const serverReceivedAt = new Date().toISOString();

    // Top-level updatedDate from Tekmetric — used for all label timing.
    // The label change itself is what causes the RO's updatedDate to update,
    // so this is the best available timestamp for when the label changed.
    const labelChangedAt = parseTekmetricTime(
      data.updatedDate,
      serverReceivedAt
    );

    if (roNumber === "N/A") {
      return Response.json(
        { ok: false, error: "Missing RO number" },
        { status: 400 }
      );
    }

    const { data: activeRows, error: fetchError } = await supabase
      .from("action_items")
      .select("id, started_at, custom_label")
      .eq("ro", roNumber)
      .eq("is_active", true)
      .order("started_at", { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error("Fetch active row error:", fetchError);
      return Response.json(
        { ok: false, error: fetchError.message },
        { status: 500 }
      );
    }

    const activeRow = activeRows?.[0];
    const activeLabel = normalizeLabel(activeRow?.custom_label);

    // Ignore duplicate webhook if same label is already active
    if (activeRow && activeLabel === customLabel) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: "Same label already active",
      });
    }

    // Close prior active label for this RO
    if (activeRow) {
      let durationMinutes: number | null = null;

      if (activeRow.started_at) {
        const startedMs = new Date(activeRow.started_at).getTime();
        const endedMs = new Date(labelChangedAt).getTime();

        if (Number.isFinite(startedMs) && Number.isFinite(endedMs)) {
          const diffMinutes = Math.round((endedMs - startedMs) / 1000 / 60);

          if (diffMinutes < 0) {
            // Out-of-order webhook — store null rather than a negative duration
            console.error("Negative duration detected — out-of-order webhook", {
              ro: roNumber,
              activeLabel,
              started_at: activeRow.started_at,
              ended_at: labelChangedAt,
              computed_minutes: diffMinutes,
            });
            durationMinutes = null;
          } else if (diffMinutes > 60 * 24 * 30) {
            // Unreasonably long — likely corrupted timestamps
            console.error("Duration exceeds 30 days — likely bad timestamps", {
              ro: roNumber,
              activeLabel,
              started_at: activeRow.started_at,
              ended_at: labelChangedAt,
              computed_minutes: diffMinutes,
            });
            durationMinutes = null;
          } else {
            durationMinutes = diffMinutes;
          }
        } else {
          console.error("Invalid date detected while closing active row", {
            ro: roNumber,
            activeLabel,
            started_at: activeRow.started_at,
            ended_at: labelChangedAt,
          });
        }
      }

      const { error: closeError } = await supabase
        .from("action_items")
        .update({
          ended_at: labelChangedAt,
          updated_at: labelChangedAt,
          duration_minutes: durationMinutes,
          is_active: false,
          is_completed: true,
          completed_at: labelChangedAt,
        })
        .eq("id", activeRow.id);

      if (closeError) {
        console.error("Close active row error:", closeError);
        return Response.json(
          { ok: false, error: closeError.message },
          { status: 500 }
        );
      }
    }

    // Stop tracking if this label should not be tracked
    if (EXCLUDED_LABELS.includes(customLabel)) {
      return Response.json({
        ok: true,
        ignored: true,
        reason: `Tracking stopped at label: ${customLabel}`,
      });
    }

    // Start new active label row
    const { error: insertError } = await supabase.from("action_items").insert([
      {
        ro: roNumber,
        event_text: eventText,
        custom_label: customLabel,
        updated_at: labelChangedAt,
        started_at: labelChangedAt,
        ended_at: null,
        duration_minutes: null,
        is_active: true,
        is_completed: false,
        completed_at: null,
        action_type: "label_update",
        event_received_at: serverReceivedAt,  // audit trail — always server time
        raw_payload: body,
        shop_id: (body as any)?.data?.shopId ?? null,
      },
    ]);

    if (insertError) {
      console.error("Insert error:", insertError);
      return Response.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      ro: roNumber,
      label: customLabel,
      label_changed_at: labelChangedAt,
      server_received_at: serverReceivedAt,
    });
  } catch (error) {
    console.error("Webhook error:", error);

    return Response.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}