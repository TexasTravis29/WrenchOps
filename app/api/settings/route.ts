import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAccessToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.replace("Bearer ", "").trim();
}

async function getAuthContext(req: Request) {
  const token = getAccessToken(req);
  if (!token) return { error: "Missing authorization token.", status: 401 as const };

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) return { error: "Unauthorized.", status: 401 as const };

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("shop_id, email")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) return { error: "Profile not found.", status: 403 as const };

  const { data: shop, error: shopError } = await adminClient
    .from("shops")
    .select("id, tekmetric_shop_id, shop_name, subscription_status")
    .eq("id", profile.shop_id)
    .single();

  if (shopError || !shop) return { error: "Shop not found.", status: 403 as const };

  return { user, profile, shop, adminClient, authClient };
}

// GET /api/settings — return current profile + shop info
export async function GET(req: Request) {
  const ctx = await getAuthContext(req);
  if ("error" in ctx) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { user, shop } = ctx;

  return Response.json({
    email: user.email,
    shopName: shop.shop_name,
    tekmetricShopId: shop.tekmetric_shop_id,
    subscriptionStatus: shop.subscription_status ?? "free",
  });
}

// PATCH /api/settings — update email, password, tekmetric shop id
export async function PATCH(req: Request) {
  const ctx = await getAuthContext(req);
  if ("error" in ctx) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { user, shop, adminClient } = ctx;

  const body = await req.json();
  const { email, password, tekmetricShopId } = body as {
    email?: string;
    password?: string;
    tekmetricShopId?: number | string;
  };

  const errors: string[] = [];

  // Update email
  if (email && email !== user.email) {
    const newEmail = String(email).trim().toLowerCase();
    const { error } = await adminClient.auth.admin.updateUserById(user.id, { email: newEmail });
    if (error) errors.push(`Email update failed: ${error.message}`);
    else {
      await adminClient.from("profiles").update({ email: newEmail }).eq("user_id", user.id);
    }
  }

  // Update password
  if (password) {
    if (password.length < 6) {
      errors.push("Password must be at least 6 characters.");
    } else {
      const { error } = await adminClient.auth.admin.updateUserById(user.id, { password });
      if (error) errors.push(`Password update failed: ${error.message}`);
    }
  }

  // Update Tekmetric Shop ID
  if (tekmetricShopId !== undefined && tekmetricShopId !== null) {
    const parsed = Number(tekmetricShopId);
    if (Number.isNaN(parsed)) {
      errors.push("Invalid Tekmetric Shop ID.");
    } else if (parsed !== shop.tekmetric_shop_id) {
      // Check if another shop already uses this ID
      const { data: existing } = await adminClient
        .from("shops")
        .select("id")
        .eq("tekmetric_shop_id", parsed)
        .neq("id", shop.id)
        .maybeSingle();

      if (existing) {
        errors.push("That Tekmetric Shop ID is already in use by another account.");
      } else {
        const { error } = await adminClient
          .from("shops")
          .update({ tekmetric_shop_id: parsed })
          .eq("id", shop.id);
        if (error) errors.push(`Shop ID update failed: ${error.message}`);
      }
    }
  }

  if (errors.length > 0) {
    return Response.json({ error: errors.join(" | ") }, { status: 400 });
  }

  return Response.json({ success: true, message: "Settings updated successfully." });
}