# Database Design

## Objetivo

Definir la estructura de la base de datos objetivo antes de implementar la migración a Supabase.

El objetivo NO es definir todos los campos, sino definir las entidades, sus relaciones y responsabilidades.

---

# Filosofía

Toda entidad pertenece a un dominio.

Toda entidad operativa pertenece a un Tenant.

Toda información histórica debe conservarse.

Nunca almacenar archivos en PostgreSQL.

---

# Dominios

## Plataforma

- Tenant
- PlatformSetting
- AuditLog

---

## Usuarios

- User
- Membership
- Invitation

---

## Billing

- PricingRule
- Subscription
- Payment

---

## PQRS

- Pqrs
- PqrsAttachment
- PqrsHistory

---

## Notificaciones

- Notification
- EmailLog

---

# Tenant

Representa un conjunto residencial.

## Responsabilidad

Aislar completamente la información de cada cliente.

## Relaciones

Tenant

↓

Users

↓

PQRS

↓

Subscriptions

↓

Payments

↓

Invitations

---

# User

Representa un usuario del sistema.

Cada usuario pertenece exactamente a un Tenant.

Nunca podrá pertenecer a dos Tenant.

Roles:

- SUPER_ADMIN
- ADMIN
- CONSEJO
- RESIDENTE

---

# Membership

Guarda información específica del usuario dentro del Tenant.

Ejemplo:

- bloque
- apartamento
- estado
- fecha ingreso

Así el modelo User queda limpio.

---

# Invitation

Invitación enviada por un ADMIN.

Estados:

- Pending
- Accepted
- Expired

Debe expirar automáticamente.

---

# PricingRule

Define el precio según la cantidad de unidades.

Ejemplo

| Desde | Hasta | Precio |
|--------|------|---------|
|1|50|80.000|
|51|100|120.000|

Estas reglas son editables.

Nunca estarán escritas en código.

---

# Subscription

Representa la licencia del Tenant.

Estados:

- Trial

- Active

- GracePeriod

- Suspended

- Cancelled

Debe existir una única suscripción activa.

---

# Payment

Historial de pagos.

Nunca eliminar.

Nunca modificar.

Solo agregar.

Proveedor inicial:

Mercado Pago.

---

# PQRS

La lógica actual prácticamente no cambia.

Solo se agrega:

tenantId

---

# PqrsAttachment

Ya no almacena Base64.

Solo:

- URL

- mimeType

- fileName

- size

---

# PqrsHistory

Mantiene el historial de estados.

No cambia.

---

# Notification

Registro interno de notificaciones.

No depende del proveedor de correo.

---

# EmailLog

Registro de todos los correos enviados.

Permite auditoría.

---

# AuditLog

Toda acción importante genera un registro.

Ejemplos:

- Crear Tenant

- Suspender Tenant

- Cambiar precio

- Renovar licencia

- Cerrar PQRS

---

# Relaciones principales

Tenant

├── Users

├── Memberships

├── Invitations

├── PQRS

├── Subscription

└── Payments

---

User

├── PQRS creadas

├── PQRS gestionadas

└── Membership

---

Subscription

└── Payments

---

PQRS

├── Attachments

└── History

---

# Convenciones

Todas las tablas tendrán:

- id

- createdAt

- updatedAt

Las tablas operativas tendrán:

- tenantId

Nunca habrá IDs autoincrementales.

Usar UUID.

---

# Índices mínimos

Tenant

- slug

- status

User

- email

- tenantId

PQRS

- tenantId

- estado

- fecha

Subscription

- tenantId

- status

Payment

- subscriptionId

- createdAt

---

# Soft Delete

Aplicar únicamente cuando tenga sentido.

No usar Soft Delete para:

- Payments

- AuditLog

- History

Esas tablas son históricas.

---

# Migración

La migración se hará en fases.

1.

Crear nuevas tablas.

2.

Migrar datos.

3.

Actualizar Prisma.

4.

Actualizar lógica.

5.

Eliminar código obsoleto.

Nunca hacer una migración masiva en un solo paso.

---

# Restricciones para Codex

- No modificar la lógica de PQRS.

- No eliminar tablas existentes sin migración.

- No romper compatibilidad.

- Crear migraciones pequeñas.

- Verificar cada fase antes de continuar.

---

# Resultado esperado

La base de datos deberá soportar cientos de conjuntos residenciales utilizando una única instancia de Supabase PostgreSQL, manteniendo el aislamiento total de los datos y permitiendo agregar nuevos módulos sin rediseñar el esquema.