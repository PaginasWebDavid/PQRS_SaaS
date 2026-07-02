# Coding Rules

## Objetivo

Este documento define las reglas obligatorias que Codex debe seguir durante todo el proyecto.

El objetivo NO es escribir código más rápido.

El objetivo es mantener un código consistente, escalable y fácil de mantener.
# Regla #0

Antes de escribir código:

1. Leer toda la carpeta docs.

2. Entender el proyecto.

3. Analizar el código existente.

4. Reutilizar el máximo posible.

5. Solo después comenzar a implementar.

Nunca asumir.

Nunca reescribir el proyecto desde cero.
---

# Regla #1

NO reescribir código que ya funciona.

Siempre modificar el menor número posible de archivos.

---

# Regla #2

Antes de crear un componente nuevo, buscar si ya existe uno reutilizable.

Priorizar reutilización.

---

# Regla #3

Nunca modificar el diseño de una pantalla si la tarea no lo solicita.

---

# Regla #4

Nunca cambiar nombres de funciones, componentes o archivos sin una razón clara.

Evitar cambios innecesarios que compliquen el historial de Git.

---

# Regla #5

Toda nueva funcionalidad debe ser modular.

Nunca mezclar lógica de diferentes dominios.

Ejemplo:

Incorrecto

PQRS llamando directamente funciones de Billing.

Correcto

PQRS -> Servicio -> Billing

---

# Regla #6

No duplicar código.

Si una función se utiliza dos veces, convertirla en utilidad reutilizable.

---

# Regla #7

No instalar librerías innecesarias.

Antes de agregar una dependencia verificar si el proyecto ya tiene una solución.

---

# Regla #8

Nunca romper compatibilidad.

El sistema actual funciona.

Todo cambio debe ser incremental.

---

# Regla #9

Una tarea = un objetivo.

No aprovechar una tarea para hacer refactors gigantes.

---

# Regla #10

No hacer optimizaciones prematuras.

Primero funcionalidad.

Después optimización.

---

# Arquitectura

Respetar siempre esta separación.

Platform

↓

Organizations

↓

Billing

↓

PQRS

↓

Notifications

↓

Analytics

Cada dominio debe tener responsabilidades claras.

---

# Base de datos

Toda entidad operativa pertenece a un Tenant.

Nunca acceder información de otro Tenant.

Siempre filtrar por tenantId.

---

# Seguridad

Nunca confiar en información enviada desde el frontend.

tenantId

role

permisos

Siempre obtenerlos desde la sesión.

---

# Prisma

Preferir Prisma antes que SQL.

Solo utilizar consultas SQL cuando exista una mejora clara de rendimiento.

---

# Errores

Nunca lanzar errores genéricos.

Siempre proporcionar mensajes útiles para el desarrollador.

Registrar errores críticos.

---

# Logs

Registrar únicamente eventos importantes.

Evitar llenar la consola con información innecesaria.

---

# Comentarios

No comentar código evidente.

Solo documentar decisiones complejas.

---

# Componentes

Mantener componentes pequeños.

Preferir composición sobre componentes gigantes.

---

# APIs

Cada endpoint debe tener una única responsabilidad.

Nunca mezclar múltiples operaciones distintas.

---

# Migraciones

Migraciones pequeñas.

Una responsabilidad por migración.

Siempre reversibles.

---

# Pull Requests

Cada cambio debe poder describirse en una frase.

Si no puede describirse fácilmente, probablemente el cambio es demasiado grande.

---

# Definition of Done

Una tarea solo termina cuando:

- Compila correctamente.
- No rompe funcionalidades existentes.
- Respeta la arquitectura.
- Sigue estas reglas.
- No introduce deuda técnica evidente.

---

# Qué NO hacer

- No reescribir módulos completos.
- No cambiar UI innecesariamente.
- No mover archivos porque sí.
- No crear dependencias innecesarias.
- No eliminar funcionalidades existentes.
- No modificar reglas de negocio sin autorización.

---

# Filosofía

El mejor cambio es el más pequeño posible que resuelve el problema correctamente.

Cada commit debe mejorar el proyecto sin aumentar su complejidad.