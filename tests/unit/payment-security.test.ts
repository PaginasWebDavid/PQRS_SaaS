import test from "node:test";
import assert from "node:assert/strict";
import {
  PaymentDomainError,
  assertAllowedKeys,
  assertOriginalFileName,
  assertReceiptExtensionMatches,
  assertReceiptMimeType,
  canAdministerPayments,
  canReadPayments,
  escapePaymentHtml,
  mapPaymentError,
  normalizeAmountCents,
  normalizeConcept,
  normalizePeriod,
  normalizeReference,
  normalizeRejectionReason,
  normalizeReversalReason,
  normalizeUnit,
  parseIsoDate,
} from "../../src/domains/payments/payment-security";

test("1. Solo ADMIN administra pagos; ADMIN y RESIDENTE pueden leer", () => {
  assert.equal(canAdministerPayments("ADMIN"), true);
  assert.equal(canAdministerPayments("RESIDENTE"), false);
  assert.equal(canAdministerPayments("CONSEJO"), false);
  assert.equal(canReadPayments("ADMIN"), true);
  assert.equal(canReadPayments("RESIDENTE"), true);
  assert.equal(canReadPayments("CONSEJO"), false);
  assert.equal(canReadPayments("SUPER_ADMIN"), false);
});

test("2. normalizePeriod exige formato AAAA-MM valido", () => {
  assert.equal(normalizePeriod("2026-08"), "2026-08");
  assert.throws(() => normalizePeriod("2026-13"), PaymentDomainError);
  assert.throws(() => normalizePeriod("2026-00"), PaymentDomainError);
  assert.throws(() => normalizePeriod("26-08"), PaymentDomainError);
  assert.throws(() => normalizePeriod(202608), PaymentDomainError);
});

test("3. normalizeConcept limpia espacios y rechaza longitudes invalidas", () => {
  assert.equal(normalizeConcept("  Cuota   administracion  "), "Cuota administracion");
  assert.throws(() => normalizeConcept("A"), PaymentDomainError);
  assert.throws(() => normalizeConcept("x".repeat(121)), PaymentDomainError);
});

test("4. normalizeConcept rechaza caracteres de control", () => {
  const withControlChar = "Cuota" + String.fromCharCode(7) + "Admin";
  assert.throws(() => normalizeConcept(withControlChar), PaymentDomainError);
});

test("5. normalizeAmountCents exige entero positivo dentro de rango", () => {
  assert.equal(normalizeAmountCents(150000), 150000);
  assert.throws(() => normalizeAmountCents(0), PaymentDomainError);
  assert.throws(() => normalizeAmountCents(-100), PaymentDomainError);
  assert.throws(() => normalizeAmountCents(1.5), PaymentDomainError);
  assert.throws(() => normalizeAmountCents("abc"), PaymentDomainError);
  assert.throws(() => normalizeAmountCents(600_000_000), PaymentDomainError);
});

test("6. normalizeUnit exige enteros no negativos", () => {
  assert.deepEqual(normalizeUnit(3, 302), { bloque: 3, apto: 302 });
  assert.throws(() => normalizeUnit(-1, 302), PaymentDomainError);
  assert.throws(() => normalizeUnit(3, "torre-b"), PaymentDomainError);
  assert.throws(() => normalizeUnit(3.5, 302), PaymentDomainError);
});

test("7. normalizeReference permite vacio/null y limita longitud", () => {
  assert.equal(normalizeReference(undefined), null);
  assert.equal(normalizeReference(""), null);
  assert.equal(normalizeReference("REF-001"), "REF-001");
  assert.throws(() => normalizeReference("x".repeat(121)), PaymentDomainError);
});

test("8. normalizeRejectionReason y normalizeReversalReason exigen texto minimo", () => {
  assert.equal(normalizeRejectionReason("Comprobante ilegible"), "Comprobante ilegible");
  assert.throws(() => normalizeRejectionReason(""), PaymentDomainError);
  assert.throws(() => normalizeRejectionReason(undefined), PaymentDomainError);
  assert.equal(normalizeReversalReason("Error de digitacion"), "Error de digitacion");
  assert.throws(() => normalizeReversalReason("a"), PaymentDomainError);
});

test("9. parseIsoDate exige instante ISO con zona explicita", () => {
  const parsed = parseIsoDate("2026-08-01T10:00:00.000Z", "INVALID_PAID_AT");
  assert.equal(parsed.toISOString(), "2026-08-01T10:00:00.000Z");
  assert.throws(() => parseIsoDate("2026-08-01", "INVALID_PAID_AT"), PaymentDomainError);
  assert.throws(() => parseIsoDate("2026-08-01T10:00:00", "INVALID_PAID_AT"), PaymentDomainError);
  assert.throws(() => parseIsoDate(123, "INVALID_PAID_AT"), PaymentDomainError);
});

test("10. assertAllowedKeys rechaza claves fuera de la lista blanca", () => {
  assert.doesNotThrow(() => assertAllowedKeys({ a: 1, b: 2 }, ["a", "b"]));
  assert.throws(() => assertAllowedKeys({ a: 1, c: 3 }, ["a", "b"]), PaymentDomainError);
  assert.throws(() => assertAllowedKeys(null, ["a"]), PaymentDomainError);
  assert.throws(() => assertAllowedKeys([1, 2], ["a"]), PaymentDomainError);
});

test("11. assertOriginalFileName rechaza traversal, rutas y NUL", () => {
  assert.equal(assertOriginalFileName("comprobante.pdf"), "comprobante.pdf");
  assert.throws(() => assertOriginalFileName("../etc/passwd"), PaymentDomainError);
  assert.throws(() => assertOriginalFileName("/etc/passwd"), PaymentDomainError);
  assert.throws(() => assertOriginalFileName("a\0b.pdf"), PaymentDomainError);
  assert.throws(() => assertOriginalFileName("a\\b.pdf"), PaymentDomainError);
  assert.throws(() => assertOriginalFileName(""), PaymentDomainError);
});

test("12. assertReceiptMimeType solo permite pdf/jpeg/png", () => {
  assert.equal(assertReceiptMimeType("application/pdf"), "application/pdf");
  assert.equal(assertReceiptMimeType("image/jpeg"), "image/jpeg");
  assert.equal(assertReceiptMimeType("image/png"), "image/png");
  assert.throws(() => assertReceiptMimeType("image/webp"), PaymentDomainError);
  assert.throws(() => assertReceiptMimeType("application/x-msdownload"), PaymentDomainError);
});

test("13. assertReceiptExtensionMatches exige extension coherente con el MIME", () => {
  assert.doesNotThrow(() => assertReceiptExtensionMatches("comprobante.pdf", "application/pdf"));
  assert.doesNotThrow(() => assertReceiptExtensionMatches("foto.jpg", "image/jpeg"));
  assert.doesNotThrow(() => assertReceiptExtensionMatches("foto.jpeg", "image/jpeg"));
  assert.throws(() => assertReceiptExtensionMatches("comprobante.exe", "application/pdf"), PaymentDomainError);
  assert.throws(() => assertReceiptExtensionMatches("foto.png", "image/jpeg"), PaymentDomainError);
});

test("14. mapPaymentError distingue error de dominio de error inesperado", () => {
  const domainMapped = mapPaymentError(new PaymentDomainError("CHARGE_NOT_FOUND"));
  assert.equal(domainMapped.status, 404);
  assert.equal(domainMapped.code, "CHARGE_NOT_FOUND");

  const genericMapped = mapPaymentError(new Error("boom"));
  assert.equal(genericMapped.status, 500);
  assert.equal(genericMapped.code, null);
  assert.doesNotMatch(genericMapped.message, /boom/);
});

test("15. escapePaymentHtml escapa entidades HTML", () => {
  assert.equal(escapePaymentHtml(`<b>"Ñoño" & 'co'</b>`), "&lt;b&gt;&quot;Ñoño&quot; &amp; &#39;co&#39;&lt;/b&gt;");
  assert.equal(escapePaymentHtml(null), "");
  assert.equal(escapePaymentHtml(undefined), "");
});
