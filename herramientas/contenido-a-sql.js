// Convierte el menú de un restaurante (archivo con el formato de data.js) en el SQL que lo carga a Supabase.
// Uso:  node herramientas/contenido-a-sql.js <archivo-del-menu.js> <org_id> > cargar.sql
// Luego pega cargar.sql en Supabase → SQL Editor. El menú del cliente nunca se sube a este repositorio.
const fs = require("fs");
const vm = require("vm");

const [file, orgId] = process.argv.slice(2);
if (!file || !/^[0-9a-f-]{36}$/i.test(orgId || "")) {
  console.error("Uso: node herramientas/contenido-a-sql.js <archivo-del-menu.js> <org_id>");
  process.exit(1);
}
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
const menu = sandbox.window.MENU;
if (!menu || !Array.isArray(menu.items) || !Array.isArray(menu.stages)) {
  console.error("El archivo no define window.MENU con stages e items.");
  process.exit(1);
}
const json = JSON.stringify(menu);
const tag = "$menu$";
if (json.includes(tag)) { console.error("El menú contiene el texto $menu$; cámbialo antes de cargarlo."); process.exit(1); }
console.log(`-- ${menu.items.length} platillos y bebidas, ${menu.stages.length} etapas`);
console.log(`insert into contenido (org_id, menu) values ('${orgId}', ${tag}${json}${tag}::jsonb)`);
console.log("on conflict (org_id) do update set menu = excluded.menu, actualizado = now();");
