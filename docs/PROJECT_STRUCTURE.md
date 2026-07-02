# Project Structure

```
apps/

    web/

        src/

            domains/

                platform/

                organizations/

                billing/

                pqrs/

                notifications/

                analytics/

            shared/

            components/

            config/

            hooks/

            lib/

            types/

docs/

```

---

# Dominios

Platform

Configuración global.

Organizations

Tenant y usuarios.

Billing

Licencias y pagos.

PQRS

Módulo principal.

Notifications

Correos.

Analytics

Métricas.

---

# Regla

Cada dominio es responsable únicamente de su propia lógica.

No mezclar responsabilidades.