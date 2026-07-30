-- Annual billing uses the fixed 10% policy discount (1000 bps). The service
-- continues to enforce a separate 500 bps maximum for monthly commercial discounts.
ALTER TABLE "TenantCommercialProfile"
  DROP CONSTRAINT "TenantCommercialProfile_discountBps_check";

ALTER TABLE "TenantCommercialProfile"
  ADD CONSTRAINT "TenantCommercialProfile_discountBps_check"
  CHECK ("discountBps" BETWEEN 0 AND 1000);
