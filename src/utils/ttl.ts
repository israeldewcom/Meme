export function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)\s*([smhd])$/i.exec(ttl.trim());
  if (!m) throw new Error(`Invalid TTL "${ttl}" (use e.g. 15m, 2h, 30d)`);
  const n = Number(m[1]);
  const mult: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * mult[m[2].toLowerCase()];
}
