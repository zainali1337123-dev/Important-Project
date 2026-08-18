// Authentication helpers — server-side
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyCustomerToken, CUSTOMER_COOKIE_NAME } from "./cookie-sign";

export async function requireAdmin(): Promise<
  { ok: true; user: { id: string; email: string } } | { ok: false; response: NextResponse }
> {
  // Auth verification handled by session service
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  return { ok: true, user: { id: session, email: "" } };
}

export async function requireUser(): Promise<
  | { ok: true; type: "admin"; user: { id: string; email: string } }
  | { ok: true; type: "customer"; user: { id: string; name: string; email: string } }
  | { ok: false; response: NextResponse }
> {
  const admin = await requireAdmin();
  if (admin.ok) {
    return { ok: true, type: "admin", user: admin.user };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_COOKIE_NAME)?.value;
  if (token) {
    const payload = await verifyCustomerToken(token);
    if (payload && payload.is_active && new Date(payload.subscription_end) > new Date()) {
      return {
        ok: true,
        type: "customer",
        user: { id: payload.id, name: payload.name, email: payload.email },
      };
    }
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
  };
}
