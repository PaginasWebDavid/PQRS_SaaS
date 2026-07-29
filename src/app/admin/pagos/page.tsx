'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/design/tokens';

type Charge = {
  id: string;
  period: string;
  concept: string;
  amountCents: number;
  paidCents: number;
  dueDate: string;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  unit: { bloque: number; apto: number };
};

type Receipt = {
  id: string;
  originalFileName: string;
  mimeType: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  declaredAmountCents: number | null;
  createdAt: string;
  charge: { id: string; period: string; concept: string };
};

type ImportBatch = {
  id: string;
  fileName: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdRows: number;
  duplicateRows: number;
  errorSummary: { row: number; message: string }[] | null;
  createdAt: string;
};

const CHARGE_STATUS_LABEL: Record<Charge['status'], string> = { PENDING: 'Pendiente', PARTIAL: 'Parcial', PAID: 'Pagada', CANCELLED: 'Cancelada' };
const CHARGE_STATUS_BADGE = (status: Charge['status']) => {
  if (status === 'PENDING') return badgeStyle(COLORS.warningSoft, COLORS.warning);
  if (status === 'PARTIAL') return badgeStyle(COLORS.warningSoft, COLORS.warning);
  if (status === 'PAID') return badgeStyle(COLORS.successSoft, COLORS.success);
  return badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);
};
const RECEIPT_STATUS_LABEL: Record<Receipt['status'], string> = { PENDING: 'Pendiente', APPROVED: 'Aprobado', REJECTED: 'Rechazado', WITHDRAWN: 'Retirado' };

function cop(cents: number) {
  return (cents / 100).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric' });
}

const inputStyle: React.CSSProperties = { width: '100%', height: 42, padding: '0 12px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5, color: COLORS.textSecondaryAlt };
const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: '20px 22px', marginBottom: 16 };
const primaryButton: React.CSSProperties = { border: 0, background: COLORS.navy, color: '#FFFFFF', fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryButton: React.CSSProperties = { border: `1.5px solid ${COLORS.inputBorder}`, background: '#FFFFFF', color: COLORS.textSecondaryAlt, fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' };

export default function AdminPagosPage() {
  const [section, setSection] = useState<'obligaciones' | 'comprobantes' | 'importar'>('obligaciones');
  const [charges, setCharges] = useState<Charge[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [chargeStatusFilter, setChargeStatusFilter] = useState<'' | Charge['status']>('');
  const [receiptStatusFilter, setReceiptStatusFilter] = useState<'' | Receipt['status']>('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateCharge, setShowCreateCharge] = useState(false);
  const [creatingCharge, setCreatingCharge] = useState(false);
  const [chargeForm, setChargeForm] = useState({ bloque: '', apto: '', period: '', concept: '', amountCents: '', dueDate: '' });
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewAmount, setReviewAmount] = useState('');
  const [reviewReference, setReviewReference] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCharges = useCallback(async (status: string) => {
    const res = await fetch(`/api/pagos${status ? `?status=${status}` : ''}`, { cache: 'no-store' });
    if (res.ok) setCharges((await res.json()).data || []);
  }, []);
  const loadReceipts = useCallback(async (status: string) => {
    const res = await fetch(`/api/pagos/comprobantes${status ? `?status=${status}` : ''}`, { cache: 'no-store' });
    if (res.ok) setReceipts(await res.json());
  }, []);
  const loadBatches = useCallback(async () => {
    const res = await fetch('/api/pagos/importaciones', { cache: 'no-store' });
    if (res.ok) setBatches(await res.json());
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([loadCharges(chargeStatusFilter), loadReceipts(receiptStatusFilter), loadBatches()])
      .catch(() => { if (alive) setError('No se pudo cargar la informacion de pagos.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [loadCharges, loadReceipts, loadBatches, chargeStatusFilter, receiptStatusFilter]);

  async function createCharge() {
    if (creatingCharge) return;
    setCreatingCharge(true);
    try {
      const res = await fetch('/api/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bloque: Number(chargeForm.bloque),
          apto: Number(chargeForm.apto),
          period: chargeForm.period,
          concept: chargeForm.concept,
          amountCents: Math.round(Number(chargeForm.amountCents) * 100),
          dueDate: new Date(`${chargeForm.dueDate}T00:00:00.000Z`).toISOString(),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error || 'No se pudo crear la obligacion'); return; }
      setShowCreateCharge(false);
      setChargeForm({ bloque: '', apto: '', period: '', concept: '', amountCents: '', dueDate: '' });
      await loadCharges(chargeStatusFilter);
    } finally {
      setCreatingCharge(false);
    }
  }

  async function cancelCharge(id: string) {
    const res = await fetch(`/api/pagos/${id}/cancelar`, { method: 'POST' });
    const body = await res.json().catch(() => null);
    if (!res.ok) { setError(body?.error || 'No se pudo cancelar la obligacion'); return; }
    await loadCharges(chargeStatusFilter);
  }

  async function reviewReceipt(id: string, decision: 'APPROVED' | 'REJECTED') {
    const res = await fetch(`/api/pagos/comprobantes/${id}/revisar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        decision === 'APPROVED'
          ? { decision, amountCents: Math.round(Number(reviewAmount) * 100), paidAt: new Date().toISOString(), reference: reviewReference || undefined }
          : { decision, rejectionReason }
      ),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) { setError(body?.error || 'No se pudo actualizar el comprobante'); return; }
    setReviewingId(null);
    setReviewAmount('');
    setReviewReference('');
    setRejectionReason('');
    await Promise.all([loadReceipts(receiptStatusFilter), loadCharges(chargeStatusFilter)]);
  }

  async function uploadImportFile() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/pagos/importar', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error || 'No se pudo importar el archivo'); return; }
      if (fileInputRef.current) fileInputRef.current.value = '';
      await Promise.all([loadBatches(), loadCharges(chargeStatusFilter)]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="pagos" userName="Administradora" userRole="Administradora" initials="AD" mobileTitle="Pagos">
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Pagos de administracion</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 20px' }}>Cuotas, comprobantes e importacion de obligaciones</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setSection('obligaciones')} style={{ ...tabStyle(section === 'obligaciones'), border: 'none', fontFamily: 'inherit' }}>Obligaciones</button>
        <button type="button" onClick={() => setSection('comprobantes')} style={{ ...tabStyle(section === 'comprobantes'), border: 'none', fontFamily: 'inherit' }}>Comprobantes</button>
        <button type="button" onClick={() => setSection('importar')} style={{ ...tabStyle(section === 'importar'), border: 'none', fontFamily: 'inherit' }}>Importar</button>
      </div>

      {error && <div style={{ background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 12, padding: 12, fontSize: 12.5, fontWeight: 600, marginBottom: 16 }}>{error}</div>}
      {loading && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Cargando…</div>}

      {!loading && section === 'obligaciones' && (
        <>
          <button type="button" onClick={() => setShowCreateCharge((v) => !v)} style={{ ...primaryButton, marginBottom: 16 }}>
            {showCreateCharge ? 'Cerrar' : '+ Nueva obligacion'}
          </button>
          {showCreateCharge && (
            <div style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Bloque</label>
                  <input inputMode="numeric" value={chargeForm.bloque} onChange={(e) => setChargeForm((f) => ({ ...f, bloque: e.target.value.replace(/\D/g, '') }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Apto</label>
                  <input inputMode="numeric" value={chargeForm.apto} onChange={(e) => setChargeForm((f) => ({ ...f, apto: e.target.value.replace(/\D/g, '') }))} style={inputStyle} />
                </div>
              </div>
              <label style={labelStyle}>Periodo (AAAA-MM)</label>
              <input value={chargeForm.period} onChange={(e) => setChargeForm((f) => ({ ...f, period: e.target.value }))} placeholder="2026-08" style={inputStyle} />
              <label style={labelStyle}>Concepto</label>
              <input value={chargeForm.concept} onChange={(e) => setChargeForm((f) => ({ ...f, concept: e.target.value }))} placeholder="Cuota de administracion" style={inputStyle} />
              <label style={labelStyle}>Monto (COP)</label>
              <input inputMode="decimal" value={chargeForm.amountCents} onChange={(e) => setChargeForm((f) => ({ ...f, amountCents: e.target.value.replace(/[^\d.]/g, '') }))} style={inputStyle} />
              <label style={labelStyle}>Fecha de vencimiento</label>
              <input type="date" value={chargeForm.dueDate} onChange={(e) => setChargeForm((f) => ({ ...f, dueDate: e.target.value }))} style={inputStyle} />
              <button type="button" onClick={createCharge} disabled={creatingCharge} style={primaryButton}>{creatingCharge ? 'Creando…' : 'Crear obligacion'}</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {(['', 'PENDING', 'PARTIAL', 'PAID', 'CANCELLED'] as const).map((s) => (
              <button key={s || 'all'} type="button" onClick={() => setChargeStatusFilter(s)} style={{ ...tabStyle(chargeStatusFilter === s), border: 'none', fontFamily: 'inherit' }}>
                {s ? CHARGE_STATUS_LABEL[s] : 'Todas'}
              </button>
            ))}
          </div>
          {charges.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>No hay obligaciones en este estado.</div>}
          {charges.map((c) => (
            <div key={c.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <b style={{ fontSize: 14 }}>Bloque {c.unit.bloque} - Apto {c.unit.apto} · {c.concept}</b>
                <span style={CHARGE_STATUS_BADGE(c.status)}>{CHARGE_STATUS_LABEL[c.status]}</span>
              </div>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 6 }}>
                {c.period} · Vence {fmtDate(c.dueDate)} · {cop(c.paidCents)} / {cop(c.amountCents)}
              </div>
              {c.status !== 'CANCELLED' && c.paidCents === 0 && (
                <button type="button" onClick={() => cancelCharge(c.id)} style={secondaryButton}>Cancelar obligacion</button>
              )}
            </div>
          ))}
        </>
      )}

      {!loading && section === 'comprobantes' && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', ''] as const).map((s) => (
              <button key={s || 'all'} type="button" onClick={() => setReceiptStatusFilter(s)} style={{ ...tabStyle(receiptStatusFilter === s), border: 'none', fontFamily: 'inherit' }}>
                {s ? RECEIPT_STATUS_LABEL[s] : 'Todos'}
              </button>
            ))}
          </div>
          {receipts.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>No hay comprobantes en este estado.</div>}
          {receipts.map((r) => (
            <div key={r.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <b style={{ fontSize: 14 }}>{r.charge.period} · {r.charge.concept}</b>
                <span style={badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt)}>{RECEIPT_STATUS_LABEL[r.status]}</span>
              </div>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 }}>
                {r.originalFileName} · {fmtDate(r.createdAt)}
                {r.declaredAmountCents ? ` · declarado ${cop(r.declaredAmountCents)}` : ''}
              </div>
              <a href={`/api/pagos/comprobantes/${r.id}/archivo`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.navy }}>Ver archivo</a>
              {r.status === 'PENDING' && reviewingId !== r.id && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={() => setReviewingId(r.id)} style={primaryButton}>Revisar</button>
                </div>
              )}
              {reviewingId === r.id && (
                <div style={{ marginTop: 10 }}>
                  <label style={labelStyle}>Monto a aplicar (COP)</label>
                  <input inputMode="decimal" value={reviewAmount} onChange={(e) => setReviewAmount(e.target.value.replace(/[^\d.]/g, ''))} style={inputStyle} defaultValue={r.declaredAmountCents ? String(r.declaredAmountCents / 100) : ''} />
                  <label style={labelStyle}>Referencia (opcional)</label>
                  <input value={reviewReference} onChange={(e) => setReviewReference(e.target.value)} style={inputStyle} />
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button type="button" onClick={() => reviewReceipt(r.id, 'APPROVED')} disabled={!reviewAmount} style={primaryButton}>Aprobar y registrar pago</button>
                  </div>
                  <label style={labelStyle}>Motivo de rechazo</label>
                  <input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} style={inputStyle} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => reviewReceipt(r.id, 'REJECTED')} disabled={!rejectionReason.trim()} style={secondaryButton}>Rechazar</button>
                    <button type="button" onClick={() => { setReviewingId(null); setReviewAmount(''); setReviewReference(''); setRejectionReason(''); }} style={secondaryButton}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {!loading && section === 'importar' && (
        <>
          <div style={cardStyle}>
            <label style={labelStyle}>Archivo Excel (.xlsx)</label>
            <input ref={fileInputRef} type="file" accept=".xlsx" style={{ marginBottom: 12 }} />
            <div>
              <button type="button" onClick={uploadImportFile} disabled={uploading} style={primaryButton}>{uploading ? 'Importando…' : 'Importar obligaciones'}</button>
            </div>
            <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 10 }}>
              Columnas esperadas: bloque, apto, periodo (AAAA-MM), concepto, monto, vencimiento, referencia (opcional).
            </p>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, margin: '20px 0 10px' }}>Importaciones recientes</div>
          {batches.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Aun no hay importaciones.</div>}
          {batches.map((b) => (
            <div key={b.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <b style={{ fontSize: 13.5 }}>{b.fileName}</b>
                <span style={b.status === 'COMPLETED' ? badgeStyle(COLORS.successSoft, COLORS.success) : b.status === 'FAILED' ? badgeStyle(COLORS.dangerSoft, COLORS.danger) : badgeStyle(COLORS.warningSoft, COLORS.warning)}>{b.status}</span>
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 6 }}>
                {fmtDate(b.createdAt)} · {b.totalRows} filas · {b.createdRows} creadas · {b.duplicateRows} duplicadas · {b.invalidRows} invalidas
              </div>
              {b.errorSummary && b.errorSummary.length > 0 && (
                <details>
                  <summary style={{ fontSize: 12, fontWeight: 700, cursor: 'pointer', color: COLORS.textSecondaryAlt }}>Ver errores</summary>
                  <ul style={{ fontSize: 12, color: COLORS.textSecondary, margin: '6px 0 0', paddingLeft: 18 }}>
                    {b.errorSummary.map((entry, index) => (
                      <li key={index}>Fila {entry.row}: {entry.message}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </>
      )}
    </AdminShell>
  );
}
