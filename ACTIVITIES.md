# Catálogo histórico de actividades

`GET /api/v1/activities?q=yoga&page=1&pageSize=10` requiere sesión de
nutriólogo. Busca por nombre y categoría sin distinguir acentos. Solo lectura;
`q` admite hasta 100 caracteres, `pageSize` entre 1 y 50.

Versión: `legacy-activities-822-v1`. Recuperado exclusivamente de `deportsmets`
en `ProyectoDietas/nutrilinedb.sql`: 822 IDs únicos, 21 categorías, MET de 0.95
a 23. Se conservan IDs, MET y textos históricos, incluidos nombres repetidos
y posibles erratas (por ejemplo, «Correr 225 km/h»). No se mezcla con `deportes`.
No se ha verificado la fuente bibliográfica, licencia ni validez clínica.

Reproducir desde el servidor:

```sh
node scripts/import-legacy-activities.mjs /ruta/ProyectoDietas/nutrilinedb.sql
```

El importador no ejecuta SQL, no accede a MySQL y no importa pacientes. Genera
un snapshot versionado y su SHA-256, expuesto en los metadatos del endpoint.
No requiere migraciones. El cliente copia nombre, MET y referencia histórica
a la fila editable; duración y unidad se capturan manualmente. Los cálculos
existentes no cambian y la selección no implica validación clínica.
