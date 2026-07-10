'use client';
import { useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Toast, useToast } from '@/components/Toast';
import { ADMIN_NAV } from '@/lib/adminNav';
import { COLORS, RADIUS, tabStyle, toggleTrackStyle, toggleDotStyle } from '@/lib/tokens';

export default function MiCuentaPage() {
  const [tab, setTab] = useState<'profile' | 'notif'>('profile');
  const [name, setName] = useState('Ana Ruiz');
  const [notif, setNotif] = useState({ pqrs: true, licencia: true, usuarios: true, invitaciones: false, errores: true });
  const { toast, showToast } = useToast();

  const notifDefs = [
    { key: 'pqrs', label: 'PQRS nuevas' }, { key: 'licencia', label: 'Licencia próxima a vencer' },
    { key: 'usuarios', label: 'Nuevos usuarios registrados' }, { key: 'invitaciones', label: 'Invitaciones aceptadas' }, { key: 'errores', label: 'Errores del sistema' },
  ] as const;

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="cuenta" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Mi cuenta">
      <h1 className="apl-up" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 18px', maxWidth: 640 }}>Mi cuenta</h1>

      <div style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
          <div onClick={() => setTab('profile')} style={tabStyle(tab === 'profile')}>Perfil</div>
          <div onClick={() => setTab('notif')} style={tabStyle(tab === 'notif')}>Notificaciones</div>
        </div>

        {tab === 'profile' && (
          <>
            <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 24, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
                <div style={{ width: 64, height: 64, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22 }}>AR</div>
                <div><div style={{ fontSize: 13, fontWeight: 700, color: COLORS.navy, cursor: 'pointer' }}>Cambiar foto</div><div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>JPG o PNG, máx. 2MB</div></div>
              </div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nombre completo</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14, background: '#FFFFFF' }} />
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Correo</label>
              <input value="ana.ruiz@parque100.com" disabled style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: '#F0F0F0', color: COLORS.textMuted }} />
            </div>
            <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 16 }}>Cambiar contraseña</div>
              <input type="password" placeholder="Contraseña actual" style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14, background: '#FFFFFF' }} />
              <input type="password" placeholder="Nueva contraseña" style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: '#FFFFFF' }} />
            </div>
            <div onClick={() => showToast('Perfil actualizado ✓')} style={{ background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', maxWidth: 220 }}>Guardar cambios</div>
          </>
        )}

        {tab === 'notif' && (
          <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: '8px 22px' }}>
            {notifDefs.map((n) => (
              <div key={n.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{n.label}</span>
                <div onClick={() => setNotif((v) => ({ ...v, [n.key]: !v[n.key] }))} style={toggleTrackStyle(notif[n.key])}><div style={toggleDotStyle(notif[n.key])} /></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Toast message={toast} />
    </AdminShell>
  );
}
