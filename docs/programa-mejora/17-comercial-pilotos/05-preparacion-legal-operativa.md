# FASE C6 — PREPARACIÓN LEGAL, OPERATIVA Y VALIDACIÓN EXTERNA

## 1. Objetivo

Cerrar todas las condiciones necesarias antes de:

* recibir datos personales de un conjunto externo;
* cobrar el primer piloto;
* enviar invitaciones reales;
* procesar PQRS reales;
* almacenar evidencias reales;
* ejecutar pagos en producción;
* comprometer niveles de servicio;
* activar una copropiedad fuera del conjunto original.

Esta fase no incluye nuevos módulos.

Su resultado debe ser una decisión documentada:

* `GO — AUTORIZADO PARA PRIMER PILOTO`;
* `GO CON CONDICIONES`;
* `NO-GO — EXISTEN BLOQUEANTES`.

---

# 2. Regla de salida

No se activa el primer piloto externo pago hasta que se encuentren cerrados estos seis bloques:

1. identidad legal y tributaria del vendedor;
2. documentos contractuales;
3. tratamiento de datos personales;
4. política operativa de soporte, cancelación y salida;
5. validación externa de los flujos críticos;
6. procedimiento de respaldo, incidentes y recuperación.

La prospección, los diagnósticos y las demostraciones pueden comenzar antes.

La importación de residentes y la recepción de pagos no.

---

# 3. Identidad del vendedor

Debe definirse una única persona o entidad que:

* aparezca en la propuesta;
* firme el acuerdo;
* reciba el pago;
* expida el documento tributario aplicable;
* aparezca en términos y políticas;
* responda frente al cliente;
* contrate proveedores;
* gestione reclamos comerciales.

## Información obligatoria

```text
TIPO DE VENDEDOR:
- persona natural;
- persona jurídica.

NOMBRE O RAZÓN SOCIAL:
NIT O DOCUMENTO:
DIRECCIÓN:
CIUDAD:
CORREO CONTRACTUAL:
TELÉFONO:
REPRESENTANTE LEGAL, SI APLICA:
CUENTA RECEPTORA:
TITULAR DE LA CUENTA:
RÉGIMEN Y RESPONSABILIDADES TRIBUTARIAS:
DOCUMENTO DE COBRO A EXPEDIR:
```

No usar simultáneamente:

* una persona en el contrato;
* otra en la cuenta bancaria;
* otra en Mercado Pago;
* una marca sin responsable jurídico.

Las diferencias justificadas deben documentarse.

---

# 4. Validación tributaria

Antes de cobrar, un contador debe confirmar:

1. quién prestará formalmente el servicio;
2. si debe actualizar actividades o responsabilidades en el RUT;
3. si está obligado a facturar electrónicamente;
4. si cobra IVA u otro impuesto;
5. qué retenciones pueden practicar las copropiedades;
6. qué documento entrega por el piloto;
7. cómo se contabilizan anualidades;
8. cómo se registra una comisión por referido;
9. cómo se trata un pago recibido por Mercado Pago;
10. cómo se documentan devoluciones y notas crédito.

La DIAN establece que los responsables de facturar deben hacerlo electrónicamente y exige, entre otros elementos, un RUT actualizado y el proceso de habilitación correspondiente. La obligación concreta debe determinarse según la situación tributaria real del vendedor.

## Evidencia requerida

* copia o certificado actualizado del RUT;
* concepto escrito del contador;
* método de facturación definido;
* prueba de emisión del documento aplicable;
* cuenta bancaria confirmada;
* formato de datos de facturación del cliente.

## Resultado

```text
IDENTIDAD TRIBUTARIA: APROBADA / PENDIENTE
FACTURACIÓN: APROBADA / PENDIENTE
CUENTA RECEPTORA: APROBADA / PENDIENTE
IMPUESTOS Y RETENCIONES: DEFINIDOS / PENDIENTES
```

---

# 5. Roles de tratamiento de datos

La estructura contractual inicial será, sujeta a revisión jurídica:

## Copropiedad

Probable rol:

`RESPONSABLE DEL TRATAMIENTO`

La copropiedad:

* define las finalidades;
* decide qué datos se recopilan;
* autoriza la carga;
* define quién puede acceder;
* atiende solicitudes de residentes;
* determina los tiempos de conservación contractuales;
* instruye la devolución o eliminación.

La SIC ha indicado que la propiedad horizontal puede actuar como responsable de las bases utilizadas para su administración y puede delegar tratamiento a terceros encargados.

## PQRS Services

Probable rol:

`ENCARGADO DEL TRATAMIENTO`

PQRS Services:

* trata datos siguiendo instrucciones del cliente;
* no utiliza datos para fines propios incompatibles;
* implementa medidas de seguridad;
* limita accesos;
* gestiona subproveedores;
* informa incidentes;
* permite exportación y salida;
* coopera con solicitudes de titulares.

## Titulares

Pueden incluir:

* propietarios;
* residentes;
* arrendatarios;
* administradores;
* consejeros;
* empleados;
* proveedores;
* personas mencionadas en PQRS;
* visitantes cuando aparezcan en evidencias.

La Ley 1581 reconoce, entre otros, derechos de conocimiento, actualización y rectificación sobre la información personal.

## Validación

Un abogado colombiano debe confirmar:

* los roles;
* las finalidades;
* la base jurídica;
* el contenido del anexo;
* la relación con proveedores internacionales;
* el procedimiento para titulares;
* cualquier autorización necesaria.

---

# 6. Inventario mínimo de datos

Crear una matriz con:

| Dato               | Titular            | Finalidad                 | Fuente            | Acceso              | Proveedor       | Retención          |
| ------------------ | ------------------ | ------------------------- | ----------------- | ------------------- | --------------- | ------------------ |
| Nombre             | Residente          | Identificación de usuario | Copropiedad       | ADMIN/usuario       | Supabase        | Según contrato     |
| Correo             | Residente          | Acceso y notificaciones   | Copropiedad       | ADMIN/usuario       | Supabase/Resend | Según contrato     |
| Unidad             | Residente          | Relación con conjunto     | Copropiedad       | Roles autorizados   | Supabase        | Según contrato     |
| PQRS               | Residente/terceros | Gestión de solicitudes    | Usuario           | Roles autorizados   | Supabase        | Según contrato     |
| Evidencias         | Varios             | Sustento del caso         | Usuario           | Roles autorizados   | Storage         | Según contrato     |
| Historial          | Usuarios           | Trazabilidad              | Plataforma        | ADMIN/CONSEJO       | Supabase        | Según contrato     |
| Datos de pago SaaS | Cliente            | Cobro                     | Cliente/proveedor | SUPER_ADMIN         | Mercado Pago    | Según obligaciones |
| Logs técnicos      | Usuarios           | Seguridad y diagnóstico   | Plataforma        | Personal autorizado | Proveedores     | Plazo definido     |

## Prohibiciones

No solicitar ni importar por defecto:

* contraseñas;
* números completos de tarjetas;
* información bancaria de residentes;
* historias clínicas;
* antecedentes;
* información biométrica;
* documentos completos de identidad;
* datos de menores sin necesidad demostrada;
* información sensible no necesaria.

Si una PQRS incluye información sensible accidentalmente, debe aplicarse el procedimiento de retiro de evidencia y registrarse el incidente.

---

# 7. Subproveedores

Crear un registro, como mínimo, para:

* Vercel;
* Supabase;
* Resend;
* Mercado Pago;
* proveedor de dominio;
* proveedor de monitoreo, si existe;
* proveedor de soporte o analítica, si se incorpora.

Para cada uno registrar:

```text
PROVEEDOR:
SERVICIO:
DATOS TRATADOS:
FINALIDAD:
UBICACIÓN O REGIÓN:
TÉRMINOS/DPA:
MEDIDAS RELEVANTES:
SUBPROVEEDORES:
MECANISMO DE ELIMINACIÓN:
CONTACTO DE INCIDENTES:
FECHA DE REVISIÓN:
```

El contrato con el conjunto debe permitir el uso de subencargados necesarios para prestar el servicio y establecer un mecanismo razonable de información sobre cambios.

No prometer que toda la información permanece en Colombia si no está verificado.

---

# 8. Documentos obligatorios

Antes del piloto deben existir versiones aprobadas de:

## 8.1 Propuesta comercial

Debe indicar:

* problema;
* alcance;
* piloto;
* precio;
* precio posterior;
* exclusiones;
* vigencia;
* siguiente paso.

## 8.2 Acuerdo de piloto

Debe definir:

* partes;
* duración;
* precio;
* fecha;
* responsabilidades;
* alcance;
* soporte;
* uso de casos reales;
* propiedad del software;
* confidencialidad;
* limitaciones;
* terminación;
* salida;
* solución de controversias;
* tratamiento de datos.

## 8.3 Anexo de tratamiento de datos

Debe cubrir:

* roles;
* instrucciones;
* finalidades;
* categorías de datos;
* titulares;
* confidencialidad;
* seguridad;
* subencargados;
* solicitudes de titulares;
* incidentes;
* exportación;
* devolución;
* eliminación;
* auditoría razonable;
* terminación.

## 8.4 Política de privacidad de la plataforma

Debe identificar:

* responsable de datos recogidos directamente por PQRS Services;
* canales;
* derechos;
* finalidades propias limitadas;
* contacto;
* cookies o analítica, si existen.

No confundir esta política con el anexo donde PQRS Services actúa por cuenta de la copropiedad.

## 8.5 Términos del servicio

Deben reflejar el producto real:

* roles;
* uso autorizado;
* disponibilidad sin prometer 100 %;
* restricciones;
* propiedad intelectual;
* pagos;
* mora;
* suspensión;
* cancelación;
* exportación;
* soporte;
* responsabilidad.

## 8.6 Política de soporte

Debe indicar:

* canal;
* horario;
* usuarios atendidos;
* prioridad;
* tiempos objetivo;
* exclusiones;
* incidentes críticos.

## 8.7 Política de cancelación y salida

Debe indicar:

* cómo se solicita;
* fecha efectiva;
* cobros futuros;
* exportación;
* acceso;
* recuperación;
* eliminación;
* copias de respaldo;
* reactivación.

## Revisión profesional

Los documentos deben ser revisados por abogado antes de recibir datos externos.

Los textos generados internamente son borradores operativos, no concepto jurídico.

---

# 9. Política recomendada de cancelación y salida

Esta política es una propuesta comercial que debe validarse jurídicamente.

## Cancelación mensual

* el cliente solicita cancelación por canal autorizado;
* no se realizan nuevos cobros;
* el acceso continúa hasta terminar el periodo pagado;
* no hay devolución proporcional salvo error atribuible a PQRS Services;
* se confirma la fecha efectiva por escrito.

## Exportación

* el cliente puede solicitar exportación antes de la fecha de cierre;
* se entrega en formato disponible;
* la exportación incluye PQRS, historial y usuarios;
* no incluye secretos, tokens o estructura interna;
* el cliente debe confirmar recepción.

## Recuperación

Propuesta:

* acceso de recuperación o asistencia durante 30 días posteriores al cierre;
* sin operación ordinaria;
* sujeto a que no exista una solicitud de eliminación inmediata compatible con obligaciones legales.

## Eliminación

Propuesta:

* eliminación de datos operativos dentro de los 60 días posteriores al cierre;
* backups eliminados por rotación dentro del plazo técnico definido;
* conservación separada de registros comerciales, tributarios o de seguridad cuando exista una obligación legítima.

Estos plazos son decisiones contractuales propuestas, no afirmaciones de un plazo impuesto universalmente por la ley.

## Confirmación final

El cliente recibe:

* fecha de terminación;
* fecha límite de exportación;
* fecha estimada de eliminación;
* confirmación final del proceso.

---

# 10. Soporte operativo

## Canal oficial

Definir:

```text
CORREO:
PORTAL/TICKETS:
HORARIO:
DÍAS HÁBILES:
CONTACTO DE INCIDENTES:
```

No utilizar WhatsApp personal como canal permanente.

## Residentes

PQRS Services atiende directamente únicamente:

* acceso;
* fallas técnicas;
* privacidad;
* seguridad.

## Administración

La administración atiende:

* seguimiento operativo;
* tiempos de respuesta;
* convivencia;
* mantenimiento;
* cartera;
* decisiones;
* proveedores;
* contenido de las PQRS.

## Objetivos iniciales de respuesta

Propuesta para pilotos:

| Prioridad | Ejemplo                  |  Acuse objetivo | Tratamiento        |
| --------- | ------------------------ | --------------: | ------------------ |
| Crítica   | Exposición entre tenants | 2 horas hábiles | Atención inmediata |
| Alta      | No se pueden crear PQRS  | 4 horas hábiles | Prioritaria        |
| Media     | Falla parcial            |     1 día hábil | Planificada        |
| Baja      | Consulta o mejora        |  2 días hábiles | Orientación        |

No prometer resolución dentro del mismo tiempo del acuse.

---

# 11. Procedimiento de incidentes

## Detectar

El incidente puede provenir de:

* usuario;
* alerta;
* proveedor;
* soporte;
* revisión interna.

## Contener

* limitar acceso;
* suspender operación afectada;
* revocar credenciales;
* bloquear descargas;
* preservar evidencia técnica.

## Evaluar

Registrar:

* fecha;
* sistemas;
* tenants;
* datos;
* titulares;
* acceso;
* duración;
* causa;
* medidas.

## Comunicar

Definir con asesoría jurídica:

* quién comunica al cliente;
* contenido;
* tiempo;
* autoridades;
* titulares;
* proveedores.

## Corregir

* resolver causa;
* probar;
* restaurar;
* monitorear.

## Cerrar

* informe;
* acciones preventivas;
* lecciones;
* responsables;
* fecha.

No ocultar un incidente crítico al cliente.

No comunicar conclusiones no verificadas.

---

# 12. Backups y recuperación

Antes del piloto debe verificarse la capacidad real del plan contratado en Supabase y los mecanismos adicionales implementados.

## Objetivo inicial recomendado

```text
RPO objetivo: máximo 24 horas
RTO objetivo: máximo 24 horas para un piloto
```

Estos son objetivos internos iniciales, no garantías contractuales hasta ser comprobados.

## Validaciones

1. confirmar backups disponibles;
2. confirmar frecuencia;
3. confirmar retención;
4. confirmar restauración;
5. documentar quién puede restaurar;
6. probar restauración en entorno aislado;
7. confirmar Storage;
8. conservar configuración e infraestructura;
9. proteger credenciales;
10. documentar dependencia del proveedor.

## Prueba de restauración

Debe realizarse al menos una vez antes de escalar a más de tres clientes.

Resultado:

```text
FECHA:
ORIGEN:
DESTINO:
DATOS RECUPERADOS:
TIEMPO:
ERRORES:
RPO REAL:
RTO REAL:
RESULTADO:
```

---

# 13. Entorno de validación externa

La validación se ejecutará con:

* entorno autorizado;
* dominio real;
* HTTPS;
* dos tenants de prueba;
* correos controlados;
* usuarios por rol;
* datos sintéticos;
* archivos sintéticos;
* comprador de prueba separado;
* credenciales de sandbox cuando existan.

No utilizar datos reales de residentes para validar.

## Tenants

### Tenant A

* ADMIN A;
* CONSEJO A;
* RESIDENTE A;
* categorías propias;
* PQRS A;
* evidencias A.

### Tenant B

* ADMIN B;
* CONSEJO B;
* RESIDENTE B;
* categorías propias;
* PQRS B;
* evidencias B.

Cada prueba debe intentar tanto el camino autorizado como un intento cross-tenant.

---

# 14. Matriz de validación externa

Crear:

```text
docs/programa-mejora/21-preparacion-legal-operativa-validacion/
03-matriz-evidencias-validacion-externa.md
```

Formato:

| ID | Flujo | Entorno | Resultado | Evidencia | Fecha | Responsable |
| -- | ----- | ------- | --------- | --------- | ----- | ----------- |

Estados:

* `NO EJECUTADO`;
* `APROBADO`;
* `APROBADO CON OBSERVACIÓN`;
* `FALLIDO`;
* `BLOQUEADO`.

---

# 15. Pruebas reales de correo

Usar direcciones controladas en al menos dos proveedores de correo distintos.

## E01 — Invitación

Verificar:

* remitente;
* asunto;
* conjunto;
* enlace;
* expiración;
* uso único;
* acceso correcto;
* no acceso a otro tenant.

## E02 — Recuperación

Verificar:

* correo;
* enlace;
* expiración;
* uso único;
* cambio de contraseña;
* revocación de sesiones;
* ausencia de filtración de existencia de usuario.

## E03 — Nueva PQRS

Verificar:

* ADMIN correcto;
* contenido mínimo;
* tenant correcto;
* sin evidencia sensible;
* no envío a ADMIN ajeno.

## E04 — Cambio y cierre

Verificar:

* residente correcto;
* estado;
* historial;
* enlaces;
* no contradicción.

## E05 — Billing

Verificar:

* pago aprobado;
* pago rechazado;
* cortesía;
* mora;
* suspensión;
* reactivación.

Cada evento debe distinguirse correctamente.

## Evidencia

Guardar:

* timestamp;
* destinatario parcialmente oculto;
* Message ID;
* estado del proveedor;
* entrega;
* rebote;
* captura sin información sensible.

---

# 16. Pruebas reales de pagos

Mercado Pago permite crear y administrar suscripciones y contempla cobros recurrentes y reintentos; aun así, la integración específica debe validarse con el flujo real del proyecto antes de usarla con clientes.

## P01 — Pago manual

* registrar operación;
* verificar operationId;
* confirmar periodo;
* confirmar notificación;
* confirmar auditoría;
* repetir y verificar idempotencia.

## P02 — Cortesía

* otorgar cortesía;
* confirmar `Sin cobro`;
* verificar que no aparezca como ingreso;
* repetir operación;
* comprobar no duplicación.

## P03 — Mercado Pago aprobado

* usar comprador de prueba;
* completar pago;
* verificar firma del webhook;
* verificar Payment;
* verificar Subscription;
* verificar outbox;
* verificar correo;
* repetir webhook.

## P04 — Mercado Pago rechazado

* ejecutar rechazo autorizado;
* verificar estado;
* verificar mensaje;
* no comunicar aprobación;
* no suspender antes de la regla vigente.

## P05 — Mora y suspensión

* usar entorno controlado;
* llevar periodo a vencimiento;
* ejecutar cron;
* confirmar gracia;
* confirmar aviso;
* confirmar suspensión.

## P06 — Reactivación

* registrar cobertura válida;
* reactivar;
* confirmar misma suscripción;
* confirmar acceso;
* confirmar auditoría;
* confirmar ausencia de pago ficticio.

## Regla

No realizar cobros reales no reversibles sin autorización expresa y control de monto.

---

# 17. Prueba funcional completa

Ejecutar de principio a fin:

```text
Crear tenant
→ invitar ADMIN
→ configurar categorías
→ importar usuarios sintéticos
→ invitar RESIDENTE
→ crear PQRS
→ adjuntar evidencia
→ asignar responsable
→ primer contacto
→ cambiar fase
→ corregir caso
→ retirar evidencia
→ cerrar
→ consultar CONSEJO
→ generar reporte
→ exportar
→ registrar pago
→ suspender
→ reactivar
→ cancelar
→ exportar salida
```

Verificar en cada paso:

* actor;
* tenant;
* permisos;
* notificación;
* auditoría;
* historial;
* resultado visible;
* respuesta ante reintento.

---

# 18. Aislamiento externo entre tenants

Intentar explícitamente:

* usar categoryId de otro tenant;
* usar PQRS ID de otro tenant;
* descargar evidencia ajena;
* asignar responsable ajeno;
* corregir caso ajeno;
* retirar evidencia ajena;
* consultar reporte ajeno;
* exportar tenant ajeno;
* cambiar tenant conservando una pantalla abierta;
* reutilizar enlaces o IDs.

Resultado esperado:

* recurso no encontrado o respuesta opaca;
* cero datos ajenos;
* cero cambios;
* registro técnico suficiente;
* sin mensajes internos.

Cualquier exposición cross-tenant produce `NO-GO`.

---

# 19. Validación visual de producción

Revisar en escritorio y móvil:

* landing;
* login;
* recuperación;
* invitación;
* onboarding;
* residente;
* administrador;
* consejo;
* creación;
* detalle;
* corrección;
* reportes;
* configuración;
* soporte;
* licencias;
* errores;
* estados vacíos.

No rediseñar.

Solo registrar:

* bloqueo;
* texto incorrecto;
* función inaccesible;
* dato desbordado;
* acción engañosa;
* problema móvil crítico.

---

# 20. Observabilidad mínima

Antes del piloto debe existir capacidad para identificar:

* errores de aplicación;
* fallos de cron;
* fallos de webhooks;
* outbox pendiente;
* rebotes de correo;
* intentos de acceso;
* fallos de Storage;
* pagos ambiguos;
* tenants suspendidos;
* limpieza de evidencias pendiente.

## Revisión diaria durante el piloto

Registrar:

```text
ERRORES CRÍTICOS:
WEBHOOKS FALLIDOS:
OUTBOX PENDIENTE:
CORREOS REBOTADOS:
STORAGE PENDIENTE:
PAGOS AMBIGUOS:
TICKETS ABIERTOS:
INCIDENTES:
```

No construir un nuevo dashboard si esta información ya puede consultarse en proveedores, logs o paneles existentes.

---

# 21. Credenciales y acceso operativo

Verificar:

* MFA en cuentas críticas;
* correos de recuperación;
* propietario de Supabase;
* propietario de Vercel;
* propietario de dominio;
* propietario de Resend;
* propietario de Mercado Pago;
* llaves de producción separadas;
* `.env` fuera de Git;
* credenciales de prueba separadas;
* acceso mínimo;
* método de revocación;
* inventario de secretos.

No compartir service role keys en mensajes, documentos o capturas.

---

# 22. Dominio y correo

Verificar:

* dominio controlado;
* DNS;
* HTTPS;
* remitente;
* SPF;
* DKIM;
* DMARC;
* links;
* correo de soporte;
* correo contractual;
* correo de privacidad;
* página legal;
* página de estado o canal alternativo, si aplica.

Resultado:

```text
DOMINIO: APROBADO / PENDIENTE
HTTPS: APROBADO / PENDIENTE
SPF: APROBADO / PENDIENTE
DKIM: APROBADO / PENDIENTE
DMARC: APROBADO / PENDIENTE
CORREOS REALES: APROBADOS / PENDIENTES
```

---

# 23. Información legal publicada

Antes del primer piloto, la aplicación debe mostrar sin placeholders:

* nombre o razón social;
* NIT o identificación;
* dirección o ciudad;
* correo contractual;
* contacto de privacidad;
* fecha de vigencia;
* términos;
* privacidad;
* pagos;
* cancelación.

No publicar información inventada para llenar campos.

---

# 24. Runbook del primer piloto

Crear un documento operativo que indique:

## Antes

* documentos;
* pago;
* datos;
* configuración;
* pruebas;
* capacitación.

## Lanzamiento

* invitaciones;
* primera PQRS;
* validación de correo;
* responsable;
* comunicación.

## Cada día

* errores;
* correo;
* soporte;
* outbox;
* pagos.

## Cada semana

* adopción;
* PQRS;
* soporte;
* procesos externos;
* incidentes;
* riesgos.

## Cierre

* informe;
* decisión;
* pago;
* exportación;
* retención;
* eliminación.

---

# 25. Criterios automáticos de NO-GO

No activar un piloto cuando exista cualquiera de estos puntos:

* identidad del vendedor indefinida;
* imposibilidad de expedir el documento de cobro aplicable;
* contrato no revisado;
* anexo de datos no revisado;
* datos legales con placeholders;
* exposición cross-tenant;
* invitaciones reales no entregadas;
* recuperación no funcional;
* PQRS no persistente;
* evidencia accesible sin autorización;
* exportación mezclada;
* webhook no verificado;
* suspensión incorrecta;
* ausencia total de backup;
* credencial crítica insegura;
* incidente crítico abierto;
* cliente sin autorización sobre la base;
* piloto sin responsable;
* piloto sin pago;
* precio posterior no informado.

---

# 26. Riesgos aceptables para un piloto

Pueden aceptarse, si se documentan:

* soporte manual;
* cobro manual;
* exportación sincrónica limitada;
* ausencia de dashboard Portafolio;
* categorías legacy conservadas;
* cleanup de Storage best-effort con referencia recuperable;
* ausencia de E2E automatizado de navegador;
* seguimiento manual de métricas;
* facturación manual mediante mecanismo legal definido;
* onboarding acompañado.

No son aceptables:

* riesgos de aislamiento;
* pérdida de datos sin recuperación;
* documentos falsos;
* cobros sin soporte;
* correos críticos no probados;
* responsabilidades contractuales ambiguas;
* inexistencia de procedimiento de salida.

---

# 27. Evidencias finales

La carpeta debe contener o referenciar:

```text
01-prompt-preparacion-previa-pilotos.md
02-respuesta-plan-preparacion-previa-pilotos.md
03-matriz-evidencias-validacion-externa.md
04-decision-go-no-go-primer-piloto.md
05-checklist-identidad-tributaria.md
06-inventario-datos-subproveedores.md
07-runbook-pruebas-externas.md
08-runbook-incidentes-recuperacion.md
09-politica-soporte-cancelacion-salida.md
```

Los contratos y documentos con datos personales no deben subirse a un repositorio público.

Puede conservarse una plantilla sin datos reales.

---

# 28. Orden de ejecución

## Bloque A — Decisiones personales y profesionales

Responsable: fundador + contador + abogado.

1. identidad;
2. RUT;
3. facturación;
4. contrato;
5. anexo;
6. privacidad;
7. cancelación;
8. soporte.

## Bloque B — Preparación operativa

Responsable: fundador.

1. cuentas;
2. dominio;
3. correos;
4. proveedores;
5. backups;
6. incidentes;
7. credenciales;
8. runbooks.

## Bloque C — Validación técnica externa

Responsable: fundador con asistencia técnica autorizada.

1. dos tenants;
2. correos;
3. flujos PQRS;
4. evidencias;
5. pagos;
6. cron;
7. salida;
8. aislamiento.

## Bloque D — Decisión

Responsable: fundador.

1. revisar matriz;
2. aceptar riesgos;
3. bloquear pendientes;
4. firmar `GO/NO-GO`;
5. autorizar primer piloto.

---

# 29. Participación de inteligencias artificiales

Esta fase no debe convertirse automáticamente en desarrollo.

## ChatGPT

* estructura documentos;
* ayuda a redactar borradores;
* organiza matrices;
* interpreta resultados.

## Contador

* define obligaciones tributarias;
* facturación;
* impuestos;
* retenciones;
* comisiones.

## Abogado

* valida contratos;
* privacidad;
* tratamiento;
* responsabilidades;
* retención;
* incidentes;
* salida.

## Codex

Solo participa para:

* ejecutar el runbook técnico;
* revisar logs;
* documentar resultados;
* corregir fallos técnicos concretos autorizados.

No implementa funcionalidades nuevas.

## Claude

Puede efectuar una revisión independiente de la matriz y evidencias técnicas.

No reemplaza la revisión jurídica ni tributaria.

---

# 30. Decisión GO/NO-GO

Formato:

```text
PROYECTO: PQRS Services
FECHA:
RESPONSABLE:

IDENTIDAD LEGAL: APROBADA / PENDIENTE
FACTURACIÓN: APROBADA / PENDIENTE
CONTRATO: APROBADO / PENDIENTE
TRATAMIENTO DE DATOS: APROBADO / PENDIENTE
SOPORTE Y SALIDA: APROBADOS / PENDIENTES
BACKUP Y RECUPERACIÓN: APROBADOS / PENDIENTES
CORREOS REALES: APROBADOS / PENDIENTES
PAGOS: APROBADOS / PENDIENTES
PQRS E2E: APROBADO / PENDIENTE
AISLAMIENTO: APROBADO / PENDIENTE
INCIDENTES CRÍTICOS ABIERTOS:
RIESGOS ACEPTADOS:

DECISIÓN:
- GO
- GO CON CONDICIONES
- NO-GO

CONDICIONES:
FECHA DE REVISIÓN:
FIRMA/RESPONSABLE:
```

---

# 31. Resultado de C6

C6 se considera cerrada cuando:

1. existe un vendedor identificado;
2. contador confirma el mecanismo de cobro;
3. abogado revisa los documentos;
4. se define el tratamiento de datos;
5. se publica información legal real;
6. se prueba el respaldo y la recuperación;
7. se ejecutan los correos reales;
8. se validan pagos;
9. se ejecuta el flujo funcional completo;
10. se comprueba aislamiento;
11. se documentan riesgos;
12. se firma la decisión `GO`.

Después de C6, el proyecto deja de estar en preparación.

Pasa a:

```text
PROSPECCIÓN
→ DIAGNÓSTICOS
→ DEMOSTRACIONES
→ PROPUESTAS
→ PRIMER PILOTO PAGO
```

No debe abrirse otro ciclo de desarrollo antes de comenzar la validación comercial, salvo que C6 revele un defecto bloqueante real.
