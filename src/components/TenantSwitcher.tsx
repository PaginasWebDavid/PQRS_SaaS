"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { COLORS } from "@/lib/design/tokens";

type Membership = {
  id: string;
  tenantId: string;
  tenantName: string;
  role: "ADMIN" | "CONSEJO" | "RESIDENTE";
};

export function TenantSwitcher() {
  const { update } = useSession();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return;
        setMemberships(data.memberships ?? []);
        setSelectedTenantId(data.selectedTenantId ?? "");
      })
      .catch(() => null);
  }, []);

  if (memberships.length <= 1) return null;

  async function changeTenant(tenantId: string) {
    if (!tenantId || tenantId === selectedTenantId || changing) return;
    setChanging(true);
    const response = await fetch("/api/me/tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setChanging(false);
      return;
    }
    await update();
    window.location.assign(data.redirectTo || "/dashboard");
  }

  return (
    <label style={{ display: "block", marginTop: 10 }}>
      <span
        style={{
          display: "block",
          fontSize: 10.5,
          color: COLORS.textMuted,
          fontWeight: 700,
          marginBottom: 5,
        }}
      >
        CAMBIAR CONJUNTO
      </span>
      <select
        aria-label="Cambiar conjunto"
        value={selectedTenantId}
        disabled={changing}
        onChange={(event) => void changeTenant(event.target.value)}
        style={{
          width: "100%",
          height: 36,
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          background: "#FFFFFF",
          color: COLORS.textPrimary,
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 700,
          padding: "0 10px",
        }}
      >
        {memberships.map((membership) => (
          <option key={membership.id} value={membership.tenantId}>
            {membership.tenantName} · {roleLabel(membership.role)}
          </option>
        ))}
      </select>
    </label>
  );
}

function roleLabel(role: Membership["role"]) {
  return {
    ADMIN: "Admin",
    CONSEJO: "Consejo",
    RESIDENTE: "Residente",
  }[role];
}
