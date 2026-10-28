export function parseBool(v: unknown, def: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === undefined || v === null || v === "") return def;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "on", "y"].includes(s)) return true;
  if (["0", "false", "no", "off", "n"].includes(s)) return false;
  throw new Error(`Invalid boolean: ${String(v)}`);
}
