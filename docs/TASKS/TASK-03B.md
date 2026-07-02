# TASK-03B — Dashboard SUPER_ADMIN

## Objetivo

Construir el dashboard visual del SUPER_ADMIN usando la infraestructura creada en TASK-03A.

---

## Contexto

El rol SUPER_ADMIN ya existe.

Las rutas globales ya están protegidas.

Ahora se debe crear una interfaz para administrar la plataforma.

---

## Ruta principal

```text
/super-admin
```

---

## Secciones del dashboard

### 1. Resumen general

Mostrar cards con:

- [ ] Total de Tenant
- [ ] Tenant activos
- [ ] Tenant suspendidos
- [ ] Usuarios totales
- [ ] PQRS totales
- [ ] PQRS cerradas

---

### 2. Gestión de Tenant

Crear tabla con:

- [ ] Nombre
- [ ] Slug
- [ ] Estado
- [ ] Número de unidades
- [ ] Administrador principal
- [ ] Fecha de creación
- [ ] Acciones

Acciones:

- [ ] Ver detalle
- [ ] Editar
- [ ] Suspender
- [ ] Reactivar

---

### 3. Crear Tenant

Formulario:

- [ ] Nombre del conjunto
- [ ] Slug
- [ ] Ciudad
- [ ] Dirección
- [ ] Número de unidades
- [ ] Nombre del administrador
- [ ] Correo del administrador
- [ ] Teléfono del administrador

Al crear:

- [ ] Crear Tenant.
- [ ] Crear ADMIN principal.
- [ ] Asociar ADMIN al Tenant.
- [ ] Enviar invitación o contraseña temporal.
- [ ] Registrar AuditLog.

---

### 4. Detalle de Tenant

Mostrar:

- [ ] Información básica.
- [ ] Usuarios.
- [ ] PQRS.
- [ ] Estado de licencia, si existe.
- [ ] Acciones administrativas.

---

## Diseño

Mantener el diseño actual del proyecto.

No hacer rediseño grande.

Usar componentes existentes.

---

## NO HACER

- No implementar pagos.
- No integrar Mercado Pago.
- No cambiar dashboard ADMIN.
- No cambiar flujo PQRS.
- No rediseñar toda la app.

---

## Criterios de aceptación

- [ ] SUPER_ADMIN tiene dashboard funcional.
- [ ] Puede crear Tenant.
- [ ] Puede suspender Tenant.
- [ ] Puede reactivar Tenant.
- [ ] Puede ver resumen global.
- [ ] Usuarios normales no pueden acceder.
- [ ] PQRS sigue funcionando.

---

## Commit esperado

```bash
feat: add super admin dashboard
```

---

## Al finalizar

DETENERSE.

Esperar validación antes de Billing.