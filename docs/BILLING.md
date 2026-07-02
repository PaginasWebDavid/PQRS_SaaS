# Billing

## Objetivo

Automatizar completamente el cobro de licencias.

El desarrollador nunca deberá cobrar manualmente.

---

# Filosofía

Cada Tenant posee exactamente una suscripción.

La suscripción determina si puede utilizar la plataforma.

---

# Precio

El administrador NO selecciona un plan.

El precio se calcula automáticamente según la cantidad de unidades.

Ejemplo

1–50

↓

$80.000

51–100

↓

$120.000

101–200

↓

$160.000

Estas reglas serán configurables.

---

# Estados

Trial

↓

Active

↓

Grace Period

↓

Suspended

↓

Cancelled

---

# Flujo

Crear Tenant

↓

Asignar unidades

↓

Calcular precio

↓

Crear suscripción

↓

Crear primer cobro

↓

Invitar ADMIN

---

# Renovación

Mercado Pago notificará mediante Webhook.

Pago aprobado

↓

Renovar licencia

↓

Actualizar vencimiento

↓

Registrar pago

---

# Pago rechazado

Webhook

↓

Grace Period

↓

Correo

↓

Recordatorio

↓

Suspensión automática

---

# Reactivación

Pago aprobado

↓

Activar licencia

↓

Desbloquear Tenant

---

# Configuración

SUPER_ADMIN podrá modificar:

- Precio
- Rangos
- Trial
- Período de gracia

Todo desde el panel.

---

# Historial

Nunca eliminar pagos.

Nunca modificar pagos.

Solo agregar nuevos registros.

---

# Definition of Done

Todo el proceso de cobro funciona automáticamente sin intervención manual.