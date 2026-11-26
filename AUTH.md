# Autenticación y roles

## Cuentas locales de demostración

Después de aplicar migraciones:

```sh
docker compose run --rm api npm run db:seed
```

Requiere `NODE_ENV=development`, `DEMO_MODE=true` y `DEMO_PASSWORD` propio de
12–128 caracteres en `.env`. El seed rechaza producción, hosts remotos y bases
distintas de `nutriline`/`nutriline_test`. Solo genera datos ficticios.

| Email | Rol |
| --- | --- |
| `admin@nutriline.example` | `ADMIN` |
| `nutriologo1@nutriline.example` | `NUTRITIONIST` |
| `nutriologo2@nutriline.example` | `NUTRITIONIST` |

La contraseña inicial es el valor de **`DEMO_PASSWORD` de tu `.env`**, no la del
PHP antiguo. No publicarla ni reutilizarla en producción. Se crea un paciente
ficticio para cada nutriólogo. Repetir el seed no duplica registros ni cambia
contraseñas/estados existentes; no sirve como herramienta para resetear cuentas.

### Cuenta ADMIN adicional de prueba local

- Correo: `admin.pruebas@nutriline.test`.
- Rol: `ADMIN`; estado inicial: `ACTIVE`.
- Creada directamente en la base local `nutriline`, fuera del seed de demostración.
  No se crea automáticamente al clonar el proyecto ni al ejecutar el seed.
- Contraseña inicial aleatoria, entregada al responsable en la conversación de
  creación; no se guarda en este documento ni en el repositorio y no corresponde
  a `DEMO_PASSWORD`. Puede cambiarse desde `/seguridad`.
- Tras iniciar sesión en el cliente, se dirige a `/admin`: usuarios, soporte y
  bitácora. No tiene acceso a expedientes clínicos. Uso exclusivo para pruebas
  locales, nunca para producción ni para pruebas automatizadas.

## Endpoints

Base: `http://localhost:3001/api/v1`.
OpenAPI/Swagger en desarrollo: http://localhost:3001/api/docs y `/api/docs-json`.

| Método | Ruta | Acceso |
| --- | --- | --- |
| POST | `/auth/login` | Email/password y Origin permitido; 200 |
| POST | `/auth/refresh` | Cookie de refresh y Origin permitido; 200 |
| POST | `/auth/logout` | Cookie si existe y Origin permitido; 204 idempotente |
| GET | `/auth/me` | Bearer access token válido; 200 |
| POST | `/auth/password/forgot` | Público + Origin; `{ email }`; 200 genérico |
| POST | `/auth/password/reset` | Público + Origin; `{ token, newPassword }`; 204 |
| POST | `/auth/password/change` | ADMIN/NUTRITIONIST + Origin; `{ currentPassword, newPassword }`; 204 |

Login recibe únicamente `email` y `password`. Email se normaliza; la contraseña
no se recorta ni transforma. Se rechazan campos extra. Refresh/logout reciben
cuerpo vacío o `{}`: no enviar tokens en JSON ni en query strings.

Los POST de auth **exigen `Origin`**, también desde curl/Postman. CORS no basta
para proteger cookies: el guard de origen rechaza ausencias y valores no autorizados.
En el navegador, `Origin` se envía automáticamente; no intentes asignarlo desde JS.
`.env.example` permite el futuro frontend local (`3000`) y Swagger local (`3001`). Si cambias el
puerto, ajusta los orígenes explícitos; nunca uses `*` con credenciales.

## Contrato de sesión del frontend React

El cliente React/Vite consume este contrato; no utiliza Next.js.

1. Login con `credentials: 'include'` y JSON `{ email, password }`.
2. Guardar `accessToken` **en memoria**. Respuesta:
   `{ accessToken, tokenType: 'Bearer', expiresIn, sessionExpiresAt, user }`.
3. En peticiones protegidas enviar `Authorization: Bearer <accessToken>`.
4. Al recargar la página o vencer el access, llamar a refresh con credenciales
   incluidas; sustituir el access en memoria. La cookie no es legible desde JS.
5. Logout con credenciales incluidas y borrar el access en memoria.

Cookie `nutriline_refresh`: HttpOnly, SameSite=Lax, path `/api/v1/auth`, sin Domain,
Secure en producción. JWT HS256 con issuer/audience y claims mínimos `sub`/`sid`;
por defecto dura 5 minutos. Refresh aleatorio de 256 bits; DB guarda solo SHA-256.
El límite absoluto por familia es **24 horas desde el login**, sin extenderlo al
renovar. `sessionExpiresAt` es su instante UTC, no el vencimiento del access token.
`AUTH_REFRESH_TTL_DAYS=1` es el valor recomendado; configuraciones antiguas entre
1 y 30 días se limitan siempre a 1 para no impedir el arranque ni permitir más
de 24 horas. El servidor también consulta el primer `createdAt` de la familia:
las sesiones existentes de siete días quedan sujetas al mismo límite, incluso
si fueron rotadas recientemente. No requiere migración ni borrar sesiones/datos.

El frontend programa la salida al vencer y revalida al recuperar foco/visibilidad;
limpia memoria y caché por cuenta y abre `/login`. Si falta la sesión o falla la
restauración, también abre el login con un aviso. Antes de peticiones comprueba
el límite local; el servidor sigue siendo la autoridad aun con reloj manipulado.
Los cambios se comunican entre pestañas sin transmitir tokens. No se repiten
guardados automáticamente al renovar o recuperar sesión.

Verificación: pruebas de cliente con reloj controlado (vencimiento sin petición,
pestaña suspendida, renovación sin extensión, bloqueo de escritura) y MySQL
aislado (login de 24 h, renovación y rechazo de familias antiguas vencidas).
Reiniciar el proceso backend después de actualizar el código.

**Revocación inmediata:** cada petición protegida consulta estado/rol y sesión en
DB. Logout con cookie válida revoca esa familia, no las sesiones de otros dispositivos.
Rotar también invalida el access token anterior. Sin cookie, logout solo limpia la
cookie y responde 204; no identifica una sesión por un Bearer adicional.

**Una renovación a la vez:** el frontend debe compartir una única promesa de
refresh (y coordinar pestañas si comparten cookie). Reutilizar un refresh antiguo,
incluido un reintento concurrente, revoca toda la familia y exige login nuevamente.
Si una respuesta de refresh se pierde, no repetir ciegamente el token anterior.

Este diseño asume frontend/API same-site (localhost con distintos puertos o
subdominios del mismo sitio sobre HTTPS). Hosting cross-site requiere revisar
cookies/CSRF antes de cambiar SameSite; no está habilitado por conveniencia.

## Permisos

- `ADMIN`: identidad, consulta de usuarios, bloqueo/desbloqueo de cuentas no
  administradoras, gestión de soporte y lectura de bitácora.
- `NUTRITIONIST`: identidad, pacientes y consultas propias; dietas pendientes.
- No existe rol de paciente en esta versión.
- Roles no implican jerarquía: ADMIN no hereda permisos clínicos.
- Rutas protegidas exigen roles explícitos (`@Roles`); sin política se deniega.
- El rol actual viene de DB, no del cuerpo de login ni de un claim obsoleto.
- Los endpoints de pacientes ya filtran por propietario: ver [PATIENTS.md](PATIENTS.md).
  Consultas clínicas disponibles: [CONSULTATIONS.md](CONSULTATIONS.md).
  Administración y soporte disponibles: [SUPPORT.md](SUPPORT.md). No hay registro
  público ni creación de usuarios desde el panel administrativo.

## Límites y errores

Login: 5 solicitudes por minuto/IP. Refresh/logout: 20 por minuto/IP por ruta.
Límite general: 120 por minuto/IP, excepto health. Contadores en memoria de una
instancia: para múltiples instancias/proxy se necesita almacenamiento compartido
y una política de IP confiable, no aceptar X-Forwarded-For indiscriminadamente.

Errores: `{ error: { code: 'HTTP_401', message, details?, requestId } }`.
400 validación, 401 autenticación, 403 rol/origen, 429 límites. Usuario inexistente,
contraseña inválida y cuenta inactiva responden el mismo mensaje de login.
Respuestas de API con `Cache-Control: no-store`. No se registran cuerpos, tokens,
hashes ni excepciones crudas de DB en el filtro HTTP.

## Antes de producción

Generar secreto criptográfico propio (mínimo 48 caracteres), usar HTTPS y orígenes
exactos, desactivar demo, revisar dependencia/infraestructura, límites distribuidos,
gestión/rotación de claves y monitoreo sanitizado. Swagger solo se monta en desarrollo.
No existe registro público. Recuperación y cambio se describen a continuación.

## Cambio y recuperación de contraseña

- Nueva contraseña: 12–128 caracteres (mínimo 12 tras ignorar espacios extremos
  solo para validar longitud); se conserva exactamente, sin recortarla. Debe ser
  diferente de la actual. El cambio autenticado verifica la contraseña actual.
- Ambos flujos actualizan contraseña, revocan todas las sesiones y consumen todos
  los enlaces pendientes en una transacción. Nunca inician sesión automáticamente.
  Login/refresh y cambios usan bloqueo por usuario para impedir sesiones creadas
  con credenciales verificadas antes de un cambio concurrente.
- Recuperación responde igual para cuentas activas, inactivas e inexistentes.
  Límite público: 3 solicitudes/minuto/IP; máximo un enlace por cuenta/minuto.
  Reset/cambio: 5 solicitudes/minuto/IP por ruta. No hay reintentos automáticos
  de cambios de contraseña ante respuestas inciertas.
- Tokens aleatorios de 256 bits, SHA-256 para búsqueda, vencimiento de 15 minutos
  desde la solicitud y un solo uso. La URL usa fragmento `#token=…`, no query;
  el cliente lo elimina de la dirección al abrir y no modifica nada hasta enviar
  el formulario. Recargar después requiere abrir otra vez el correo.
- La cola SMTP persiste temporalmente el token cifrado con AES-256-GCM y una clave
  derivada con separación de dominio de `AUTH_ACCESS_SECRET`. No se guarda en
  claro ni se devuelve por HTTP. Se elimina el payload al entregar, consumir,
  agotar tres intentos o limpiar vencidos. El worker revisa cada 5 segundos y
  separa intentos fallidos al menos 30 segundos. SMTP no garantiza entrega única:
  una caída tras aceptar un correo podría duplicarlo, nunca duplicar su consumo.
  Rotar el secreto invalida payloads pendientes; solicitar enlaces nuevos.
- `MAIL_MODE=disabled` devuelve 503 explícito para cualquier dirección. No hay
  fallback de correo ni registro de enlaces/destinatarios/cuerpos.

### Buzón local (sin correo real)

```sh
docker compose -f compose.yaml -f compose.mail.yaml up -d mailpit
```

En el archivo privado `.env.local`, configurar `MAIL_MODE=smtp`,
`SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, `SMTP_SECURE=false`,
`MAIL_FROM=no-reply@nutriline.example`,
`PASSWORD_RESET_ORIGIN=http://localhost:5173` y autorizar ese origen en
`CORS_ORIGINS`. Reiniciar API. Buzón: http://localhost:8025 (puertos loopback).
Si API corre dentro de Docker, conectar ambos servicios a la misma red y usar
`SMTP_HOST=mailpit`; `127.0.0.1` corresponde al arranque API con npm.
Aplicar migración aditiva `20261119110000_password_resets` con el procedimiento
de [DEVELOPMENT.md](DEVELOPMENT.md); nunca reseedear ni borrar volúmenes.

En producción falta seleccionar/configurar proveedor SMTP real: HTTPS para el
origen de recuperación, credenciales privadas y TLS SMTP son obligatorios.
El origen debe estar permitido; nunca se acepta URL de retorno del solicitante.
Mantener observabilidad sin secretos y configurar límites compartidos antes de
escalar a varias instancias. El buzón local no es transporte de producción.
