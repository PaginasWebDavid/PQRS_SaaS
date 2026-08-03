import type { ReactNode } from "react";
import { FeatureGate } from "@/components/commercial/FeatureGate";

export default function Layout({ children }: { children: ReactNode }) {
  return <FeatureGate feature="RESERVATIONS" backHref="/admin/dashboard">{children}</FeatureGate>;
}
