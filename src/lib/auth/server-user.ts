// Authentication helpers — server-side
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuthToken, AUTH_COOKIE_NAME } from "./cookie-sign";

export async function requireUser(): Promise<
  | { ok: true; user: { id: string; name: string; email: string } }
  | { ok: false; response: NextResponse }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    const payload = await verifyAuthToken(token);
    if (payload && payload.email) {
      return {
        ok: true,
        user: { id: payload.id, name: payload.name, email: payload.email },
      };
    }
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
  };
}

export async function requireAdmin() {
  return requireUser();
}
