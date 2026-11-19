# Agenda y citas persistentes

Solo datos ficticios. Citas, consultas clínicas, R24 y menús son registros
independientes. Marcar asistencia/inasistencia no crea una consulta, mediciones,
menú ni evaluación. No hay notificaciones, recordatorios, pagos ni temporizador
de consulta. Fotografía fuera de alcance por decisión del usuario.

## API autenticada

Solo NUTRITIONIST activo con perfil. ADMIN no hereda acceso. Propietario obtenido
de sesión, nunca del body. Recursos ajenos responden 404; respuestas no-store.
Aplica el límite absoluto de sesión de 24 horas y no se reintentan escrituras
automáticamente.

- `GET /api/v1/appointments?from=...&to=...&page=1&pageSize=100`: citas que
  intersectan `[from,to)`, orden startsAt/ID ascendente. From/to son instantes ISO
  completos con precisión de minuto; rango mayor que cero y máximo 63 días.
  PageSize 1–100 (defecto 20). Respuesta `{data,meta:{page,pageSize,total}}`.
- Filtros opcionales `status` y `search` (hasta 150 caracteres). Búsqueda literal
  por motivo/nombre actual del paciente, o UUID completo del paciente. Nunca
  condicionan las comprobaciones de conflicto al escribir.
- `POST /api/v1/appointments`: crea cita programada, versión 1. Body estricto:
  `{patientId,patientUpdatedAt,startsAt,localStartsAt,timeZone,durationMinutes,
  reason,notes,clientRequestId}`.
- `GET /api/v1/appointments/:appointmentId`: detalle propio.
- `PATCH /api/v1/appointments/:appointmentId`: reprograma/edita motivo y notas.
  Body igual al horario de creación, pero sustituye patientId/patientUpdatedAt
  por `expectedVersion`. No cambia paciente ni estado confirmado.
- `POST /api/v1/appointments/:appointmentId/status`: HTTP 200. Body estricto
  `{status,expectedVersion,clientRequestId}`.

Detalle: id, patientId, startsAt, endsAt, timeZone, localStartsAt, reason, notes,
status, version, createdAt, updatedAt y patient `{fullName,archivedAt}`. El nombre
y archivo reflejan la ficha actual; el registro privado de cada operación
conserva también su respuesta original. No se exponen propietario interno,
hashes ni referencias de guardado.

## Horarios y estados

- Fecha/hora futuras al crear o reprogramar. Duración entera 5–480 minutos;
  termina el mismo día en la zona IANA declarada. Motivo requerido (hasta 500),
  notas opcionales como cadena vacía (hasta 2000).
- Se conservan instante UTC, minuto local y zona de captura. El servidor verifica
  su correspondencia y rechaza minutos inexistentes/incoherentes y ambas
  ocurrencias de una hora repetida DST; no elige una silenciosamente.
- La interfaz captura/muestra en la zona del navegador y la declara explícitamente;
  el detalle muestra además el horario/zona originales. React Big Calendar usa
  esa misma zona del navegador. No se supone que sea la zona fija del consultorio.
- Programada/confirmada bloquean horario. Intervalos semiabiertos: una cita puede
  comenzar exactamente cuando termina otra. Cancelada/asistió/no asistió no bloquean.
- Programada → confirmada solo antes de iniciar. Programada/confirmada →
  asistió/no asistió solo a partir del inicio (reloj del servidor).
- Programada/confirmada → cancelada por acción explícita. Los tres estados
  terminales cierran edición/transiciones. No hay cambios automáticos por tiempo.
- Paciente archivado: lectura y cancelación de una cita activa, pero no creación,
  confirmación, reprogramación ni asistencia nueva. El reintento idéntico de una
  operación ya guardada funciona incluso después del archivo o cierre.

## Seguridad de escrituras

Cada transacción bloquea primero la fila del profesional: serializa todos sus
horarios, incluso pacientes distintos, procesos distintos o citas invisibles en
el filtro. Luego bloquea al paciente con el mecanismo compartido con su edición
y archivo. Comprueba cruces en DB contra todas las citas programadas/confirmadas.
No depende de una caché local, mutex de proceso ni selección previa del cliente.

`patientUpdatedAt` detecta ficha obsoleta al crear; `expectedVersion` detecta
reprogramaciones/transiciones simultáneas. Conflictos responden 409 sin sobrescribir.
`clientRequestId` UUID es único por profesional. Hash SHA-256 canónico incluye
operación, destino y body. Reintentos idénticos devuelven la respuesta original
de esa operación, no necesariamente el estado vigente; misma referencia con
otros datos/destino devuelve 409. El calendario se invalida y relee tras éxito.
Mutaciones y cita se guardan atómicamente; registro privado de operaciones
inmutable por versión, sin borrado ni endpoint de eliminación.

## Cliente y límites

TanStack Query para lecturas/escrituras, claves por cuenta, cancelación de
lecturas y cero reintentos automáticos de escritura. Informed para captura;
estado de diálogo/revisión local. API por defecto, demo solo explícita e independiente.

Mes/semana/día/listado, navegación, búsqueda, filtros y selección de espacio o
evento. Nueva cita selecciona paciente activo mediante búsqueda/paginación real,
sin cargar un directorio truncado ni usar fixtures de respaldo. Reprogramar
mantiene el paciente. Revisar no envía; solo confirmar guarda. Volver a editar
revoca la revisión y conserva campos en el mismo diálogo. Cerrar pide confirmar
descarte; salir/recargar no recupera el borrador en memoria.

Respuesta perdida/5xx/éxito no verificable bloquea edición y cierre del diálogo;
solo permite la misma operación/payload/referencia. Conflicto conserva la captura
y bloquea sobrescritura. Restauración incierta o sesión vencida sigue redirigiendo
al login. No se persisten tokens ni borradores en almacenamiento del navegador.

El calendario carga todas las páginas antes de mostrar citas. Detecta cambios
de total/IDs duplicados y respuestas incompletas; no presenta un calendario
parcial como completo. Hasta 100 páginas de 100 filas por periodo; si se supera,
falla de forma explícita y pide acotar el intervalo. Máximo de API: 63 días;
vista mensual incluye también los días de semanas adyacentes.

## Migración y verificación

Migración aditiva `20261119100000_appointments`: appointments y
appointment_mutations, FK de propietario compuestas e índices para intervalos.
No reescribe pacientes, menús, consultas ni sesiones. Primero se verificó en
`nutriline_test` con `docker compose --profile test run --build --rm test`:
**48 pruebas MySQL**, seis de agenda (concurrencia/cruces, contiguas, reintentos,
versiones, estados/asistencia, archivo y propietarios). Después se aplicó la
migración pendiente en desarrollo con `npm run db:migrate:deploy`, usando su
configuración local existente. Sin seed de desarrollo, reset ni borrado de volúmenes.

Build/lint de ambos proyectos; **297 pruebas frontend, 142 unitarias backend y
29 HTTP e2e**. Generación Prisma comprobada. Logs en `/tmp/opencode/appointments-*`.
En navegador contra API/MySQL reales: login existente, paciente ficticio previo,
crear/revisar sin escritura, guardar, confirmar, reprogramar, recargar/releer,
rechazar cruce 409 y cancelar. Cero consultas creadas. Cita ficticia conservada:
`ba65d57b-aef7-40f4-902b-efa43bb6ecb6`, cancelada versión 4. Asistencia se probó
en MySQL aislado adelantando el inicio solo en esa base de prueba, no alterando
el reloj ni datos del desarrollo. Diálogo a 500/768/1440 px y las cuatro vistas
a 500 px sin desbordamiento horizontal de página. No acredita validación clínica.
