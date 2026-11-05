# Nutriline

Modernización de un sistema de gestión nutricional para una demo comercial.
El objetivo es reconstruir los flujos del proyecto PHP con una arquitectura
moderna, sin trasladar sus fallos ni importar datos personales reales.

Este repositorio contiene **el backend**. El frontend moderno **todavía no existe**:
también se migrará tomando como referencia las pantallas del sistema original.
Next.js es la dirección prevista, no una implementación disponible.

> Entorno de desarrollo y demostración con datos ficticios. No está aprobado
> para uso clínico real ni preparado para publicarse en producción.

## Estado actual

Última verificación: **2026-11-05**.

| Área | Estado |
| --- | --- |
| Entorno Docker, MySQL y migraciones Prisma | Implementado y verificado |
| Login, sesiones, roles, refresh y logout | Implementado y verificado |
| Pacientes propios: alta, edición, búsqueda, detalle y archivo | Implementado y verificado |
| Consultas, mediciones, historial e IMC numérico | Implementado y verificado |
| Frontend moderno | Pendiente de crear/migrar |
| Agenda, dietas/PDF, recetas, imágenes y otras fórmulas | Backlog, no implementado |
| Importación de pacientes/cuentas reales | Fuera del alcance actual |

El recorrido disponible mediante API es:

**Login → paciente → consulta con mediciones → IMC → historial → archivo.**

Cada nutriólogo accede únicamente a sus pacientes y consultas. El administrador
no hereda acceso clínico y los pacientes no tienen cuenta de acceso en esta entrega.

## Tecnologías

| Componente | Tecnología |
| --- | --- |
| Runtime | Node.js 24.22.2, ESM |
| Backend | NestJS 12, TypeScript 6 |
| Persistencia | Prisma 7.10.1, MySQL 8.4 |
| Validación y contrato | Zod, OpenAPI/Swagger |
| Identidad | Argon2id, JWT de acceso y refresh opaco rotativo |
| Pruebas y calidad | Vitest, Supertest, Oxlint, Prettier |
| Entorno local | Docker Compose |
| Frontend / imágenes | Next.js / Cloudinary previstos, aún no implementados |

## Inicio rápido

Requisitos: Docker Desktop activo e integración WSL habilitada. Para ejecutar
herramientas npm directamente en WSL, usar la versión de Node de `.nvmrc`.

Desde la raíz de este repositorio:

1. Crear `.env` desde `.env.example` **solo si no existe**:
   ```sh
   cp -n .env.example .env
   ```
2. Editar `.env`: generar `AUTH_ACCESS_SECRET` aleatorio propio de al menos
   48 caracteres y definir `DEMO_PASSWORD` propio de 12–128 caracteres.
   No utilizar los placeholders ni publicar estos valores.
3. Construir, arrancar y aplicar migraciones:
   ```sh
   docker compose up -d --build --wait
   docker compose run --rm api npm run db:migrate:deploy
   ```
4. Crear las cuentas y pacientes ficticios de demostración:
   ```sh
   docker compose run --rm api npm run db:seed
   ```

El seed requiere `NODE_ENV=development` y `DEMO_MODE=true`; no importa datos del
PHP ni cambia contraseñas de usuarios existentes. Cuentas y flujo de sesión:
[AUTH.md](AUTH.md).

| Recurso local | Dirección |
| --- | --- |
| API | http://localhost:3001/api/v1 |
| Health del proceso | http://localhost:3001/api/v1/health |
| Swagger (solo desarrollo) | http://localhost:3001/api/docs |
| OpenAPI JSON (solo desarrollo) | http://localhost:3001/api/docs-json |
| PHP original, si se inicia por separado | http://localhost:8080 |
| Futuro frontend, puerto previsto | http://localhost:3000 — todavía no hay aplicación |

MySQL no publica puertos al host. Los datos del backend persisten en su propio
volumen, separado del legado. **No ejecutar `docker compose down -v`.**
Operación diaria, configuración y diagnóstico: [DEVELOPMENT.md](DEVELOPMENT.md).

## API disponible

Base `/api/v1`. Las rutas clínicas requieren un nutriólogo autenticado con perfil.

| Módulo | Rutas | Guía |
| --- | --- | --- |
| Salud | `GET /health` | [Desarrollo](DEVELOPMENT.md) |
| Sesiones | `POST /auth/login`, `/auth/refresh`, `/auth/logout`; `GET /auth/me` | [Autenticación](AUTH.md) |
| Pacientes | `POST/GET /patients`; `GET/PATCH /patients/:patientId`; `POST /patients/:patientId/archive` | [Pacientes](PATIENTS.md) |
| Consultas | `POST/GET /patients/:patientId/consultations`; `GET /consultations/:consultationId` | [Consultas e IMC](CONSULTATIONS.md) |

Los DTOs rechazan campos desconocidos; el propietario se obtiene de la sesión.
Los POST de autenticación exigen `Origin` permitido incluso desde Postman/curl.
Una consulta no es una cita de agenda. El IMC se calcula en servidor sin
clasificación clínica; `70 kg / 175 cm` se presenta como `22.86`.

## Pruebas

En WSL, con `.env` preparado:

```sh
nvm use
npm ci
npm run db:generate
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm test
npm run test:e2e
```

Integraciones contra MySQL exclusivo de pruebas, con migraciones automáticas:

```sh
docker compose --profile test run --build --rm test
docker compose --profile test stop db-test
```

Última ejecución: **146 pruebas correctas** —97 unitarias, 23 e2e HTTP con
servicios sustituidos y 26 integraciones MySQL—. También pasó el smoke HTTP
del flujo completo sobre la API en Docker. No equivalen a cobertura total ni
a validación médica. Evidencias y pendientes: [tareas](specs/001-backend-foundation/tasks.md).

## Documentación

| Documento | Contenido |
| --- | --- |
| [Desarrollo local](DEVELOPMENT.md) | Docker, variables, MySQL, migraciones y pruebas |
| [Arquitectura](docs/ARCHITECTURE.md) | Módulos, modelo, seguridad y decisiones técnicas |
| [Migración y estado](docs/MIGRATION.md) | Relación con PHP, alcance y próximos bloques, incluido frontend |
| [Autenticación](AUTH.md) | Cuentas ficticias, roles y contrato de sesión |
| [Pacientes](PATIENTS.md) | DTOs, filtros, propiedad, archivo y concurrencia |
| [Consultas](CONSULTATIONS.md) | Mediciones, tiempos, precisión e IMC |
| [Especificaciones](specs/README.md) | Requisitos, investigación, decisiones y seguimiento detallado |

## Límites y precauciones

- Solo datos ficticios. No versionar `.env`, dumps ni expedientes.
- Observe está instalado, pero **no se importa ni inicializa**; activarlo está bloqueado.
- Faltan revisión clínica de reglas/rangos, revisión de dependencias e infraestructura
  de producción. Los avisos de auditoría registrados no se consideran resueltos.
- Sin alta pública, recuperación de contraseña, administración de cuentas,
  portal paciente, cobros ni correos reales en la entrega actual.
- Cloudinary, agenda, dietas/PDF y frontend requieren sus propias implementaciones.
- El código PHP y su base se mantienen independientes y no se modifican al probar el backend.

## Licencia

Repositorio privado, declarado `UNLICENSED` en `package.json`. No se concede aquí
una licencia de redistribución del proyecto. Revisar por separado las licencias
de dependencias y la procedencia del catálogo nutricional del legado.
