# Tareas — 001 Base del backend

`[x]` hecho y comprobado; `[ ]` pendiente. IDs estables para commits y seguimiento.
Documentación creada no equivale a aprobación ni implementación del diseño.

## A. Descubrimiento y especificación

- [x] **T001** Revisar instrucciones y starter NestJS. Evidencia: `AGENTS.md`,
  `package.json`, `src/app.module.ts`, `src/main.ts`; hallazgos en `research.md`.
- [x] **T002** Inventariar los 17 `CREATE TABLE` sin copiar registros personales.
  Evidencia: tabla de mapeo completa en `research.md`.
- [x] **T003** Revisar flujos principales y registrar riesgos con fuentes.
  Evidencia: login, alta/seguimiento, historial, agenda, IMC, platillos y suscripción
  documentados; análisis estático inicial, no auditoría exhaustiva.
- [x] **T004** Crear spec, plan, modelo y contrato preliminares, con criterios de
  aceptación y tareas. Evidencia: archivos de esta entrega y enlaces del índice.
- [x] **T005** Adoptar la dirección D01–D05 tras «ok vamos» del usuario y actualizar
  modelo/plan. Detalles de cookies/CSRF y rangos clínicos quedan explícitamente
  pendientes en T022/T043 antes de implementar sus funcionalidades.
- [x] **T006** Registrar baseline: Node/npm, build, lint, unit y e2e del starter;
  revisar compatibilidad NestJS 12/TypeScript 6/Prisma. Cierre: comandos/resultados
  documentados y fallos preexistentes identificados, sin activar servicios de pago.
  Evidencia: baseline build/lint/1 unit/1 e2e OK; Node activo inicial 22.21.0,
  npm 10.9.4. Adoptado Node 24.22.2 instalado para satisfacer engines de herramientas
  Nest actuales; Prisma 7.10.1 estable con generación/build/types comprobados.

## B. Base técnica — depende de T005–T006

- [x] **T010** Configurar entorno validado y `.env.example` sin secretos:
  puerto API, DB, autenticación, CORS y modo demo. Cierre: configuración incompleta
  falla al arrancar con mensaje seguro; variables cubiertas por tests.
  Evidencia: 19 tests de configuración, incluyendo secreto obligatorio sin
  placeholder, TTL acotados y HTTPS en orígenes de producción. Variables de DB,
  host/puerto, CORS, demo y Observe validadas; seed valida su propia contraseña.
- [x] **T011** Crear Compose y volumen exclusivos para backend nuevo y DB de tests.
  Cierre: MySQL saludable, persistencia tras restart y ningún volumen/puerto del
  legado reutilizado; documentar ejecución Nest local vs contenedor y URL de DB.
  Evidencia: API/MySQL healthy; reinicio de DB conserva migración y tablas;
  DB test en tmpfs sin puertos publicados y detenida tras las pruebas.
- [x] **T012** Revisar Observe y definir comportamiento en dev/tests, con redacción
  o desactivación de captura sensible. Cierre: pruebas no requieren red/claves y
  login/datos clínicos no se exportan en cuerpos ni logs.
  Evidencia: SDK no importado ni inicializado; validación rechaza activarlo;
  e2e falla si se reintroduce su importación; Prisma sin logs de consultas.
  Habilitar telemetría en producción requiere una revisión posterior, no realizada.
- [x] **T013** Instalar Prisma compatible y modelar User, NutritionistProfile,
  AuthSession, Patient, Consultation, AnthropometricAssessment y CalculationResult.
  Cierre: migración inicial reproducible en DB vacía, FKs/índices/decimales comprobados.
  Evidencia: migración aplicada en desarrollo y DB test; diff contra schema sin
  diferencias. Tres pruebas MySQL reales verifican conexión, FK de propiedad,
  rollback, precisión decimal y consultas independientes el mismo día.
- [x] **T014** Configurar prefijo v1, validación estricta, errores seguros,
  paginación, CORS y OpenAPI. Cierre: DTO inválido/desconocido da `400`, sin stack
  ni datos sensibles; contrato generado coincide con la spec.
  Evidencia: prefijo, liveness, CORS, validación Zod estricta de auth/pacientes,
  errores seguros, paginación acotada y OpenAPI de rutas existentes probados.
  El contrato de consultas se incorporará al implementar ese módulo.
- [x] **T015** Crear seed ficticio e idempotente con dos propietarios y administrador.
  Cierre: sin importación SQL real, credenciales por entorno y ejecución restringida
  fuera de demo/test; fixtures permiten probar aislamiento. AC10.
  Evidencia: seed real en MySQL de tests, repetido sin duplicados ni cambios de
  hash/estado; ADMIN, dos NUTRITIONIST y dos pacientes ficticios de propietarios
  distintos. Restricciones de entorno probadas; sin importación del SQL antiguo.
- [ ] **T016** Revisar los 7 avisos del audit completo del starter (Nest CLI/Mau
  y transitivas), sin degradar Nest ni forzar cambios incompatibles. Cierre:
  actualizaciones verificadas o riesgo/mitigación documentados antes de distribuir.

## C. Identidad y sesiones — depende de base técnica

- [x] **T020** Implementar hash moderno (Argon2id), normalización de email,
  usuario activo y roles. Cierre: tests de hash/verificación, duplicados y selección
  explícita de campos; ningún SHA-1 ni hash en respuesta. FR01.
  Evidencia: Argon2id con salt independiente, verificación real, unique email
  case-insensitive en MySQL, DTO normalizado y selección pública explícita.
- [x] **T021** Implementar login y `/auth/me`, con rate limiting y errores genéricos.
  Cierre: e2e válido/inválido/inactivo y rol; sin enumeración ni datos en logs. AC01.
  Evidencia: pruebas HTTP y MySQL de ambos roles; desconocido/inactivo/contraseña
  inválida con el mismo mensaje; rate limit 5/min e IP comprobado; sin hashes en JSON.
- [x] **T022** Implementar refresh rotativo y logout según D02, protección CSRF
  correspondiente y pruebas de expiración/reutilización/revocación. AC09.
  Evidencia: Origin obligatorio, cookie HttpOnly/SameSite/Secure, expiración
  absoluta, rotación concurrente con bloqueo, replay que revoca familia y logout
  idempotente; access revocado inmediatamente mediante consulta de sesión en DB.
- [x] **T023** Implementar guards y política de rol/propiedad reutilizable.
  Cierre: denegación por defecto y ADMIN sin acceso clínico implícito. AC03.
  Evidencia: guards globales de access/rol y PatientOwnershipService con validación
  de perfil, bloqueo por propietario y rechazo de archivados. Pruebas HTTP reales
  de todas las rutas de pacientes rechazan ADMIN, perfil ausente y accesos ajenos.
  Las futuras consultas deben reutilizar la política y añadir sus pruebas AC03.

## D. Pacientes — depende de T020–T023

- [x] **T030** Implementar creación y actualización con DTOs acotados; propietario
  desde sesión. Cierre: contacto opcional, DOB válida y rechazo de owner/role en
  payload; pruebas con dos nutriólogos. AC02, AC03, AC07.
  Evidencia: HTTP/MySQL de alta y PATCH, contacto null/omitido, normalización,
  fechas imposibles/futuras, rechazo de IDs/owner/role y ausencia de escrituras inválidas.
- [x] **T031** Implementar listado paginado/búsqueda y detalle solo del propietario.
  Cierre: límites/orden/filtros probados; IDs ajenos devuelven `404`. AC02, AC03.
  Evidencia: paginación estable, total filtrado con snapshot, búsqueda literal
  por nombre/email/teléfono, filtros estrictos y acceso cruzado 404 comprobados.
- [x] **T032** Implementar archivo sin borrar historial ni permitir creación de
  consultas posteriores; controlar concurrencia con creación. Cierre: pruebas de
  archivo repetido, listado, acceso ajeno y carrera archivo/consulta. AC08.
  Avance: endpoint de archivo idempotente implementado con bloqueo por propietario;
  conserva historial, detalle y timestamps; excluido del listado activo y PATCH 409.
  Pruebas de archivos concurrentes y carrera edición/archivo OK.
  Cierre 2026-11-05: creación usa el bloqueo compartido; pruebas MySQL
  de carrera archivo/consulta y rechazo de creación posterior al archivo OK.

## E. Primer flujo clínico — depende de pacientes

- [x] **T040** Implementar BMI v1 como función de dominio con unidades explícitas.
  Cierre: 70 kg/175 cm → 22.86, valores no finitos/cero/negativos rechazados,
  precisión y redondeo probados; sin clasificación clínica no aprobada. AC04, AC07.
  Evidencia: siete pruebas de dominio verifican precisión decimal, cero/negativos,
  no finitos y overflow/underflow; HTTP documenta resultado decimal string.
- [x] **T041** Crear consulta+mediciones+cálculo en transacción y con propietario
  coherente. Cierre: rollback ante fallo, paciente archivado/ajeno bloqueado y cintura
  vs cadera guardadas correctamente con valores distintos. AC03–AC05, AC08.
  Implementado agregado anidado en transacción, validación de propietario/archivo
  y errores temporales. Pruebas MySQL de persistencia/rollback/concurrencia OK
  el 2026-11-05, con cintura/cadera distintas y entradas BMI auditables.
- [x] **T042** Implementar detalle e historial por ID, paginados y ordenados.
  Cierre: dos consultas del mismo día no se mezclan y no se filtran datos ajenos.
  AC03, AC06.
  Endpoints de detalle e historial implementados, snapshot y orden fecha/ID;
  contrato HTTP y aislamiento con DB real verificados el 2026-11-05.
- [ ] **T043** Probar coherencia temporal y campos requeridos: nacimiento,
  atención, medición y reloj controlado. Cierre: fechas inválidas/futuras rechazadas
  según regla aprobada, sin reemplazar faltantes por cero. AC07.
  Validación técnica y reloj controlado probados. Política temporal conservadora
  de demo documentada en D04; sin validar rangos clínicos ni uso pediátrico.

## F. Cierre de entrega

- [x] **T050** Ejecutar AC01–AC10 con MySQL aislado y fixtures ficticios.
  Cierre: evidencia e2e/integración y revisión negativa de autorización por cada ruta.
  Evidencia 2026-11-05: 26 integraciones MySQL sobre migración aplicada a DB vacía,
  incluidas sesiones/roles, propiedad por ruta, consultas, rollback e historial;
  97 unitarias y 23 e2e HTTP. No equivale a validación clínica de D04.
- [x] **T051** Completar README de arranque, migraciones, seed, tests, puertos y
  sesión; actualizar OpenAPI y esta documentación al contrato real.
  Guías README/DEVELOPMENT/AUTH/PATIENTS/CONSULTATIONS enlazadas y actualizadas;
  OpenAPI de las tres rutas de consultas probado.
- [ ] **T052** Ejecutar build/lint/unit/e2e; validar arranque desde DB nueva,
  persistencia y no exposición de secretos. Registrar resultados y riesgos restantes.
  Actualización 2026-11-05: build/lint/types, 97 unitarias, 23 e2e y 26
  integraciones correctas; migración desde DB test vacía y API reconstruida/healthy.
  Smoke HTTP completo y limpieza de sus datos ficticios OK. La persistencia tras
  reinicio se verificó en la base técnica (registro 2026-11-04); no se repitió
  el reinicio de la DB de desarrollo en esta verificación. Mantener abierto
  hasta la revisión final de persistencia y seguridad previa a distribuir la demo.

## Backlog — futuras specs, no iniciado

- [ ] **B001** Agenda y estados de cita, con relación opcional a consulta clínica.
- [ ] **B002** Hábitos, actividad/MET, laboratorio y antecedentes con unidades explícitas.
- [ ] **B003** Validación de fuentes, dominios y fixtures para fórmulas avanzadas.
- [ ] **B004** Catálogo nutricional con licencia revisada; recetas/ingredientes/porciones.
- [ ] **B005** Dietas versionadas y generación de PDF a partir de datos estructurados.
- [ ] **B006** Cloudinary: subida firmada, assets públicos/privados, propiedad y limpieza.
- [ ] **B007** Suscripciones y correos simulados sin cobros/envíos externos reales.
- [ ] **B008** Crear/migrar el frontend tomando como referencia las pantallas PHP,
  con Next.js previsto y consumo de la API. No existe una base nueva disponible
  ni dependencia Firebase confirmada (aclaración del usuario, 2026-11-05).
- [ ] **B009** Administración de cuentas y posible portal paciente, permisos explícitos.

## Registro de verificación

- **2026-11-04:** inspección de archivos del starter y legado, extracción de DDL
  y creación de documentos. No se instalaron dependencias ni se ejecutaron build,
  tests, migraciones o servicios nuevos. Tareas funcionales permanecen pendientes.
- **Validación documental:** comprobados los enlaces locales de 8 documentos,
  ausencia de IDs duplicados y espacios finales; 35 tareas registradas, 4 de
  descubrimiento/documentación completadas. No equivale a validación funcional.
- **Base técnica (2026-11-04):** generación/validación Prisma, build, lint,
  `tsc --noEmit --incremental false`, 14 unit tests y 2 e2e HTTP OK con Node 24.22.2.
  E2e utiliza un provider DB sustituido: todavía no prueba integración MySQL.
  Compose validado, `.env`/cliente generado ignorados y 9 documentos con enlaces
  locales válidos. Build de Docker y verificaciones con MySQL en curso.
- **Cierre de verificación técnica (2026-11-04):** Docker build/arranque OK,
  `db:migrate:deploy` aplicado y `prisma migrate diff` sin diferencias. API health
  `200 {"status":"ok"}` en 3001 y login PHP antiguo `200` en 8080.
  MySQL nuevo tiene 7 tablas de dominio + `_prisma_migrations`, sin usuarios.
  Reinicio de DB conserva las 8 tablas y la migración terminada. Tres integraciones
  MySQL pasaron; inicialmente se corrigieron permisos de temporales de Vitest
  para usuario no root y la expectativa BigInt del `SELECT 1` del adapter.
  DB test detenida al terminar. Build/lint/types, 14 unit y 2 e2e también OK.
  Esto no completa AC01–AC10: los endpoints de negocio aún no existen.
- **Dependencias:** `npm audit --omit=dev` sin vulnerabilidades reportadas;
  audit completo con 7 avisos (2 low, 3 moderate, 2 high) en herramientas del
  starter Nest CLI/Mau y transitivas. Pendiente revisión compatible; no se aplicó
  fix forzado ni se considera la imagen local apta para producción.
- **Autenticación (2026-11-04):** build/lint/types OK, 30 unit tests, 14 e2e y
  13 integraciones MySQL OK. Cubren Argon2id, configuración, guard de seed,
  contrato OpenAPI, JSON inválido/errores sanitizados, roles, Origin, cookie,
  rate limiting, sesiones inactivas/vencidas, firma/audiencia/algoritmo JWT,
  concurrencia de refresh, replay, logout e idempotencia del seed.
  `npm audit --omit=dev`: 0 avisos; los 7 avisos de herramientas siguen en T016.
  Operación/limitaciones en `AUTH.md`. No están implementados los controles
  de propiedad ni el CRUD de pacientes (no dar AC03/AC10 completos por terminados).
  API reconstruida y saludable; seed aplicado en desarrollo. Smoke HTTP real de
  login/me/logout exitoso para las tres cuentas y OpenAPI accesible. DB temporal
  de tests detenida al terminar; sin cambios al legado ni commits/push.
- **Pacientes (2026-11-04):** build/lint y `tsc --noEmit --incremental false` OK;
  62 unit tests, 19 e2e HTTP y 21 integraciones MySQL OK (102 en total).
  Añadidas ocho integraciones de pacientes: alta/edición/contacto opcional,
  ADMIN y perfil ausente denegados, aislamiento de detalle/edición/archivo,
  DTOs inválidos sin escritura, paginación/búsqueda/total propios, comodines
  literales, archivo concurrente con historial intacto y carrera edición/archivo.
  Cinco e2e adicionales validan contratos, sesión requerida y queries estrictas.
  API reconstruida/healthy; smoke con cuentas demo verifica listados propios 200,
  acceso ajeno 404, ADMIN 403 y OpenAPI actualizado. No se alteró el schema ni
  ninguna migración aplicada. DB test detenida al terminar; legado intacto.
  T032 sigue parcial hasta implementar consultas y probar archivo/consulta.
  Guía de contrato disponible en `PATIENTS.md`; sin commits ni push.
- **Consultas (2026-11-05):** creación de consulta con mediciones y BMI v1 en
  transacción, historial paginado y detalle por UUID implementados. Creación
  reutiliza bloqueo de paciente/propietario y rechazo de archivados. Sin cambios
  al schema, migraciones aplicadas, datos del legado ni dependencias.
  Node 24.22.2: `npm run build`, `npm run lint` y
  `npx tsc --noEmit --incremental false` OK; `npm test`: 97 pruebas;
  `npm run test:e2e`: 23 pruebas HTTP con servicios sustituidos; todas pasan.
  Agregadas cinco integraciones MySQL al fixture existente de pacientes:
  agregado/precisión/historial, aislamiento/roles, validación temporal,
  carrera creación/archivo y rollback con fallo inyectado después de las escrituras
  reales y antes del commit. **No ejecutadas:** `docker compose ps` no encuentra
  Docker en esta distro WSL. T032/T041/T042 y el cierre AC01–AC10 siguen abiertos.
  T043 conserva revisión de política clínica pendiente; reglas conservadoras de
  demo y límites puramente técnicos en `CONSULTATIONS.md` y D04. OpenAPI actualizado.
  Siguiente paso: habilitar integración WSL de Docker Desktop, ejecutar
  `docker compose --profile test run --build --rm test`, detener `db-test` al acabar,
  corregir cualquier fallo y entonces verificar arranque/smoke del flujo completo.
- **Cierre de integración y smoke (2026-11-05):** Docker disponible en WSL.
  `docker compose --profile test run --build --rm test` aplica la migración
  inicial sobre `nutriline_test` vacía y pasa las 26 integraciones, incluidas
  las cinco nuevas de consultas. No se necesitaron correcciones de código.
  `docker compose --profile test stop db-test` deja la DB temporal detenida.
  Repetidos con Node 24.22.2: lint, tipos y build OK; 97 unitarias y 23 e2e
  HTTP OK (146 pruebas en total). API reconstruida con
  `docker compose up -d --build --wait api` y seed ficticio idempotente ejecutado.
  Smoke HTTP sobre la API en ejecución: login/me de los tres roles demo,
  paciente nuevo, dos consultas independientes del mismo día, IMC 22.86,
  cintura/cadera separadas, detalle/historial paginado, acceso ajeno 404,
  ADMIN 403, archivo con historial intacto y bloqueo 409 de consulta posterior.
  OpenAPI contiene las tres rutas; logout revoca inmediatamente cada sesión.
  El smoke elimina únicamente el paciente y las consultas ficticias que creó;
  no imprime contraseñas/tokens ni modifica el legado. T032/T041/T042/T050/T051
  cerradas con evidencia. T043 (revisión clínica de política de demo), T052
  (revisión final antes de distribuir) y T016 (audit de herramientas) siguen abiertas.
- **Documentación del proyecto (2026-11-05):** README propio en español en lugar
  del texto genérico de Nest; guías de arquitectura y migración en `docs/`,
  enlazadas con operación local, contratos y especificaciones. Corregido el
  supuesto de un frontend Next.js existente: aún no existe y también se migrará.
  No hay dependencia Firebase confirmada ni creación de proyecto frontend en este
  cambio. El historial de investigación conserva explícitamente su carácter inicial.
  Validación documental: 15 documentos revisados, 44 enlaces locales válidos y
  `git diff --check` sin errores. No se reejecutaron pruebas funcionales por este
  cambio exclusivamente documental; los resultados de 146 pruebas son los del
  cierre de integración anterior.
