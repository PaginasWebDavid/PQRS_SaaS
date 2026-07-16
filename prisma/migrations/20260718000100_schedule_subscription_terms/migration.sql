ALTER TABLE "Subscription"
  ADD COLUMN "pendingUnitsSnapshot" INTEGER,
  ADD COLUMN "pendingPriceCents" INTEGER,
  ADD COLUMN "pendingCurrency" TEXT,
  ADD COLUMN "pendingPriceEffectiveAt" TIMESTAMP(3);