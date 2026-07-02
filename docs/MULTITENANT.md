# Multi-Tenant

## Objetivo

Convertir la aplicación actual de un único conjunto residencial a una plataforma capaz de administrar múltiples conjuntos utilizando exactamente el mismo código.

La prioridad es reutilizar la mayor cantidad posible del proyecto existente.

---

# Concepto

Un Tenant representa un conjunto residencial.

Todo dato operativo pertenece exactamente a un Tenant.

Ejemplos:

- Usuarios
- PQRS
- Reportes
- Evidencias
- Configuración

Nunca podrán existir datos compartidos entre Tenant.

---

# Filosofía

No existirán múltiples despliegues.

No existirán múltiples bases de datos.

Existirá:

- una aplicación
- una base de datos
- un único código

El aislamiento se realizará mediante tenantId.

---

# Flujo

Tenant

↓

Usuarios

↓

PQRS

↓

Reportes

↓

Configuración

---

# tenantId

Toda entidad operativa deberá tener un tenantId.

Ejemplo

- User
- Membership
- Pqrs
- PqrsHistory
- PqrsAttachment

No aplica para:

- PlatformSettings
- PricingRules
- AuditLog global

---

# Obtención del Tenant

El frontend nunca enviará tenantId.

Siempre se obtendrá desde la sesión del usuario autenticado.

Flujo

Login

↓

JWT

↓

tenantId

↓

Middleware

↓

Route Handler

↓

Prisma

---

# Consultas

Incorrecto

Buscar todas las PQRS.

Correcto

Buscar únicamente las PQRS cuyo tenantId coincida con el usuario autenticado.

---

# Seguridad

Toda consulta deberá validar tenantId.

Toda modificación deberá validar tenantId.

Toda eliminación deberá validar tenantId.

Nunca confiar en parámetros enviados desde el cliente.

---

# Migración

El sistema actual deberá crear automáticamente un Tenant inicial.

Todos los datos existentes serán migrados hacia ese Tenant.

El usuario no deberá notar cambios.

---

# Restricciones

No romper PQRS.

No modificar la experiencia del usuario.

No cambiar Login.

No cambiar Registro.

Solo agregar aislamiento.

---

# Definition of Done

- Existe Tenant.
- Existe tenantId.
- Todas las consultas utilizan tenantId.
- Toda la aplicación continúa funcionando.