# Arquitectura de Nutriline

Estado documentado: 2026-11-05. Describe lo implementado, no una aprobación
de seguridad para producción. Entrada general: [README](../README.md).

## Componentes y límites

```text
Cliente HTTP / Swagger             Frontend Next.js futuro
          |                                 |
          +------------- HTTP JSON ---------+
                             |
                   NestJS /api/v1 :3001
                   auth · patients · consultations
                             |
                      Prisma + adapter MariaDB
                             |
                     MySQL 8.4 interno

PHP original :8080 → MySQL 5.7 propio
(entorno separado, solo referencia; no hay sincronización ni importación)
```

Monolito modular: controladores exponen HTTP, servicios aplican reglas y
orquestan operaciones, Prisma gestiona persistencia. No hay microservicios,
colas, frontend desplegado ni integración operativa de Cloudinary.

Compose publica únicamente la API en `127.0.0.1:3001` por defecto. MySQL vive
en una red interna. Desarrollo usa un volumen persistente; `db-test` usa tmpfs
y una base distinta, sin reutilizar datos ni volúmenes del PHP.

## Estructura del repositorio

```text
src/
  main.ts                    # Bootstrap
  setup-app.ts               # Prefijo, CORS, cookies, errores, Swagger
  config/                    # Entorno validado
  common/                    # Validación Zod, errores y paginación
  database/                  # PrismaService y módulo global
  demo/                      # Seed sintético y restricciones
  modules/
    auth/                    # Login, sesiones, guards y roles
    patients/                # Pacientes y bloqueo de propiedad compartido
    consultations/           # Creación, detalle e historial clínico
    calculations/            # Función de dominio BMI v1
  generated/prisma/          # Generado, no versionado
prisma/
  schema.prisma
  migrations/
  seed.ts
test/                        # E2e HTTP e integración MySQL
specs/                       # Requisitos, decisiones y evidencias
docs/                        # Arquitectura y visión de migración
```

Imports ESM con extensión `.js` en TypeScript. Dependencias reproducibles con
`package-lock.json`. El cliente Prisma se genera durante el build Docker;
no editar ni versionar archivos generados.

## Modelo de datos

Fuente ejecutable: [`schema.prisma`](../prisma/schema.prisma).

```text
User ── 0..1 NutritionistProfile ── N Patient ── N Consultation
  └── N AuthSession                    ↑              ├── 0..1 AnthropometricAssessment
                           propietario coherente     └── N CalculationResult
```

- `User`: identidad, hash, rol `ADMIN`/`NUTRITIONIST` y estado activo/inactivo.
- `NutritionistProfile`: perfil, zona horaria y propietario clínico.
- `AuthSession`: hash de refresh, familia, vencimiento y revocación.
- `Patient`: datos mínimos, nacimiento date-only y fecha de archivo.
- `Consultation`: evento clínico por UUID, fecha, motivo y notas. Inmutable por API.
- `AnthropometricAssessment`: medidas de una consulta; la ruta de creación lo exige.
- `CalculationResult`: método/versionado, inputs, resultado y fecha de cálculo.

La FK compuesta de consulta a paciente asegura coherencia del propietario.
No se vinculan expedientes por email ni por fecha; dos consultas del mismo día
tienen IDs independientes. No hay borrado clínico por API ni cascadas de historial.

## Escrituras y concurrencia

Crear una consulta bloquea la fila del paciente filtrada por propietario dentro
de una transacción. Después comprueba archivo y fechas, calcula IMC y crea
consulta, mediciones y resultado juntos. Un fallo revierte el agregado.

Edición y archivo del paciente reutilizan el mismo bloqueo. Si archivo gana la
carrera, la creación responde 409; si consulta gana, se conserva en el historial
cuando se archiva. El archivo es idempotente, no una eliminación.

Los listados usan orden determinista; historial: `occurredAt DESC, id DESC`.
Datos y total se leen en un snapshot `RepeatableRead`. Paginación acotada,
sin parámetros arbitrarios ni queries repetidas.

## Identidad y autorización

1. Login valida Origin, credenciales Argon2id y cuenta activa.
2. Devuelve access JWT corto y refresh opaco en cookie HttpOnly.
3. Las rutas protegidas consultan sesión/usuario actuales en DB y exigen rol explícito.
4. Los servicios filtran cada recurso clínico por propietario de la sesión.
5. Refresh rota tokens; replay revoca la familia. Logout revoca esa familia.

ADMIN no hereda permisos clínicos. IDs ajenos e inexistentes responden 404.
El frontend futuro deberá mantener access en memoria y serializar refresh;
no se ha implementado todavía ese cliente. Detalles: [AUTH.md](../AUTH.md).

## Contrato, datos y privacidad

- Base `/api/v1`; OpenAPI en `/api/docs` y `/api/docs-json` solo en desarrollo.
- Zod estricto rechaza campos extra; errores HTTP sanitizados con requestId.
- CORS con orígenes explícitos y credenciales; Origin obligatorio en POST de auth.
- Fechas de nacimiento `YYYY-MM-DD`; instantes con zona, respuestas en UTC.
- Medidas DECIMAL(8,3), cálculo DECIMAL(12,6); decimales de API como strings.
- IMC con aritmética decimal, presentación a dos decimales, sin clasificación médica.
- Respuestas `Cache-Control: no-store`; Prisma sin logging de consultas.
- Observe no se importa ni inicializa. No enviar cuerpos clínicos ni secretos a telemetría.

Límites de almacenamiento no equivalen a rangos clínicos plausibles. Reglas
temporales y restricciones actuales: [CONSULTATIONS.md](../CONSULTATIONS.md).

## Verificación y límites de despliegue

Unitarias prueban DTOs, entorno y reglas de dominio. E2e HTTP prueban contratos
y guards con servicios sustituidos. Integración usa MySQL aislado para propiedad,
transacciones, sesiones, precisión y concurrencia. El smoke prueba la API Docker.

La imagen actual incluye herramientas de desarrollo. Antes de distribuir:
revisar audit, HTTPS, secretos, copias de seguridad/restauración, límites compartidos
si hay múltiples instancias y una estrategia de observabilidad sanitizada.
Nada de esto se da por resuelto por haber pasado las pruebas locales.
