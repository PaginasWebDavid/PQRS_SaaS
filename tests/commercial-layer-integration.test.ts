import 'dotenv/config';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { cancelCommercialProcess, confirmPilotPayment, convertPilot, correctCommercialProfile, createPaidPilotTenant, founderSlotsRemaining, getTenantCommercialSummary, markReferralCommissionPaid, refreshReferralCommission, startPilot, startPilotEvaluation, updatePilotChecklist, validateCommercialPricingPolicy } from '../src/domains/commercial/commercial.service';
import { assertTenantFeatureActive, FeatureUnavailableError, setTenantFeatureEntitlement } from '../src/domains/commercial/entitlement.service';
import { getPlatformAnalytics } from '../src/domains/platform/analytics.service';
import { updateTenantDetails, updateTenantStatusForSuperAdmin } from '../src/domains/platform/tenant-admin.service';
import { listCommonAreasForTenant } from '../src/domains/reservations/reservation.service';
import { listChargesForTenant } from '../src/domains/payments/payment.service';

const RUN = `commercial-c7b-${Date.now()}`;
const tenantIds: string[] = [];
let sequence = 0;
let actorId = '';
let declaredTests = 0;
const realFetch = globalThis.fetch;
const oldResendKey = process.env.RESEND_API_KEY;

function scenario(name: string, fn: () => Promise<void> | void) {
  declaredTests += 1;
  test(`${declaredTests}. ${name}`, fn);
}
function operation(label: string) { sequence += 1; return `${label}-${RUN}-${sequence}`; }

async function createPilot(options: { units?: number; reservations?: boolean; payments?: boolean; pilotPriceCents?: number; monthlyPriceCents?: number; quoteReason?: string; referral?: boolean } = {}) {
  const n = ++sequence;
  const result = await createPaidPilotTenant(actorId, {
    operationId: operation('create'), name: `Conjunto C7B ${RUN} ${n}`, slug: `${RUN}-${n}`, city: 'Bogota', address: `Calle ${n}`,
    units: options.units ?? 50, adminName: `Admin ${n}`, adminEmail: `admin-${RUN}-${n}@example.com`, adminPhone: '3000000000', implementationType: 'STANDARD',
    referralName: options.referral ? `Referido ${n}` : undefined, referralAgreementType: options.referral ? 'GENERAL' : 'NONE',
    reservationsEnabled: options.reservations, residentPaymentsEnabled: options.payments, pilotPriceCents: options.pilotPriceCents,
    monthlyPriceCents: options.monthlyPriceCents, manualQuoteReason: options.quoteReason,
  });
  tenantIds.push(result.tenantId);
  return result.tenantId;
}

async function confirm(tenantId: string, options: { operationId?: string; paidAt?: Date; amountCents?: number; reference?: string } = {}) {
  const profile = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
  return confirmPilotPayment(actorId, tenantId, { operationId: options.operationId || operation('pilot-payment'), amountCents: options.amountCents ?? profile.pilotPriceCents!, paidAt: options.paidAt || new Date(), manualReference: options.reference || operation('transfer') });
}

async function makeActivePilot(options: Parameters<typeof createPilot>[0] = {}) {
  const tenantId = await createPilot(options); const paidAt = new Date(); await confirm(tenantId, { paidAt });
  for (const field of ['residentBaseReceivedAt', 'categoriesConfiguredAt', 'trainingCompletedAt', 'smokeTestApprovedAt', 'launchCommunicationSentAt'] as const) {
    await updatePilotChecklist(actorId, tenantId, { operationId: operation(`check-${field}`), field, completed: true });
  }
  await startPilot(actorId, tenantId, { operationId: operation('start'), realUseStartsAt: paidAt });
  return tenantId;
}

async function convert(tenantId: string, mode: 'MONTHLY' | 'ANNUAL' = 'MONTHLY', overrides: Record<string, unknown> = {}) {
  const profile = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
  const amountCents = mode === 'ANNUAL' ? Math.round(profile.postPilotListPriceCents! * 12 * 0.9) : profile.postPilotListPriceCents!;
  return convertPilot(actorId, tenantId, { operationId: operation('convert'), billingMode: mode, amountCents, paidAt: new Date(), manualReference: operation('conversion-transfer'), ...overrides });
}

async function cleanupTenants(ids: string[]) {
  if (!ids.length) return;
  await prisma.billingOutboxAttempt.deleteMany({ where: { outbox: { tenantId: { in: ids } } } });
  await prisma.billingNotificationOutbox.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.emailLog.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.payment.deleteMany({
    where: { OR: [{ tenantId: { in: ids } }, { subscription: { tenantId: { in: ids } } }] },
  });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
}

before(async () => {
  await prisma.$connect();
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: 'commercial-c7b-' } }, select: { id: true } });
  await cleanupTenants(stale.map((tenant) => tenant.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: 'super-commercial-c7b-' } } });
  process.env.RESEND_API_KEY = 're_test_only_never_sent';
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: operation('resend') }), { status: 200 })) as typeof fetch;
  actorId = (await prisma.user.create({ data: { email: `super-${RUN}@example.com`, name: 'QA Super Admin C7B', password: 'not-used', role: 'SUPER_ADMIN' } })).id;
});

after(async () => {
  await cleanupTenants(tenantIds);
  await prisma.user.deleteMany({ where: { id: actorId } });
  globalThis.fetch = realFetch; if (oldResendKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldResendKey;
  await prisma.$disconnect();
});

// Fundadores, implementacion y referidos: 12.
for (let founder = 1; founder <= 9; founder += 1) {
  scenario(`fundador ${founder} recibe ordinal estable y proteccion`, async () => {
    const tenantId = await makeActivePilot({ referral: true }); await convert(tenantId);
    const profile = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    assert.equal(profile.isFounderCustomer, true); assert.equal(profile.founderNumber, founder); assert.equal(profile.implementationType, 'FOUNDER_WAIVED');
    assert.equal(profile.implementationEffectiveFeeCents, 0); assert.ok(profile.priceProtectedUntil && profile.founderGrantedAt);
  });
}
scenario('dos conversiones simultaneas compiten por el ultimo cupo fundador', async () => {
  const tenantA = await makeActivePilot(); const tenantB = await makeActivePilot();
  const profileA = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: tenantA } });
  const profileB = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: tenantB } });
  const results = await Promise.allSettled([
    convertPilot(actorId, tenantA, { operationId: operation('last-founder-a'), billingMode: 'MONTHLY', amountCents: profileA.postPilotListPriceCents!, paidAt: new Date(), manualReference: 'LAST-FOUNDER-A' }),
    convertPilot(actorId, tenantB, { operationId: operation('last-founder-b'), billingMode: 'MONTHLY', amountCents: profileB.postPilotListPriceCents!, paidAt: new Date(), manualReference: 'LAST-FOUNDER-B' }),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 2);
  const profiles = await prisma.tenantCommercialProfile.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  assert.equal(profiles.filter((profile) => profile.founderNumber === 10).length, 1);
  assert.equal(profiles.filter((profile) => profile.isFounderCustomer).length, 1);
  assert.equal(await founderSlotsRemaining(), 0);
});
scenario('el cliente once no recibe condicion fundadora', async () => {
  const tenantId = await makeActivePilot(); await convert(tenantId);
  assert.equal((await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } })).isFounderCustomer, false); assert.equal(await founderSlotsRemaining(), 0);
});
scenario('cancelar tecnicamente un fundador no libera su ordinal', async () => {
  const first = await prisma.tenantCommercialProfile.findFirstOrThrow({ where: { isFounderCustomer: true }, orderBy: { founderNumber: 'asc' } });
  await updateTenantStatusForSuperAdmin(actorId, first.tenantId, 'CANCELLED');
  assert.equal((await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: first.tenantId } })).founderNumber, 1); assert.equal(await founderSlotsRemaining(), 0);
});
scenario('cambiar unidades durante proteccion conserva el precio y exige revision comercial', async () => {
  const founder = await prisma.tenantCommercialProfile.findFirstOrThrow({ where: { isFounderCustomer: true, priceProtectedUntil: { gt: new Date() }, tenant: { status: 'ACTIVE' } }, orderBy: { founderNumber: 'asc' } });
  const before = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: founder.tenantId } });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: founder.tenantId } });
  await updateTenantDetails(actorId, founder.tenantId, { units: tenant.units + 25 });
  const [after, profile] = await Promise.all([prisma.subscription.findUniqueOrThrow({ where: { tenantId: founder.tenantId } }), prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: founder.tenantId } })]);
  assert.equal(after.priceCents, before.priceCents); assert.equal(after.pendingPriceCents, before.pendingPriceCents);
  assert.match(profile.nextAction || '', /proteccion de precio/i);
});

// Piloto y ficha comercial: 18.
scenario('crear piloto deja estado comercial pendiente de pago', async () => {
  const id = await createPilot(); assert.equal((await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } })).commercialStatus, 'PILOT_PENDING_PAYMENT');
});
scenario('crear piloto no crea trial automatico', async () => {
  const id = await createPilot(); const row = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: id } }); assert.equal(row.status, 'PENDING_PAYMENT'); assert.equal(row.trialEndsAt, null);
});
scenario('las tarifas de piloto y mensual quedan congeladas', async () => {
  const id = await createPilot({ units: 50 }); const row = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } }); assert.equal(row.pilotPriceCents, 9_900_000); assert.equal(row.postPilotListPriceCents, 11_900_000);
});
scenario('mas de 600 unidades exige cotizacion individual', async () => { await assert.rejects(createPilot({ units: 601 }), /precio manual/i); });
scenario('cotizacion individual conserva precios, motivo y aprobador', async () => {
  const id = await createPilot({ units: 601, pilotPriceCents: 20_000_000, monthlyPriceCents: 30_000_000, quoteReason: 'Cotizacion aprobada por alcance' });
  const row = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } }); assert.equal(row.pilotPriceCents, 20_000_000); assert.equal(row.manualQuoteApprovedById, actorId);
});
scenario('confirmar transferencia crea pago PILOT aprobado', async () => {
  const id = await createPilot(); await confirm(id); const row = await prisma.payment.findFirstOrThrow({ where: { tenantId: id, concept: 'PILOT' } }); assert.equal(row.provider, 'MANUAL_TRANSFER'); assert.equal(row.status, 'APPROVED');
});
scenario('confirmar pago con operationId repetido es idempotente', async () => {
  const id = await createPilot(); const paidAt = new Date(); const op = operation('same-payment');
  const results = await Promise.allSettled([confirm(id, { operationId: op, paidAt, reference: 'REF-SAME' }), confirm(id, { operationId: op, paidAt, reference: 'REF-SAME' })]);
  const failures = results.flatMap((item) => item.status === 'rejected'
    ? [`${item.reason instanceof Error ? item.reason.name : typeof item.reason}:${item.reason instanceof Error ? item.reason.message : String(item.reason)}`]
    : []);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 2, failures.join(' | ')); assert.equal(await prisma.payment.count({ where: { tenantId: id, concept: 'PILOT' } }), 1);
});
scenario('reutilizar operationId con otro payload produce conflicto', async () => {
  const id = await createPilot(); const paidAt = new Date(); const op = operation('conflict-payment'); await confirm(id, { operationId: op, paidAt, reference: 'REF-A' }); await assert.rejects(confirm(id, { operationId: op, paidAt, reference: 'REF-B' }), /datos distintos/i);
});
scenario('el pago fija exactamente 45 dias de acceso', async () => {
  const id = await createPilot(); const paidAt = new Date('2026-08-01T12:00:00Z'); await confirm(id, { paidAt }); const row = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } }); assert.equal((row.pilotAccessEndsAt!.getTime() - paidAt.getTime()) / 86_400_000, 45);
});
scenario('el checklist tipado persiste y se audita', async () => {
  const id = await createPilot(); await confirm(id); await updatePilotChecklist(actorId, id, { operationId: operation('check-training'), field: 'trainingCompletedAt', completed: true }); assert.ok((await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } })).trainingCompletedAt); assert.ok(await prisma.auditLog.count({ where: { tenantId: id, action: 'COMMERCIAL_PROFILE_CHANGED' } }));
});
scenario('iniciar piloto conserva el fin de acceso pagado', async () => {
  const id = await makeActivePilot(); const [profile, sub] = await Promise.all([prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } }), prisma.subscription.findUniqueOrThrow({ where: { tenantId: id } })]); assert.equal(profile.commercialStatus, 'PILOT_ACTIVE'); assert.equal(profile.pilotAccessEndsAt?.getTime(), sub.currentPeriodEnd.getTime());
});
scenario('iniciar evaluacion persiste metricas manuales acotadas', async () => {
  const id = await makeActivePilot(); await startPilotEvaluation(actorId, id, { operationId: operation('evaluation'), notes: 'Buen uso', supportMinutes: 20, outsideRequests: 1, meetings: 2 }); const row = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } }); assert.equal(row.commercialStatus, 'PILOT_EVALUATION'); assert.equal(row.manualSupportMinutes, 20);
});
scenario('correccion controlada actualiza precio y modalidad antes de convertir', async () => {
  const id = await createPilot(); await correctCommercialProfile(actorId, id, { operationId: operation('correction'), reason: 'Ajuste pactado', changes: { postPilotContractPriceCents: 12_345_600, billingMode: 'MONTHLY' } }); const [profile, sub] = await Promise.all([prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } }), prisma.subscription.findUniqueOrThrow({ where: { tenantId: id } })]); assert.equal(profile.postPilotContractPriceCents, 12_345_600); assert.equal(sub.priceCents, 12_345_600);
});
scenario('la ficha consultada conserva aislamiento entre conjuntos', async () => {
  const a = await createPilot({ units: 50 }); const b = await createPilot({ units: 250 }); const summary = await getTenantCommercialSummary(b); assert.equal(summary.profile?.tenantId, b); assert.notEqual(summary.profile?.tenantId, a);
});
scenario('la creacion inicializa categorias PQRS reales', async () => { const id = await createPilot(); assert.ok(await prisma.pqrsCategory.count({ where: { tenantId: id } })); });
scenario('la invitacion ADMIN se difiere hasta confirmar pago', async () => {
  const id = await createPilot(); assert.equal(await prisma.invitation.count({ where: { tenantId: id } }), 0); await confirm(id); assert.equal(await prisma.invitation.count({ where: { tenantId: id, role: 'ADMIN' } }), 1);
});
scenario('un valor de piloto incorrecto no activa acceso', async () => {
  const id = await createPilot(); await assert.rejects(confirm(id, { amountCents: 1 }), /no coincide/i); assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { tenantId: id } })).status, 'PENDING_PAYMENT');
});
scenario('no se inicia piloto si faltan hitos obligatorios', async () => {
  const id = await createPilot(); await confirm(id); await assert.rejects(startPilot(actorId, id, { operationId: operation('blocked-start') }), /faltan hitos/i);
});

// Pagos, precios y conversion: 18.
scenario('el pago PILOT no incrementa MRR', async () => {
  const id = await createPilot(); await confirm(id);
  assert.equal(await prisma.payment.count({ where: { tenantId: id, status: 'APPROVED', concept: { in: ['SUBSCRIPTION_MONTHLY', 'SUBSCRIPTION_ANNUAL'] } } }), 0);
});
scenario('conversion mensual persiste estado y modalidad', async () => {
  const id = await makeActivePilot(); await convert(id); const row = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } }); assert.equal(row.commercialStatus, 'CONVERTED_MONTHLY'); assert.equal(row.billingMode, 'MONTHLY');
});
scenario('conversion mensual crea concepto SUBSCRIPTION_MONTHLY', async () => {
  const id = await makeActivePilot(); await convert(id); assert.equal(await prisma.payment.count({ where: { tenantId: id, concept: 'SUBSCRIPTION_MONTHLY', status: 'APPROVED' } }), 1);
});
scenario('conversion anual persiste estado y modalidad', async () => {
  const id = await makeActivePilot(); await convert(id, 'ANNUAL'); const row = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } }); assert.equal(row.commercialStatus, 'CONVERTED_ANNUAL'); assert.equal(row.billingMode, 'ANNUAL');
});
scenario('anualidad calcula descuento exacto del diez por ciento', async () => {
  const id = await makeActivePilot(); await convert(id, 'ANNUAL'); const row = await prisma.payment.findFirstOrThrow({ where: { tenantId: id, concept: 'SUBSCRIPTION_ANNUAL' } }); assert.equal(row.discountBps, 1000); assert.equal(row.amountCents, Math.round(row.listAmountCents! * 0.9));
});
scenario('anualidad cubre doce meses calendario', async () => {
  const id = await makeActivePilot(); await convert(id, 'ANNUAL'); const row = await prisma.payment.findFirstOrThrow({ where: { tenantId: id, concept: 'SUBSCRIPTION_ANNUAL' } }); const expected = new Date(row.periodStart); expected.setMonth(expected.getMonth() + 12); assert.equal(row.periodEnd.getTime(), expected.getTime());
});
scenario('anualidad rechaza descuento comercial acumulado', async () => { const id = await makeActivePilot(); await assert.rejects(convert(id, 'ANNUAL', { discountBps: 100 }), /no admite/i); });
scenario('mensual acepta descuento maximo de cinco por ciento', async () => {
  const id = await makeActivePilot(); const start = new Date(); const end = new Date(start); end.setMonth(end.getMonth() + 2); const profile = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } }); await convert(id, 'MONTHLY', { amountCents: Math.round(profile.postPilotListPriceCents! * 0.95), discountBps: 500, discountReason: 'Acuerdo de lanzamiento', discountStartsAt: start, discountEndsAt: end }); assert.equal((await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } })).discountBps, 500);
});
scenario('mensual rechaza descuento superior al cinco por ciento', async () => { const id = await makeActivePilot(); await assert.rejects(convert(id, 'MONTHLY', { discountBps: 501 }), /0 % y 5 %/i); });
scenario('un descuento mensual exige motivo', async () => {
  const id = await makeActivePilot(); const start = new Date(); const end = new Date(Date.now() + 86_400_000); await assert.rejects(convert(id, 'MONTHLY', { discountBps: 100, discountStartsAt: start, discountEndsAt: end }), /motivo/i);
});
scenario('un descuento mensual exige vigencia valida', async () => { const id = await makeActivePilot(); await assert.rejects(convert(id, 'MONTHLY', { discountBps: 100, discountReason: 'Temporal' }), /vigencia/i); });
scenario('conversion anticipada inicia al terminar el piloto pagado', async () => {
  const id = await makeActivePilot(); const end = (await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } })).pilotAccessEndsAt!; await convert(id); const row = await prisma.payment.findFirstOrThrow({ where: { tenantId: id, concept: 'SUBSCRIPTION_MONTHLY' } }); assert.equal(row.periodStart.getTime(), end.getTime());
});
scenario('conversion posterior al vencimiento inicia en la fecha pagada', async () => {
  const id = await makeActivePilot(); const paidAt = new Date(); await prisma.tenantCommercialProfile.update({ where: { tenantId: id }, data: { pilotAccessEndsAt: new Date(paidAt.getTime() - 86_400_000) } }); await convert(id, 'MONTHLY', { paidAt }); const row = await prisma.payment.findFirstOrThrow({ where: { tenantId: id, concept: 'SUBSCRIPTION_MONTHLY' } }); assert.equal(row.periodStart.getTime(), paidAt.getTime());
});
scenario('reintentar la misma conversion no duplica pago ni periodo', async () => {
  const id = await makeActivePilot(); const profile = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } }); const input = { operationId: operation('same-conversion'), billingMode: 'MONTHLY' as const, amountCents: profile.postPilotListPriceCents!, paidAt: new Date(), manualReference: 'CONV-SAME' }; await convertPilot(actorId, id, input); await convertPilot(actorId, id, input); assert.equal(await prisma.payment.count({ where: { tenantId: id, concept: 'SUBSCRIPTION_MONTHLY' } }), 1);
});
scenario('dos conversiones simultaneas producen un solo pago', async () => {
  const id = await makeActivePilot(); const profile = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } }); const result = await Promise.allSettled([1, 2].map((n) => convertPilot(actorId, id, { operationId: operation(`race-${n}`), billingMode: 'MONTHLY', amountCents: profile.postPilotListPriceCents!, paidAt: new Date(), manualReference: `RACE-${n}` }))); assert.equal(result.filter((item) => item.status === 'fulfilled').length, 1); assert.equal(await prisma.payment.count({ where: { tenantId: id, concept: 'SUBSCRIPTION_MONTHLY' } }), 1);
});
scenario('conversion y cancelacion simultaneas dejan un unico estado comercial coherente', async () => {
  const id = await makeActivePilot(); const profile = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } });
  const results = await Promise.allSettled([
    convertPilot(actorId, id, { operationId: operation('convert-cancel-convert'), billingMode: 'MONTHLY', amountCents: profile.postPilotListPriceCents!, paidAt: new Date(), manualReference: 'CONVERT-CANCEL' }),
    cancelCommercialProcess(actorId, id, { operationId: operation('convert-cancel-cancel'), reason: 'Decision concurrente de QA' }),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  const finalProfile = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } });
  assert.ok(['CONVERTED_MONTHLY', 'CANCELLED'].includes(finalProfile.commercialStatus));
  assert.equal(await prisma.payment.count({ where: { tenantId: id, concept: 'SUBSCRIPTION_MONTHLY' } }), finalProfile.commercialStatus === 'CONVERTED_MONTHLY' ? 1 : 0);
});
scenario('el pago conserva snapshots de lista, descuento y efectivo', async () => {
  const id = await makeActivePilot(); await convert(id); const row = await prisma.payment.findFirstOrThrow({ where: { tenantId: id, concept: 'SUBSCRIPTION_MONTHLY' } }); assert.equal(row.listAmountCents, row.amountCents); assert.equal(row.discountBps, 0);
});
scenario('politica reproducible de precios no tiene huecos ni rangos mayores a 600', async () => { const validation = await validateCommercialPricingPolicy(); assert.equal(validation.valid, true); assert.deepEqual(validation.issues, []); });
scenario('analytics deriva conversion del estado comercial', async () => {
  const before = await getPlatformAnalytics(); const id = await makeActivePilot(); await convert(id); const after = await getPlatformAnalytics(); assert.equal(after.trialConversion.converted, before.trialConversion.converted + 1);
});

// Entitlements: 14.
scenario('RESERVATIONS puede activarse con motivo y auditoria', async () => {
  const id = await createPilot(); await setTenantFeatureEntitlement({ actorUserId: actorId, tenantId: id, feature: 'RESERVATIONS', status: 'ACTIVE', reason: 'Contratado', operationId: operation('ent-active') }); assert.equal((await assertTenantFeatureActive(id, 'RESERVATIONS')).status, 'ACTIVE');
});
scenario('estado SETUP no concede acceso operativo', async () => { const id = await createPilot({ reservations: true }); await assert.rejects(assertTenantFeatureActive(id, 'RESERVATIONS'), FeatureUnavailableError); });
scenario('estado SUSPENDED revoca acceso sin borrar configuracion', async () => {
  const id = await createPilot(); await setTenantFeatureEntitlement({ actorUserId: actorId, tenantId: id, feature: 'RESERVATIONS', status: 'SUSPENDED', reason: 'Pausa', operationId: operation('ent-suspend') }); await assert.rejects(assertTenantFeatureActive(id, 'RESERVATIONS'), FeatureUnavailableError);
});
scenario('estado DISABLED deniega acceso controlado', async () => { const id = await createPilot(); await assert.rejects(assertTenantFeatureActive(id, 'RESIDENT_PAYMENTS'), /Modulo no disponible/i); });
scenario('cambio con el mismo operationId es idempotente', async () => {
  const id = await createPilot(); const op = operation('same-ent'); const input = { actorUserId: actorId, tenantId: id, feature: 'RESERVATIONS' as const, status: 'ACTIVE' as const, reason: 'Contrato firmado', operationId: op }; await setTenantFeatureEntitlement(input); await setTenantFeatureEntitlement(input); assert.equal(await prisma.commercialOperation.count({ where: { tenantId: id, operationId: op } }), 1);
});
scenario('dos activaciones simultaneas del mismo entitlement producen un solo cambio durable', async () => {
  const id = await createPilot(); const op = operation('concurrent-ent');
  const input = { actorUserId: actorId, tenantId: id, feature: 'RESERVATIONS' as const, status: 'ACTIVE' as const, reason: 'Contrato concurrente', operationId: op };
  const results = await Promise.allSettled([setTenantFeatureEntitlement(input), setTenantFeatureEntitlement(input)]);
  const failures = results.flatMap((item) => item.status === 'rejected'
    ? [`${item.reason instanceof Error ? item.reason.name : typeof item.reason}:${item.reason instanceof Error ? item.reason.message : String(item.reason)}`]
    : []);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 2, failures.join(' | '));
  assert.equal(await prisma.commercialOperation.count({ where: { tenantId: id, operationId: op } }), 1);
  assert.equal((await prisma.tenantFeatureEntitlement.findUniqueOrThrow({ where: { tenantId_feature: { tenantId: id, feature: 'RESERVATIONS' } } })).status, 'ACTIVE');
});
scenario('mismo operationId con otro entitlement se rechaza', async () => {
  const id = await createPilot(); const op = operation('ent-conflict'); await setTenantFeatureEntitlement({ actorUserId: actorId, tenantId: id, feature: 'RESERVATIONS', status: 'ACTIVE', reason: 'Contrato', operationId: op }); await assert.rejects(setTenantFeatureEntitlement({ actorUserId: actorId, tenantId: id, feature: 'RESIDENT_PAYMENTS', status: 'ACTIVE', reason: 'Contrato', operationId: op }), /datos distintos/i);
});
scenario('activar un tenant no altera el entitlement de otro', async () => {
  const a = await createPilot(); const b = await createPilot(); await setTenantFeatureEntitlement({ actorUserId: actorId, tenantId: a, feature: 'RESERVATIONS', status: 'ACTIVE', reason: 'Solo A', operationId: operation('isolation-ent') }); assert.equal((await prisma.tenantFeatureEntitlement.findUniqueOrThrow({ where: { tenantId_feature: { tenantId: b, feature: 'RESERVATIONS' } } })).status, 'DISABLED');
});
scenario('lectura de Reservas funciona cuando esta contratada', async () => {
  const id = await createPilot(); await setTenantFeatureEntitlement({ actorUserId: actorId, tenantId: id, feature: 'RESERVATIONS', status: 'ACTIVE', reason: 'Contrato', operationId: operation('reserve-read') }); assert.deepEqual(await listCommonAreasForTenant({ tenantId: id }), []);
});
scenario('lectura directa de Reservas falla sin contrato', async () => { const id = await createPilot(); await assert.rejects(listCommonAreasForTenant({ tenantId: id }), FeatureUnavailableError); });
scenario('lectura de Pagos funciona cuando esta contratada', async () => {
  const id = await createPilot(); await setTenantFeatureEntitlement({ actorUserId: actorId, tenantId: id, feature: 'RESIDENT_PAYMENTS', status: 'ACTIVE', reason: 'Contrato', operationId: operation('payment-read') }); const result = await listChargesForTenant({ tenantId: id }); assert.deepEqual(result.data, []);
});
scenario('lectura directa de Pagos falla sin contrato', async () => { const id = await createPilot(); await assert.rejects(listChargesForTenant({ tenantId: id }), FeatureUnavailableError); });
scenario('suspender Reservas conserva datos existentes', async () => {
  const id = await createPilot(); await setTenantFeatureEntitlement({ actorUserId: actorId, tenantId: id, feature: 'RESERVATIONS', status: 'ACTIVE', reason: 'Contrato', operationId: operation('preserve-on') }); await prisma.commonArea.create({ data: { tenantId: id, name: 'Salon comun', openingTime: '08:00', closingTime: '20:00', minDurationMinutes: 60, maxDurationMinutes: 120, maxReservationsPerWeek: 2 } }); await setTenantFeatureEntitlement({ actorUserId: actorId, tenantId: id, feature: 'RESERVATIONS', status: 'SUSPENDED', reason: 'Pausa comercial', operationId: operation('preserve-off') }); assert.equal(await prisma.commonArea.count({ where: { tenantId: id } }), 1);
});
scenario('cada tenant comercial tiene dos entitlements tipados', async () => { const id = await createPilot(); assert.equal(await prisma.tenantFeatureEntitlement.count({ where: { tenantId: id } }), 2); });
scenario('backfill legacy conserva una ficha y dos entitlements por tenant migrado', async () => {
  const legacy = await prisma.tenantCommercialProfile.findMany({ where: { commercialStatus: 'LEGACY_REVIEW' }, select: { tenantId: true } });
  assert.ok(legacy.length > 0);
  const tenantIds = legacy.map((profile) => profile.tenantId);
  assert.equal(await prisma.tenant.count({ where: { id: { in: tenantIds } } }), legacy.length);
  assert.equal(await prisma.tenantFeatureEntitlement.count({ where: { tenantId: { in: tenantIds } } }), legacy.length * 2);
});

// Smoke integral con dos tenants: 2.
scenario('smoke tenant A opera Gestion sin add-ons', async () => {
  const id = await makeActivePilot(); await convert(id); await assert.rejects(listCommonAreasForTenant({ tenantId: id }), FeatureUnavailableError); await assert.rejects(listChargesForTenant({ tenantId: id }), FeatureUnavailableError); assert.equal((await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } })).commercialStatus, 'CONVERTED_MONTHLY');
});
scenario('smoke tenant B opera Reservas activas y Pagos desactivados sin fuga', async () => {
  const id = await makeActivePilot({ reservations: true }); await setTenantFeatureEntitlement({ actorUserId: actorId, tenantId: id, feature: 'RESERVATIONS', status: 'ACTIVE', reason: 'Configuracion terminada', operationId: operation('smoke-reservations') }); await convert(id); assert.deepEqual(await listCommonAreasForTenant({ tenantId: id }), []); await assert.rejects(listChargesForTenant({ tenantId: id }), FeatureUnavailableError); const foreign = tenantIds.find((tenantId) => tenantId !== id)!; assert.notEqual((await getTenantCommercialSummary(foreign)).profile?.tenantId, id);
});

async function addApprovedPayment(tenantId: string, concept: 'SUBSCRIPTION_MONTHLY' | 'COURTESY', amountCents?: number) {
  const [subscription, profile] = await Promise.all([prisma.subscription.findUniqueOrThrow({ where: { tenantId } }), prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } })]);
  const start = new Date(); const end = new Date(start); end.setMonth(end.getMonth() + 1);
  return prisma.payment.create({ data: { tenantId, subscriptionId: subscription.id, amountCents: concept === 'COURTESY' ? 0 : (amountCents || profile.postPilotContractPriceCents!), listAmountCents: concept === 'COURTESY' ? 0 : (amountCents || profile.postPilotContractPriceCents!), currency: 'COP', status: 'APPROVED', provider: concept === 'COURTESY' ? 'COURTESY' : 'MANUAL_TRANSFER', concept, dueDate: start, paidAt: start, periodStart: start, periodEnd: end, operationId: operation('referral-payment'), approvedEffectAppliedAt: start } });
}

// Referidos adicionales: la fase exige cubrir la causacion, no solo el conteo minimo.
scenario('el pago del piloto no cuenta como primer pago mensual del referido', async () => {
  const id = await makeActivePilot({ referral: true }); await convert(id); await refreshReferralCommission(id); assert.equal((await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } })).commissionStatus, 'PENDING_PAYMENTS');
});
scenario('una cortesia no vuelve elegible la comision', async () => {
  const id = await makeActivePilot({ referral: true }); await convert(id); await addApprovedPayment(id, 'COURTESY'); await refreshReferralCommission(id); assert.equal((await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } })).commissionStatus, 'PENDING_PAYMENTS');
});
scenario('el segundo pago mensual vuelve elegible una mensualidad neta', async () => {
  const id = await makeActivePilot({ referral: true }); await convert(id); const second = await addApprovedPayment(id, 'SUBSCRIPTION_MONTHLY'); await refreshReferralCommission(id); const row = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } }); assert.equal(row.commissionStatus, 'ELIGIBLE'); assert.equal(row.commissionEligibleCents, second.amountCents);
});
scenario('recalcular la comision elegible no duplica la causacion', async () => {
  const id = await makeActivePilot({ referral: true }); await convert(id); await addApprovedPayment(id, 'SUBSCRIPTION_MONTHLY'); const first = await refreshReferralCommission(id); const second = await refreshReferralCommission(id); assert.equal(second.commissionEligibleAt?.getTime(), first.commissionEligibleAt?.getTime());
});
scenario('un referido convertido a anual queda en revision manual', async () => {
  const id = await makeActivePilot({ referral: true }); await convert(id, 'ANNUAL'); assert.equal((await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } })).commissionStatus, 'MANUAL_REVIEW');
});
scenario('Super Admin marca una comision elegible como pagada una sola vez', async () => {
  const id = await makeActivePilot({ referral: true }); await convert(id); await addApprovedPayment(id, 'SUBSCRIPTION_MONTHLY'); await refreshReferralCommission(id); const op = operation('commission-paid'); const paidAt = new Date(); const input = { operationId: op, reference: 'COM-001', paidAt }; await markReferralCommissionPaid(actorId, id, input); await markReferralCommissionPaid(actorId, id, input); assert.equal((await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: id } })).commissionStatus, 'PAID');
});

assert.ok(declaredTests >= 64, 'La fase C7B debe declarar al menos 64 pruebas focalizadas');
