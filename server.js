/* 
   ARCHIVO: server.js (Raíz)
   Versión: 2.1 Full Stack BARRIO
*/
const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDatabase, getDb, saveDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// SISTEMA DE SEGURIDAD: Triple Llave
let ADMIN_PASSWORDS = ['barrio2025', 'admin2025', 'seguridad2025'];
const MASTER_RESET_KEY = 'BARRIO-RESET-2026-PUERTOMAS';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers de Base de Datos ---
function queryAll(sql, params = []) {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

function runSql(sql, params = []) {
  const db = getDb();
  db.run(sql, params);
  saveDb();
}

// --- Autenticación Administrativa ---
const adminTokens = new Set();
// Generamos un token persistente basado en las claves actuales
const getSessionToken = () => Buffer.from(ADMIN_PASSWORDS.join(':')).toString('base64');

function authMw(req, res, next) {
  const t = req.headers.authorization?.replace('Bearer ', '');
  if (!t) return res.status(401).json({ error: 'No autorizado' });
  
  // Validamos contra los tokens activos o el token maestro de la sesión
  if (adminTokens.has(t) || t === getSessionToken()) {
    return next();
  }
  res.status(401).json({ error: 'Sesión expirada' });
}

// ========== API PÚBLICA ==========

app.get('/api/config', (req, res) => {
  const rows = queryAll('SELECT * FROM configuracion');
  const config = {};
  rows.forEach(r => { config[r.clave] = r.valor; });
  res.json(config);
});

app.get('/api/locales/:id', (req, res) => {
  const local = queryOne('SELECT * FROM locales WHERE id = ?', [req.params.id]);
  if (!local) return res.status(404).json({ error: 'No encontrado' });
  local.productos = queryAll('SELECT * FROM productos WHERE local_id = ? ORDER BY nombre', [local.id]);
  res.json(local);
});

app.get('/api/muro', (req, res) => {
  res.json(queryAll(`
    SELECT m.*, COALESCE(u.nickname, u.nombre) as autor 
    FROM muro_comunitario m 
    JOIN usuarios u ON m.usuario_id = u.id 
    ORDER BY m.created_at DESC LIMIT 50
  `));
});

app.get('/api/mascotas', (req, res) => {
  res.json(queryAll('SELECT * FROM mascotas_perdidas ORDER BY created_at DESC'));
});

// ========== API ADMINISTRATIVA (Protegida) ==========

app.post('/api/admin/login', (req, res) => {
  const { passwords } = req.body;
  if (!Array.isArray(passwords) || passwords.length !== 3) {
    return res.status(400).json({ error: 'Se requieren las 3 llaves' });
  }
  const isValid = passwords.every((p, i) => p === ADMIN_PASSWORDS[i]);
  if (!isValid) return res.status(401).json({ error: 'Llaves incorrectas' });
  
  const token = getSessionToken();
  adminTokens.add(token);
  res.json({ token });
});

// DASHBOARD STATS
app.get('/api/admin/stats', authMw, (req, res) => {
  const visitas = queryOne('SELECT COUNT(*) as cnt FROM visitas')?.cnt || 0;
  const usuarios = queryOne('SELECT COUNT(*) as cnt FROM usuarios')?.cnt || 0;
  const mascotas = queryOne('SELECT COUNT(*) as cnt FROM mascotas_perdidas')?.cnt || 0;
  res.json({ totalVisitas: visitas, uniqueUsers: usuarios, totalMascotas: mascotas, topLocales: [] });
});

// GESTIÓN DE USUARIOS
app.get('/api/admin/usuarios', authMw, (req, res) => {
  res.json(queryAll('SELECT * FROM usuarios ORDER BY created_at DESC'));
});

app.put('/api/admin/usuarios/:id/verificar', authMw, (req, res) => {
  runSql('UPDATE usuarios SET is_verified = ? WHERE id = ?', [req.body.is_verified ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/admin/usuarios/:id', authMw, (req, res) => {
  runSql('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// GESTIÓN DE LOCALES Y PRODUCTOS
app.get('/api/admin/locales', authMw, (req, res) => res.json(queryAll('SELECT * FROM locales ORDER BY nombre')));

app.post('/api/admin/productos/masivo', authMw, (req, res) => {
  const { local_id, productos } = req.body;
  const db = getDb();
  db.run('DELETE FROM productos WHERE local_id = ?', [local_id]);
  const stmt = db.prepare('INSERT INTO productos (local_id,nombre,marca,precio,en_stock,unidad) VALUES (?,?,?,?,?,?)');
  productos.forEach(p => {
    stmt.run([local_id, p.nombre, p.marca || '', parseFloat(p.precio), 1, p.unidad || 'kg']);
  });
  stmt.free();
  saveDb();
  res.json({ ok: true });
});

// GESTIÓN DE MENSAJES (BUZÓN)
app.get('/api/admin/mensajes', authMw, (req, res) => {
  res.json(queryAll('SELECT m.*, u.nombre, u.telefono FROM mensajes_admin m JOIN usuarios u ON m.usuario_id = u.id ORDER BY m.created_at DESC'));
});

app.delete('/api/admin/mensajes/:id', authMw, (req, res) => {
  runSql('DELETE FROM mensajes_admin WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// GESTIÓN DE EMERGENCIAS Y RASTREO
app.get('/api/admin/emergencias', authMw, (req, res) => {
  res.json(queryAll('SELECT e.*, u.nombre, u.telefono FROM registro_emergencias e JOIN usuarios u ON e.usuario_id = u.id ORDER BY e.created_at DESC'));
});

app.get('/api/admin/rastreo', authMw, (req, res) => {
  res.json(queryAll('SELECT r.*, u.nombre, u.telefono FROM rastreo_robos r JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.created_at DESC'));
});

// CONFIGURACIÓN Y SEGURIDAD
app.put('/api/admin/config', authMw, (req, res) => {
  for (const [k, v] of Object.entries(req.body)) {
    runSql('UPDATE configuracion SET valor=? WHERE clave=?', [v, k]);
  }
  res.json({ ok: true });
});

app.put('/api/admin/passwords', authMw, (req, res) => {
  const { old_passwords, new_passwords } = req.body;
  if (old_passwords.every((p, i) => p === ADMIN_PASSWORDS[i])) {
    ADMIN_PASSWORDS = [...new_passwords];
    adminTokens.clear(); // Forzar re-login
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Claves actuales incorrectas' });
  }
});

// FALLBACK SPA
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`🚀 BARRIO Server activo en puerto ${PORT}`);
  });
}
start();