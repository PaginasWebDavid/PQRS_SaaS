# SUPER_ADMIN

## Objetivo

Crear un rol capaz de administrar completamente la plataforma sin necesidad de modificar código.

---

# Responsabilidades

El SUPER_ADMIN administra el negocio.

No administra únicamente un conjunto.

Administra toda la plataforma.

---

# Dashboard

Debe visualizar:

## Plataforma

- Total de Tenant
- Tenant activos
- Tenant suspendidos
- Tenant Trial

## Facturación

- Ingreso mensual
- Pagos pendientes
- Renovaciones próximas
- Licencias activas

## Uso

- Usuarios registrados
- PQRS creadas
- PQRS cerradas

---

# Gestión de Tenant

Crear Tenant.

Editar Tenant.

Suspender Tenant.

Reactivar Tenant.

Eliminar (solo lógico).

---

# Gestión Comercial

Administrar:

- Pricing Rules
- Período de gracia
- Trial
- Productos

Nunca modificar código para cambiar precios.

---

# Gestión de Licencias

Ver estado.

Renovar.

Suspender.

Cancelar.

Reactivar.

---

# Configuración

Modificar:

- Branding global
- Correos
- Feature Flags
- Storage
- Mercado Pago
- Resend

---

# Permisos

El SUPER_ADMIN puede acceder a cualquier Tenant.

Siempre deberá existir auditoría.

---

# Restricciones

No puede modificar datos de PQRS directamente.

Debe actuar mediante herramientas administrativas.

---

# Definition of Done

Todo el negocio puede administrarse desde este panel sin modificar código.