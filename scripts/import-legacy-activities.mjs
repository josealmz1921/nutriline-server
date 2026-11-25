import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Exclusivamente deportsmets; no ejecuta SQL ni importa datos de pacientes.
export function parseActivityRows(sql) {
  const columns = [
    ...(
      sql.match(/CREATE TABLE `deportsmets` \(([\s\S]*?)\) ENGINE=/)?.[1] ?? ''
    ).matchAll(/^\s*`([^`]+)`/gm),
  ].map((m) => m[1]);
  if (
    columns.join(',') !== 'id_deporteMets,Met,categoriaMets,actividadEspecifica'
  )
    throw new Error('Estructura deportsmets no reconocida');
  const rows = [];
  const quoted = "'((?:[^'\\\\]|\\\\.|'')*)'";
  const tuple = new RegExp(
    '\\((\\d+),([0-9.eE+-]+),' + quoted + ',' + quoted + '\\)',
    'gy',
  );
  const decode = (text) =>
    text
      .replace(/''/g, "'")
      .replace(
        /\\([\s\S])/g,
        (_, c) => ({ n: '\n', r: '\r', t: '\t', 0: '\0' })[c] ?? c,
      );
  for (const block of sql.matchAll(
    /INSERT INTO `deportsmets` VALUES ([\s\S]*?);\s*(?:\n|$)/g,
  )) {
    let offset = 0;
    while (offset < block[1].length) {
      tuple.lastIndex = offset;
      const match = tuple.exec(block[1]);
      if (!match || !Number.isFinite(Number(match[2])) || Number(match[2]) <= 0)
        throw new Error('Tupla de actividad inválida');
      rows.push({
        id: match[1],
        met: match[2],
        category: decode(match[3]),
        name: decode(match[4]),
      });
      offset = tuple.lastIndex;
      if (offset < block[1].length && block[1][offset++] !== ',')
        throw new Error('Separador inválido');
    }
  }
  if (
    !rows.length ||
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    rows.some((row) => !row.name.trim() || !row.category.trim())
  )
    throw new Error('Catálogo vacío, incompleto o IDs duplicados');
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2])
    throw new Error(
      'Uso: node scripts/import-legacy-activities.mjs /ruta/nutrilinedb.sql',
    );
  const rows = parseActivityRows(await readFile(process.argv[2], 'utf8'));
  if (rows.length !== 822)
    throw new Error('Se esperaban 822 actividades históricas');
  const digest = createHash('sha256')
    .update(JSON.stringify(rows))
    .digest('hex');
  await writeFile(
    new URL(
      '../src/modules/activities/legacy-activities.data.ts',
      import.meta.url,
    ),
    `// Generado por scripts/import-legacy-activities.mjs. Solo deportsmets; sin datos de pacientes.\nexport const legacyActivityDigest = ${JSON.stringify(digest)};\nexport const legacyActivityRows: { id: string; met: string; category: string; name: string }[] = ${JSON.stringify(rows)};\n`,
  );
  console.log(`Importadas ${rows.length} actividades. SHA-256: ${digest}`);
}
