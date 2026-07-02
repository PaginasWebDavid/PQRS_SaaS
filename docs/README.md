# PQRS Services

> Administra fácil. Vive tranquilo.

---

# Objetivo

Este proyecto busca transformar la aplicación actual de PQRS, que hoy funciona para un único conjunto residencial, en una plataforma capaz de administrar múltiples conjuntos desde una única instalación.

No se busca reescribir el sistema.

Se busca evolucionarlo manteniendo la mayor cantidad posible del código existente.

---

# Estado actual

Actualmente el sistema cuenta con:

- Next.js 14 (App Router)
- TypeScript
- Prisma
- PostgreSQL
- NextAuth
- TailwindCSS
- Dashboard funcional
- Gestión completa de PQRS
- Roles
- Reportes
- Correos
- Historial
- Evidencias

El sistema funciona correctamente para un único conjunto residencial.

---

# Objetivo final

El proyecto deberá convertirse en una plataforma donde múltiples conjuntos residenciales compartan la misma infraestructura, pero cada uno tenga completamente aislada su información.

Cada conjunto será un **Tenant**.

Todos utilizarán exactamente el mismo código.

---

# Principios

## 1. Nunca romper el módulo de PQRS

Toda la lógica actual de PQRS debe conservarse.

Solo debe adaptarse para funcionar con múltiples Tenant.

---

## 2. Nunca crear versiones diferentes por cliente

Solo existirá un código.

Nunca habrá forks.

---

## 3. Configuración antes que código

Todo aquello que pueda configurarse desde el panel del SUPER_ADMIN no debe quedar escrito en el código.

Ejemplos:

- precios
- planes
- cantidad de unidades
- períodos de gracia
- branding
- módulos habilitados

---

## 4. Todo pertenece a un Tenant

Excepto los datos propios de la plataforma.

---

## 5. El SUPER_ADMIN administra el negocio

No deberá volver a ser necesario modificar código para:

- crear conjuntos
- cambiar precios
- suspender clientes
- habilitar módulos
- activar licencias

---

# Tecnologías

Frontend

- Next.js

Backend

- Next.js Route Handlers

ORM

- Prisma

Base de datos

- Supabase PostgreSQL

Archivos

- Supabase Storage

Hosting

- Vercel

Emails

- Resend

Pagos

- Mercado Pago

Autenticación

- NextAuth

---

# Estructura esperada

```
apps/

    web/

docs/

```

---

# Documentación

Este directorio contiene únicamente la información necesaria para desarrollar el proyecto correctamente con ayuda de Codex.

No pretende ser documentación corporativa.

Pretende servir como guía técnica.

---

# Flujo de trabajo

Cada cambio deberá seguir este orden.

1. Leer documentación.

2. Implementar una única tarea.

3. Ejecutar pruebas.

4. Verificar que no se rompió funcionalidad existente.

5. Continuar con la siguiente tarea.

Nunca implementar varias tareas grandes simultáneamente.

---

# Roadmap

Fase 1

- Preparar proyecto

Fase 2

- Multi-Tenant

Fase 3

- SUPER_ADMIN

Fase 4

- Billing

Fase 5

- Migrar PQRS

Fase 6

- Dashboard SaaS

Fase 7

- Producción

---

# Reglas para Codex

Siempre asumir que:

- existe código funcionando.
- debe reutilizarse el mayor porcentaje posible.
- no debe reescribir componentes sin necesidad.
- no debe cambiar diseño salvo que la tarea lo indique.
- cada cambio debe ser incremental.

---
## Principio fundamental

El proyecto ya existe y funciona.

El objetivo es evolucionarlo, no reconstruirlo.

Cada cambio debe ser incremental.

Cada commit debe mantener la aplicación funcional.
# Meta

Al finalizar el proyecto será posible administrar decenas o cientos de conjuntos residenciales desde una única plataforma, manteniendo un único código, una única infraestructura y una administración completamente centralizada desde el panel del SUPER_ADMIN.