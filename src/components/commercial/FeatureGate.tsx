import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser } from "@/lib/authorization";
import { assertTenantFeatureActive, FeatureUnavailableError } from "@/domains/commercial/entitlement.service";
import { COLORS, RADIUS } from "@/lib/design/tokens";

const FEATURE_NAME: Record<string, string> = {
  RESERVATIONS: "Reservas de zonas comunes",
  RESIDENT_PAYMENTS: "Pagos de residentes",
};

export async function FeatureGate({
  feature,
  backHref = "/",
  children,
}: {
  feature: "RESERVATIONS" | "RESIDENT_PAYMENTS";
  backHref?: string;
  children: ReactNode;
}): Promise<ReactElement> {
  try {
    const identity = await requireActiveTenantUser(await auth());
    await assertTenantFeatureActive(identity.tenantId, feature);
    return <>{children}</>;
  } catch (error) {
    const unavailable = error instanceof FeatureUnavailableError;
    const featureName = FEATURE_NAME[feature] || "Este módulo";
    return (
      <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24, background: COLORS.bg }}>
        <section style={{ maxWidth: 460, textAlign: "center", background: COLORS.bgCard, borderRadius: RADIUS.card, padding: "34px 28px" }}>
          <div style={{ width: 46, height: 46, borderRadius: RADIUS.pill, background: unavailable ? COLORS.navySoft : COLORS.warningSoft, color: unavailable ? COLORS.navy : COLORS.warning, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, fontWeight: 800, margin: "0 auto 18px" }}>
            {unavailable ? "🔒" : "!"}
          </div>
          <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 10px", color: COLORS.textPrimary }}>
            {unavailable ? `${featureName} no está contratado` : "No pudimos verificar tu acceso"}
          </h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 13.5, fontWeight: 500, lineHeight: 1.6, margin: "0 0 22px" }}>
            {unavailable
              ? "Tu conjunto no tiene este módulo activo, por eso no aparece en el menú. Si quieres habilitarlo, escríbenos y lo activamos."
              : "Puede ser un problema momentáneo de conexión. Vuelve a intentarlo en unos segundos."}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href={backHref} style={{ background: COLORS.navy, color: COLORS.white, fontSize: 13, fontWeight: 700, padding: "11px 18px", borderRadius: RADIUS.pill, textDecoration: "none" }}>
              Volver al inicio
            </Link>
            {unavailable && (
              <a href="mailto:hola@pqrsservices.com?subject=Quiero%20activar%20un%20modulo" style={{ border: `1.5px solid ${COLORS.inputBorder}`, color: COLORS.textPrimary, fontSize: 13, fontWeight: 700, padding: "11px 18px", borderRadius: RADIUS.pill, textDecoration: "none" }}>
                Escríbenos
              </a>
            )}
          </div>
        </section>
      </main>
    );
  }
}
