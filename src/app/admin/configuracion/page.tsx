'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS } from '@/lib/design/tokens';

export default function ConfiguracionConjuntoPage() {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const { toast, showToast } = useToast();

  useEffect(() => { fetch('/api/me').then((r) => r.ok ? r.json() : null).then((data) => { if (!data) return; setName(data.tenant?.name || ''); setCity(data.tenant?.city || ''); setAddress(data.tenant?.address || ''); setEmail(data.user?.email || ''); }).catch(() => {}); }, []);
  async function saveTenant() { const res = await fetch('/api/tenant', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, city, address }) }); showToast(res.ok ? 'Configuración guardada ✓' : 'No se pudo guardar la configuración'); }

  const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: '#FFFFFF' };

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="configuracion" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Configuración">
      <h1 className="apl-up" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Configuración del conjunto</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 24px' }}>Estos datos se leen y guardan en tu tenant real.</p>

      <div style={{ maxWidth: 680 }}>
        <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22, marginBottom: 24 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 16 }}>Información general</div>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nombre del conjunto</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Ciudad</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Dirección</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ background: COLORS.navySoft, borderRadius: 10, padding: '11px 14px', fontSize: 12, color: COLORS.navy, fontWeight: 600, marginBottom: 14 }}>El número de unidades y el plan de precio los administra PQRS Services.</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.textSecondary }}>Correo de la cuenta: <span style={{ color: COLORS.textPrimary, fontWeight: 800 }}>{email}</span></div>
        </div>

        <button onClick={saveTenant} style={{ border: 0, background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', maxWidth: 220, width: '100%' }}>Guardar cambios</button>
      </div>

      <Toast message={toast} />
    </AdminShell>
  );
}
