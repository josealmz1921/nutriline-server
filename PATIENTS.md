# Pacientes: API y aislamiento

Base `/api/v1`. Las seis rutas exigen `Authorization: Bearer <accessToken>` y
rol `NUTRITIONIST` activo con perfil. `ADMIN` no tiene acceso clínico: responde 403.
Sesiones y cuentas ficticias: [AUTH.md](AUTH.md). Swagger: `/api/docs` en desarrollo.

| Método | Ruta | Resultado |
| --- | --- | --- |
| POST | `/patients` | 201, paciente creado para el nutriólogo de la sesión |
| GET | `/patients` | 200, listado paginado de pacientes propios activos por defecto |
| GET | `/patients/:patientId` | 200, detalle propio, incluso archivado |
| PATCH | `/patients/:patientId` | 200, actualización parcial de paciente propio activo |
| POST | `/patients/:patientId/archive` | 200, archivo idempotente; cuerpo vacío o `{}` |
| POST | `/patients/:patientId/reactivate` | 200, reactivación idempotente con versión revisada |

IDs ajenos e inexistentes responden el mismo 404 en detalle, edición, archivo y reactivación.
Nunca se acepta propietario elegido por el cliente. La búsqueda y su total también
se filtran por propietario. Un UUID mal formado responde 400.

## Crear / editar

```json
{
  "fullName": "Paciente Ficticio",
  "birthDate": "1992-05-15",
  "email": null,
  "phone": null,
  "occupation": "Datos de demostración",
  "gender": "Mujer",
  "nationality": "MX"
}
```

- Creación requiere `fullName` (1–150 caracteres tras trim) y `birthDate`.
- Nacimiento: fecha real `YYYY-MM-DD`, desde `1000-01-01` (límite técnico MySQL)
  hasta hoy en UTC, evaluado en cada solicitud. No se fija todavía un rango
  clínico de edad ni se habilitan interpretaciones pediátricas.
- Email opcional, válido y máximo 254; se recorta y normaliza a minúsculas.
- Teléfono opcional, 1–32 caracteres; ocupación opcional, 1–150. Se recortan.
- Contactos/ocupación admiten `null` para borrarlos; cadenas vacías se rechazan.
  No se exige email ni se considera único: un paciente no es una cuenta de acceso.
- PATCH admite esos mismos campos, requiere al menos uno y conserva los omitidos.
- Género opcional: `Hombre`, `Mujer` o `null`, como en el formulario original;
  no se usa para inferir variables clínicas.
- Nacionalidad opcional: código exacto de PaisP original o `null`. Se conservan
  códigos históricos (`AN`, `UK`, `TP`, `YU`), sin conversión implícita.
- PATCH acepta además `expectedUpdatedAt`, el timestamp leído del expediente:
  si ya cambió devuelve 409 sin sobrescribir. Ese dato solo no constituye una
  actualización válida. Se conserva compatibilidad con clientes que lo omiten;
  el frontend conectado siempre lo envía. Cada edición avanza la versión.
- Campos extra (por ejemplo `id`, `nutritionistId`, `role`, `archivedAt`) dan 400.
- Fotografía, motivo de consulta y síntomas no pertenecen a este contrato:
  se rechazan, no se descartan. La evaluación completa requiere su propio contrato.

Respuesta: `id`, `fullName`, `birthDate`, `email`, `phone`, `occupation`, `gender`, `nationality`, `archivedAt`,
`createdAt`, `updatedAt`. Nacimiento sigue siendo date-only; timestamps ISO en UTC.
No incluye perfil del propietario, hashes, sesiones ni consultas anidadas.

La migración `20261113080000_patient_identity` solo añade dos columnas nullable;
no cambia filas existentes ni vuelve a ejecutar el seed.

## Listado

Ejemplo: `GET /patients?page=1&pageSize=20&search=Ficticio&archived=false`.

- `page`: entero decimal positivo, por defecto 1, máximo 1 000 000.
- `pageSize`: entero positivo, por defecto 20, máximo 100.
- `search`: texto recortado de 1–150 caracteres. Busca una subcadena literal en
  nombre, email o teléfono, con la collation case/accent-insensitive de MySQL.
  `%`, `_` y barra invertida no se interpretan como comodines del cliente.
- `archived`: exactamente `false` (predeterminado) o `true` (solo archivados).
- Parámetros desconocidos, repetidos o de tipo array dan 400.
- Orden fijo `fullName ASC, id ASC`; conteo y página leen el mismo snapshot.

```json
{
  "data": [],
  "meta": { "page": 1, "pageSize": 20, "total": 0 }
}
```

## Archivo y concurrencia

No hay DELETE. Archivo y reactivación conservan paciente e historial.
Repetirlo devuelve el mismo registro sin cambiar timestamps. El paciente archivado
se puede consultar pero no editar (409); el listado activo lo excluye.

Edición y archivo toman bloqueo de fila dentro de una transacción MySQL, filtrada
por propietario. Esto serializa escrituras concurrentes sin autorizar por un ID
global. `PatientOwnershipService` ofrece el mismo bloqueo y chequeo de archivo
para el módulo de consultas, que ya lo utiliza al crear el agregado clínico.
La prueba MySQL de la carrera archivo/consulta pasó, junto con el bloqueo de
creación posterior al archivo. Contrato: [CONSULTATIONS.md](CONSULTATIONS.md).

## Reactivación y concurrencia

`POST /patients/:patientId/reactivate` requiere un cuerpo estricto:

```json
{ "expectedUpdatedAt": "2026-11-19T13:00:00.000Z" }
```

- Usa el bloqueo de fila por paciente y propietario antes de leer o escribir.
  Solo cuenta NUTRITIONIST activa con perfil; ADMIN no hereda acceso clínico.
- Si ya está activo, devuelve la ficha actual sin escribir ni modificar timestamps,
  incluso al repetir una versión anterior. No sobrescribe ediciones posteriores.
- Si está archivado, su `updatedAt` debe coincidir con la versión revisada: 409
  si cambió. Evita que un reintento antiguo reactive después de otro archivo.
- Solo cambia `archivedAt` a null y avanza `updatedAt`. Archivo también avanza su
  versión de forma monótona, incluso al suceder dentro del mismo milisegundo.
- Conserva identidad, consultas/capturas/cálculos, menús y revisiones y citas. No
  crea consultas, recalcula resultados ni revive/cancela/reprograma citas.
  El paciente vuelve al listado activo y puede editarse o recibir nuevas capturas.
- Devuelve el mismo contrato de paciente; no acepta propietario, estado, identidad
  ni otros campos elegidos por cliente. Versión ausente o inválida: 400.
- Sin nueva migración. El frontend exige confirmación y, ante respuesta incierta,
  permite lectura del estado o repetir explícitamente el mismo ID/versión; no hay
  reintentos de escritura automáticos.

Verificación de reactivación: build/lint, 163 unitarias, 34 HTTP e2e y 70 pruebas
MySQL aisladas correctas. Incluye aislamiento de propietarios, ADMIN/perfil ausente,
versiones inválidas, reactivación concurrente/idempotente, archivo posterior sin ABA,
edición y nueva consulta después de reactivar y preservación exacta de evaluación,
menú con revisión y cita cancelada. Datos sintéticos solo en `nutriline_test`;
sin migraciones nuevas ni cambios en credenciales/base de desarrollo.

## Pruebas

`npm test` cubre validación; `npm run test:e2e` prueba guards, DTOs y OpenAPI con
servicios sustituidos. `docker compose --profile test run --build --rm test`
ejecuta HTTP, auth y Prisma sobre MySQL aislado con dos propietarios ficticios,
ADMIN y un nutriólogo sin perfil. Incluye accesos cruzados, paginación, búsqueda,
validación, historial conservado y escrituras concurrentes. No usa datos del legado.

Ampliación de identidad verificada con 99 pruebas unitarias, 23 HTTP e2e y 28
de integración MySQL. Incluye persistencia/limpieza de género y nacionalidad,
avance de versión y rechazo de edición obsoleta sin sobrescrituras. Build y lint
también pasan. La comprobación HTTP local creó y editó un paciente ficticio,
verificó el 409 y archivó únicamente ese registro al terminar, sin crear consultas.
