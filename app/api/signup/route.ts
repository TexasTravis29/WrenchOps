import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type SignupBody = {
  email?: string;
  password?: string;
  shopName?: string;
  tekmetricShopId?: number | string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SignupBody;

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const shopName = String(body.shopName || "").trim();
    const parsedTekmetricShopId = Number(body.tekmetricShopId);

    if (!email) {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return Response.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    if (!shopName) {
      return Response.json({ error: "Shop name is required." }, { status: 400 });
    }

    if (!parsedTekmetricShopId || Number.isNaN(parsedTekmetricShopId)) {
      return Response.json(
        { error: "A valid Tekmetric Shop ID is required." },
        { status: 400 }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1) Enforce one account per Tekmetric shop
    const { data: existingShop, error: existingShopError } = await admin
      .from("shops")
      .select("id, tekmetric_shop_id")
      .eq("tekmetric_shop_id", parsedTekmetricShopId)
      .maybeSingle();

    if (existingShopError) {
      return Response.json(
        { error: existingShopError.message },
        { status: 500 }
      );
    }

    if (existingShop) {
      return Response.json(
        {
          error:
            "That Tekmetric Shop ID is already connected to an account. Log in instead.",
        },
        { status: 409 }
      );
    }

    // 2) Create auth user
    const { data: createdUserData, error: createUserError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          tekmetric_shop_id: parsedTekmetricShopId,
          shop_name: shopName,
        },
      });

    if (createUserError || !createdUserData.user) {
  return Response.json(
    { error: createUserError?.message || "Failed to create user.", details: JSON.stringify(createUserError) },
    { status: 400 }
  );
}

    const user = createdUserData.user;

    // 3) Create shop row
    const { data: createdShop, error: createShopError } = await admin
      .from("shops")
      .insert([
        {
          shop_name: shopName,
          tekmetric_shop_id: parsedTekmetricShopId,
        },
      ])
      .select("id, tekmetric_shop_id, shop_name")
      .single();

    if (createShopError || !createdShop) {
      // rollback auth user if shop insert fails
      await admin.auth.admin.deleteUser(user.id);

      return Response.json(
        { error: createShopError?.message || "Failed to create shop." },
        { status: 500 }
      );
    }

    // 4) Create profile row
    const { error: createProfileError } = await admin.from("profiles").insert([
      {
        user_id: user.id,
        email,
        shop_id: createdShop.id,
      },
    ]);

    if (createProfileError) {
      // rollback shop + auth user if profile insert fails
      await admin.from("shops").delete().eq("id", createdShop.id);
      await admin.auth.admin.deleteUser(user.id);

      return Response.json(
        { error: createProfileError.message },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: "Account created successfully. You can now log in.",
    });
  } catch (error) {
    console.error("Signup route error:", error);
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
}