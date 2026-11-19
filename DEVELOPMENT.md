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
Menús independientes, revisiones, migración y activación: [MENUS.md](MENUS.md).
Agenda, citas y conflictos de horarios: [APPOINTMENTS.md](APPOINTMENTS.md).
No hay clasificación clínica ni fórmulas avanzadas; uso exclusivo de demo.

La imagen incluye herramientas de desarrollo/migración: no es una imagen endurecida
para producción. Por ahora el código se copia al construir; después de editar:

```sh
docker compose up -d --build --wait
```

## Operación diaria

### Backend con npm y MySQL en Docker

Para trabajar en el backend sin construir su imagen:

```sh
nvm use
# Solo la primera vez; crea .env.local privado sin sobrescribirlo.
npm run setup:local
docker compose -f compose.yaml -f compose.local.yaml up -d --wait db
npm run start:dev
```

Mantener ese último comando en una terminal abierta. En otra terminal, dentro
de `nutriline-client`, ejecutar `npm run dev` y abrir http://localhost:5173.
No ejecutar simultáneamente la API de Docker y la de npm en el puerto 3001.

`.env` conserva `db:3306` para la API de Docker; `.env.local` conserva las mismas
credenciales y solo cambia el destino a `127.0.0.1:3307` para Nest/Prisma locales.
Este archivo está ignorado por Git y excluido de la imagen Docker. Las variables
exportadas en la terminal tienen prioridad sobre ambos archivos.

El archivo Compose adicional publica MySQL **solo en loopback**, no en la red.
Se utiliza 3307 para no interferir con el MySQL de Ubuntu en 3306. Recrear el
contenedor para publicar el puerto conserva el volumen `nutriline-server_mysql_data`.
No ejecutar `down -v`, no borrar volúmenes ni repetir el seed para este cambio.
Las siguientes veces basta con los dos últimos comandos de backend.

`CORS_ORIGINS` en `.env` debe incluir `http://localhost:5173`; reiniciar Nest
si se cambia la configuración. Las cuentas ficticias existentes mantienen sus
contraseñas. El login correcto, no solo `/health`, comprueba el acceso a la DB.

### Todo el backend en Docker

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
- Frontend React/Vite: **localhost:5173**, en el repositorio `nutriline-client`.
- MySQL 8.4: **solo red interna** por defecto; acceso opcional por
  **127.0.0.1:3307** con `compose.local.yaml`.
- El PHP antiguo continúa en **localhost:8080**, con sus datos independientes.
- El MySQL de Ubuntu no se usa ni se modifica.

`DATABASE_URL` usa el host `db` porque Nest y Prisma se ejecutan dentro de Compose.
`npm run start:dev` usa `.env.local` cuando existe, siguiendo el procedimiento
anterior. No apuntarlo al legado.

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
