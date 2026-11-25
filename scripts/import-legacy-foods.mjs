import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Importa exclusivamente alimentos; nunca ejecuta SQL ni lee otras tablas.
export function parseFoodRows(sql) {
  const definition = sql.match(
    /CREATE TABLE `alimentos` \(([\s\S]*?)\) ENGINE=/,
  )?.[1];
  const columns = [...(definition ?? '').matchAll(/^\s*`([^`]+)`/gm)].map(
    (match) => match[1],
  );
  if (columns.length !== 32 || columns[0] !== 'idAlimento')
    throw new Error('Estructura alimentos no reconocida');
  const rows = [];
  for (const block of sql.matchAll(
    /INSERT INTO `alimentos` VALUES ([\s\S]*?);/g,
  )) {
    let i = 0;
    const input = block[1];
    while (i < input.length) {
      if (input[i] !== '(') throw new Error('Tupla SQL inválida');
      i++;
      const row = [];
      while (true) {
        let value = '';
        if (input[i] === "'") {
          i++;
          let closed = false;
          while (i < input.length) {
            const char = input[i++];
            if (char === '\\') {
              const escaped = input[i++];
              value +=
                { n: '\n', r: '\r', t: '\t', 0: '\0' }[escaped] ?? escaped;
            } else if (char === "'") {
              if (input[i] === "'") {
                value += "'";
                i++;
              } else {
                closed = true;
                break;
              }
            } else value += char;
          }
          if (!closed) throw new Error('Cadena SQL sin cerrar');
        } else {
          while (i < input.length && ![',', ')'].includes(input[i]))
            value += input[i++];
          value = value.trim() === 'NULL' ? null : value.trim();
        }
        row.push(value);
        if (input[i] === ')') {
          i++;
          break;
        }
        if (input[i++] !== ',') throw new Error('Separador SQL inválido');
      }
      if (row.length !== columns.length)
        throw new Error('Número de columnas inválido');
      rows.push(
        Object.fromEntries(columns.map((key, index) => [key, row[index]])),
      );
      while (/\s/.test(input[i] ?? '') && i < input.length) i++;
      if (i < input.length && input[i++] !== ',')
        throw new Error('Separador de tuplas inválido');
    }
  }
  if (
    !rows.length ||
    new Set(rows.map((row) => row.idAlimento)).size !== rows.length
  )
    throw new Error('Catálogo vacío o IDs duplicados');
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2])
    throw new Error(
      'Uso: node scripts/import-legacy-foods.mjs /ruta/nutrilinedb.sql',
    );
  const sql = await readFile(process.argv[2], 'utf8');
  const rows = parseFoodRows(sql);
  const hash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const content = `// Generado con scripts/import-legacy-foods.mjs. No editar a mano.\n// Solo tabla alimentos; no contiene pacientes, cuentas ni platillos.\nexport const legacyFoodDigest = ${JSON.stringify(hash)};\nexport const legacyFoodRows: Record<string, string | null>[] = ${JSON.stringify(rows)};\n`;
  await writeFile(
    new URL('../src/modules/foods/legacy-foods.data.ts', import.meta.url),
    content,
  );
  console.log(`Importados ${rows.length} alimentos. SHA-256 de filas: ${hash}`);
}
