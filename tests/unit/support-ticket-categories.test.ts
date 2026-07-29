import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_SUPPORT_CATEGORIES,
  RESIDENT_SUPPORT_CATEGORIES,
  allowedSupportCategoriesForRole,
  isAllowedSupportCategory,
} from "../../src/domains/support/support-ticket.service";
import { supportTicketCategoryLabel } from "../../src/lib/design/supportTicketCategories";

test("1. RESIDENTE y CONSEJO solo tienen categorias tecnicas, nunca BILLING", () => {
  assert.deepEqual(allowedSupportCategoriesForRole("RESIDENTE"), RESIDENT_SUPPORT_CATEGORIES);
  assert.deepEqual(allowedSupportCategoriesForRole("CONSEJO"), RESIDENT_SUPPORT_CATEGORIES);
  assert.ok(!RESIDENT_SUPPORT_CATEGORIES.includes("BILLING"));
});

test("2. ADMIN tiene ademas la categoria BILLING", () => {
  const categories = allowedSupportCategoriesForRole("ADMIN");
  assert.deepEqual(categories, ADMIN_SUPPORT_CATEGORIES);
  assert.ok(categories.includes("BILLING"));
});

test("3. SUPER_ADMIN y roles nulos caen en el set restringido (nunca BILLING por defecto)", () => {
  assert.equal(allowedSupportCategoriesForRole("SUPER_ADMIN").includes("BILLING"), false);
  assert.equal(allowedSupportCategoriesForRole(null).includes("BILLING"), false);
  assert.equal(allowedSupportCategoriesForRole(undefined).includes("BILLING"), false);
});

test("4. isAllowedSupportCategory rechaza categorias legacy y valores invalidos", () => {
  assert.equal(isAllowedSupportCategory("RESIDENTE", "TECHNICAL"), true);
  assert.equal(isAllowedSupportCategory("RESIDENTE", "BILLING"), false);
  assert.equal(isAllowedSupportCategory("ADMIN", "BILLING"), true);
  assert.equal(isAllowedSupportCategory("RESIDENTE", "OTRO"), false);
  assert.equal(isAllowedSupportCategory("RESIDENTE", "TECNICO"), false);
  assert.equal(isAllowedSupportCategory("RESIDENTE", 123), false);
  assert.equal(isAllowedSupportCategory("RESIDENTE", undefined), false);
});

test("5. las categorias vigentes e historicas siempre tienen una etiqueta legible", () => {
  for (const category of ["TECNICO", "FACTURACION", "CUENTA", "OTRO", "TECHNICAL", "ACCESS", "PRIVACY_SECURITY", "BILLING"]) {
    assert.notEqual(supportTicketCategoryLabel(category), "");
  }
  assert.equal(supportTicketCategoryLabel("TECNICO"), "Tecnico");
  assert.equal(supportTicketCategoryLabel("FACTURACION"), "Facturacion");
  assert.equal(supportTicketCategoryLabel("UNKNOWN"), "Otro");
});