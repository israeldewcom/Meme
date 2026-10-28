import test from "node:test";
import assert from "node:assert/strict";
import { parseBool } from "../utils/bool";

test("parseBool handles false-like strings (the z.coerce.boolean bug)", () => {
  assert.equal(parseBool("false", true), false);
  assert.equal(parseBool("0", true), false);
  assert.equal(parseBool("FALSE", true), false);
  assert.equal(parseBool("true", false), true);
  assert.equal(parseBool(undefined, true), true);
  assert.equal(parseBool("", false), false);
  assert.throws(() => parseBool("maybe", true));
});
