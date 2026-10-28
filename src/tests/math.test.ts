import test from "node:test";
import assert from "node:assert/strict";
import { pctOf, uiSupplyString, uiAmount } from "../utils/holderMath";
import { ttlToSeconds } from "../utils/ttl";
import { parsePaging } from "../utils/paging";
import { generateReferralCode } from "../utils/crypto";

test("pctOf is exact for huge BigInt supplies", () => {
  const total = 1_000_000_000n * 10n ** 9n; // 1B tokens, 9 decimals
  assert.equal(pctOf(total / 4n, total), 25);
  assert.equal(pctOf(1n, total), 0);
  assert.equal(pctOf(5n, 0n), 0);
  assert.equal(pctOf(total, total), 100);
});

test("uiSupplyString / uiAmount", () => {
  assert.equal(uiSupplyString("1000000000000000", 6), "1000000000");
  assert.equal(uiAmount(2_500_000n, 6), 2.5);
});

test("ttlToSeconds", () => {
  assert.equal(ttlToSeconds("15m"), 900);
  assert.equal(ttlToSeconds("30d"), 2_592_000);
  assert.equal(ttlToSeconds("2h"), 7200);
  assert.throws(() => ttlToSeconds("soon"));
});

test("parsePaging clamps input", () => {
  assert.deepEqual(parsePaging({ page: "-3", limit: "9999" }), { page: 1, limit: 60 });
  assert.deepEqual(parsePaging({}), { page: 1, limit: 24 });
});

test("referral codes are 8 chars from the safe alphabet", () => {
  for (let i = 0; i < 50; i++) assert.match(generateReferralCode(), /^[A-HJ-NP-Z2-9]{8}$/);
});
