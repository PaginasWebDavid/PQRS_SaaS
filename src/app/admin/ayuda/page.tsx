'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, badgeStyle } from '@/lib/design/tokens';

const FAQS = [
  { q: '¿Cómo cierro una PQRS?', a: 'Abre la solicitud en el módulo PQRS y usa "Avanzar estado" hasta llegar a Terminada, agregando una nota interna con la evidencia de cierre.' },
  { q: '¿Cómo invito a un nuevo usuario?', a: 'Ve a Invitaciones → Nueva invitación, ingresa el correo y el rol. El usuario recibirá un enlace para activar su cuenta.' },
  { q: '¿Puedo cambiar el número de unidades de mi conjunto?', a: 'No directamente. Esa información la administra PQRS Services — escríbenos abajo y lo ajustamos por ti.' },
  { q: '¿Cómo pago o renuevo mi licencia?', a: 'Ve a Licencias y pagos. Si te falta el primer pago o estás en mora, verás el botón "Pagar ahora con Mercado Pago". Mientras la renovación automática esté activada, el cobro mensual se hace solo.' },
  { q: '¿Qué pasa si mi conjunto queda en mora?', a: 'Tienes el período de gracia que se muestra en Licencias y pagos para ponerte al día antes de que la licencia se suspenda. Puedes pagar en cualquier momento desde ahí.' },
];

type Category = 'TECNICO' | 'FACTURACION' | 'CUENTA' | 'OTRO';
const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'TECNICO', label: 'Problema técnico' },
  { value: 'FACTURACION', label: 'Facturación' },
  { value: 'CUENTA', label: 'Mi cuenta / conjunto' },
  { value: 'OTRO', label: 'Otro' },
];

type Ticket = {
  id: string;
  subject: string;
  message: string;
  category: string;
  status: 'ABIERTA' | 'RESPONDIDA' | 'CERRADA';
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = { ABIERTA: 'Abierta', RESPONDIDA: 'Respondida', CERRADA: 'Cerrada' };
const statusBadge = (status: string) => status === 'ABIERTA' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : status === 'RESPONDIDA' ? badgeStyle(COLORS.successSoft, COLORS.success) : badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);

export default function AyudaPage() {
  const [open, setOpen] = useState(0);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<Category>('OTRO');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { toast, showToast } = useToast();
  const canSubmit = subject.trim() && message.trim() && !submitting;

  const fetchTickets = () => {
    setLoading(true);
    fetch('/api/support-tickets', { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error('No se pudieron cargar tus solicitudes'); return res.json(); })
      .then((data: Ticket[]) => setTickets(data))
      .catch(() => showToast('No se pudieron cargar tus solicitudes'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim(), category }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        showToast(body?.error || 'No se pudo enviar la solicitud');
        return;
      }
      setSubject('');
      setMessage('');
      setCategory('OTRO');
      fetchTickets();
      showToast('Solicitud enviada ✓ Te avisaremos por correo cuando la respondamos.');
    } catch {
      showToast('No se pudo enviar la solicitud. Revisa tu conexión.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="ayuda" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Ayuda">
      <h1 className="apl-up" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px', maxWidth: 720 }}>Centro de ayuda</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 24px' }}>Preguntas frecuentes y soporte para administradores</p>

      <div style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          {FAQS.map((f, i) => (
            <div key={f.q} style={{ background: COLORS.bgCard, borderRadius: 14, overflow: 'hidden' }}>
              <button type="button" onClick={() => setOpen(open === i ? -1 : i)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '16px 20px', border: 'none', background: 'transparent', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{f.q}</span>
                <span style={{ fontSize: 18, color: COLORS.textMuted, transform: open === i ? 'rotate(45deg)' : 'none', transition: 'transform 250ms' }}>＋</span>
              </button>
              {open === i && <p style={{ margin: 0, padding: '0 20px 16px', fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>{f.a}</p>}
            </div>
          ))}
        </div>

        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 24, marginBottom: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Contactar soporte</div>
          <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 18px' }}>¿No encontraste la respuesta arriba? Escríbenos y el equipo de PQRS Services te responderá por aquí y por correo.</p>

          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Tipo de solicitud</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCategory(opt.value)}
                style={{
                  border: category === opt.value ? 'none' : `1.5px solid ${COLORS.inputBorder}`,
                  background: category === opt.value ? COLORS.navy : 'none',
                  color: category === opt.value ? '#FFFFFF' : '#1D1D1F',
                  fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Asunto</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej. No puedo exportar un reporte" style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', marginBottom: 14 }} />
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Mensaje</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Cuéntanos qué necesitas" style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', marginBottom: 18, resize: 'vertical' }} />
          <button type="button" disabled={!canSubmit} onClick={submit} style={{ width: '100%', textAlign: 'center', background: canSubmit ? COLORS.navy : COLORS.neutralSoft, color: canSubmit ? '#FFFFFF' : COLORS.textMuted, fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: canSubmit ? 'pointer' : 'default' }}>{submitting ? 'Enviando…' : 'Enviar solicitud'}</button>
        </div>

        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 14, fontWeight: 800 }}>Mis solicitudes</div>
          {loading && <div style={{ padding: '32px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>Cargando…</div>}
          {!loading && tickets.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>Aún no has enviado ninguna solicitud.</div>
          )}
          {!loading && tickets.map((t) => (
            <div key={t.id} style={{ padding: '16px 20px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' }}>{t.subject}</span>
                <span style={{ ...statusBadge(t.status), flexShrink: 0 }}>{STATUS_LABEL[t.status]}</span>
              </div>
              <p style={{ fontSize: 12.5, color: COLORS.textSecondary, margin: '0 0 8px', lineHeight: 1.5 }}>{t.message}</p>
              {t.response && (
                <div style={{ background: COLORS.successSoft, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#1D1D1F', lineHeight: 1.5 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.success, marginBottom: 4 }}>Respuesta de PQRS Services</div>
                  {t.response}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Toast message={toast} />
    </AdminShell>
  );
}
