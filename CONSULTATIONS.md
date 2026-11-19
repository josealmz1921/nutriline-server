# Consultas clínicas — demo

Base `/api/v1`. Requieren Bearer y rol `NUTRITIONIST` activo con perfil.
ADMIN no tiene acceso clínico. Sesiones: [AUTH.md](AUTH.md).

| Método | Ruta | Resultado |
| --- | --- | --- |
| POST | `/patients/:patientId/consultations` | 201, consulta + mediciones + BMI v1 |
| GET | `/patients/:patientId/consultations` | 200, historial paginado propio |
| GET | `/consultations/:consultationId` | 200, agregado propio por UUID |
| GET | `/consultations` | 200, directorio global paginado propio, con paciente actual |

IDs ajenos e inexistentes responden 404. No hay edición ni borrado de consultas.
El archivo del paciente conserva la lectura del historial y bloquea creación con
409. Creación y archivo comparten bloqueo de fila por paciente/propietario.

## Directorio general

`GET /consultations?page=1&pageSize=5&status=all&order=recent`.
Requiere el mismo Bearer, cuenta activa y perfil NUTRITIONIST; ADMIN no accede.

- `page`: 1–1 000 000; `pageSize`: 1–100 (predeterminado 20).
- `search`: texto literal recortado 1–150, en nombre actual del paciente, motivo,
  ID del paciente o ID de consulta. Usa collation MySQL sin distinguir acentos ni
  mayúsculas; `%`, `_` y barra invertida no habilitan comodines.
- `status`: `all` (predeterminado), `active` o `archived`, estado **del paciente**.
- `order`: `recent` (predeterminado), `oldest` o `patient`. Fecha descendente o
  ascendente; paciente usa nombre ascendente y fecha descendente. ID ascendente
  desempata siempre, incluidas consultas del mismo instante.
- `fromDate`/`toDate`: fechas calendario válidas `YYYY-MM-DD`, desde año 1000.
  Ambos extremos incluyen días completos en `America/Mexico_City`, con reglas
  históricas de zona/DST, sin fijar UTC-6 ni depender de la zona del proceso.
  Intervalo invertido, parámetros extra, repetidos o arrays responden 400.
- Devuelve `data: [{id, patientId, occurredAt, reason, patient: {fullName, archivedAt}}]`,
  `meta: {page, pageSize, total}` y `summary: {patients, archivedConsultations}`.
  Conteos sobre todo el conjunto filtrado, no sobre la página; pacientes distintos.
  Página fuera del conjunto devuelve `data: []` con el total verdadero.
- Lista y conteos leen el mismo snapshot RepeatableRead, siempre filtrado por
  propietario. No devuelve notas, contactos, evaluaciones JSON, medidas ni cálculos.
  Nombre/archivo son actuales, no sustituyen la instantánea histórica del detalle.
  No calcula, escribe ni crea consultas, menús o citas. Sin migración nueva.

Verificación del directorio: build/lint, 154 unitarias, 33 HTTP e2e y las 67
integraciones MySQL aisladas satisfactorias. Ocho nuevas integraciones cubren
aislamiento, guards, búsqueda literal/sin acentos, activos/archivados, días completos
de México, extremos técnicos de fechas, paginación/desempates y nombre actual sin
reescribir consultas. Solo se utilizaron registros sintéticos en `nutriline_test`.

## Crear: contrato mínimo compatible

```json
{
  "occurredAt": "2026-01-01T12:00:00Z",
  "reason": "Evaluación ficticia",
  "notes": null,
  "anthropometry": {
    "measuredAt": "2026-01-01T11:00:00Z",
    "weightKg": "70.000",
    "heightCm": "175.000",
    "waistCm": "80.000",
    "hipCm": "95.000"
  }
}
```

- Requeridos: atención, motivo, medición, peso y talla. Motivo: 1–500 caracteres;
  notas opcionales/anulables: 1–10 000. Textos recortados; vacíos rechazados.
- Medidas como **strings**, positivas, máximo `99999.999`, hasta tres decimales;
  sin exponentes, comas, espacios ni coerción de números. Cintura/cadera pueden
  omitirse o ser null; ausencia nunca significa cero.
- Son límites técnicos de DECIMAL(8,3), **no rangos clínicos plausibles**.
- Instantes ISO con `Z` u offset, segundos enteros o exactamente tres decimales;
  se responden en UTC. Desde el nacimiento (00:00 UTC), no futuros; la medición
  no puede ser posterior a la atención. Regla conservadora de demo, no una
  política clínica validada; revisar antes de uso real.
- No se impone rango de edad ni se devuelve clasificación clínica/pediátrica.
- Campos desconocidos, propietario, IDs o `bmi` enviados por el cliente dan 400.

El servidor calcula `pesoKg / (tallaCm / 100)^2` con aritmética decimal. Guarda
BMI versión 1, entradas normalizadas y resultado con seis decimales; presenta
dos decimales (half-up). `70/175` produce `22.86`. Resultados que redondean a cero
o exceden DECIMAL(12,6) se rechazan con 400, sin truncamiento SQL.

Respuesta: `id`, `patientId`, `occurredAt`, `reason`, `notes`, `createdAt`,
`anthropometry` y `calculations`. Medidas con tres decimales; cálculo incluye
`methodCode`, `methodVersion`, `value`, `unit`, `calculatedAt`. No devuelve perfil
del propietario, notas de otras consultas, hashes ni inputs internos del cálculo.
La antropometría puede ser null en registros incompletos creados directamente
en DB o en la evaluación ampliada, que conserva las medidas dentro de su captura JSON.

## Evaluación completa v1

El mismo POST admite alternativamente `occurredAt`, `reason`, `notes`,
`clientRequestId` (UUID), `patientUpdatedAt` (versión leída del paciente) y
`assessment`. No mezclar este contrato con `anthropometry` del contrato mínimo.
Swagger describe todos los campos; `test/assessment-fixture.ts` contiene un
ejemplo ficticio válido con exclusiones explícitas.

- Migración aditiva `20261113090000_complete_assessment`: JSON nullable y versión,
  referencia única por propietario y hash interno. No reescribe datos ni ejecuta seed.
- `assessment`: `schemaVersion: 1`, motor `nutriline-client-assessment-1`,
  `resultsOrigin: client-snapshot`, `clinicalApproval: false`, zona IANA,
  instante de medición, horarios locales, síntomas, `captures` y `results`.
- Capturas estrictas: 38 medidas originales + supraespinal, disponibilidad/estado,
  diez determinaciones con valor/unidad/referencia/interpretación, cinco periodos
  de R24 con preparaciones/alimentos y exclusiones, hábitos/actividades con MET y
  fuente, selección de autores y textos de interpretación. No incluye menú ni cita.
- `notPerformed` y `unavailable` conservan borradores textuales incluso inválidos,
  sin convertirlos en hallazgos ni alimentar resultados. No se rellenan ausencias
  con cero. Cada periodo R24 debe declarar consumo/ausencia/disponibilidad.
- Peso, talla y fecha de medición se exigen solo si las medidas están capturadas.
  Sin mediciones, `measuredAt` y su horario local pueden ser null. Instantes y
  zona/horarios locales deben coincidir; cronología se comprueba contra nacimiento,
  atención y ahora. Los límites son técnicos, no rangos clínicos.
- Se conserva precisión decimal original en JSON; no se redondean medidas a
  DECIMAL(8,3). El IMC numérico también se guarda en `CalculationResult`, con
  entradas decimales completas y salida de seis decimales.
- Las nuevas consultas añaden `serverCalculations`, calculado solo por servidor
  al crear y guardado en el mismo JSON/transacción. La instantánea del cliente
  permanece en `results`, separada; sus valores/etiquetas no alimentan el motor.
  Calcular no equivale a validar aplicabilidad clínica ni aprobar la evaluación.
- La creación añade un `patientSnapshot` asignado por servidor para conservar
  nombre y nacimiento de referencia. El detalle incluye toda la captura; el
  listado solo añade `assessmentVersion`/`clientRequestId`, sin JSON pesado.
- Bajo bloqueo por paciente, se comprueba propietario, archivo y versión. Una
  ficha modificada da 409. Captura, referencia y cálculo se guardan atómicamente.
- Repetir referencia y contenido devuelve la misma consulta (201), incluso si
  después se archivó el paciente; cambiar contenido/paciente con esa referencia
  devuelve 409. La repetición no crea ni modifica registros. No hay reintentos
  automáticos: el frontend pide confirmar explícitamente el mismo envío.
- Máximo 80 KB de evaluación y 95 KB del cuerpo completo; rechazo sin truncar.
  Sin edición de consultas, almacenamiento de PDF/foto, menús ni agenda.
- No existen resultados clínicamente aprobados ni recalculados al leer. Métodos
  pendientes y catálogo completo siguen sin validar para uso clínico real.
  El entorno continúa siendo para datos ficticios.

### Motor de servidor v1

`src/modules/calculations/assessment-engine.v1.ts` calcula 47 estados: ocho de
antropometría (incluidas coordenadas), trece de fórmulas, 24 nutrientes y dos de
actividad. Conserva exclusiones, dependencias y límites de los métodos del cliente:
Heath–Carter, Mifflin simplificada, Harris original, Schofield/FAO, Deurenberg,
Lean, Durnin-Womersley/Siri/Brozek, Rocha, Wurch y diferencia de masas.
Valencia, IOM como TMB, Garrow, Faulkner, Yuhasz y factores históricos de estrés
permanecen sin resultados automáticos. Sexo de ecuación no se infiere del género.

R24 utiliza exclusivamente `assessment-catalog.v1.ts`: seis referencias históricas
exactas del catálogo antiguo, con nombre/unidad/cantidad de referencia y columnas
conocidas. No acepta nutrientes suministrados por el cliente ni inventa
equivalencias. Nombre/unidad/id incoherentes o alimentos libres dejan contribuciones
desconocidas; subtotal conocido y total diario completo permanecen separados.
Columnas con unidad/método pendientes no se suman. MET y fuente son declarados por
el profesional, no verificados clínicamente; actividad bruta no se suma a TMB.

Metadatos persistidos: `engineVersion: nutriline-server-assessment-1`,
`catalogVersion: legacy-six-foods-1`, `resultsOrigin: server`, fecha UTC,
`clinicalApproval: false`, SHA-256 de JSON `{birthDate,captures}` y aritmética.
Cada resultado tiene `methodCode`, `methodVersion: 1`, estado
`calculated`/`excluded`/`unavailable`, unidad, valor nullable, detalle y subtotal
cuando corresponde. Entradas originales y nacimiento de referencia quedan en
la captura/snapshot del paciente. No se usan valores, unidades ni textos de
resultados enviados por el cliente para construir estos resultados.

El motor usa IEEE-754 binary64, sin redondeo intermedio. Resultados no finitos
quedan en null. `CalculationResult` de IMC conserva su cálculo decimal separado.
No hay reinterpretación de consultas antiguas: sin `serverCalculations` siguen
siendo instantáneas históricas del cliente. Reintentos devuelven el resultado
persistido, incluida su fecha, antes de ejecutar el motor nuevamente. No requiere
nuevas columnas/migración; no se editaron consultas ni credenciales existentes.

Comprobación de este motor: build/lint, 127 unitarias y 23 HTTP e2e correctas;
paridad numérica de 1,680 escenarios contra el cliente (47 estados por escenario).
La prueba de orquestación real cubre persistencia, relectura e idempotencia con DB
sustituida. Se añadió también una prueba MySQL de manipulación de snapshots y
cambio posterior de nacimiento. El primer intento quedó bloqueado por Docker
Desktop; el reintento con Docker disponible pasó las **37 pruebas de integración**
en `nutriline_test`, incluidas persistencia real del motor, relectura e idempotencia
sin recálculo. Se aplicaron las tres migraciones solo a la base temporal de pruebas;
no se modificó la base de desarrollo ni sus credenciales.

Verificado además por HTTP local: alta de paciente ficticio, evaluación 201,
reintento con mismo ID, detalle idéntico, historial con una consulta e IMC separado.
Al terminar se archivó solo ese paciente sintético y se cerró su sesión de prueba.

Verificación de esta ampliación: build/lint, 108 unitarias, 23 HTTP e2e y 34
integraciones MySQL aisladas correctas. Incluye aislamiento, guardado sin
mediciones/fecha, concurrencia idempotente, conflicto de identidad, precisión,
cronología/zona y rollback conjunto. El contrato real del cliente también se
cotejó con las cinco secciones totalmente capturadas y 47 estados de resultados.

## Historial y verificación

`?page=1&pageSize=20`: máximo 1 000 000 páginas y 100 elementos por página.
Solo admite esos parámetros, sin repetidos/arrays; orden `occurredAt DESC, id DESC`.
Datos y total comparten snapshot. Dos consultas del mismo día mantienen IDs distintos.

Build, lint, tipos, unitarias y e2e HTTP con servicios sustituidos se verifican
localmente. Las nuevas pruebas MySQL están en `test/patients.integration-spec.ts`:
aislamiento, precisión, historial, archivo/creación concurrentes y rollback ante
fallo inyectado después de las escrituras reales y antes del commit. No requiere
triggers ni permisos elevados. Verificación 2026-11-05: 97 unitarias, 23 e2e HTTP
y 26 integraciones MySQL correctas; migración aplicada sobre DB de pruebas vacía.
Build, lint y tipos también correctos. La base temporal se detuvo al finalizar.

```sh
docker compose --profile test run --build --rm test
docker compose --profile test stop db-test
```

No utiliza el dump ni la base del PHP. No desplegar para uso clínico real.
