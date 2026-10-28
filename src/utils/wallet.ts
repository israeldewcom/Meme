import nacl from "tweetnacl";
import bs58 from "bs58";

export function verifyWalletSignature(input: { message: string; signature: string; wallet: string }): boolean {
  try {
    const messageBytes = new TextEncoder().encode(input.message);
    const signatureBytes = bs58.decode(input.signature);
    const walletBytes = bs58.decode(input.wallet);
    if (signatureBytes.length !== 64 || walletBytes.length !== 32) return false;
    return nacl.sign.detached.verify(messageBytes, signatureBytes, walletBytes);
  } catch {
    return false;
  }
}

export function buildChallengeMessage(input: { wallet: string; nonce: string; tenantSlug: string; issuedAt: string }): string {
  return [
    `Meme Launchpad Pro — authentication request`,
    ``,
    `Domain: ${input.tenantSlug}`,
    `Wallet: ${input.wallet}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    ``,
    `Signing this message proves you control this wallet.`,
    `It does NOT authorize any transaction.`
  ].join("\n");
}
