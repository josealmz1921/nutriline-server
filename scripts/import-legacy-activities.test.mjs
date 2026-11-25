import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseActivityRows } from './import-legacy-activities.mjs';

const definition =
  'CREATE TABLE `deportsmets` (\n`id_deporteMets` int,\n`Met` double,\n`categoriaMets` text,\n`actividadEspecifica` text\n) ENGINE=InnoDB;\n';
test('importa solo actividades y preserva escapes e IDs distintos con nombres iguales', () => {
  const rows = parseActivityRows(
    definition +
      "INSERT INTO `paciente` VALUES (1,'privado');\nINSERT INTO `deportsmets` VALUES (1,2.5,'Categoría','Caminar, \\'suave\\''),(2,3,'Categoría','Caminar, \\'suave\\'');\n",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Caminar, 'suave'");
  assert.equal(rows[0].met, '2.5');
});
test('rechaza estructuras desconocidas, MET inválido, filas parciales e IDs duplicados', () => {
  for (const sql of [
    '',
    definition,
    definition + "INSERT INTO `deportsmets` VALUES (1,0,'a','b');\n",
    definition +
      "INSERT INTO `deportsmets` VALUES (1,2,'a','b'),(1,3,'a','b');\n",
    definition + "INSERT INTO `deportsmets` VALUES (1,2,'a');\n",
  ])
    assert.throws(() => parseActivityRows(sql));
});
