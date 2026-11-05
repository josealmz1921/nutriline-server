# Desarrollo local del backend

## Requisitos

- Docker Desktop con integración WSL para Ubuntu-22.04.
- Para comandos npm en WSL: Node 24.22.2 (`nvm use`, versión fijada en `.nvmrc`).
- Todo desde `~/proyects/nutriline-server`.

## Preparar y arrancar

Si aún no existe `.env`, copia `.env.example` a `.env`. No sobrescribas un `.env`
existente. Los valores de ejemplo son exclusivamente locales y no sirven para producción.

Reemplaza `AUTH_ACCESS_SECRET` con un valor aleatorio propio: el placeholder del
ejemplo se rechaza. Para generarlo: `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`.
Configura también `DEMO_PASSWORD` si vas a crear las cuentas sintéticas.

```sh
docker compose up -d --build --wait
docker compose run --rm api npm run db:migrate:deploy
```

Comprobar: http://localhost:3001/api/v1/health → `{"status":"ok"}`.
Es liveness, no una prueba completa de DB ni de funcionalidades de negocio.
Login, sesiones y seed están descritos en [AUTH.md](AUTH.md).
Swagger en desarrollo: http://localhost:3001/api/docs.
Pacientes y aislamiento: [PATIENTS.md](PATIENTS.md).
Consultas, mediciones e IMC numérico: [CONSULTATIONS.md](CONSULTATIONS.md).
No hay clasificación clínica ni fórmulas avanzadas; uso exclusivo de demo.

La imagen incluye herramientas de desarrollo/migración: no es una imagen endurecida
para producción. Por ahora el código se copia al construir; después de editar:

```sh
docker compose up -d --build --wait
```

## Operación diaria

```sh
docker compose up -d --wait
docker compose ps
docker compose logs --tail=50 -f api
docker compose stop
```

Ctrl+C sale de los logs sin detener el servidor. Los datos persisten en
`nutriline-server_mysql_data`. No usar `down -v`: borraría la base nueva.
Cambiar contraseñas en `.env` no cambia automáticamente las de un volumen ya creado.

## Puertos y aislamiento

- Backend: **127.0.0.1:3001** (configurable por `PORT` en `.env`).
- Frontend previsto: **localhost:3000**, origen CORS permitido por defecto;
  todavía no existe una aplicación en ese puerto como parte de este proyecto.
- MySQL 8.4: **solo red interna**, sin publicar 3306/3307.
- El PHP antiguo continúa en **localhost:8080**, con sus datos independientes.
- El MySQL de Ubuntu no se usa ni se modifica.

`DATABASE_URL` usa el host `db` porque Nest y Prisma se ejecutan dentro de Compose.
`npm run start:dev` directamente en WSL no resolverá ese host: antes de usar ese
modo se necesita una configuración de acceso a DB distinta. No apuntarlo al legado.

Para entrar al MySQL nuevo (contraseña `MYSQL_PASSWORD` de tu `.env`):

```sh
docker compose exec db mysql -u nutriline -p nutriline
```

## Prisma y migraciones

Prisma 7.10.1 con adapter MariaDB compatible con MySQL, generación ESM en
`src/generated/prisma` (ignorado por Git). Se genera durante el build de Docker.

```sh
nvm use
npm ci
npm run db:generate
npm run db:validate
docker compose run --rm api npm run db:migrate:deploy
```

Generar/validar no requiere una DB accesible, pero sí `DATABASE_URL` para cargar
la configuración. No usar `db push` sobre bases con información ni editar una
migración ya aplicada. `db:migrate:dev` requiere acceso a una shadow database;
ese flujo todavía no está configurado para el usuario restringido de Compose.

## Pruebas

Unitarias y HTTP e2e sin conectarse a MySQL ni a Observe:

```sh
nvm use
npm ci
npm run db:generate
npm run build
npm run lint
npm test
npm run test:e2e
```

Integración con una DB MySQL separada y temporal:

```sh
docker compose --profile test run --build --rm test
docker compose --profile test stop db-test
```

El runner aplica migraciones antes de probar. La DB `nutriline_test` usa tmpfs;
no reutiliza el volumen de desarrollo. Las pruebas rechazan otro nombre de base
y requieren `NODE_ENV=test`. No realizar resets globales ni borrar datos ajenos.

## Privacidad y seguridad pendiente

Observe está instalado por el starter, pero **no se importa ni inicializa**.
`OBSERVE_ENABLED=true` se rechaza hasta revisar redacción/captura de datos.
Prisma no tiene logging de consultas habilitado. `.env` está ignorado y excluido
de la imagen; nunca incluir credenciales ni expedientes en logs o commits.

Auditoría inicial: 7 avisos en herramientas de desarrollo (Nest CLI/Mau y sus
dependencias); no se aplicó `npm audit fix --force`. Revisar actualizaciones
compatibles antes de distribuir la demo. No constituye autorización para producción.

La autenticación dispone de guards de rol y los pacientes se aíslan por
propietario. Ver [tareas](specs/001-backend-foundation/tasks.md).
