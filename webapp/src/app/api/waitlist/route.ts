import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { fullName, email, company, role } = body;

    if (!fullName || !email) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const { data: existing } = await supabaseAdmin
      .from("waitlist")
      .select("id")
      .eq("email", email)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "You are already on the waitlist." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("waitlist")
      .insert([
        {
          full_name: fullName,
          email,
          company,
          role,
        },
      ]);

    if (error) throw error;

    return NextResponse.json({
      success: true,
    });

  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Failed to join waitlist." },
      { status: 500 }
    );
  }
}
