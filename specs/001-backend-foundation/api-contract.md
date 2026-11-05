# Contrato preliminar de API

**Estado:** health, autenticación, pacientes y consultas implementados y verificados
con MySQL aislado. Base `/api/v1`. OpenAPI de rutas existentes en
`/api/docs` (solo desarrollo); guía operativa en `../../AUTH.md`.

## Convenciones

- JSON, campos en inglés/camelCase, UUIDs opacos.
- `201` al crear, `200` al consultar/actualizar, `204` al cerrar sesión.
- `400` validación, `401` sesión ausente/inválida, `403` rol no permitido,
  `404` recurso inexistente o ajeno, `409` conflicto de estado/identidad,
  `429` límite de peticiones. Errores de DB no se exponen.
- DTOs rechazan campos desconocidos; límites de tamaños y longitudes explícitos.
- Listados: `page` desde 1, `pageSize` por defecto 20 y máximo 100;
  `page` máximo 1 000 000, orden determinista. Respuesta `{ data, meta: { page, pageSize, total } }`.
- Decimales como strings con punto; fechas/instantes según `data-model.md`.
- Error implementado: `{ error: { code: 'HTTP_<status>', message, details?, requestId } }`.
  `details` solo con errores de campos sanitizados, sin SQL, tokens ni valores sensibles.

## Rutas de la primera entrega

| Método y ruta | Autorización | Entrada / salida |
| --- | --- | --- |
| `GET /health` | Pública, mínima | Estado del proceso sin secretos ni versiones internas; liveness no implica DB saludable |
| `POST /auth/login` | Origin permitido, rate limited | 200; email/password → usuario + access token; refresh en cookie HttpOnly |
| `POST /auth/refresh` | Cookie válida + Origin permitido, rate limited | 200; rota refresh/access; cuerpo vacío o `{}` |
| `POST /auth/logout` | Origin permitido | 204; revoca familia si hay cookie válida, limpia cookie; idempotente |
| `GET /auth/me` | Usuario activo | Identidad, rol y perfil permitido; sin hash/tokens |
| `POST /patients` | NUTRITIONIST | Datos de paciente → paciente propio creado |
| `GET /patients` | NUTRITIONIST | `page`, `pageSize`, `search?`, `archived=false` → propios; `archived=true` lista archivados |
| `GET /patients/:patientId` | NUTRITIONIST propietario | Detalle de paciente propio, incluso archivado |
| `PATCH /patients/:patientId` | NUTRITIONIST propietario | Campos permitidos; archivado bloquea edición clínica con `409` |
| `POST /patients/:patientId/archive` | NUTRITIONIST propietario | Archivado idempotente → paciente; no elimina historial |
| `POST /patients/:patientId/consultations` | NUTRITIONIST propietario | Consulta + medidas → agregado y cálculo generados en transacción |
| `GET /patients/:patientId/consultations` | NUTRITIONIST propietario | Historial paginado, `occurredAt DESC, id DESC` |
| `GET /consultations/:consultationId` | NUTRITIONIST propietario | Consulta, antropometría y cálculo; `404` si es ajena |

Sin alta pública, portal paciente ni endpoints administrativos de cuentas en esta
entrega: usuarios creados por seed restringido. ADMIN puede consultar su identidad,
pero no accede automáticamente a rutas clínicas. No hay edición/borrado de consultas.

## Ejemplo sintético: crear paciente

```json
{
  "fullName": "Paciente Demo Uno",
  "birthDate": "1992-05-15",
  "email": "paciente.uno@example.invalid",
  "phone": null,
  "occupation": "Ejemplo de demostración"
}
```

`fullName` y `birthDate` requeridos; email/contacto opcionales. No aceptar
`nutritionistId`, hashes, rol, campos de suscripción ni IDs elegidos por el cliente.
Rechazar fechas de nacimiento futuras/imposibles; alcance por edad sujeto a D04.

Pacientes implementados: fecha de nacimiento desde `1000-01-01` hasta hoy UTC,
sin imponer aún rango clínico de edad. Nombre/ocupación máximo 150 caracteres,
teléfono 32 y email 254. Contactos opcionales y anulables, no cadenas vacías.
PATCH no vacío; no modifica registros archivados (409). Respuesta explícita con
campos del paciente y timestamps, sin propietario ni consultas anidadas.

Listado con `fullName ASC, id ASC`; búsqueda literal en nombre/email/teléfono
(1–150 caracteres), misma restricción de propietario en datos y conteo. `archived`
admite solo `true`/`false`. Queries desconocidas/repetidas se rechazan. Archivo
idempotente con bloqueo de fila, sin eliminar historial. Detalle/edición/archivo
ajenos responden 404. Guía completa: [PATIENTS.md](../../PATIENTS.md).

## Ejemplo sintético: crear consulta

```json
{
  "occurredAt": "2026-11-04T17:00:00Z",
  "reason": "Evaluación inicial de demostración",
  "notes": "Datos totalmente ficticios",
  "anthropometry": {
    "measuredAt": "2026-11-04T17:00:00Z",
    "weightKg": "70.000",
    "heightCm": "175.000",
    "waistCm": "80.000",
    "hipCm": "95.000"
  }
}
```

`occurredAt`, `reason`, `anthropometry.measuredAt`, peso y talla requeridos;
notas/cintura/cadera opcionales. El servidor valida coherencia temporal con
nacimiento y reloj actual; consultas futuras se rechazan (son agenda, no atención).
Para la demo: nacimiento <= medición <= atención <= reloj actual. Se admiten
segundos enteros o tres decimales, siempre con zona. Medidas positivas como strings
de hasta tres decimales, máximo técnico 99999.999; no son rangos clínicos validados.
Motivo 1–500 y notas opcionales/anulables 1–10 000 caracteres, tras trim.
No aceptar `bmi`, clasificación o propietario calculados/enviados por el navegador.

Respuesta de creación: `id`, `patientId`, `occurredAt`, `reason`, `notes`,
`anthropometry`, `calculations` y timestamps; sin perfil completo del paciente.
Ejemplo del elemento calculado para esos valores:

```json
{
  "methodCode": "BMI",
  "methodVersion": "1",
  "value": "22.86",
  "unit": "kg/m2"
}
```

La precisión interna es mayor que la presentación. No devolver interpretación
clínica hasta validar su regla. Los ejemplos no son fixtures del respaldo antiguo.
Contrato y limitaciones actuales: [CONSULTATIONS.md](../../CONSULTATIONS.md).

## Sesiones implementadas

JWT HS256, issuer `nutriline-api`, audience `nutriline-web`, claims `sub`/`sid`,
`iat`/`exp`; sin rol ni datos clínicos en el token. Vigencia por defecto 300 segundos.
`user` incluye id, email, role, status y nutritionistProfile (id/displayName/timezone
o null), nunca passwordHash. Respuesta de login/refresh:
`{ accessToken, tokenType: 'Bearer', expiresIn, user }`.

Refresh opaco de 256 bits en cookie `nutriline_refresh`: HttpOnly, SameSite=Lax,
path `/api/v1/auth`, Secure en producción y sin Domain. Solo hash SHA-256 en DB.
POST login/refresh/logout exigen Origin exacto autorizado, incluso fuera del navegador.
Diseño same-site; cross-site exige nueva revisión de cookies/CSRF.

Rotación con bloqueo de fila y transacción: revoca el token anterior, crea otro de
la misma familia sin extender su vencimiento absoluto (7 días por defecto).
Reutilizar un token revocado invalida la familia. El frontend debe serializar refresh.
Logout revoca la familia correspondiente; no afecta otras sesiones independientes.
Cada acceso verifica en DB usuario activo, rol y sesión: revocación inmediata del
access, también después de refresh. Sin cookie, logout es 204 sin identificar familia.

Rate limits por IP/ruta: login 5/min, refresh y logout 20/min; base 120/min en memoria.
Consultar [AUTH.md](../../AUTH.md) para seed, frontend, permisos y limitaciones.

## Integraciones posteriores

Cloudinary tendrá firma de subida autenticada y validación de propiedad, propósito,
tipo, tamaño y respuesta del proveedor antes de asociar un asset. No habrá un
endpoint de firma genérico que acepte parámetros arbitrarios. No publicar material
clínico real ni mezclar assets públicos de platillos con documentos privados.
El contrato concreto se definirá en una spec posterior, igual que dietas/PDF.
