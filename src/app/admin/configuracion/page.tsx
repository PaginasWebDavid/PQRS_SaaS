'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/shell/AdminShell';
import { useIsMobile } from '@/components/shell/Sheet';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS } from '@/lib/design/tokens';

type TenantInfo = { units?: number | null; status?: string | null };
type TenantSettings = { tenant?: TenantInfo | null; pqrsCloseSlaDays?: number; integrations?: { correoTransaccional: boolean; almacenamientoEvidencias: boolean; pagos: boolean } };

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Falta primer pago', TRIAL: 'Trial', ACTIVE: 'Activa',
  GRACE_PERIOD: 'En mora', SUSPENDED: 'Suspendida', CANCELLED: 'Cancelada',
};

function IntegrationRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${COLORS.borderSoft}`, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: ok ? COLORS.success : COLORS.warning, flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: ok ? COLORS.success : COLORS.warning }} />
        {ok ? 'Conectado' : 'No disponible'}
      </span>
    </div>
  );
}

export default function ConfiguracionConjuntoPage() {
  const isMobile = useIsMobile();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const { toast, showToast } = useToast();

  useEffect(() => {
    fetch('/api/me').then((r) => r.ok ? r.json() : null).then((data) => {
      if (!data) return;
      setName(data.tenant?.name || '');
      setCity(data.tenant?.city || '');
      setAddress(data.tenant?.address || '');
      setEmail(data.user?.email || '');
    }).catch(() => setLoadError('No se pudo cargar la información del conjunto.'));
    fetch('/api/tenant').then((r) => r.ok ? r.json() : null).then((data) => { if (data) setSettings(data); }).catch(() => setLoadError('No se pudo cargar la configuración del conjunto.'));
  }, []);

  async function saveTenant() {
    try {
      const res = await fetch('/api/tenant', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, city, address }) });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setSettings((current) => current ? { ...current, tenant: body } : current);
        showToast('Configuración guardada ✓');
      } else {
        showToast(body?.error || 'No se pudo guardar la configuración');
      }
    } catch {
      showToast('No se pudo guardar la configuración. Revisa tu conexión.');
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: '#FFFFFF' };
  const statusLabel = settings?.tenant?.status ? (STATUS_LABEL[settings.tenant.status] || settings.tenant.status) : '—';

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="configuracion" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Configuración">
      <h1 className="apl-up" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Configuración del conjunto</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 24px' }}>Estos datos se leen y guardan en tu conjunto real.</p>
      {loadError && <p style={{ color: COLORS.danger, fontSize: 13, fontWeight: 700, margin: '-10px 0 20px' }}>{loadError}</p>}

      <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 16 }}>Información general</div>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nombre del conjunto</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
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
          <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 16 }}>Correo de la cuenta: <span style={{ color: COLORS.textPrimary, fontWeight: 800 }}>{email}</span></div>
          <button onClick={saveTenant} style={{ border: 0, background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '13px 26px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Guardar cambios</button>
        </div>

        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 16 }}>Licencia y reglas del servicio</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>ESTADO</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{statusLabel}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>UNIDADES CONTRATADAS</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{settings?.tenant?.units ?? '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>SLA DE CIERRE</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{settings?.pqrsCloseSlaDays ?? '—'} días</div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.6, margin: '0 0 14px' }}>
            Una PQRS se marca como vencida en Reportes cuando supera este número de días sin resolverse. Esta regla la define PQRS Services para toda la plataforma.
          </p>
          <Link href="/admin/licencias" style={{ fontSize: 13, fontWeight: 700, color: COLORS.navy }}>Ver detalle de licencia y pagos →</Link>
        </div>

        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 4 }}>Estado del sistema</div>
          <p style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 10px' }}>Si algo no está conectado, contacta a soporte de PQRS Services.</p>
          <IntegrationRow label="Correo transaccional (invitaciones, confirmaciones)" ok={Boolean(settings?.integrations?.correoTransaccional)} />
          <IntegrationRow label="Almacenamiento de evidencias" ok={Boolean(settings?.integrations?.almacenamientoEvidencias)} />
          <IntegrationRow label="Pagos (Mercado Pago)" ok={Boolean(settings?.integrations?.pagos)} />
        </div>

        <p style={{ fontSize: 12.5, color: COLORS.textMuted, fontWeight: 500 }}>
          ¿Buscas activar o desactivar tus correos de nuevas PQRS? Eso se configura en <Link href="/admin/cuenta" style={{ color: COLORS.navy, fontWeight: 700 }}>Mi cuenta</Link>.
        </p>
      </div>

      <Toast message={toast} />
    </AdminShell>
  );
}
