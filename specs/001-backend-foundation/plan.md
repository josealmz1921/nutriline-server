# Plan técnico y decisiones

## Base acordada

Backend nuevo en NestJS/TypeScript + Prisma/MySQL; frontend Next.js después;
Cloudinary para imágenes. Monolito modular propuesto. No modificar el legado
ni copiar sus datos personales. No instalar herramientas de spec adicionales:
estos Markdown son la fuente de planificación del repositorio.

## Decisiones adoptadas para comenzar

El usuario indicó «ok vamos» tras la propuesta. Se adoptan D01–D05 como dirección
de implementación; los detalles de despliegue de cookies/CSRF se cerrarán antes de
implementar autenticación y los rangos clínicos antes de publicar sus DTOs.
D06 continúa como propuesta para una entrega posterior.

| ID | Propuesta | Impacto / validación |
| --- | --- | --- |
| D01 | API en `3001`, Next.js en `3000`; MySQL 8.4 LTS en Docker sin puerto público por defecto | Confirmar puertos libres, runtime y compatibilidad de Prisma. El legado conserva `8080` y su MySQL 5.7 |
| D02 | JWT corto en memoria del cliente, refresh opaco rotativo en cookie HttpOnly; hash de refresh en DB | Confirmar despliegue Next/API, CORS, SameSite y CSRF antes de cerrar contrato. No usar localStorage para refresh |
| D03 | Nutriólogo propietario único por paciente; sin multiclínica ni portal paciente en esta entrega | Aislamiento por propietario; colaborar/transferir pacientes se especificará aparte |
| D04 | Consulta clínica mínima con peso/talla e IMC numérico; sin clasificación ni fórmulas avanzadas | Validar que basta para la primera demo, alcance por edad y rangos plausibles |
| D05 | Administrador gestiona cuentas, sin acceso clínico global; archivado de paciente, no borrado físico | Confirmar permisos y retención. No habilitar borrado de expedientes por conveniencia |
| D06 | Suscripciones simuladas fuera de la primera entrega; no bloquear todavía pacientes/consultas por plan | Definir después vencimiento, días vs meses calendario, demo reset y permisos |

### D02 concretada en autenticación

Same-site; cookie HttpOnly/SameSite=Lax/Secure en producción, path `/api/v1/auth`.
Origin exacto obligatorio en POST de auth. Refresh opaco rotativo, límite absoluto
de familia, bloqueo de fila ante concurrencia y revocación por replay. Access JWT
de 5 minutos por defecto, pero comprobación de sesión/rol activo en DB en cada
petición: revocación inmediata, no vigencia residual hasta expirar. Es necesario
serializar renovaciones desde Next.js. No se habilita despliegue cross-site sin revisión.

No se da por implementada ninguna decisión por estar escrita aquí. La base técnica
usa Node 24.22.2 y Prisma 7.10.1 estable (el tag npm `latest` apunta a una RC de Prisma 8).
Como la API corre dentro de Docker, no se publica MySQL en el host.
Cloudinary y D06 no bloquean el primer flujo.

## Estructura propuesta

```text
src/
  common/          # errores, validación, guards/decoradores compartidos
  config/          # entorno tipado y validado
  database/        # Prisma y transacciones
  modules/
    auth/
    users/
    nutritionists/
    patients/
    consultations/
    calculations/
  app.module.ts
  main.ts
prisma/
  schema.prisma
  migrations/
  seed.ts
```

Mantener imports ESM con `.js`, npm/package-lock y Vitest existentes.
Controladores manejan HTTP; servicios validan reglas/propiedad y orquestan transacciones;
Prisma queda detrás de servicios con selecciones explícitas. No añadir repositorios,
CQRS, colas o microservicios sin una necesidad demostrada.

## Secuencia

1. **Análisis/documentación:** inventario inicial, riesgos y borradores de contrato/modelo.
2. **Base técnica:** runtime compatible, entorno validado, Compose independiente,
   Prisma/migraciones, pruebas de DB y estrategia segura para Observe.
3. **Identidad:** usuarios/roles, hash moderno, login/refresh/logout y controles de abuso.
4. **Pacientes:** CRUD acotado, archivado y autorización por propietario.
5. **Consultas:** snapshot clínico, transacción, IMC e historial por ID.
6. **Demo:** fixtures ficticios, pruebas de aceptación y documentación reproducible.
7. **Próximas specs:** agenda, hábitos/laboratorios, catálogo/recetas, dietas/PDF,
   Cloudinary y suscripciones simuladas. Definir contratos al iniciar cada entrega.

## Estrategia de verificación

- Baseline del starter: build, lint, unit tests y e2e antes de cambios funcionales.
- Unit tests: reglas clínicas aprobadas, límites, estado de paciente y sesiones.
- Integración con MySQL real y aislado: migraciones, índices, transacciones y seed.
- E2E: AC01–AC10, con dos nutriólogos y pruebas negativas de propiedad en cada ruta.
- Ejecución del flujo desde una DB nueva; comprobar que restart conserva datos.
- No ejecutar tests contra DB del legado ni permitir reset de demo en producción.
- Para issues de producción, seguir `AGENTS.md` y usar datos de Observe; esta fase
  no depende de comportamiento productivo ni requiere activar servicios externos.

## Política de avance

Actualizar `tasks.md` y la spec en el mismo cambio de cada funcionalidad.
Registrar comandos realmente ejecutados y resultados, sin secretos.
Cambios de contrato requieren actualizar ejemplos, OpenAPI y pruebas a la vez.
No marcar tareas implementadas con base solo en documentación o código sin verificar.
