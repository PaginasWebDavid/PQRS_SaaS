# Categorias y flujos

**La categoria decide el flujo.** Esa es la idea completa, y es lo que evita preguntarle
al [[Admin]] dos veces lo mismo.

Cada categoria tiene un `workflowType`:

- **SIMPLE** — se abre y se cierra. Convivencia, seguridad, cartera, certificados.
- **MAINTENANCE** — pasa por **5 fases**. Mantenimiento y zonas comunes.

Cuando el admin escoge "Mantenimiento" al abrir el caso, el sistema ya sabe que ese
[[PQRS]] necesita fases. No hay que preguntarle aparte "¿como va a ser esta solicitud?".

## Por que 5 fases

Un arreglo fisico no se resuelve en un paso: hay que diagnosticar, cotizar, contratar,
ejecutar y verificar. Registrar cada fase es lo que le permite al [[Admin]] demostrarle
al [[Consejo]] que el caso avanzo, aunque todavia no este cerrado.

## Categorias propias

Cada [[Conjunto]] arranca con un juego inicial y puede crear las suyas, con un tope. La
categoria queda guardada como *snapshot* en el caso: si despues se renombra o desactiva,
los casos viejos siguen mostrando lo que decia cuando ocurrieron.

Codigo: `src/domains/pqrs/pqrs-category-policy.ts`
