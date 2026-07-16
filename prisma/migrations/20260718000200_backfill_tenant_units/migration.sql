UPDATE "Tenant" AS tenant
SET "units" = subscription."unitsSnapshot"
FROM "Subscription" AS subscription
WHERE subscription."tenantId" = tenant."id"
  AND tenant."units" <= 0
  AND subscription."unitsSnapshot" > 0;
