import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    // Simple admin token protection to secure database signups
    const expectedPasscode = process.env.ADMIN_PASSCODE;
    if (!expectedPasscode || !token || token !== expectedPasscode) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("waitlist")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      waitlist: data || []
    });

  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch waitlist signups." },
      { status: 500 }
    );
  }
}
