'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ResidentShell } from '@/components/shell/ResidentShell';
import { Toast, useToast } from '@/components/shell/Toast';
import { COLORS, RADIUS, badgeStyle } from '@/lib/design/tokens';

type Charge = {
  id: string;
  period: string;
  concept: string;
  amountCents: number;
  paidCents: number;
  dueDate: string;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
};

type Receipt = {
  id: string;
  originalFileName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  createdAt: string;
  charge: { id: string; period: string; concept: string };
};

const CHARGE_STATUS_LABEL: Record<Charge['status'], string> = { PENDING: 'Pendiente', PARTIAL: 'Parcial', PAID: 'Pagada', CANCELLED: 'Cancelada' };
const CHARGE_STATUS_BADGE = (status: Charge['status']) => {
  if (status === 'PAID') return badgeStyle(COLORS.successSoft, COLORS.success);
  if (status === 'CANCELLED') return badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);
  return badgeStyle(COLORS.warningSoft, COLORS.warning);
};
const RECEIPT_STATUS_LABEL: Record<Receipt['status'], string> = { PENDING: 'En revision', APPROVED: 'Aprobado', REJECTED: 'Rechazado', WITHDRAWN: 'Retirado' };

function cop(cents: number) {
  return (cents / 100).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric' });
}

const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: '18px 20px', marginBottom: 14 };
const primaryButton: React.CSSProperties = { border: 0, background: COLORS.navy, color: '#FFFFFF', fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryButton: React.CSSProperties = { border: `1.5px solid ${COLORS.inputBorder}`, background: '#FFFFFF', color: COLORS.navy, fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' };

export default function ResidentePagosPage() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [chargesRes, receiptsRes] = await Promise.all([
      fetch('/api/pagos', { cache: 'no-store' }),
      fetch('/api/pagos/comprobantes', { cache: 'no-store' }),
    ]);
    if (!chargesRes.ok || !receiptsRes.ok) throw new Error('load_failed');
    setCharges((await chargesRes.json()).data || []);
    setReceipts(await receiptsRes.json());
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    load().catch(() => { if (alive) setError('No se pudo cargar tu informacion de pagos.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]);

  const balanceCents = charges.reduce((sum, c) => sum + (c.status === 'CANCELLED' ? 0 : c.amountCents - c.paidCents), 0);

  async function uploadReceipt(chargeId: string) {
    const file = fileInputRef.current?.files?.[0];
    if (!file) { showToast('Selecciona un archivo primero'); return; }
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/pagos/${chargeId}/comprobantes`, { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) { showToast(body?.error || 'No se pudo cargar el comprobante'); return; }
      setUploadingFor(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
      showToast('Comprobante enviado para revision');
    } catch {
      showToast('No se pudo cargar el comprobante');
    }
  }

  async function withdrawReceipt(id: string) {
    const res = await fetch(`/api/pagos/comprobantes/${id}/retirar`, { method: 'POST' });
    const body = await res.json().catch(() => null);
    if (!res.ok) { showToast(body?.error || 'No se pudo retirar el comprobante'); return; }
    await load();
    showToast('Comprobante retirado');
  }

  const bottomNav = [
    { key: 'inicio', label: 'Inicio', icon: '⌂', onClick: () => router.push('/residente') },
    { key: 'pagos', label: 'Pagos', icon: '$', onClick: () => {} },
    { key: 'perfil', label: 'Perfil', icon: '◐', onClick: () => router.push('/residente') },
    { key: 'ayuda', label: 'Ayuda', icon: '?', onClick: () => router.push('/residente') },
  ];

  return (
    <ResidentShell activeKey="pagos" initials="RS" greetingName="Residente" bottomNav={bottomNav}>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>Pagos</h1>
      <p style={{ color: COLORS.textSecondary, marginBottom: 16, fontSize: 14 }}>Cuotas de administracion de tu unidad</p>

      {error && <div style={{ background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 12, padding: 12, fontSize: 12.5, fontWeight: 600, marginBottom: 16 }}>{error}</div>}
      {loading && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Cargando…</div>}

      {!loading && (
        <div style={{ ...cardStyle, background: COLORS.navy, color: '#FFFFFF' }}>
          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700, marginBottom: 4 }}>SALDO PENDIENTE</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{cop(balanceCents)}</div>
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 800, margin: '20px 0 10px' }}>Obligaciones</div>
      {!loading && charges.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>No tienes obligaciones registradas.</div>}
      {charges.map((c) => (
        <div key={c.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <b style={{ fontSize: 14 }}>{c.concept}</b>
            <span style={CHARGE_STATUS_BADGE(c.status)}>{CHARGE_STATUS_LABEL[c.status]}</span>
          </div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 }}>
            {c.period} · Vence {fmtDate(c.dueDate)} · {cop(c.paidCents)} / {cop(c.amountCents)}
          </div>
          {c.status !== 'PAID' && c.status !== 'CANCELLED' && uploadingFor !== c.id && (
            <button type="button" onClick={() => setUploadingFor(c.id)} style={secondaryButton}>Cargar comprobante</button>
          )}
          {uploadingFor === c.id && (
            <div>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ marginBottom: 10, fontSize: 12.5 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => uploadReceipt(c.id)} style={primaryButton}>Enviar</button>
                <button type="button" onClick={() => setUploadingFor(null)} style={secondaryButton}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      ))}

      <div style={{ fontSize: 13, fontWeight: 800, margin: '24px 0 10px' }}>Mis comprobantes</div>
      {!loading && receipts.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Aun no has cargado comprobantes.</div>}
      {receipts.map((r) => (
        <div key={r.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <b style={{ fontSize: 13.5 }}>{r.charge.period} · {r.charge.concept}</b>
            <span style={badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt)}>{RECEIPT_STATUS_LABEL[r.status]}</span>
          </div>
          <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 8 }}>{r.originalFileName} · {fmtDate(r.createdAt)}</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <a href={`/api/pagos/comprobantes/${r.id}/archivo`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.navy }}>Ver archivo</a>
            {r.status === 'PENDING' && (
              <button type="button" onClick={() => withdrawReceipt(r.id)} style={{ ...secondaryButton, padding: '4px 10px', fontSize: 11.5 }}>Retirar</button>
            )}
          </div>
        </div>
      ))}
      <Toast message={toast} bottom={78} />
    </ResidentShell>
  );
}
