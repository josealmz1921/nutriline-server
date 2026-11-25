# Catálogo histórico de alimentos

Snapshot de solo lectura `legacy-foods-2176-v1`, recuperado exclusivamente de la
tabla `alimentos` de `ProyectoDietas/nutrilinedb.sql`: 2176 IDs únicos. No se
importan pacientes, credenciales, consultas, platillos ni otras tablas. No se
ejecuta el respaldo SQL ni se modifica la base existente.

## Regeneración y trazabilidad

```sh
node scripts/import-legacy-foods.mjs /ruta/ProyectoDietas/nutrilinedb.sql
node --test scripts/import-legacy-foods.test.mjs
```

El importador valida columnas e IDs únicos y genera
`src/modules/foods/legacy-foods.data.ts`. Conserva las 32 columnas originales
como cadenas o null, incluidas fracciones, pesos y nutrientes, sin interpretar
ni corregir sus valores. Digest SHA-256 de las filas JSON:
`a1dc678cace70ba1c0101e6797a707d257069af00285f4b9fc9b4fd717663b82`.

La procedencia/licencia original y la validez clínica siguen pendientes. No
publicar el catálogo como fuente validada ni usar sus nutrientes para cálculos
clínicos. La versión histórica de seis alimentos de consultas/R24 no se modifica.
Si se revisa el catálogo, publicar una versión nueva, no sobrescribir esta.

## API

`GET /api/v1/foods?q=manzana&page=1&pageSize=20` exige nutriólogo autenticado;
ADMIN no hereda acceso. Búsqueda por palabras sin distinguir acentos ni
mayúsculas; máximo 100 caracteres y 50 resultados por página. No hay escrituras.

Devuelve ID, nombre, cantidad decimal original, fracción original, unidad, grupo
y `usableReference`, junto con total, versión, origen, digest y advertencia.
No expone nutrientes como valores clínicamente validados. Dos cantidades son
`i` y trece unidades son `9`: se conservan pero no se usan para autocompletar.
La interfaz requiere completar manualmente cantidad y unidad de esas referencias.
No se realizan conversiones de unidades ni inferencias de porciones.

## Ingredientes en menús

El cliente busca y agrega ingredientes dentro de cada preparación; guarda
instantáneas de `catalogId`, `catalogVersion`, `name`, `quantity` y `unit`.
Nombre/ID/versión deben corresponder al catálogo; cantidad y unidad son
editables. Hasta 50 ingredientes por preparación, dentro del límite de 80 KB
del menú. Los ingredientes no modifican automáticamente la porción total de la
preparación ni sus nutrientes. Se incluyen en el detalle y el PDF de la revisión.

Estas capturas usan `schemaVersion: 3`. Se mantienen las versiones 1 y 2 para
lectura y escritura histórica. No se requiere migración de tablas (captura JSON).
Actualizar el servidor antes del cliente. Si la búsqueda falla o no hay sesión,
se conserva la captura manual; no se usan fixtures como fallback de producción.
