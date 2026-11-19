# Menús diarios persistidos · versión 1

Uso con datos ficticios. Captura manual, independiente del consumo R24, de las
consultas, sus cálculos y la agenda. Guardar no constituye aprobación clínica,
firma, prescripción validada ni cálculo nutricional. Fotografía fuera de alcance.

## Rutas autenticadas

Solo NUTRITIONIST activo con perfil; ADMIN no hereda acceso. Todas las lecturas y
escrituras restringen propietario. Recursos ajenos responden 404. Lecturas usan
`Cache-Control: no-store`. La sesión sigue teniendo un límite absoluto de 24 h.

- `POST /api/v1/patients/:patientId/menus`: crea menú y revisión 1 atómicamente.
- `GET /api/v1/patients/:patientId/menus?page=1&pageSize=5`: lista metadatos,
  ordenados por fecha descendente e ID descendente. PageSize 1–100 (defecto 20).
- `GET /api/v1/menus/:menuId`: última revisión completa.
- `PATCH /api/v1/menus/:menuId`: crea revisión nueva sin borrar anteriores.
- `GET /api/v1/menus/:menuId/revisions/:revision`: revisión histórica inmutable.

No hay borrado ni relación implícita con consultas. Se permiten varios menús
para una fecha. Pacientes archivados permiten leer; no crear/editar. El reintento
idéntico de una escritura ya completada sigue funcionando después del archivo.

## Contrato de escritura

`{schemaVersion:1,clientRequestId,patientUpdatedAt,menu}`; PATCH exige además
`expectedRevision`. UUID e instante ISO completos, sin campos adicionales.
`menu` conserva cadenas originales (espacios y precisión decimal incluidos):

- `date`: fecha YYYY-MM-DD, año 1000–9999, sin conversión de zona.
- `professional`: nombre mostrado capturado, opcional/vacío, máximo 100. No
  acredita identidad; la cuenta responsable se obtiene exclusivamente de sesión.
- `recommendations`: opcional/vacío, máximo 3000.
- `nextReview`: opcional/vacío; fecha válida igual o posterior al menú. No agenda.
- `meals`: cinco claves obligatorias: breakfast, firstSnack, lunch, secondSnack,
  dinner. Cada una tiene `status` included/notIncluded, `time` y `preparations`.
  Al menos un tiempo incluido. Time opcional HH:mm para tiempos incluidos.
- Preparación: name (150), quantity (12), unit (40), instructions (1000),
  substitutions (1000); cadenas, hasta 50 filas por tiempo. Nombre, cantidad
  positiva con punto/coma decimal y unidad obligatorios solo en tiempos incluidos.
  No se infieren equivalencias, nutrientes, sustituciones ni porciones.
- Tiempos no incluidos conservan filas/borradores, sin exigir su completitud ni
  interpretar sus valores como indicaciones. Límites de forma/tamaño sí aplican.
  Máximo 80 KB UTF-8 de captura; se rechaza el exceso sin truncar ni descartar.

La respuesta incluye ID, patientId, schemaVersion, revision, currentRevision,
createdAt, updatedAt, revisionCreatedAt, menu y snapshots históricos de paciente y
cuenta responsable (nombre, zona horaria). Cada edición toma snapshots nuevos;
leer una revisión anterior nunca la actualiza con la ficha actual. No se exponen
hashes, claves de reintento ni datos de autenticación.

## Concurrencia y reintentos

Transacción con bloqueo del paciente compartido con edición/archivo/consultas.
`patientUpdatedAt` detecta identidad obsoleta y `expectedRevision` detecta edición
simultánea: responden 409 sin sobrescribir. Se conservan revisiones históricas.
`clientRequestId` es único por propietario; hash SHA-256 del contenido canónico
incluye operación, destino, captura y versión esperada. Un reintento devuelve
la revisión originalmente guardada, aunque haya revisiones posteriores. Misma
referencia con contenido/destino distinto responde 409. Nunca se reintentan
escrituras automáticamente. La interfaz bloquea cambios ante respuesta incierta
y permite solo el mismo payload/referencia; los conflictos conservan la captura
en pantalla hasta que el usuario decide salir y descartarla.

## Migración y activación

Migración aditiva `20261119090000_daily_menus`: tablas `daily_menus` y
`daily_menu_revisions`, claves de propietario compuestas, sin reescribir pacientes
ni consultas. No modifica credenciales ni requiere seed. No ejecutar reset,
`migrate dev` contra la base existente, ni `docker compose down -v`.

Con Docker disponible, primero verificar en la base exclusiva `nutriline_test`:

```sh
docker compose --profile test run --build --rm test
```

Después, con el entorno local existente y sus credenciales, para activar:

```sh
npm run db:generate
npm run db:migrate:deploy
npm run start:dev
```

Si la API ya está corriendo, reiniciarla en vez de arrancar otra en el puerto 3001.
Prisma carga `.env.local`/`.env`; no imprimirlos, reemplazarlos ni repetir seed.
Swagger: `/api/docs`. Interfaz: expediente → Menús diarios → Nuevo menú.

## PDF y evidencia

La interfaz revisa antes de enviar y exige confirmación explícita. El PDF sale
del detalle de una revisión persistida, no del formulario activo: conserva
identidad histórica, número de revisión y origen, excluye borradores de las
indicaciones, no recalcula nutrientes. Visor/descarga/impresión comparten un Blob;
no se almacena el archivo PDF en servidor. Los PDF locales de demo siguen siendo
borradores independientes. Versiones/capturas incompatibles bloquean el detalle
y la exportación, sin fallback a fixtures.

Build/lint, unitarias y HTTP con guards/validación reales verificados. Pruebas
MySQL verificadas: captura íntegra, aislamiento, archivo, ficha obsoleta,
reintentos concurrentes, ediciones simultáneas y revisiones inmutables. El
reintento con Docker disponible pasó **42 pruebas en cinco archivos**, incluidas
las cinco de menús, exclusivamente en `nutriline_test`. Log:
`/tmp/opencode/menus-integration-retry.log`.

Después se regeneró Prisma y se aplicó únicamente la migración pendiente de
menús en desarrollo (`127.0.0.1:3307`), conservando datos, credenciales y volumen;
sin repetir el seed de desarrollo. Se detuvo la API Docker antigua para iniciar
la versión actualizada con npm en 3001. Log de migración:
`/tmp/opencode/menus-dev-migrate.log`.

Además de la revisión visual interceptada a 500/768/1440 px, se verificó el flujo
real en navegador: login existente, paciente ficticio nuevo, revisión sin envío,
guardado de menú, edición con revisión 2, conservación de revisión 1, PDF real
de revisión 2 (15 947 bytes, mismo Blob) y relectura después de recargar. No se
crearon consultas (historial en cero). Registros ficticios conservados:
paciente `3aea82ca-7d54-4251-b3c0-1e7fa6d2d449`, menú
`3f62549e-58a7-46ea-9bab-74b88064c29c`. Esta evidencia no constituye aprobación
clínica ni valida catálogos/métodos para uso con datos reales.
