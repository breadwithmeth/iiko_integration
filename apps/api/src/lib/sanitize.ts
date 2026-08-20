const SECRET_KEYS = new Set(["apikey", "clientsecret", "authorization", "token", "password", "passwordhash"]);

export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SECRET_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : sanitize(val)
      ])
    );
  }
  return value;
}
