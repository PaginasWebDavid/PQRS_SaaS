# Salida a producción

Lo que falta para cobrar de verdad, y lo que hay que hacer después.
Marca cada casilla cuando la completes.

---

## 🔴 Bloqueante: activar Wompi real

Hoy la plataforma **no puede cobrar dinero de verdad**. Las llaves de producción ya están
cargadas en Vercel, pero el ambiente sigue en `sandbox`: los pagos se procesan contra el
servidor de pruebas de Wompi y no se mueve un peso.

Son tres pasos **y el orden importa**.

### 1. Registrar el webhook en el panel de Wompi

- [ ] Entra al panel de **Wompi en producción** (no el de pruebas)
- [ ] Busca *Eventos* / *Webhooks* / *URL de eventos*
- [ ] Registra exactamente:

```
https://www.pqrsservices.com/api/billing/wompi/webhook
```

**Esto va primero, y no es opcional.** El webhook es cómo Wompi le avisa a la plataforma
que un pago salió bien. Sin él ocurre el peor escenario posible: **le cobras la tarjeta al
conjunto y tu sistema nunca se entera**. El cliente ve el cargo en su banco, y en la
plataforma su licencia sigue apareciendo como impaga.

### 2. Cambiar el ambiente en Vercel

- [ ] Vercel → tu proyecto → *Settings* → *Environment Variables*
- [ ] Edita `WOMPI_ENV` en **Production**: de `sandbox` a `production`

### 3. Redesplegar

- [ ] Vercel → *Deployments* → en el último, menú `...` → **Redeploy**

Las variables de entorno no se aplican solas a un despliegue que ya existe.

### 4. Comprobar con dinero real

- [ ] Paga **una mensualidad real** de un conjunto de prueba con tu propia tarjeta
- [ ] Verifica que el pago aparece en *Licencias y pagos* con proveedor **Wompi**
- [ ] Verifica que la tarjeta **"Recibido en \<mes\>"** sube por ese valor
- [ ] Verifica que el cargo aparece en tu panel de Wompi producción

Si el pago se cobra pero no aparece en la plataforma, **el webhook del paso 1 no quedó bien**.

> Consejo: hazlo con el conjunto más pequeño y luego te reembolsas desde Wompi. Cuesta unos
> pesos y te ahorra descubrirlo con un cliente real.

---

## 🟠 Antes del primer cliente que pague

### Alertas de caída

- [ ] Crea un monitor gratuito (UptimeRobot, Better Stack o similar) sobre
      `https://www.pqrsservices.com`, cada 5 minutos, con aviso a tu correo

Hoy, si el sitio se cae de madrugada, te enteras porque un cliente te escribe. Son diez
minutos de configuración.

### Datos de demostración presentables

- [ ] Ponles títulos reales a las PQRS sembradas

Todas se llaman **"Solicitud"**. En una demo frente a una administradora se nota, y resta
credibilidad justo en el momento en que más la necesitas.

---

## 🟡 Apenas cierres la primera venta

### Supabase Pro

- [ ] Sube el proyecto a plan Pro (unos 25 USD al mes)
- [ ] Avísame para restaurar la línea de respaldos en la política de privacidad

**Hoy tu base no tiene ni un solo respaldo.** Si una consulta sale mal o borras algo por
error, no hay a dónde volver. Y vas a ser Encargado del tratamiento de datos de cientos de
residentes: fotos de sus apartamentos, quejas, historiales.

Segundo motivo: los proyectos gratuitos de Supabase **se pausan por inactividad**. Con
clientes reales, eso es tu producto caído sin que nadie lo toque.

Por eso la política de privacidad ya **no** afirma que hay copias de respaldo: era falso y
había que retirarlo. Cuando subas de plan, vuelve a ser cierto.

---

## 🟢 Cuando tengas tiempo

### Base de pruebas más cerca

- [ ] Crea un proyecto Supabase gratis nuevo en **us-east-1**
- [ ] Pon su conexión en `.env.test` (`TEST_DATABASE_URL` y `TEST_DIRECT_URL`)
- [ ] Corre `npm run test:db:deploy` para crear el esquema

La base de pruebas actual está en Canadá y por eso la suite tarda **33 minutos**. En la
misma región de producción bajaría a pocos, y la correrías mucho más seguido.

### Actualizar Next

- [ ] Planear el salto de Next 14.2 a 16.3

Quedan 5 vulnerabilidades altas que solo se cierran con ese salto. Es un cambio de versión
mayor: proyecto aparte, con su propia verificación pantalla por pantalla. **No lo hagas la
semana que salgas a vender.**

### Constituir la SAS

- [ ] Cuando llegues a 10–20 clientes

Mientras operes como persona natural, **tu patrimonio personal responde sin límite**. La
cláusula de límite de responsabilidad del contrato es hoy tu único escudo. Una SAS separa
el negocio de tus bienes, y además muchos consejos de administración prefieren contratar
con persona jurídica.

---

## Lo que ya está resuelto

No hay que volver sobre esto:

- Dominio propio con SSL y correo entrante (`hola@pqrsservices.com` → tu Gmail)
- Correo saliente verificado en Resend, con `Reply-To` para no perder respuestas
- Aviso por correo cuando un cliente abre un ticket de soporte
- RLS en las 36 tablas y permisos de `anon`/`authenticated` revocados
- Vulnerabilidades críticas de dependencias en cero
- Cabeceras de seguridad, incluido bloqueo de clickjacking
- Documentos legales como contrato real, sin afirmaciones falsas
- Suite completa en verde: 824 pruebas
- Aislamiento entre conjuntos verificado ruta por ruta, con prueba que lo vigila
