import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFoodRows } from './import-legacy-foods.mjs';

const columns = [
  'idAlimento',
  ...Array.from({ length: 31 }, (_, i) => `column${i}`),
];
const definition = `CREATE TABLE \`alimentos\` (\n${columns.map((key) => `  \`${key}\` varchar(50)`).join(',\n')}\n) ENGINE=InnoDB;`;
test('analiza SQL como texto, conserva comas y comillas y solo extrae alimentos', () => {
  const row = `(1,'Pan, \\'especial\\'',${Array(30).fill("'0'").join(',')})`;
  const sql = `${definition}\nINSERT INTO \`paciente\` VALUES (1,'No importar');\nINSERT INTO \`alimentos\` VALUES ${row};`;
  const parsed = parseFoodRows(sql);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].column0, "Pan, 'especial'");
  assert.equal(Object.keys(parsed[0]).length, 32);
});
test('rechaza IDs duplicados y filas incompletas', () => {
  const row = `(1,${Array(31).fill("'0'").join(',')})`;
  assert.throws(
    () =>
      parseFoodRows(
        `${definition}\nINSERT INTO \`alimentos\` VALUES ${row},${row};`,
      ),
    /duplicados/,
  );
  assert.throws(
    () =>
      parseFoodRows(
        `${definition}\nINSERT INTO \`alimentos\` VALUES (1,'incompleto');`,
      ),
    /columnas/,
  );
});
