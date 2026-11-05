# Investigación del legado

## Alcance y límites

Inspección estática inicial del código propio PHP/JavaScript y de los bloques
`CREATE TABLE` de `ProyectoDietas/nutrilinedb.sql`; no se copiaron filas del respaldo.
Esto no es una auditoría exhaustiva ni valida clínicamente los cálculos.
Las rutas de esta sección son relativas a `/home/josealmz/proyects/ProyectoDietas`.

## Inventario de las 17 tablas

| Tabla antigua | Concepto observado | Destino propuesto |
| --- | --- | --- |
| `nutriologo` | Cuenta, rol, perfil y vencimiento mezclados; email como PK | `User`, `NutritionistProfile`, después `Subscription` |
| `paciente` | Identidad, contacto, resumen clínico, archivos y propietario | `Patient`, consultas y archivos separados |
| `consulta` | Evento de calendario con `start`, colores y estado | `Appointment` posterior, no `Consultation` clínica |
| `antropometria` | Mediciones por email y fecha | `AnthropometricAssessment` por consulta |
| `habitos` | Hábitos, preferencias y actividad física | `HabitAssessment` y actividades posteriores |
| `historialconsultas` | Fechas de consulta por paciente | Historial derivado de `Consultation` |
| `resultformulas` | Métodos, resultados e interpretaciones enviados por formulario | `CalculationResult` versionado |
| `quimicasanguinea` | Mediciones y textos interpretativos | `LabAssessment` posterior |
| `padecimientos` | Antecedentes personales/familiares | Modelo clínico posterior, requiere aclarar M/P/Pa |
| `somatotipopaciente` | Componentes y deporte seleccionado | Evaluación posterior |
| `deportes` | Deporte y referencias endo/meso/ecto/MET | Catálogo posterior |
| `deportsmets` | Actividades y MET | Catálogo posterior |
| `alimentos` | Nutrientes mayormente almacenados en `varchar` | `Food` y porciones/unidades posteriores |
| `platillos` | Nombre/código/imagen y composición serializada | `Recipe` + `RecipeIngredient` posteriores |
| `dietaconsulta` | Archivo por paciente y fecha | `DietPlan`/documento ligados por ID, posteriores |
| `notificacionenutri` | Avisos, estado y referencia a cita | `Notification` posterior |
| `recuperarpass` | Código y vencimiento | Tokens de recuperación con hash, posteriores |

## Flujos y fuentes comprobadas

| Flujo | Fuentes | Observación |
| --- | --- | --- |
| Login | `php/login.php`, `js/animaciones.js` | SHA-1, sesión PHP; devuelve rol, acceso y fecha de pago |
| Alta de cuenta | `php/NuevoUsuario.php` | Guarda identidad, rol y acceso en `nutriologo` |
| Alta clínica inicial | `php/nuevopaciente.php` | Mezcla paciente, carpetas, imagen, mediciones, hábitos y resultados |
| Consulta de seguimiento | `php/guardarConsulta.php` | Inserciones encadenadas sin transacción; vínculos por email/fecha |
| Historial | `php/historiaClinica1.php` a `5.php`, `js/historiaClinica.js` | Paciente, antropometría, hábitos, fórmulas y laboratorio en llamadas separadas |
| Calendario | `php/consultasNutriologo.php`, `js/fullCallMy.js` | Agenda futura; estado `2` al crear; edición/eliminación por ID |
| Inicio de atención | `Nutriologo/consultasusurio.php` | Cambia el evento de agenda a estado `1`; semántica completa pendiente |
| Cálculos | `js/formulas.js` | IMC, TMB, composición corporal y somatotipo se calculan en navegador |
| Platillos | `php/crearplatillo.php`, `js/crearPlatillo.js` | Composición se divide por `?` y comas, varias filas por código |
| Dietas | `php/guardarDietas.php`, `js/distribucionAli.js` | Guardado contiene SQL malformado; flujo no validado de extremo a extremo |
| Borrado de paciente | `php/eliminarPaciente.php` | Borrados múltiples sin transacción ni comprobación de propiedad en ese endpoint |
| Suscripción | `stripe/CreateCharch.php`, `Nutriologo/paginaPrincipalNutri.php` | Trimestre equivale a 90 días; `fechaPago` se usa como vencimiento |

## Riesgos que no deben replicarse

1. **Autorización incompleta:** `historiaClinica1.php`–`5.php` consultan identificadores
   enviados por el cliente sin comprobar propietario en esos archivos. Los redirects
   JavaScript no sustituyen controles de servidor.
2. **Inyección y credenciales:** `php/login.php` concatena entradas SQL y usa SHA-1.
   No copiar claves ni credenciales antiguas al repositorio nuevo.
3. **Registro clínico ambiguo:** fecha + email no identifican una consulta única.
   Dos atenciones en el mismo día pueden mezclarse al recuperar el historial.
4. **Escrituras parciales:** alta, seguimiento y borrado ejecutan varias operaciones
   sin transacción. El borrado considera éxito si alguna operación devuelve verdadero.
5. **Cintura/cadera intercambiadas:** las columnas `cintura, cadera` reciben
   `$caderP, $cinturaP` en `nuevopaciente.php` y `guardarConsulta.php`.
6. **IMC con huecos:** `js/formulas.js:1563–1601` no cubre exactamente 18.5 o 40,
   ni todos los intervalos decimales; invalidar datos no debe producir un cero normal.
7. **Fórmulas por validar:** TMB tiene ramas por edad/sexo y coeficientes diferentes
   según método. No presumir que son correctas por existir en el código.
8. **Archivos inseguros:** imágenes se guardan usando extensiones del cliente y
   nombres locales; no trasladar esa estrategia a Cloudinary.
9. **Múltiples tipos de paciente/cuenta:** existe `passPaciente` y redirección por
   rol `2`, pero el login revisado consulta `nutriologo`. Portal paciente no confirmado.

## Cálculos: estrategia de recuperación

- IMC observado: `pesoKg / (tallaCm / 100)^2`; presentación a dos decimales.
- Métodos TMB observados incluyen Mifflin-St Jeor, Schofield, Harris-Benedict
  y FAO/WHO/UNU. También aparecen métodos de grasa/densidad y somatotipo.
- Crear fixtures sintéticos y documentar unidades, población, fuente y precisión
  de cada fórmula antes de habilitarla. No preservar errores como comportamiento deseado.
- Separar pruebas de caracterización del legado de pruebas de la especificación corregida.
- En la primera entrega solo se propone IMC numérico; clasificación y demás métodos
  quedan bloqueados hasta aclarar alcance y referencias.

## Estado del repositorio nuevo en la inspección inicial (histórico)

`package.json`: NestJS 12, TypeScript 6, ESM, npm/package-lock, Vitest y Oxlint.
`src/` contiene únicamente el starter de controlador/servicio/módulo/bootstrap.
No se encontraron Prisma, configuración MySQL ni módulos de dominio.
Observe ya se inicializa en `app.module.ts` y `main.ts`, con placeholders si faltan
claves; no se comprobó su comportamiento ni la redacción de datos.
No se ejecutaron build, tests ni integraciones durante la fase documental inicial.
La base técnica posterior y sus verificaciones se registran en `tasks.md`.

## Investigación pendiente

- Revisar a fondo PDFs, dieta, porciones/nutrientes, laboratorios, antecedentes y
  algoritmos avanzados antes de especificar sus entregas.
- Confirmar campos mínimos clínicos, unidades, alcance por edad y políticas de acceso.
- Inventariar las pantallas PHP y definir el frontend moderno antes de crearlo.
  Aclaración del usuario (2026-11-05): no existe aún un frontend nuevo; la base
  Next.js/Firebase supuesta inicialmente no es un recurso disponible.
- Verificar Node local, compatibilidad Nest/Prisma y estrategia de Observe en dev/tests.
- Verificar licencia/procedencia del catálogo nutricional antes de usarlo en una demo pública.
