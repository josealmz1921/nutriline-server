# Modelo de datos propuesto

**Estado:** esquema inicial en `prisma/schema.prisma`, con migración versionada.
Autenticación y endpoints de pacientes implementados, con pruebas de rol y propiedad.
Consultas con mediciones y BMI implementadas; integración MySQL verificada.
No utilizar emails como PK/FK ni fechas como identificadores de una consulta.
IDs opacos UUID, columnas `snake_case` y nombres de modelo/campos TypeScript
en inglés son la convención propuesta.

## Primera entrega

| Modelo | Campos principales | Relaciones y restricciones |
| --- | --- | --- |
| `User` | `id`, `email`, `passwordHash`, `role`, `status`, timestamps | Email normalizado único; roles ADMIN/NUTRITIONIST; no devolver hash |
| `NutritionistProfile` | `id`, `userId`, `displayName`, `timezone`, timestamps | `userId` único, FK User; zona inicial America/Mexico_City |
| `AuthSession` | `id`, `userId`, `refreshTokenHash`, `expiresAt`, `revokedAt`, referencia de rotación | Sesión revocable; detalles de familia/reutilización sujetos a D02 |
| `Patient` | `id`, `nutritionistId`, `fullName`, `birthDate`, `email?`, `phone?`, `occupation?`, `archivedAt?`, timestamps | Pertenece a NutritionistProfile; email opcional, no globalmente único; sin contraseña |
| `Consultation` | `id`, `patientId`, `nutritionistId`, `occurredAt`, `reason`, `notes?`, timestamps | FK paciente y propietario coherentes; snapshot clínico independiente de agenda |
| `AnthropometricAssessment` | `id`, `consultationId`, `measuredAt`, `weightKg`, `heightCm`, `waistCm?`, `hipCm?` | FK consulta única; todos los datos de medición son de esa atención |
| `CalculationResult` | `id`, `consultationId`, `methodCode`, `methodVersion`, `inputs`, `value`, `unit`, `calculatedAt` | Único por consulta/método/versión; primer método BMI versión 1; calculado en servidor |

`birthDate` y `occurredAt` se necesitan para validación temporal y futura edad
al momento de atención, no para recalcular edad histórica usando la fecha actual.
No forzar un campo de género a servir como parámetro fisiológico de una fórmula:
los requisitos específicos de cada método se definirán al incorporarlo.

## Invariantes

La migración inicial usa `utf8mb4_unicode_ci` explícitamente. `Consultation` solo
tiene `createdAt`: su edición no está habilitada en esta entrega.

- Consultas únicamente para pacientes propios no archivados; el propietario no
  se admite como campo editable. Comprobarlo dentro de la transacción y evitar
  carreras entre archivado y creación (bloqueo/aislamiento o estrategia equivalente).

- La FK de paciente y el propietario de consulta deben ser coherentes mediante
  una relación/clave compuesta o restricción equivalente, no solo por convención.
- Índices para pacientes por propietario/archivo y consultas por paciente/fecha/ID.
- No borrar en cascada usuarios/pacientes con historial; archivado/desactivación.
- Pacientes: edición y archivo usan bloqueo de fila filtrado por propietario;
  creación de consulta comparte ese bloqueo. Archivo es idempotente, permite
  leer detalle/historial y bloquea edición. Prueba MySQL de carrera archivo/consulta
  y bloqueo de creación posterior al archivo verificados.
- Primera entrega: consulta inmutable después de crear; corrección/auditoría futura.
- No guardar `lastConsultation`/`consultationCount` como autoridad: derivarlos
  inicialmente de consultas, para evitar contadores desincronizados.
- Dos consultas el mismo día son válidas y tienen IDs distintos.

## Tipos, unidades y tiempo

- Fechas de nacimiento como DATE (`YYYY-MM-DD`). Instantes en UTC con precisión
  de milisegundos; API exige ISO 8601 con zona y responde UTC.
- Zona America/Mexico_City solo para presentación y reglas locales explícitas.
- Peso en kg; talla/cintura/cadera en cm; pliegues futuros en mm, explícitamente.
- Medidas: DECIMAL(8,3), no FLOAT; resultado DECIMAL(12,6).
  Revisar precisión de cada método nuevo antes de incorporarlo.
- API representa decimales como strings de punto fijo para evitar conversiones
  silenciosas de Prisma/JavaScript. BMI se calcula sin redondear entradas, se
  persiste con precisión interna y se presenta a dos decimales.
- Ausencia de medición es null/no presente, nunca `0`, cadena vacía o texto `'null'`.
- JSON de inputs solo con estructura validada y versionada por método; no un
  expediente arbitrario ni un contenedor para valores sin tipar.
- MySQL nuevo con `utf8mb4`; fijar collation/normalización de email y límites de texto.

## Extensiones posteriores (no crear tablas vacías ahora)

- `Appointment`: fecha programada, paciente y nutriólogo, estado explícito;
  vínculo opcional y único desde una consulta, sin asumir equivalencia con atención.
- `HabitAssessment`, `LabAssessment`, antecedentes y actividades: por consulta,
  con unidades y referencias revisadas.
- `Food`, `FoodServing`, `Recipe`, `RecipeIngredient`: nutrientes y cantidades
  normalizados; aclarar si valores se expresan por 100 g o por porción.
- `DietPlan`, comidas e ítems: relación por ID y snapshots/versionado para que
  cambiar una receta no altere una dieta histórica.
- `MediaAsset`: publicId, tipo de recurso/entrega, versión, formato, tamaño,
  dimensiones, propósito y propietario; acceso firmado si es privado.
- `Subscription`: inicio/vencimiento, plan y modo demo separados de User.
  No reutilizar el nombre engañoso `fechaPago` para un vencimiento.
- Notificaciones, recuperación y documentos requieren su propia especificación.

## Datos de demo

Crear seed sintético, idempotente y exclusivo de entornos permitidos. Credenciales
por entorno, sin copiar las cuentas/contraseñas del PHP a código ni documentación
pública. Incluir al menos dos propietarios para comprobar aislamiento.
No restaurar el SQL antiguo en esta base. Revisar licencias antes de reutilizar
el catálogo de alimentos, aunque no contenga información personal.
