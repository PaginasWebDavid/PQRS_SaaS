# TASK-01 — Preparación del Proyecto

## Objetivo

Preparar la base del proyecto para convertir la aplicación actual en una plataforma multi-tenant sin romper la funcionalidad existente.

Esta tarea NO implementa lógica de negocio nueva.

Únicamente deja el proyecto listo para comenzar la migración.

---

# Contexto

Actualmente existe una aplicación completamente funcional para un único conjunto residencial.

NO debe reescribirse.

Debe evolucionarse.

El objetivo de esta tarea es dejar la estructura preparada para todas las siguientes fases.

---

# Resultado esperado

Al finalizar esta tarea:

- El proyecto compila.
- Todo sigue funcionando.
- No cambia el comportamiento para el usuario.
- No existe deuda técnica nueva.

---

# Tareas

## 1. Crear una nueva rama

```
feature/saas-migration
```

---

## 2. Crear carpeta de documentación

```
docs/
```

Agregar todos los documentos creados hasta el momento.

---

## 3. Migrar Base de Datos

Preparar el proyecto para utilizar Supabase PostgreSQL.

NO migrar todavía los datos.

Solo preparar la conexión.

---

## 4. Configurar Supabase Storage

Preparar el cliente.

No utilizarlo todavía.

---

## 5. Configurar Resend

Eliminar dependencia futura de Nodemailer.

Preparar el servicio.

No cambiar aún los correos existentes.

---

## 6. Crear estructura por dominios

Crear únicamente las carpetas.

No mover lógica todavía.

```
src/

domains/

platform/

organizations/

billing/

pqrs/

notifications/

analytics/

shared/
```

---

## 7. Crear carpeta shared

Mover únicamente utilidades comunes.

No mover lógica de negocio.

---

## 8. Crear carpeta config

Toda configuración nueva deberá vivir aquí.

Ejemplo

```
config/

app.ts

billing.ts

email.ts

storage.ts
```

---

## 9. Crear carpeta types

Centralizar tipos compartidos.

---

## 10. Crear carpeta services

Preparar servicios compartidos.

Todavía vacíos.

---

## 11. Crear carpeta repositories

Todavía vacía.

Será utilizada posteriormente.

---

# NO HACER

No agregar Tenant.

No modificar Login.

No modificar Registro.

No modificar PQRS.

No cambiar Base de Datos.

No mover componentes grandes.

No instalar librerías innecesarias.

No romper compatibilidad.

---

# Criterios de aceptación

- El proyecto sigue compilando.
- El proyecto sigue funcionando.
- El proyecto mantiene exactamente el mismo comportamiento.
- Existen las nuevas carpetas.
- Existe la conexión preparada para Supabase.
- Existe la configuración de Resend.
- No existen cambios funcionales.

---

# Commit esperado

```
chore: prepare project for SaaS migration
```

---

# Entregables

- Nueva estructura creada.
- Documentación agregada.
- Configuración preparada.
- Sin cambios funcionales.

---

# Al finalizar

Detenerse.

No comenzar la siguiente tarea.

Esperar validación antes de continuar.