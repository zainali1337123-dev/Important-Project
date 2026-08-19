import { NextRequest, NextResponse } from "next/server";
import { signAuthToken, verifyAuthToken, AUTH_COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/auth/cookie-sign";

const MASTER_EMAIL = "zain@gmail.com";
const MASTER_PASSWORD = "zain123ali";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ user: null });
    }

    const payload = await verifyAuthToken(token);
    if (!payload) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: payload.id,
        email: payload.email,
        name: payload.name,
      },
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const providedPassword = String(password).trim();

    if (normalizedEmail !== MASTER_EMAIL || providedPassword !== MASTER_PASSWORD) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const userPayload = {
      id: "usr_zain",
      name: "Zain Ali",
      email: MASTER_EMAIL,
    };

    const token = await signAuthToken(userPayload);

    const response = NextResponse.json({
      success: true,
      user: userPayload,
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: "Internal server error during login" }, { status: 500 });
  }
}
