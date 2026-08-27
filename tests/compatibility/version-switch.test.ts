import assert from "node:assert/strict";
import test from "node:test";

import {
  currentAppVersion,
  parseAppVersion,
  safeReturnPath,
} from "../../src/compat/version";

test("only known application versions are accepted", () => {
  assert.equal(parseAppVersion("stable"), "stable");
  assert.equal(parseAppVersion("beta"), "beta");
  assert.equal(parseAppVersion("preview"), null);
  assert.equal(parseAppVersion(null), null);
});

test("unknown and missing version cookies use stable", () => {
  assert.equal(currentAppVersion(undefined), "stable");
  assert.equal(currentAppVersion("invalid"), "stable");
  assert.equal(currentAppVersion("beta"), "beta");
});

test("return paths remain on the Fantassist origin", () => {
  assert.equal(safeReturnPath("/campaigns/abc/scenes/def"), "/campaigns/abc/scenes/def");
  assert.equal(safeReturnPath("https://example.com"), "/campaigns");
  assert.equal(safeReturnPath("//example.com/path"), "/campaigns");
  assert.equal(safeReturnPath("/campaigns\\example.com"), "/campaigns");
  assert.equal(safeReturnPath("/campaigns\nnext"), "/campaigns");
});
