import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function makeOtp(email: string, secret: string, offset: number) {
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000)) + offset;
  const hash = crypto
    .createHmac("sha256", secret)
    .update(`${email}:${bucket}`)
    .digest("hex");
  return String(parseInt(hash.slice(0, 6), 16) % 10000).padStart(4, "0");
}

function checkOtp(email: string, otp: string, secret: string) {
  if (!/^\d{4}$/.test(otp)) return false;
  return [-1, 0, 1].some((offset) => makeOtp(email, secret, offset) === otp);
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "verify-otp" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const otp = String(body?.otp || "").trim();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    const otpSecret = process.env.OTP_SECRET;

    if (!url || !secretKey || !otpSecret) {
      return NextResponse.json(
        { error: "Environment variables are missing." },
        { status: 500 }
      );
    }

    if (!checkOtp(email, otp, otpSecret)) {
      return NextResponse.json(
        { error: "Invalid or expired OTP." },
        { status: 400 }
      );
    }

    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    const emailOtp = data?.properties?.email_otp;
    const hashedToken = data?.properties?.hashed_token;

    if (error || (!emailOtp && !hashedToken)) {
      return NextResponse.json(
        { error: error?.message || "Failed to generate session token." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, email, emailOtp, hashedToken });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 }
    );
  }
}