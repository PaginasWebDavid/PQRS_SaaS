# Documentación de PQRS Services

Este directorio contiene contexto operativo, decisiones técnicas, pruebas, planes y borradores legales del proyecto.

## Empieza aquí

1. [README público y guía técnica](../README.md)
2. [Contexto canónico de producto y negocio](programa-mejora/00-contexto/PQRS_SERVICES_NEGOCIO_ACTUAL.md)
3. [Guía de pruebas](TESTING.md)

El contexto canónico describe el funcionamiento vigente de los cuatro roles, cada pestaña, los módulos, facturación, seguridad, operación comercial y límites manuales.

## Organización

### programa-mejora

Contiene auditorías, prompts, respuestas, decisiones, implementaciones y cierres por fase.

Estos documentos son evidencia histórica. Pueden describir estados anteriores del producto. Si existe una contradicción, el orden de autoridad es:

1. código y migraciones aplicadas;
2. contexto canónico actualizado;
3. documentación de la fase más reciente;
4. documentación histórica.

### legal

Contiene borradores de trabajo:

- Contrato marco de prestación del servicio.
- Acuerdo de referidos y gestión comercial.

Los archivos marcados BORRADOR no están autorizados para firma o publicación. Requieren revisión de abogado colombiano y contador, completar datos de las partes y verificar la operación tributaria.

Las páginas legales que ve el usuario están implementadas en src/app/legal y su configuración está en src/lib/legal.ts.

### superpowers

Conserva planes técnicos y de diseño utilizados durante fases de implementación.

## Reglas de mantenimiento

- No guardar secretos, tokens, contraseñas ni datos personales reales.
- No presentar una capacidad manual como automática.
- Actualizar el contexto canónico cuando cambie un rol, módulo, proveedor, precio, estado, flujo o política legal.
- Mantener separados el negocio acordado por contrato y la cobertura técnica que la aplicación registra.
- No borrar evidencia histórica para ocultar una decisión anterior; marcarla como superada y enlazar el estado vigente.
- No usar documentos legales sin validación profesional.

## Estado comercial actual

PQRS Services se vende a conjuntos mediante propuesta y contrato. El plazo contractual puede ser de uno o varios años. Las formas de pago admitidas son:

- mensual manual;
- mensual automática por Wompi;
- anual anticipada con 10 % de descuento.

La duración contractual y la forma de pago no son equivalentes. La aplicación gestiona cobertura y cobros; el documento firmado conserva las condiciones particulares de cada cliente.
