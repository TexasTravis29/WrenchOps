import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    console.log("Tekmetric webhook received:");
    console.log(JSON.stringify(body, null, 2));

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const data = body.data || {};

    // ✅ Clean extraction
    const roNumber = data.repairOrderNumber?.toString() || "N/A";
    const customLabel =
      data.repairOrderCustomLabel?.name || "No Label";
    const eventText = body.event || "No Event";
    const updatedAt = data.updatedDate || new Date().toISOString();

    const { error } = await supabase.from("action_items").insert([
      {
        ro: roNumber,
        event_text: eventText,
        custom_label: customLabel,
        updated_at: updatedAt,
        action_type: "label_update",
        event_received_at: new Date().toISOString(),
        raw_payload: body,
      },
    ]);

    if (error) {
      console.error("Insert error:", error);
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);

    return Response.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}
