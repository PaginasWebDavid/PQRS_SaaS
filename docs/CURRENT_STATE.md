# Current State

## Objetivo

Este documento describe el estado ACTUAL del proyecto antes de iniciar la migración.

Codex debe asumir que TODO lo descrito aquí funciona correctamente.

La prioridad NO es reescribir.

La prioridad es evolucionar.

---

# Tecnologías

## Frontend

- Next.js 14 App Router
- React 18
- TypeScript
- TailwindCSS
- shadcn/ui

## Backend

- Next.js Route Handlers

## ORM

Prisma

## Base de Datos

Actualmente PostgreSQL.

Se migrará a Supabase PostgreSQL.

## Autenticación

NextAuth

Credentials Provider

JWT

## Correos

Actualmente Nodemailer.

Debe migrarse a Resend.

---

# Estado del sistema

Actualmente el sistema funciona completamente para un único conjunto residencial.

Existe:

- Login
- Registro
- Recuperar contraseña
- Dashboard
- PQRS
- Reportes
- Usuarios
- Historial
- Correos
- Evidencias

Todo funciona correctamente.

No debe romperse.

---

# Arquitectura actual

Actualmente el proyecto es un monolito Next.js.

Frontend y Backend viven en el mismo proyecto.

La API utiliza Route Handlers.

Prisma accede directamente a PostgreSQL.

---

# Base de datos

Actualmente NO existe concepto de Tenant.

Todas las tablas pertenecen implícitamente al mismo conjunto residencial.

No existe aislamiento de datos.

---

# Roles actuales

ADMIN

CONSEJO

RESIDENTE

---

# Flujo actual

Usuario

↓

Login

↓

Dashboard

↓

Crear PQRS

↓

Gestión

↓

Cierre

↓

Correo

Todo este flujo ya funciona.

Debe conservarse.

---

# Lo que NO debe cambiar

No modificar la lógica de PQRS.

No modificar el flujo de estados.

No modificar la experiencia del usuario sin necesidad.

No reescribir componentes solo porque sí.

No cambiar el diseño actual salvo cuando la tarea lo indique.

---

# Problemas actuales

## Single Tenant

Solo funciona para un conjunto.

---

## Configuración

Muchos parámetros están escritos en código.

---

## Billing

No existe.

---

## Licencias

No existen.

---

## SUPER_ADMIN

No existe.

---

## Archivos

Actualmente algunas evidencias se almacenan dentro de PostgreSQL.

Esto deberá migrarse a Supabase Storage.

---

## Correos

Actualmente se usa Nodemailer.

Migrar a Resend.

---

# Objetivo de la migración

Convertir el proyecto actual en una plataforma capaz de administrar múltiples conjuntos utilizando un único código.

La prioridad es reutilizar el mayor porcentaje posible del proyecto existente.

---

# Restricciones

Codex debe asumir siempre:

- El sistema funciona.
- No debe reescribirse.
- Debe modificarse incrementalmente.
- Cada tarea debe romper la menor cantidad posible de código existente.

---

# Definición de éxito

El proyecto estará listo cuando:

- Existan múltiples Tenant.
- Cada Tenant tenga datos completamente aislados.
- Exista un SUPER_ADMIN.
- Exista un sistema de licencias.
- Exista un sistema de pagos.
- PQRS continúe funcionando exactamente igual para los usuarios.