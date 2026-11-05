# Migración de Nutriline: estado y continuidad

Actualizado: 2026-11-05. Este documento es una visión general; los criterios
de cierre y evidencias viven en [las tareas](../specs/001-backend-foundation/tasks.md).

## Objetivo

Reconstruir el sistema de gestión nutricional para una demo comercial moderna,
con una API independiente y posteriormente un frontend nuevo. No es una
traducción archivo por archivo ni un importador automático del respaldo SQL.

| Proyecto | Función | Estado |
| --- | --- | --- |
| `ProyectoDietas` | Referencia PHP/JS, pantallas y comportamiento antiguo | Se conserva intacto |
| `nutriline-server` | API NestJS, Prisma y MySQL independientes | Primer flujo clínico implementado y probado |
| Frontend moderno | Interfaz que consumirá la API | No existe todavía; pendiente de crear/migrar |

En el entorno local las carpetas de referencia son hermanas, bajo
`/home/josealmz/proyects/`. No son dependencias necesarias para ejecutar la API.

## Corrección del contexto del frontend

Documentos iniciales suponían una base Next.js existente y una dependencia de
Firebase por sustituir. **El usuario aclaró que aún no dispone del frontend
nuevo.** No se debe buscar, asumir reutilizable ni dar por integrada esa base.
Next.js sigue como dirección prevista; repositorio, versiones, diseño y pantallas
se concretarán al iniciar su migración. Firebase no es una dependencia confirmada
del nuevo frontend ni del backend.

## Qué se conserva y qué cambia

Se conserva el propósito de registrar pacientes, consultas, mediciones y planes
nutricionales; el alcance se incorpora por entregas. La investigación del legado
incluye 17 tablas y flujos de identidad, agenda, historial, recetas y suscripción.

Cambios ya aplicados en la primera entrega:

- Identidad por UUID, hashes Argon2id y sesiones revocables; sin importar cuentas SHA-1.
- Propiedad por nutriólogo comprobada en servidor, no por redirects del navegador.
- Separación entre cuenta, paciente y consulta; una cita futura no es una consulta clínica.
- Mediciones/resultados ligados por ID de consulta, no por email y fecha.
- Transacciones para evitar escrituras parciales; archivo en vez de borrado de historial.
- Cintura y cadera independientes y probadas con valores distintos.
- Cálculo de IMC en servidor con unidades y método versionados.

No se copian pacientes, contraseñas, expedientes ni archivos reales. Tampoco se
asume que las fórmulas, catálogos o licencias del legado sean correctos por existir.
Fuentes y hallazgos: [investigación](../specs/001-backend-foundation/research.md).

## Entregas y pendientes

### 1. Primer flujo backend — disponible

Autenticación, pacientes, consultas con medidas/IMC, detalle, historial y archivo.
Verificado con 97 unitarias, 23 e2e HTTP y 26 integraciones MySQL, más smoke real.
La migración inicial funciona sobre una DB de prueba vacía y el seed usa datos ficticios.

Quedan abiertas la revisión clínica de la política conservadora de demo, revisión
de avisos de dependencias y revisión final de persistencia/seguridad antes de distribuir.
Pruebas correctas no equivalen a preparación para producción.

### 2. Frontend — siguiente bloque propuesto, no iniciado

Antes de implementarlo, acordar su alcance y diseño tomando como referencia
las pantallas PHP. Orden sugerido para el primer recorrido:

1. Crear el proyecto y definir estructura, estilos y cliente de API.
2. Login, restauración de sesión, logout y acceso por rol.
3. Lista, búsqueda, alta y edición de pacientes.
4. Detalle e historial del paciente.
5. Formulario de consulta y presentación de medidas/IMC del servidor.
6. Archivo del paciente y estados vacíos, carga, error y sesión vencida.
7. Pruebas del recorrido completo con dos propietarios ficticios.

El cliente debe cumplir el [contrato de sesión](../AUTH.md): access en memoria,
cookies con credenciales y una renovación a la vez. No recalcular IMC como fuente
de verdad, permitir elegir propietario ni confiar en ocultar botones como autorización.
El administrador no debe mostrar acceso clínico que la API prohíbe.

Esta secuencia no crea todavía un repositorio, dependencias, pantallas ni decisiones
de diseño definitivas. El backend puede seguir verificándose con Swagger sin frontend.

### 3. Funcionalidades posteriores — backlog, orden por acordar

- Agenda de citas y notificaciones.
- Hábitos, antecedentes, actividad y laboratorio con unidades explícitas.
- Otras fórmulas, después de revisar fuentes, precisión, población y fixtures.
- Catálogo nutricional, recetas, ingredientes y porciones con licencia revisada.
- Dietas versionadas y PDF desde datos estructurados.
- Cloudinary con subida firmada y control de propiedad/privacidad.
- Suscripciones y correo inicialmente simulados, sin cobros/envíos reales.
- Administración de cuentas y posible portal paciente con permisos explícitos.

No habilitar todo a la vez ni crear tablas vacías para dar por migrado un módulo.

## Cómo retomar el trabajo

1. Leer [README](../README.md), [arquitectura](ARCHITECTURE.md) y este documento.
2. Consultar [specs](../specs/README.md) y tareas abiertas antes de implementar.
3. Elegir un bloque con contrato y criterio de aceptación explícitos.
4. Mantener intactos los archivos, volúmenes y datos del PHP.
5. Verificar con fixtures ficticios y registrar solo comandos/resultados reales.
6. Actualizar documentación y OpenAPI junto con el comportamiento que describen.

No publicar secretos, dumps ni datos de pacientes en documentos, ejemplos o Git.
