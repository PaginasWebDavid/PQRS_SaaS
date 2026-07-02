# TASK-03A — Infraestructura SUPER_ADMIN

## Objetivo

Crear la base técnica del rol SUPER_ADMIN sin construir todavía el dashboard visual completo.

Esta tarea prepara permisos, rutas, servicios y validaciones globales.

---

## Contexto

El sistema ya debe tener Multi-Tenant implementado.

Ahora se necesita un rol global que pueda administrar toda la plataforma.

El SUPER_ADMIN no pertenece a un Tenant específico.

---

## Checklist

### Roles y permisos

- [ ] Agregar rol `SUPER_ADMIN`.
- [ ] Actualizar enums de Prisma.
- [ ] Actualizar tipos TypeScript.
- [ ] Actualizar NextAuth/session.
- [ ] Agregar validaciones de permisos globales.
- [ ] Crear helper `isSuperAdmin()`.

---

### Rutas protegidas

- [ ] Crear namespace de rutas para SUPER_ADMIN.
- [ ] Ejemplo: `/super-admin`.
- [ ] Proteger todas las rutas con guard.
- [ ] Impedir acceso a usuarios normales.

---

### Servicios

Crear servicios base:

- [ ] `superAdminService`
- [ ] `tenantAdminService`
- [ ] `platformStatsService`

---

### Acceso global

El SUPER_ADMIN puede:

- [ ] Ver todos los Tenant.
- [ ] Ver usuarios globales.
- [ ] Ver PQRS globales.
- [ ] Ver estados de licencias.
- [ ] Ver pagos globales cuando Billing exista.

---

### Auditoría

- [ ] Registrar acciones críticas del SUPER_ADMIN.
- [ ] Crear eventos de auditoría para:
  - creación de Tenant
  - suspensión
  - reactivación
  - cambio de configuración
  - cambio de precio

---

## NO HACER

- No crear dashboard visual completo.
- No crear gráficas.
- No implementar Billing.
- No integrar Mercado Pago.
- No rediseñar UI.
- No modificar PQRS salvo permisos necesarios.

---

## Criterios de aceptación

- [ ] Existe rol SUPER_ADMIN.
- [ ] SUPER_ADMIN puede entrar a rutas globales.
- [ ] Usuarios normales no pueden entrar.
- [ ] No se rompe Login.
- [ ] No se rompe PQRS.
- [ ] No se rompe Admin actual.
- [ ] El proyecto compila.

---

## Commit esperado

```bash
feat: add super admin infrastructure
```

---

## Al finalizar

DETENERSE.

Esperar validación antes de construir dashboard.