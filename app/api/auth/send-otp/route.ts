import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function makeOtp(email: string, secret: string) {
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  const hash = crypto
    .createHmac("sha256", secret)
    .update(`${email}:${bucket}`)
    .digest("hex");
  return String(parseInt(hash.slice(0, 6), 16) % 10000).padStart(4, "0");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const otpSecret = process.env.OTP_SECRET;
    const fromEmail =
      process.env.RESEND_FROM_EMAIL || "ABHYQ AI <onboarding@resend.dev>";

    if (!url || !secretKey || !resendKey || !otpSecret) {
      return NextResponse.json(
        { error: "Environment variables are missing." },
        { status: 500 }
      );
    }

    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    const otp = makeOtp(email, otpSecret);

    const mailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: "ABHYQ AI Login OTP",
        html: `<p>Your 4-digit login OTP is: <strong>${otp}</strong></p>`,
      }),
    });

    if (!mailRes.ok) {
      const errData = await mailRes.json().catch(() => ({}));
      const msg = String(errData?.message || "");

      // Local development mein Resend sandbox block kare to Terminal mein OTP de do
      if (process.env.NODE_ENV !== "production" && mailRes.status === 403) {
        console.log(`\n[DEV OTP] ${email} -> ${otp}\n`);
        return NextResponse.json({ ok: true, devFallback: true });
      }

      return NextResponse.json(
        { error: msg || "Failed to send OTP email." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 }
    );
  }
}