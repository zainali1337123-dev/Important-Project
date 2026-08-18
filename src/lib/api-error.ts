/**
 * Extracts a user-facing error detail from a caught error.
 */
export function getErrorDetail(err: unknown): string | undefined {
  if (err instanceof Error) {
    const msg = err.message;
    if (
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("not configured") ||
      msg.includes("does not exist")
    ) {
      return msg;
    }
  }

  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") {
      return e.message as string;
    }
  }

  return undefined;
}
