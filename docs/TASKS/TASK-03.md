# TASK-03 — Implementar SUPER_ADMIN

## Objetivo

Crear el rol SUPER_ADMIN y el panel administrativo de la plataforma.

Esta tarea NO debe modificar la experiencia de los usuarios existentes.

---

# Contexto

El sistema ya soporta múltiples Tenant.

Ahora se necesita un usuario capaz de administrar toda la plataforma.

---

# Checklist

## Roles

- [ ] Agregar rol SUPER_ADMIN.
- [ ] Actualizar enums de Prisma.
- [ ] Actualizar NextAuth.
- [ ] Actualizar permisos.

---

## Dashboard

Crear Dashboard SUPER_ADMIN.

Debe mostrar:

- [ ] Total de Tenant
- [ ] Tenant activos
- [ ] Tenant suspendidos
- [ ] Usuarios registrados
- [ ] PQRS creadas
- [ ] PQRS cerradas

---

## Gestión de Tenant

Crear CRUD.

- [ ] Crear Tenant
- [ ] Editar Tenant
- [ ] Suspender Tenant
- [ ] Reactivar Tenant

Todavía NO eliminar Tenant.

---

## Crear Tenant

Formulario:

- Nombre
- Slug
- Número de unidades
- Nombre administrador
- Correo administrador

El precio debe calcularse automáticamente.

---

## Invitación

Al crear un Tenant:

- crear ADMIN
- enviar invitación
- generar contraseña temporal

---

## NO HACER

- Billing
- Mercado Pago
- Cambios visuales grandes

---

# Commit

feat: implement super admin dashboard

---

# Al finalizar

DETENERSE.