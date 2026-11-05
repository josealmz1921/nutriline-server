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

## Endpoints

Base: `http://localhost:3001/api/v1`.
OpenAPI/Swagger en desarrollo: http://localhost:3001/api/docs y `/api/docs-json`.

| Método | Ruta | Acceso |
| --- | --- | --- |
| POST | `/auth/login` | Email/password y Origin permitido; 200 |
| POST | `/auth/refresh` | Cookie de refresh y Origin permitido; 200 |
| POST | `/auth/logout` | Cookie si existe y Origin permitido; 204 idempotente |
| GET | `/auth/me` | Bearer access token válido; 200 |

Login recibe únicamente `email` y `password`. Email se normaliza; la contraseña
no se recorta ni transforma. Se rechazan campos extra. Refresh/logout reciben
cuerpo vacío o `{}`: no enviar tokens en JSON ni en query strings.

Los POST de auth **exigen `Origin`**, también desde curl/Postman. CORS no basta
para proteger cookies: el guard de origen rechaza ausencias y valores no autorizados.
En el navegador, `Origin` se envía automáticamente; no intentes asignarlo desde JS.
`.env.example` permite Next local (`3000`) y Swagger local (`3001`). Si cambias el
puerto, ajusta los orígenes explícitos; nunca uses `*` con credenciales.

## Flujo de sesión para Next.js

1. Login con `credentials: 'include'` y JSON `{ email, password }`.
2. Guardar `accessToken` **en memoria**. Respuesta:
   `{ accessToken, tokenType: 'Bearer', expiresIn, user }`.
3. En peticiones protegidas enviar `Authorization: Bearer <accessToken>`.
4. Al recargar la página o vencer el access, llamar a refresh con credenciales
   incluidas; sustituir el access en memoria. La cookie no es legible desde JS.
5. Logout con credenciales incluidas y borrar el access en memoria.

Cookie `nutriline_refresh`: HttpOnly, SameSite=Lax, path `/api/v1/auth`, sin Domain,
Secure en producción. JWT HS256 con issuer/audience y claims mínimos `sub`/`sid`;
por defecto dura 5 minutos. Refresh aleatorio de 256 bits; DB guarda solo SHA-256.
El límite absoluto por familia es 7 días por defecto, sin extenderlo al renovar.

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

- `ADMIN`: identidad y futuras funciones administrativas/catálogos.
- `NUTRITIONIST`: identidad y rutas de sus pacientes; consultas/dietas pendientes.
- No existe rol de paciente en esta versión.
- Roles no implican jerarquía: ADMIN no hereda permisos clínicos.
- Rutas protegidas exigen roles explícitos (`@Roles`); sin política se deniega.
- El rol actual viene de DB, no del cuerpo de login ni de un claim obsoleto.
- Los endpoints de pacientes ya filtran por propietario: ver [PATIENTS.md](PATIENTS.md).
  No existe todavía CRUD administrativo ni endpoints de consultas clínicas.

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
Este bloque no implementa registro público, recuperación ni cambio de contraseña.
