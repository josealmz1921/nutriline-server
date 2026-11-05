# Pacientes: API y aislamiento

Base `/api/v1`. Las cinco rutas exigen `Authorization: Bearer <accessToken>` y
rol `NUTRITIONIST` activo con perfil. `ADMIN` no tiene acceso clínico: responde 403.
Sesiones y cuentas ficticias: [AUTH.md](AUTH.md). Swagger: `/api/docs` en desarrollo.

| Método | Ruta | Resultado |
| --- | --- | --- |
| POST | `/patients` | 201, paciente creado para el nutriólogo de la sesión |
| GET | `/patients` | 200, listado paginado de pacientes propios activos por defecto |
| GET | `/patients/:patientId` | 200, detalle propio, incluso archivado |
| PATCH | `/patients/:patientId` | 200, actualización parcial de paciente propio activo |
| POST | `/patients/:patientId/archive` | 200, archivo idempotente; cuerpo vacío o `{}` |

IDs ajenos e inexistentes responden el mismo 404 en detalle, edición y archivo.
Nunca se acepta propietario elegido por el cliente. La búsqueda y su total también
se filtran por propietario. Un UUID mal formado responde 400.

## Crear / editar

```json
{
  "fullName": "Paciente Ficticio",
  "birthDate": "1992-05-15",
  "email": null,
  "phone": null,
  "occupation": "Datos de demostración"
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
- Campos extra (por ejemplo `id`, `nutritionistId`, `role`, `archivedAt`) dan 400.

Respuesta: `id`, `fullName`, `birthDate`, `email`, `phone`, `occupation`, `archivedAt`,
`createdAt`, `updatedAt`. Nacimiento sigue siendo date-only; timestamps ISO en UTC.
No incluye perfil del propietario, hashes, sesiones ni consultas anidadas.

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

No hay DELETE ni restauración en esta entrega. Archivo conserva paciente e historial.
Repetirlo devuelve el mismo registro sin cambiar timestamps. El paciente archivado
se puede consultar pero no editar (409); el listado activo lo excluye.

Edición y archivo toman bloqueo de fila dentro de una transacción MySQL, filtrada
por propietario. Esto serializa escrituras concurrentes sin autorizar por un ID
global. `PatientOwnershipService` ofrece el mismo bloqueo y chequeo de archivo
para el módulo de consultas, que ya lo utiliza al crear el agregado clínico.
La prueba MySQL de la carrera archivo/consulta pasó, junto con el bloqueo de
creación posterior al archivo. Contrato: [CONSULTATIONS.md](CONSULTATIONS.md).

## Pruebas

`npm test` cubre validación; `npm run test:e2e` prueba guards, DTOs y OpenAPI con
servicios sustituidos. `docker compose --profile test run --build --rm test`
ejecuta HTTP, auth y Prisma sobre MySQL aislado con dos propietarios ficticios,
ADMIN y un nutriólogo sin perfil. Incluye accesos cruzados, paginación, búsqueda,
validación, historial conservado y escrituras concurrentes. No usa datos del legado.
