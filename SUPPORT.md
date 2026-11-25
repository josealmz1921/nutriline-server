# Soporte y control administrativo

Aplicar la migración `20261125090000_support_and_billing` con el procedimiento
habitual de despliegue (`npm run db:generate` y `npm run db:migrate:deploy`).
La gestión de bloqueo y bitácora requiere además
`20261125100000_admin_account_events`. No aplicar migraciones automáticamente
desde el cliente ni apuntar tests a bases con datos reales.

## Tickets

- Sesión `NUTRITIONIST`: solo sus propios tickets, mensajes y eventos. Acceso a
  un ID ajeno devuelve 404, incluso para responder o cerrar.
- Máximo **3 activos**: OPEN, IN_PROGRESS, WAITING_REPLY. RESOLVED y CLOSED no
  cuentan. El filtro de lista no cambia el contador activo.
- Todos los creates y cambios de estado bloquean la fila del perfil con
  `SELECT … FOR UPDATE` dentro de una transacción ReadCommitted. Así se
  serializan las comprobaciones del límite, incluso con varios procesos.
- ADMIN puede crear tickets adicionales y reabrirlos sin límite; cada creación
  administrativa se marca como excepción en la bitácora. Un nutriólogo solo
  puede cerrar su ticket, nunca asignar, cambiar prioridad ni reabrir.
- Los tickets finalizados no admiten respuestas; los activos sí, incluso si
  la cuenta alcanzó o superó el límite por una excepción administrativa.
- Creación y respuesta exigen clientRequestId UUID. Reintentar el mismo envío
  es idempotente; reutilizar la referencia con otro contenido devuelve 409.
- Cambios de gestión requieren expectedVersion para rechazar ediciones
  obsoletas. Mensaje, versión y evento se guardan en una sola transacción.
- No hay borrado, adjuntos ni notas internas en esta versión. No incluir
  información clínica, contraseñas ni datos de tarjeta en los mensajes.

### API

- `GET/POST /api/v1/support/tickets`
- `GET /api/v1/support/tickets/:ticketId`
- `GET/POST /api/v1/support/tickets/:ticketId/messages`
- `GET /api/v1/support/tickets/:ticketId/events`
- `POST /api/v1/support/tickets/:ticketId/close` (nutriólogo)
- `PATCH /api/v1/support/tickets/:ticketId` (admin: estado, prioridad, responsable)
- `POST /api/v1/admin/support/tickets` (admin, nutritionistId obligatorio)

Listas y conversaciones paginadas: page desde 1, pageSize 1–50 (por defecto
10). Tickets admiten status y, para admin, nutritionistId. La asignación solo
acepta un usuario ADMIN activo. El panel ofrece «Asignarme» y quitar responsable.
Un ticket puede vincularse a paymentId; se verifica que pertenezca al mismo
nutriólogo. Todas las respuestas se entregan como texto, no HTML.

## Administración y pagos

Frontend: `/admin` exclusivo de ADMIN; `/dashboard/soporte` para nutriólogos.
El admin no hereda acceso clínico. El inicio de sesión ADMIN dirige a `/admin`.

- `GET /api/v1/admin/summary`: usuarios, cuentas bloqueadas, nutriólogos y
  tickets activos. No consulta pagos ni suscripciones.
- `GET /api/v1/admin/nutritionists`: búsqueda por nombre/correo, suscripción,
  estado de cuenta y contadores, sin pacientes ni credenciales.
- `GET /api/v1/admin/payments`: filtros nutritionistId, provider, status,
  from/to (días de registro UTC inclusivos). Solo lectura.

**Adyen y Mercado Pago no están conectados.** No hay checkout, cobro,
reembolso, webhook, activación de suscripción, seed de pagos ni endpoint para
marcar un pago como recibido. No se cambian permisos por estos registros.

Las tablas billing_payments y billing_subscriptions son la base de consulta
para la integración futura del propietario del proyecto. El importe se guarda
como entero en unidades mínimas de la moneda (no float); la UI muestra esa
unidad explícitamente, sin asumir que todas las monedas tienen dos decimales.
La referencia de proveedor es única por proveedor. La futura integración debe
validar firmas, moneda, importe y eventos idempotentes, conservar conciliación
y auditoría y manejar reembolsos/cambios fuera de orden antes de activar acceso.
No se almacenan tarjetas, secretos del proveedor ni payloads arbitrarios.

### Usuarios y bitácora (sin pagos en el panel)

Rutas React Router DOM: `/admin`, `/admin/usuarios`, `/admin/usuarios/:id`,
`/admin/soporte` y `/admin/bitacora`. Soporte admite `?ticketId=UUID` para abrir
el seguimiento directamente desde la bitácora. La estructura de pagos anterior
se conserva en backend para la integración futura, pero no se muestra ni se
consulta desde el panel.

- `GET /api/v1/admin/users`: usuarios ADMIN y NUTRITIONIST, búsqueda por
  nombre/correo, paginación. Solo datos de cuenta y perfil, nunca credenciales.
- `GET /api/v1/admin/users/:userId`: detalle de cuenta.
- `PATCH /api/v1/admin/users/:userId/status`: status ACTIVE/INACTIVE,
  expectedStatus y reason de 5–1000 caracteres. Solo ADMIN; se prohíbe bloquear
  administradores y la cuenta propia. La UI exige confirmación.
- Bloqueo por fila de usuario y transacción: cambio de estado, revocación de
  sesiones y enlaces de recuperación pendientes y evento de auditoría se
  guardan juntos. Conflictos de estado devuelven 409. Desbloquear no revive
  sesiones ni enlaces anteriores, requiere un nuevo login.
- `GET /api/v1/admin/audit`: solo ADMIN, paginado, filtros userId (afectado),
  action (BLOCKED/UNBLOCKED/CREATED/UPDATED/REPLIED), from/to (días UTC).
  Unifica eventos de cuenta con los eventos de soporte ya existentes sin
  duplicarlos. Devuelve actor, usuario, acción, fecha, motivo y referencia al
  ticket, sin cuerpos de mensajes ni información clínica. La vista del ticket
  mantiene el detalle previo/posterior de cada cambio de soporte.
- No hay endpoints de edición o borrado de bitácora.

## Verificación

Tests unitarios de contratos, aislamiento, límite, idempotencia y auditoría;
tests HTTP de sesión/roles y de ausencia de escritura de pagos. La prueba real
`test/support.integration-spec.ts` requiere MySQL aislado `nutriline_test` ya
migrado; comprueba 6 creaciones simultáneas, máximo 3, reintento, cierre y
excepción admin. Nunca apuntarla a datos de desarrollo/producción.
