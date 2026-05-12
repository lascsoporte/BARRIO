const fs = require('fs');
const path = 'public/js/admin.js';
let c = fs.readFileSync(path, 'utf8');
c = c.replace(/\$\{u\.nombre\} \$\{u\.is_verified \? '✅' : '⏳'\}/g, '${u.nombre} <span style="font-size:0.9rem; color:#666;">(@${u.nickname || "sin-nick"})</span> ${u.is_verified ? "✅" : "⏳"}');
// Eliminar los setTimeouts mal pegados
c = c.replace(/setTimeout\(\(\) => \{\r?\n\s+const btn = document\.getElementById\('dlMascotas'\);\r?\n\s+if\(btn\) btn\.onclick = \(\) => Admin\.downloadCSV\(window\._tempMascotas, 'mascotas_barrio\.xlsx'\);\r?\n\s+\}, 100\);/g, '');
// Cambiar nombre de archivo exportado
c = c.replace(/usuarios_barrio\.csv/g, 'usuarios_registrados.xlsx');
fs.writeFileSync(path, c, 'utf8');
console.log('Fix applied');
