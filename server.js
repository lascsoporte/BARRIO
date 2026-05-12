// Server - BARRIO 2026 (Versión Ultra-Estable)
const express = require('express');
const path = require('path');
const cors = require('cors');
const https = require('https');
const { initDatabase, cleanupMascotas, cleanupReportes, isUsingMysql, ...dbHelper } = require('./database');
const nodemailer = require('nodemailer');
const webpush = require('web-push');

// Claves VAPID
const publicVapidKey = 'BPfYyug0EiK_oS0FRF8w-k2WpxoDs79-DZjjFI505RsAeUrzi5e88XPgsj8Pp2YV6pZfMtnb-IXiYN8tJ9mgrFc';
const privateVapidKey = 'U1cp2rbRx71On29mhZ9N6cTn-hBs74iLq6K_Nx16mh4';
webpush.setVapidDetails('mailto:contacto@puertomas.cl', publicVapidKey, privateVapidKey);

const app = express();
const PORT = process.env.PORT || 3000;
let ADMIN_PASSWORDS = ['barrio2025', 'admin2025', 'seguridad2025'];

// Genera un token que NO cambia aunque el servidor se reinicie (basado en las claves)
const getPersistentToken = () => Buffer.from(ADMIN_PASSWORDS.join(':')).toString('base64');

async function loadPasswords() {
  try {
    const p1 = await dbHelper.queryOne("SELECT valor FROM configuracion WHERE clave = 'admin_pass1'");
    const p2 = await dbHelper.queryOne("SELECT valor FROM configuracion WHERE clave = 'admin_pass2'");
    const p3 = await dbHelper.queryOne("SELECT valor FROM configuracion WHERE clave = 'admin_pass3'");
    if (p1 && p2 && p3) {
      ADMIN_PASSWORDS = [p1.valor, p2.valor, p3.valor];
      console.log('Claves administrativas cargadas:', ADMIN_PASSWORDS);
    }
  } catch(e) { console.error('Error cargando claves:', e); }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Notificaciones Telegram
let TELEGRAM_TOKEN = '8788499800:AAF0Lcc7HbVJcB-DB6dxFpxaksixNxngqds'; 
let TELEGRAM_CHAT_ID = '2007857065'; 

function sendTelegramAlert(message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  const data = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' });
  const options = {
    hostname: 'api.telegram.org', port: 445, 
    path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
  };
  const req = https.request(options).on('error', (e) => console.error('Telegram Error:', e));
  req.write(data); req.end();
}

async function queryAll(sql, params = []) { try { return await dbHelper.queryAll(sql, params); } catch(e) { return []; } }
async function queryOne(sql, params = []) { try { return await dbHelper.queryOne(sql, params); } catch(e) { return null; } }
async function runSql(sql, params = []) { try { return await dbHelper.runSql(sql, params); } catch(e) { return null; } }

// Middleware de Seguridad (Fix 401)
function authMw(req, res, next) {
  const t = req.headers.authorization?.replace('Bearer ', '');
  if (!t) return res.status(401).json({ error: 'No autorizado' });
  
  if (t === getPersistentToken()) {
    return next();
  }
  res.status(401).json({ error: 'Sesión expirada o no autorizada' });
}

// ========== RUTAS PÚBLICAS ==========

app.get('/api/config', async (req, res) => {
  const rows = await queryAll('SELECT * FROM configuracion');
  const c = {}; rows.forEach(r => c[r.clave] = r.valor); 
  res.json(c);
});

app.get('/api/locales/:id', async (req, res) => {
  const l = await queryOne('SELECT * FROM locales WHERE id = ?', [req.params.id]);
  if (!l) return res.status(404).json({ error: 'No encontrado' });
  l.productos = await queryAll('SELECT * FROM productos WHERE local_id = ?', [l.id]);
  res.json(l);
});

// ========== RUTAS ADMIN ==========

app.post('/api/admin/login', (req, res) => {
  const { passwords } = req.body;
  if (!passwords || !Array.isArray(passwords)) return res.status(400).json({ error: 'Formato incorrecto' });

  if (passwords.every((p, i) => p === ADMIN_PASSWORDS[i])) {
    const token = getPersistentToken();
    sendTelegramAlert(`🔐 <b>ADMIN: SESIÓN INICIADA</b>\nAcceso exitoso al panel desde el navegador.`);
    res.json({ token });
  } else {
    sendTelegramAlert(`⚠️ <b>ADMIN: FALLO DE ACCESO</b>\nIntento de login con llaves INCORRECTAS.`);
    res.status(401).json({ error: 'Llaves incorrectas' });
  }
});

app.get('/api/admin/locales', authMw, async (req, res) => res.json(await queryAll('SELECT * FROM locales ORDER BY nombre')));
app.get('/api/admin/productos', authMw, async (req, res) => res.json(await queryAll('SELECT p.*, l.nombre as local_nombre FROM productos p JOIN locales l ON p.local_id = l.id')));
app.get('/api/admin/usuarios', authMw, async (req, res) => res.json(await queryAll('SELECT * FROM usuarios ORDER BY created_at DESC')));
app.get('/api/admin/reportes', authMw, async (req, res) => res.json(await queryAll('SELECT * FROM reportes_ciudadanos r LEFT JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.created_at DESC')));
app.get('/api/admin/stats', authMw, async (req, res) => {
  const u = await queryOne('SELECT COUNT(*) as count FROM usuarios');
  const m = await queryOne('SELECT COUNT(*) as count FROM mascotas_perdidas');
  res.json({ totalVisitas: 0, uniqueUsers: u?.count || 0, visitasHoy: 0, totalMascotas: m?.count || 0, topLocales: [] });
});

// SPA Fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function start() {
  try {
    // Escuchar el puerto de inmediato para evitar Error 502 en Render
    app.listen(PORT, '0.0.0.0', async () => {
      console.log(`Servidor activo en el puerto ${PORT}`);
      
      // Intentar conectar a la DB después de que el puerto ya está abierto
      try {
        await initDatabase();
        await loadPasswords();
        sendTelegramAlert(`🚀 <b>SISTEMA BARRIO CONECTADO</b>\nEl servidor está online y la base de datos lista.`);
      } catch (dbErr) {
        console.error("Error de Base de Datos:", dbErr);
        sendTelegramAlert(`🚨 <b>PROBLEMA DE BASE DE DATOS</b>\nEl servidor está vivo pero no puede conectar a la DB.`);
      }
    });

  } catch (e) {
    console.error("FAIL START:", e);
    // En Render, si el proceso muere muy rápido da 502
    setTimeout(() => { process.exit(1); }, 1000); 
  }
}

start();