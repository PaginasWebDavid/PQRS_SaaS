'use client';
import { useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS } from '@/lib/design/tokens';

const FAQS = [
  { q: '¿Cómo cierro una PQRS?', a: 'Abre la solicitud en el módulo PQRS y usa "Avanzar estado" hasta llegar a Terminada, agregando una nota interna con la evidencia de cierre.' },
  { q: '¿Cómo invito a un nuevo usuario?', a: 'Ve a Invitaciones → Nueva invitación, ingresa el correo y el rol. El usuario recibirá un enlace para activar su cuenta.' },
  { q: '¿Puedo cambiar el número de unidades de mi conjunto?', a: 'No directamente. Esa información la administra PQRS Services — contáctanos por este centro de ayuda.' },
  { q: '¿Cómo renuevo mi licencia?', a: 'Ve a Licencias y pagos y usa el botón "Renovar licencia". La renovación no cambia tu tarifa, solo extiende la vigencia.' },
];

export default function AyudaPage() {
  const [open, setOpen] = useState(0);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const { toast, showToast } = useToast();
  const canSubmit = subject.trim() && message.trim();

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

        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Contactar soporte</div>
          <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 18px' }}>Escríbenos y el equipo de PQRS Services te responderá en menos de 24 horas.</p>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Asunto</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej. No puedo exportar un reporte" style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14 }} />
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Mensaje</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Cuéntanos qué necesitas" style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 18, resize: 'vertical' }} />
          <button type="button" disabled={!canSubmit} onClick={() => { if (!canSubmit) return; setSubject(''); setMessage(''); showToast('Mensaje enviado ✓ Te responderemos pronto.'); }} style={{ width: '100%', textAlign: 'center', background: canSubmit ? COLORS.navy : COLORS.neutralSoft, color: canSubmit ? '#FFFFFF' : COLORS.textMuted, fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: canSubmit ? 'pointer' : 'default' }}>Enviar mensaje</button>
        </div>
      </div>

      <Toast message={toast} />
    </AdminShell>
  );
}


