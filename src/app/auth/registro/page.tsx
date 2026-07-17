'use client';

import Link from 'next/link';
import { BrandLockup } from '@/components/shell/Logo';
import { COLORS, FONTS, RADIUS } from '@/lib/design/tokens';

export default function RegistroPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.white, fontFamily: FONTS.sans, color: COLORS.textPrimary, padding: "48px 20px" }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}><BrandLockup size={28} /></div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 10px" }}>Acceso por invitacion</h1>
        <p style={{ fontSize: 14, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.6, margin: "0 0 24px" }}>
          Para proteger la informacion de cada conjunto, las cuentas se activan unicamente desde una invitacion enviada por su administrador.
        </p>
        <div style={{ background: COLORS.bgCard, borderRadius: 16, padding: 20, marginBottom: 22, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
          Si recibiste un correo de invitacion, abre el enlace incluido, crea tu contrasena y luego inicia sesion.
        </div>
        <Link href="/auth/login" style={{ display: "block", background: COLORS.navy, color: COLORS.white, fontSize: 14, fontWeight: 700, padding: "13px 0", borderRadius: RADIUS.pill }}>
          Ir a iniciar sesion
        </Link>
      </div>
    </div>
  );
}
