import bs58 from "bs58";

/** Plausible base58 Solana public key (32 bytes). */
export function isBase58Address(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  if (input.length < 32 || input.length > 44) return false;
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(input)) return false;
  try {
    return bs58.decode(input).length === 32;
  } catch {
    return false;
  }
}
