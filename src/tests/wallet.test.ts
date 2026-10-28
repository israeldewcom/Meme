import test from "node:test";
import assert from "node:assert/strict";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { verifyWalletSignature, buildChallengeMessage } from "../utils/wallet";

test("wallet signature verification", () => {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const message = buildChallengeMessage({ wallet, nonce: "abc", tenantSlug: "demo", issuedAt: "2025-01-01T00:00:00.000Z" });
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));

  assert.equal(verifyWalletSignature({ message, signature, wallet }), true);
  assert.equal(verifyWalletSignature({ message: message + "x", signature, wallet }), false);
  const other = bs58.encode(nacl.sign.keyPair().publicKey);
  assert.equal(verifyWalletSignature({ message, signature, wallet: other }), false);
  assert.equal(verifyWalletSignature({ message, signature: "garbage", wallet }), false);
});

test("challenge message is deterministic", () => {
  const a = { wallet: "W", nonce: "n", tenantSlug: "t", issuedAt: "i" };
  assert.equal(buildChallengeMessage(a), buildChallengeMessage({ ...a }));
});
