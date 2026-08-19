// Cookie signing utilities for Edge runtime (middleware compatible)
// Uses Web Crypto API — works in Next.js Edge runtime

function getSecret(): string {
  const secret = process.env.AUTH_TOKEN_SECRET || process.env.CUSTOMER_TOKEN_SECRET;
  if (!secret) {
    return "danish-cattle-feed-auth-secret-key-2026";
  }
  return secret;
}

export interface AuthPayload {
  id: string;
  name: string;
  email: string;
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function signAuthToken(payload: AuthPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const encoded = btoa(json);
  const signature = await hmacSha256(encoded, getSecret());
  return `${encoded}.${signature}`;
}

export async function verifyAuthToken(
  token: string
): Promise<AuthPayload | null> {
  try {
    const dotIndex = token.lastIndexOf(".");
    if (dotIndex === -1) return null;

    const encoded = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);

    const expected = await hmacSha256(encoded, getSecret());
    if (signature !== expected) return null;

    const json = atob(encoded);
    const payload = JSON.parse(json) as AuthPayload;

    if (!payload.email) return null;

    return payload;
  } catch {
    return null;
  }
}

export const AUTH_COOKIE_NAME = "danish_session";
export const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
