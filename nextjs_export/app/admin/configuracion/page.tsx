'use client';
import { useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Toast, useToast } from '@/components/Toast';
import { ADMIN_NAV } from '@/lib/adminNav';
import { COLORS, RADIUS, toggleTrackStyle, toggleDotStyle } from '@/lib/tokens';

export default function ConfiguracionConjuntoPage() {
  const [name, setName] = useState('Parque Residencial Calle 100');
  const [city, setCity] = useState('Bogotá');
  const [address, setAddress] = useState('Cra 15 # 100-25');
  const [contactEmail, setContactEmail] = useState('administracion@parque100.com');
  const [contactPhone, setContactPhone] = useState('+57 601 555 0100');
  const [t1, setT1] = useState(true);
  const [t2, setT2] = useState(false);
  const { toast, showToast } = useToast();

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="configuracion" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Configuración">
      <h1 className="apl-up" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Configuración del conjunto</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 24px' }}>Estos datos son visibles para todos tus usuarios.</p>

      <div style={{ maxWidth: 680 }}>
        <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22, marginBottom: 20 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 16 }}>Información general</div>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nombre del conjunto</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14, background: '#FFFFFF' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Ciudad</label><input value={city} onChange={(e) => setCity(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: '#FFFFFF' }} /></div>
            <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Dirección</label><input value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: '#FFFFFF' }} /></div>
          </div>
          <div style={{ background: COLORS.navySoft, borderRadius: 10, padding: '11px 14px', fontSize: 12, color: COLORS.navy, fontWeight: 600 }}>El número de unidades y el plan de precio son administrados por PQRS Services.</div>
        </div>

        <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22, marginBottom: 20 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 16 }}>Datos de contacto</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Correo de contacto</label><input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: '#FFFFFF' }} /></div>
            <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Teléfono</label><input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: '#FFFFFF' }} /></div>
          </div>
        </div>

        <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22, marginBottom: 24 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 16 }}>Configuraciones generales</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Permitir que residentes adjunten evidencias</span>
            <div onClick={() => setT1((v) => !v)} style={toggleTrackStyle(t1)}><div style={toggleDotStyle(t1)} /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Auto-registro de residentes por correo del conjunto</span>
            <div onClick={() => setT2((v) => !v)} style={toggleTrackStyle(t2)}><div style={toggleDotStyle(t2)} /></div>
          </div>
        </div>

        <div onClick={() => showToast('Configuración guardada ✓')} style={{ background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', maxWidth: 220 }}>Guardar cambios</div>
      </div>

      <Toast message={toast} />
    </AdminShell>
  );
}
