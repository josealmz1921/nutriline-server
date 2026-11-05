# Consultas clínicas — demo

Base `/api/v1`. Requieren Bearer y rol `NUTRITIONIST` activo con perfil.
ADMIN no tiene acceso clínico. Sesiones: [AUTH.md](AUTH.md).

| Método | Ruta | Resultado |
| --- | --- | --- |
| POST | `/patients/:patientId/consultations` | 201, consulta + mediciones + BMI v1 |
| GET | `/patients/:patientId/consultations` | 200, historial paginado propio |
| GET | `/consultations/:consultationId` | 200, agregado propio por UUID |

IDs ajenos e inexistentes responden 404. No hay edición ni borrado de consultas.
El archivo del paciente conserva la lectura del historial y bloquea creación con
409. Creación y archivo comparten bloqueo de fila por paciente/propietario.

## Crear

```json
{
  "occurredAt": "2026-01-01T12:00:00Z",
  "reason": "Evaluación ficticia",
  "notes": null,
  "anthropometry": {
    "measuredAt": "2026-01-01T11:00:00Z",
    "weightKg": "70.000",
    "heightCm": "175.000",
    "waistCm": "80.000",
    "hipCm": "95.000"
  }
}
```

- Requeridos: atención, motivo, medición, peso y talla. Motivo: 1–500 caracteres;
  notas opcionales/anulables: 1–10 000. Textos recortados; vacíos rechazados.
- Medidas como **strings**, positivas, máximo `99999.999`, hasta tres decimales;
  sin exponentes, comas, espacios ni coerción de números. Cintura/cadera pueden
  omitirse o ser null; ausencia nunca significa cero.
- Son límites técnicos de DECIMAL(8,3), **no rangos clínicos plausibles**.
- Instantes ISO con `Z` u offset, segundos enteros o exactamente tres decimales;
  se responden en UTC. Desde el nacimiento (00:00 UTC), no futuros; la medición
  no puede ser posterior a la atención. Regla conservadora de demo, no una
  política clínica validada; revisar antes de uso real.
- No se impone rango de edad ni se devuelve clasificación clínica/pediátrica.
- Campos desconocidos, propietario, IDs o `bmi` enviados por el cliente dan 400.

El servidor calcula `pesoKg / (tallaCm / 100)^2` con aritmética decimal. Guarda
BMI versión 1, entradas normalizadas y resultado con seis decimales; presenta
dos decimales (half-up). `70/175` produce `22.86`. Resultados que redondean a cero
o exceden DECIMAL(12,6) se rechazan con 400, sin truncamiento SQL.

Respuesta: `id`, `patientId`, `occurredAt`, `reason`, `notes`, `createdAt`,
`anthropometry` y `calculations`. Medidas con tres decimales; cálculo incluye
`methodCode`, `methodVersion`, `value`, `unit`, `calculatedAt`. No devuelve perfil
del propietario, notas de otras consultas, hashes ni inputs internos del cálculo.
La antropometría puede ser null en registros incompletos creados directamente
en DB; la nueva ruta siempre exige y crea mediciones y cálculo.

## Historial y verificación

`?page=1&pageSize=20`: máximo 1 000 000 páginas y 100 elementos por página.
Solo admite esos parámetros, sin repetidos/arrays; orden `occurredAt DESC, id DESC`.
Datos y total comparten snapshot. Dos consultas del mismo día mantienen IDs distintos.

Build, lint, tipos, unitarias y e2e HTTP con servicios sustituidos se verifican
localmente. Las nuevas pruebas MySQL están en `test/patients.integration-spec.ts`:
aislamiento, precisión, historial, archivo/creación concurrentes y rollback ante
fallo inyectado después de las escrituras reales y antes del commit. No requiere
triggers ni permisos elevados. Verificación 2026-11-05: 97 unitarias, 23 e2e HTTP
y 26 integraciones MySQL correctas; migración aplicada sobre DB de pruebas vacía.
Build, lint y tipos también correctos. La base temporal se detuvo al finalizar.

```sh
docker compose --profile test run --build --rm test
docker compose --profile test stop db-test
```

No utiliza el dump ni la base del PHP. No desplegar para uso clínico real.
