# Resumen del espacio clínico

`GET /api/v1/dashboard`, Bearer, exclusivamente NUTRITIONIST activo con perfil.
El propietario se obtiene de la sesión, nunca de parámetros del solicitante.
ADMIN y nutriólogos sin perfil reciben 403; sin sesión, 401.

Respuesta: `asOf` ISO UTC; `totals` con `activePatients`, `archivedPatients`,
`consultations`, `withoutConsultations`, `upcomingAppointments`;
`recentConsultations` y `upcomingAppointments`, listas de máximo cinco registros.

Los totales no tienen filtro temporal. Las consultas incluyen pacientes archivados;
sin primera consulta cuenta solo activos sin ninguna consulta persistida. Citas
futuras: inicio >= `asOf`, estado scheduled/confirmed; incluye pacientes archivados
para no ocultar compromisos pendientes. Citas atendidas/canceladas/noShow y citas
pasadas quedan fuera. Ningún estado de cita crea ni cuenta como consulta.

Consultas recientes: createdAt descendente e id descendente como desempate, sin
deduplicar pacientes. Se devuelven fecha clínica occurredAt y fecha de registro
createdAt, motivo e identidad mínima actual del paciente, no assessment, notas ni
resultados. No es auditoría de todas las acciones. Citas: startsAt e id ascendentes,
motivo, estado, fechas UTC, zona declarada y paciente mínimo. Las listas son
resúmenes acotados explícitos, no sustituyen historial ni calendario completo.

Todos los filtros incluyen nutritionistId. Conteos y listas usan una transacción
RepeatableRead; un error no devuelve un resumen parcial. Cache-Control no-store
según configuración global. Sin escrituras, migraciones ni cambios a datos previos.

Verificado con MySQL aislado nutriline_test: permisos, vacío, aislamiento entre
profesionales, archivados, consultas históricas por registro, límite de cinco y
separación de citas y consultas. Total actual: 59 integraciones, 148 unitarias y
32 HTTP e2e. Frontend: 307 pruebas; build y lint de ambos proyectos satisfactorios.
