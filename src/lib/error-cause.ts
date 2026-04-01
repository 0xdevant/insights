/**
 * Undici / Node fetch often throws `TypeError: fetch failed` with the real reason in
 * {@link Error.cause}. Join the chain for logs and API error strings.
 */
export function formatErrorCauseChain(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [err.message.trim() || err.name];
  let c: unknown = err.cause;
  let depth = 0;
  while (c instanceof Error && depth++ < 6) {
    const m = c.message.trim();
    if (m) parts.push(m);
    c = c.cause;
  }
  return parts.join(" → ");
}
