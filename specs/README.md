# Especificaciones de Nutriline

Este directorio conserva el contexto, las decisiones y el avance del backend.
El objetivo es una demo comercial moderna, no una traducción archivo por archivo
del sistema PHP ni una migración automática de datos reales.

## Entregas

| Entrega | Estado | Documentación |
| --- | --- | --- |
| 001 — Base del backend y primer flujo clínico | Base, auth, pacientes y consultas verificados con MySQL; limitaciones de demo documentadas | [Especificación](001-backend-foundation/spec.md) · [Plan](001-backend-foundation/plan.md) · [Tareas](001-backend-foundation/tasks.md) |

## Cómo trabajar

1. Leer `spec.md` para entender el alcance y los criterios de aceptación.
2. Consultar `research.md` para distinguir comportamiento observado de diseño propuesto.
3. Revisar `data-model.md` y `api-contract.md` antes de implementar.
4. Tomar una tarea de `tasks.md`, implementar y verificar su criterio de cierre.
5. Marcarla completada solo con evidencia; actualizar los documentos si cambia el diseño.

Las decisiones confirmadas por el usuario se distinguen de las propuestas técnicas.
Una tarea terminada de documentación no significa que su funcionalidad ya exista.
No almacenar aquí contraseñas, secretos, dumps SQL, expedientes ni ejemplos de pacientes reales.

## Contexto para continuar en otra sesión

- Backend: este repositorio, `/home/josealmz/proyects/nutriline-server`.
- Referencia local de solo lectura: `/home/josealmz/proyects/ProyectoDietas`.
- Corrección de contexto (2026-11-05): el frontend moderno aún no existe; también
  se creará/migrará desde las pantallas del PHP. La suposición de una base Next.js
  existente y dependencia Firebase no está vigente. Next.js es la dirección prevista.
- Visión general de la migración: [docs/MIGRATION.md](../docs/MIGRATION.md).
  Arquitectura actual: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
- Stack acordado: NestJS + TypeScript, Prisma + MySQL, Cloudinary para imágenes.
- El legado funciona aparte en Docker; no modificar sus archivos, volúmenes ni datos.
- Leer primero esta entrega y el estado de `tasks.md`. Node 24.22.2 y Prisma
  7.10.1; guía operativa en `DEVELOPMENT.md`. No confundir tablas creadas con
   aprobación clínica: consultas, mediciones y BMI tienen pruebas unitarias,
   HTTP e integraciones MySQL correctas; los rangos e interpretación clínicos
   permanecen fuera del alcance de la demo.
   Ver `AUTH.md`, `PATIENTS.md` y `CONSULTATIONS.md`.
