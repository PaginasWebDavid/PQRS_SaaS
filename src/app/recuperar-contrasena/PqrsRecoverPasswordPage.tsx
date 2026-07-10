'use client';

import type { ChangeEvent, CSSProperties } from 'react';
import { useState } from 'react';

type Step = 'request' | 'sent' | 'reset' | 'done' | 'expired';

const inputStyle: CSSProperties = {
  width: '100%', height: 48, padding: '0 15px', border: '1.5px solid #E8E8ED',
  borderRadius: 12, fontSize: 14.5, fontFamily: "'Manrope', sans-serif",
};

function Logo() {
  return <svg width="24" height="24" viewBox="0 0 128 128" style={{ display: 'block' }} aria-hidden="true"><path d="M24 8h80c8.837 0 16 7.163 16 16v64c0 8.837-7.163 16-16 16H48l-16 16c-2.52 2.52-8 1.087-8-3V104c-8.837 0-16-7.163-16-16V24C8 15.163 15.163 8 24 8z" fill="#122545"/><path d="M40 62l17 17 31-34" fill="none" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export default function PqrsRecoverPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');

  const canRequest = email.trim().length > 0;
  const mismatch = Boolean(pass1 && pass2 && pass1 !== pass2);
  const canReset = pass1.length >= 8 && pass1 === pass2;
  const buttonStyle = (enabled: boolean): CSSProperties => ({
    textAlign: 'center', background: enabled ? '#122545' : '#E8E8ED', color: enabled ? '#FFFFFF' : '#8E8E93',
    fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: 999, cursor: enabled ? 'pointer' : 'default',
  });

  return <>
    <style jsx global>{`
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
      *{box-sizing:border-box} body{margin:0;background:#fff} ::selection{background:#EAEEF6;color:#122545}
      a{color:#122545;text-decoration:none} a:hover{color:#0B1A33}
      input:focus{outline:none;border-color:#122545!important;box-shadow:0 0 0 3.5px rgba(18,37,69,.12)}
      @keyframes apl-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
      @keyframes apl-pop{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
    `}</style>
    <main style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#FFFFFF',fontFamily:"'Manrope',sans-serif",color:'#1D1D1F',padding:24}}>
      <div style={{width:'100%',maxWidth:380,animation:'apl-up 500ms cubic-bezier(.2,.7,.2,1) both'}}>
        <a href="/login" style={{display:'flex',alignItems:'center',gap:9,marginBottom:40,justifyContent:'center'}}><Logo/><span style={{fontWeight:800,fontSize:15.5,letterSpacing:'-0.01em',color:'#1D1D1F'}}>PQRS <span style={{fontWeight:500,color:'#6E6E73'}}>Services</span></span></a>

        {step === 'request' && <div>
          <h1 style={{fontSize:24,fontWeight:800,letterSpacing:'-0.02em',margin:'0 0 8px',textAlign:'center'}}>Recupera tu acceso</h1>
          <p style={{fontSize:13.5,color:'#6E6E73',fontWeight:500,margin:'0 0 28px',textAlign:'center',lineHeight:1.5}}>Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña.</p>
          <label style={{display:'block',fontSize:13,fontWeight:700,marginBottom:7}}>Correo electrónico</label>
          <input type="email" value={email} onChange={(e:ChangeEvent<HTMLInputElement>)=>setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" style={{...inputStyle,marginBottom:22}}/>
          <div onClick={()=>canRequest&&setStep('sent')} style={buttonStyle(canRequest)}>Enviar enlace</div>
          <p style={{fontSize:13,color:'#8E8E93',fontWeight:500,marginTop:24,textAlign:'center'}}><a href="/login" style={{fontWeight:700,color:'#122545'}}>← Volver a iniciar sesión</a></p>
        </div>}

        {step === 'sent' && <div style={{textAlign:'center'}}>
          <div style={{width:56,height:56,borderRadius:999,background:'#EAEEF6',color:'#122545',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,margin:'0 auto 20px',animation:'apl-pop 400ms cubic-bezier(.2,.7,.2,1) both'}}>✉</div>
          <h1 style={{fontSize:22,fontWeight:800,letterSpacing:'-0.02em',margin:'0 0 8px'}}>Revisa tu correo</h1>
          <p style={{fontSize:13.5,color:'#6E6E73',fontWeight:500,margin:'0 0 6px',lineHeight:1.55}}>Enviamos un enlace para restablecer tu contraseña a</p>
          <p style={{fontSize:14,color:'#1D1D1F',fontWeight:700,margin:'0 0 26px'}}>{email}</p>
          <div onClick={()=>setStep('reset')} style={{background:'#122545',color:'#FFFFFF',textAlign:'center',fontSize:14,fontWeight:700,padding:'13px 0',borderRadius:999,cursor:'pointer',marginBottom:14}}>Abrir enlace de ejemplo</div>
          <p style={{fontSize:12.5,color:'#8E8E93',fontWeight:500}}>¿No llegó? <span onClick={()=>canRequest&&setStep('sent')} style={{fontWeight:700,color:'#122545',cursor:'pointer'}}>Reenviar correo</span></p>
        </div>}

        {step === 'reset' && <div>
          <h1 style={{fontSize:22,fontWeight:800,letterSpacing:'-0.02em',margin:'0 0 8px',textAlign:'center'}}>Crea tu nueva contraseña</h1>
          <p style={{fontSize:13.5,color:'#6E6E73',fontWeight:500,margin:'0 0 26px',textAlign:'center'}}>Usa al menos 8 caracteres.</p>
          <label style={{display:'block',fontSize:13,fontWeight:700,marginBottom:7}}>Nueva contraseña</label>
          <input type="password" value={pass1} onChange={(e)=>setPass1(e.target.value)} placeholder="••••••••" style={{...inputStyle,marginBottom:14}}/>
          <label style={{display:'block',fontSize:13,fontWeight:700,marginBottom:7}}>Confirmar contraseña</label>
          <input type="password" value={pass2} onChange={(e)=>setPass2(e.target.value)} placeholder="••••••••" style={{...inputStyle,marginBottom:8}}/>
          {mismatch ? <p style={{fontSize:12.5,color:'#B3261E',fontWeight:600,margin:'0 0 14px'}}>Las contraseñas no coinciden.</p> : <div style={{marginBottom:14}}/>}
          <div onClick={()=>canReset&&setStep('done')} style={buttonStyle(canReset)}>Guardar contraseña</div>
        </div>}

        {step === 'done' && <div style={{textAlign:'center'}}>
          <div style={{width:56,height:56,borderRadius:999,background:'#ECF6EF',color:'#1A6B3A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,margin:'0 auto 20px',animation:'apl-pop 400ms cubic-bezier(.2,.7,.2,1) both'}}>✓</div>
          <h1 style={{fontSize:22,fontWeight:800,letterSpacing:'-0.02em',margin:'0 0 8px'}}>Contraseña actualizada</h1>
          <p style={{fontSize:13.5,color:'#6E6E73',fontWeight:500,margin:'0 0 26px',lineHeight:1.55}}>Ya puedes iniciar sesión con tu nueva contraseña.</p>
          <a href="/login" style={{display:'block',background:'#122545',color:'#FFFFFF',textAlign:'center',fontSize:14,fontWeight:700,padding:'13px 0',borderRadius:999}}>Iniciar sesión</a>
        </div>}

        {step === 'expired' && <div style={{textAlign:'center'}}>
          <div style={{width:56,height:56,borderRadius:999,background:'#FBF3DF',color:'#8A5A00',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,margin:'0 auto 20px'}}>!</div>
          <h1 style={{fontSize:22,fontWeight:800,letterSpacing:'-0.02em',margin:'0 0 8px'}}>Este enlace venció</h1>
          <p style={{fontSize:13.5,color:'#6E6E73',fontWeight:500,margin:'0 0 26px',lineHeight:1.55}}>Por seguridad, los enlaces de recuperación duran un tiempo limitado. Solicita uno nuevo.</p>
          <div onClick={()=>{setStep('request');setEmail('')}} style={{background:'#122545',color:'#FFFFFF',textAlign:'center',fontSize:14,fontWeight:700,padding:'13px 0',borderRadius:999,cursor:'pointer'}}>Solicitar nuevo enlace</div>
        </div>}
      </div>
    </main>
  </>;
}
