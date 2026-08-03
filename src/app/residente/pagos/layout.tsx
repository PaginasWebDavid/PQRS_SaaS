import type { ReactNode } from "react";
import { FeatureGate } from "@/components/commercial/FeatureGate";

export default function Layout({ children }: { children: ReactNode }) {
  return <FeatureGate feature="RESIDENT_PAYMENTS" backHref="/residente">{children}</FeatureGate>;
}
