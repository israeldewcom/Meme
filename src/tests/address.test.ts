import test from "node:test";
import assert from "node:assert/strict";
import { isBase58Address } from "../utils/validateAddress";

test("isBase58Address", () => {
  assert.equal(isBase58Address("11111111111111111111111111111111"), true);
  assert.equal(isBase58Address("So11111111111111111111111111111111111111112"), true);
  assert.equal(isBase58Address("not-an-address"), false);
  assert.equal(isBase58Address("0OIl" + "1".repeat(30)), false);
  assert.equal(isBase58Address(""), false);
});
