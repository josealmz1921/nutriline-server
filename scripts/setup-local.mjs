import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';

// Deriva la conexión sin mostrar ni cambiar credenciales de la configuración Docker.
const root = new URL('../', import.meta.url);
const values = parse(await readFile(new URL('.env', root)));
if (values.NODE_ENV !== 'development') {
  throw new Error('Esta configuración solo se permite con NODE_ENV=development.');
}
const url = new URL(values.DATABASE_URL);
if (url.protocol !== 'mysql:' || url.hostname !== 'db') {
  throw new Error('Se esperaba una conexión MySQL al servicio Docker db. No se cambió nada.');
}
url.hostname = '127.0.0.1';
url.port = '3307';
await writeFile(
  new URL('.env.local', root),
  `# Conexión local a MySQL en Docker. No compartir ni versionar.\nDATABASE_URL=${JSON.stringify(url.toString())}\n`,
  { flag: 'wx', mode: 0o600 },
);
console.log('Creado .env.local para 127.0.0.1:3307, sin sobrescribir archivos ni credenciales.');
