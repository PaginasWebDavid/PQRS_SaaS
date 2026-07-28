"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { COLORS } from "@/lib/design/tokens";
import { LogoMark } from "@/components/shell/Logo";

type Membership = {
  id: string;
  tenantId: string;
  tenantName: string;
  role: "ADMIN" | "CONSEJO" | "RESIDENTE";
};

export default function SelectTenantPage() {
  const { update } = useSession();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "No autorizado");
        setMemberships(data.memberships ?? []);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudieron cargar tus conjuntos"
        )
      )
      .finally(() => setLoading(false));
  }, []);

  async function selectTenant(tenantId: string) {
    setSelecting(tenantId);
    setError("");
    const response = await fetch("/api/me/tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setError(data?.error || "No se pudo seleccionar el conjunto");
      setSelecting(null);
      return;
    }
    await update();
    window.location.assign(data.redirectTo || "/dashboard");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#FFFFFF",
      }}
    >
      <section style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ marginBottom: 22 }}>
          <LogoMark size={32} />
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}>
          Elige un conjunto
        </h1>
        <p
          style={{
            color: COLORS.textSecondary,
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.5,
            margin: "0 0 24px",
          }}
        >
          Tu cuenta tiene acceso a más de un conjunto.
        </p>
        {loading && <p>Cargando conjuntos…</p>}
        {!loading && memberships.length === 0 && (
          <p>No tienes membresías activas.</p>
        )}
        <div style={{ display: "grid", gap: 10 }}>
          {memberships.map((membership) => (
            <button
              key={membership.id}
              type="button"
              disabled={selecting !== null}
              onClick={() => void selectTenant(membership.tenantId)}
              style={{
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#FFFFFF",
                borderRadius: 12,
                padding: "15px 16px",
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <strong style={{ display: "block", fontSize: 14 }}>
                {membership.tenantName}
              </strong>
              <span
                style={{
                  color: COLORS.textSecondary,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {membership.role}
                {selecting === membership.tenantId
                  ? " · Seleccionando…"
                  : ""}
              </span>
            </button>
          ))}
        </div>
        {error && (
          <p style={{ color: COLORS.danger, fontSize: 13, fontWeight: 600 }}>
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
