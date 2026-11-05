# 001 — Base del backend y primer flujo clínico

## Estado

Especificación creada el 2026-11-04. Base técnica, autenticación para ADMIN y
NUTRITIONIST, seed sintético y gestión de pacientes implementados. Consultas
clínicas pendientes; no está completo el recorrido de la entrega.
Las decisiones y detalles pendientes se registran en [plan.md](plan.md), y las
verificaciones efectivamente ejecutadas en [tasks.md](tasks.md).

## Objetivo y decisiones confirmadas

Modernizar Nutriline para demostrar capacidades y conseguir clientes.
El frontend reutilizará una base Next.js; el backend se construye desde cero
en NestJS con TypeScript, MySQL y Prisma. Cloudinary gestionará imágenes.
Mantener intacto el legado, usar datos ficticios y simular pagos/correos inicialmente.

## Primera entrega

Un flujo verificable mediante API, antes de conectar el frontend:

1. Un nutriólogo inicia sesión.
2. Registra un paciente sin necesitar una cuenta de acceso para ese paciente.
3. Crea una consulta clínica con peso, talla, motivo y notas.
4. Consulta el historial y el IMC calculado por el servidor.
5. Otro nutriólogo no puede acceder a esos recursos.

La cita de agenda y la consulta clínica son conceptos distintos. La primera
entrega permite consultas sin cita previa; el calendario vendrá después.

## Requisitos funcionales

- **FR01 — Identidad:** usuarios con ID estable, email normalizado, contraseña
  con hash moderno y estado activo/inactivo. Roles iniciales `ADMIN` y `NUTRITIONIST`.
- **FR02 — Sesiones:** login, consulta del usuario actual, renovación y cierre
  de sesión. Contraseña inválida, usuario desconocido o inactivo no generan sesión.
- **FR03 — Pacientes:** alta, listado paginado, detalle, actualización y archivo.
  La propiedad se obtiene de la identidad autenticada, nunca del cuerpo enviado.
- **FR04 — Consultas:** crear y leer consultas clínicas vinculadas por ID al
  paciente y nutriólogo. Guardar consulta, antropometría y cálculo en una transacción.
- **FR05 — Cálculos:** IMC numérico calculado en servidor con peso en kg y talla
  en cm. Rechazar cero, negativos y valores no finitos. No aceptar resultados
  calculados por el cliente como fuente de verdad. Interpretación clínica pendiente.
- **FR06 — Historial:** ordenar por fecha de atención e ID para desempates;
  distinguir dos consultas del mismo paciente en un mismo día.
- **FR07 — Demo:** seed reproducible con administrador, al menos dos nutriólogos
  y pacientes ficticios que permitan demostrar aislamiento y evolución.
- **FR08 — Contrato:** API JSON versionada y documentada en OpenAPI, con DTOs,
  validación, límites de paginación y errores previsibles.

## Seguridad y privacidad

- **SR01:** verificar rol y propiedad en cada lectura/escritura, incluidos historiales
  y futuros archivos; un JWT válido por sí solo no autoriza acceder a otro paciente.
- **SR02:** el rol administrador no otorga acceso clínico global por defecto.
- **SR03:** no importar cuentas, hashes SHA-1 ni datos identificables del respaldo.
- **SR04:** no exponer credenciales, tokens, notas clínicas o cuerpos de login en
  logs, errores, OpenAPI ni telemetría de Observe. Revisar instrumentación antes
  de habilitar datos de negocio; ninguna validación de telemetría se da por hecha.
- **SR05:** secretos por entorno; ejemplos sin valores reales. CORS limitado al
  frontend autorizado; controles CSRF según el transporte de sesión que se apruebe.
- **SR06:** DB y volumen nuevos, separados del MySQL de Ubuntu y del legado.
- **SR07:** rate limiting en login/refresh y mensajes de autenticación genéricos.

## Fuera de esta entrega

- Frontend Next.js, integración Firebase y login público de pacientes.
- Calendario, notificaciones y recuperación por correo.
- Dietas, recetas, PDF, laboratorios, somatotipo y fórmulas avanzadas.
- Cloudinary operativo, cobros reales, portal de autoservicio y multiclínica.
- Importador del dump antiguo o uso clínico/producción con pacientes reales.

Estas funcionalidades permanecen en el backlog; no se eliminan del producto.

## Escenarios de aceptación

- **AC01:** login válido devuelve identidad y sesión; login inválido/inactivo da
  `401` genérico; no aparecen hashes ni tokens de renovación en logs.
- **AC02:** un nutriólogo crea y lista sus pacientes; campos desconocidos y un
  `nutritionistId` enviado en el payload son rechazados, no utilizados.
- **AC03:** leer, modificar, archivar o consultar historial de un paciente ajeno
  devuelve `404`, sin filtrar su existencia. Rol no permitido devuelve `403`.
- **AC04:** consulta con 70 kg y 175 cm produce IMC `22.86`; queda vinculada por
  ID, no por email ni fecha, y aparece en el historial del paciente correcto.
- **AC05:** fallo al guardar una parte de la consulta revierte todas sus escrituras.
- **AC06:** dos consultas del mismo día siguen siendo recursos independientes.
- **AC07:** talla cero/negativa, peso negativo, fechas imposibles y payloads
  incompletos son rechazados con `400`; ausencia de medición no equivale a cero.
- **AC08:** archivar al paciente conserva su historial y bloquea nuevas consultas;
  el listado normal lo excluye y un filtro explícito permite verlo a su propietario.
- **AC09:** logout/reutilización de refresh revocado no permite renovar la sesión;
  se documenta si el access token ya emitido sigue válido hasta su expiración.
- **AC10:** desde una base nueva, migraciones y seed permiten reproducir el flujo
  sin depender de Firebase, del PHP ni de datos privados.

Cada escenario se vincula a tareas y pruebas en [tasks.md](tasks.md).
