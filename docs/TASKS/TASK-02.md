# TASK-02 — Implementar Multi-Tenant

## Objetivo

Agregar soporte Multi-Tenant al proyecto sin romper la funcionalidad actual.

El sistema debe seguir comportándose igual, pero ahora toda la información pertenecerá a un Tenant.

---

# Contexto

Actualmente la aplicación asume que existe un único conjunto residencial.

A partir de esta tarea existirán múltiples conjuntos utilizando la misma aplicación.

Cada conjunto será un Tenant.

Todo dato operativo deberá pertenecer a un Tenant.

---

# Objetivo final

Cuando esta tarea termine deberá ser posible:

- Crear múltiples Tenant.
- Asociar usuarios a un Tenant.
- Asociar PQRS a un Tenant.
- Aislar completamente la información entre Tenant.

Todavía NO existirá el SUPER_ADMIN.

Todavía NO existirá Billing.

---

# Checklist

## Base de datos

- [ ] Crear modelo `Tenant`.
- [ ] Agregar `tenantId` a `User`.
- [ ] Agregar `tenantId` a `Pqrs`.
- [ ] Agregar `tenantId` a `PqrsHistory`.
- [ ] Agregar `tenantId` a `PqrsAttachment`.
- [ ] Crear relaciones Prisma.
- [ ] Crear migración.
- [ ] Ejecutar migración.

---

## Prisma

- [ ] Actualizar schema.prisma.
- [ ] Ejecutar prisma generate.
- [ ] Verificar que no existan errores.

---

## Backend

- [ ] Crear TenantService.
- [ ] Crear TenantRepository.
- [ ] Crear TenantValidator.
- [ ] Centralizar acceso al Tenant.

---

## Autenticación

Por ahora NO modificar Login.

El usuario seguirá iniciando sesión igual.

Correo

↓

Contraseña

Simplemente el usuario tendrá un tenantId asociado.

---

## PQRS

Modificar únicamente las consultas.

Toda consulta deberá filtrar por tenantId.

Ejemplo

ANTES

Buscar todas las PQRS.

AHORA

Buscar únicamente las PQRS del tenant autenticado.

---

## Middleware

Crear middleware para resolver el Tenant desde la sesión.

Nunca recibir tenantId desde el frontend.

---

## Seguridad

Validar tenantId en:

- PQRS
- Usuarios
- Reportes
- Dashboard

Nunca permitir consultar datos de otro Tenant.

---

## Datos existentes

Crear un Tenant inicial.

Migrar automáticamente todos los datos existentes hacia ese Tenant.

El usuario no debe notar ningún cambio.

---

# NO HACER

- No crear SUPER_ADMIN.
- No crear Billing.
- No crear pagos.
- No modificar UI.
- No cambiar diseño.
- No crear módulos nuevos.

---

# Criterios de aceptación

- [ ] Todo sigue funcionando.
- [ ] El proyecto compila.
- [ ] Existe un Tenant inicial.
- [ ] Todas las PQRS pertenecen a un Tenant.
- [ ] Todos los usuarios pertenecen a un Tenant.
- [ ] No es posible acceder a datos de otro Tenant.
- [ ] No se rompió ninguna funcionalidad existente.

---

# Pruebas

## Crear PQRS

Debe funcionar.

---

## Editar PQRS

Debe funcionar.

---

## Cerrar PQRS

Debe funcionar.

---

## Reportes

Deben mostrar únicamente información del Tenant.

---

## Login

Debe seguir funcionando exactamente igual.

---

# Commit esperado

feat: implement multi-tenant foundation

---

# Al finalizar

DETENERSE.

No implementar SUPER_ADMIN.

No implementar Billing.

Esperar revisión antes de continuar.