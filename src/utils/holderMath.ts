/** Percentage (0-100, 4 decimals) of `amount` in `total`, computed with BigInt to avoid precision loss. */
export function pctOf(amount: bigint, total: bigint): number {
  if (total <= 0n || amount <= 0n) return 0;
  return Number((amount * 1_000_000n) / total) / 10_000;
}

export function uiAmount(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

export function uiSupplyString(raw: string, decimals: number): string {
  return (BigInt(raw) / 10n ** BigInt(decimals)).toString();
}
