/** @type {import('next').NextConfig} */

// Cabeceras de seguridad. Vercel ya envia HSTS por su cuenta; el resto no
// estaba puesto.
//
// Se eligen a proposito solo las directivas que NO pueden romper la app:
// no hay script-src, style-src ni connect-src. El motivo es concreto: la
// pantalla de licencias carga https://checkout.wompi.co/widget.js y habla con
// production.wompi.co, y una CSP mal calibrada tumbaria los pagos. Una CSP
// completa es un proyecto aparte, con su propia verificacion en cada flujo.
//
// Lo que si se cierra aqui es el clickjacking, que es el riesgo real y
// concreto: sin frame-ancestors, cualquiera puede incrustar el panel de
// administracion en un iframe invisible sobre su propia pagina y lograr que
// un administrador haga clic en "cerrar caso" o "pagar" creyendo que pulsa
// otra cosa.
const securityHeaders = [
  {
    // frame-ancestors es la version moderna; X-Frame-Options queda abajo para
    // navegadores viejos que no la entienden.
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    // Impide que el navegador adivine el tipo de un archivo servido: sin esto,
    // una evidencia subida podria interpretarse como algo distinto de lo que
    // declara. El tipo real ya se valida al subir, esto es la segunda barrera.
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    // Al salir hacia otro sitio no se filtra la ruta completa. Importa porque
    // las URLs internas llevan identificadores de conjunto y de PQRS.
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    // La app no usa camara, microfono ni ubicacion. Declararlo evita que un
    // script de terceros los pida en nombre del dominio.
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
