import crypto from "crypto";

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateReferralCode(len = 8): string {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function ipHash(ip: string | undefined, salt: string): string {
  return sha256(`${ip || "unknown"}:${salt}`).slice(0, 24);
}
