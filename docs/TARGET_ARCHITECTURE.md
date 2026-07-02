# Target Architecture

## Objetivo

Definir el estado final esperado del proyecto después de la migración.

Este documento describe cómo debe quedar la plataforma una vez todas las tareas hayan sido implementadas.

---

# Filosofía

El proyecto NO será reescrito.

El proyecto evolucionará sobre la base existente.

El objetivo es reutilizar el mayor porcentaje posible del código actual.

---

# Arquitectura General

Se mantendrá un **Monolito Modular**.

No se utilizarán microservicios.

Todos los módulos compartirán el mismo proyecto Next.js.

Cada módulo deberá estar claramente separado por dominio.

---

# Stack Tecnológico

Frontend

- Next.js 15 (si la migración es estable)
- React
- TypeScript
- TailwindCSS
- shadcn/ui

Backend

- Route Handlers

ORM

- Prisma

Base de datos

- Supabase PostgreSQL

Storage

- Supabase Storage

Autenticación

- NextAuth

Emails

- Resend

Pagos

- Mercado Pago

Hosting

- Vercel

---

# Organización

La aplicación tendrá un único código.

Todos los conjuntos compartirán exactamente la misma aplicación.

No existirán despliegues independientes.

---

# Multi-Tenant

Cada conjunto residencial será un Tenant.

Todo dato operativo pertenecerá exactamente a un Tenant.

Ejemplos:

- Usuarios
- PQRS
- Evidencias
- Reportes
- Configuración

Nunca podrán mezclarse datos entre Tenant.

---

# Roles

## SUPER_ADMIN

Administra toda la plataforma.

Puede:

- Crear Tenant
- Editar Tenant
- Suspender Tenant
- Reactivar Tenant
- Ver ingresos
- Ver pagos
- Crear reglas de precio
- Activar módulos
- Administrar la plataforma

---

## ADMIN

Administra únicamente su Tenant.

Puede:

- Invitar usuarios
- Gestionar PQRS
- Ver reportes
- Renovar licencia
- Configurar datos del conjunto

---

## ASISTENTE

Apoya la operación diaria.

---

## CONSEJO

Consulta información.

---

## RESIDENTE

Utiliza los servicios.

---

# Tenant

Cada Tenant tendrá:

- Nombre
- Número de unidades
- Estado
- Licencia
- Suscripción
- Configuración
- Productos habilitados

---

# Licencias

Estados posibles

- Trial
- Active
- Grace Period
- Suspended
- Cancelled

Un Tenant suspendido no podrá acceder al sistema.

---

# Precio

El precio NO será elegido manualmente.

Será calculado automáticamente utilizando la cantidad de unidades.

Las reglas serán administradas desde SUPER_ADMIN.

Nunca estarán escritas en código.

---

# SUPER_ADMIN Dashboard

El panel principal deberá mostrar:

## Plataforma

- Total de Tenant
- Tenant activos
- Tenant suspendidos

## Facturación

- MRR
- Ingresos del mes
- Pagos pendientes
- Renovaciones próximas

## Uso

- Usuarios
- PQRS creadas
- PQRS cerradas

---

# ADMIN Dashboard

Mostrará únicamente información de su Tenant.

Nunca verá datos de otros conjuntos.

---

# Registro

El registro normal desaparece.

El acceso será mediante:

- Invitación enviada por ADMIN

o

- Código temporal generado por ADMIN

El usuario nunca seleccionará un Tenant.

El Tenant quedará asociado automáticamente.

---

# Login

El login seguirá siendo:

- Correo
- Contraseña

El Tenant se obtendrá automáticamente desde el usuario.

---

# Productos

Cada Tenant podrá tener productos activados.

Inicialmente:

- PQRS

En el futuro:

- Comunicados
- Reservas
- Visitantes
- Correspondencia

---

# Archivos

Las evidencias dejarán de almacenarse en PostgreSQL.

Se almacenarán en Supabase Storage.

La base de datos únicamente guardará:

- URL
- Nombre
- Tipo
- Tamaño

---

# Correos

Todos los correos utilizarán Resend.

No se utilizará Nodemailer.

---

# Configuración

El SUPER_ADMIN podrá modificar sin tocar código:

- Precios
- Rangos de unidades
- Período de gracia
- Módulos
- Branding global
- Correos
- Configuración de pagos

---

# Reglas de Desarrollo

Codex deberá seguir estas reglas:

- Nunca reescribir módulos completos.
- Modificar únicamente lo necesario.
- Mantener compatibilidad con PQRS.
- Crear componentes reutilizables.
- Documentar cambios importantes.
- No introducir dependencias innecesarias.

---

# Definición de Proyecto Terminado

El proyecto se considerará terminado cuando:

- Existan múltiples Tenant.
- Los datos estén completamente aislados.
- Exista SUPER_ADMIN.
- Exista facturación automática.
- Existan licencias.
- PQRS funcione igual que hoy.
- El administrador pueda crear nuevos conjuntos sin modificar código.
- La plataforma pueda crecer agregando nuevos módulos sin cambios estructurales.