import type { ReactElement, ReactNode } from "react";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser } from "@/lib/authorization";
import { assertTenantFeatureActive, FeatureUnavailableError } from "@/domains/commercial/entitlement.service";

export async function FeatureGate({ feature, children }: { feature: "RESERVATIONS" | "RESIDENT_PAYMENTS"; children: ReactNode }): Promise<ReactElement> {
  try {
    const identity = await requireActiveTenantUser(await auth());
    await assertTenantFeatureActive(identity.tenantId, feature);
    return <>{children}</>;
  } catch (error) {
    const unavailable = error instanceof FeatureUnavailableError;
    return (
      <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Manrope, sans-serif" }}>
        <section style={{ maxWidth: 460, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 10px" }}>{unavailable ? "Modulo no contratado" : "Acceso no disponible"}</h1>
          <p style={{ color: "#6E6E73", fontSize: 14, fontWeight: 500, lineHeight: 1.6, margin: 0 }}>
            {unavailable ? "Este modulo no forma parte del alcance activo de tu conjunto." : "No fue posible verificar el acceso a este modulo."}
          </p>
        </section>
      </main>
    );
  }
}
