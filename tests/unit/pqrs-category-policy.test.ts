import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCategoryDisplayName } from "../../src/domains/pqrs/pqrs-category-policy";

test("normalizes a visible custom PQRS category", () => {
  assert.equal(normalizeCategoryDisplayName("  Danos   menores  "), "Danos menores");
});

test("rejects prototype-polluting category names", () => {
  for (const value of ["__proto__", "prototype", "Constructor"]) {
    assert.throws(() => normalizeCategoryDisplayName(value), /categoria invalido/);
  }
});
