const express = require('express');
const path = require('path');
const cors = require('cors');
const https = require('https');
const { initDatabase, cleanupMascotas, cleanupReportes, isUsingMysql, ...dbHelper } = require('./database');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
let ADMIN_PASSWORDS = ['barrio2025', 'admin2025', 'seguridad2025'];
const DEFAULT_PASSWORDS = ['barrio2025', 'admin2025', 'seguridad2025'];
const MASTER_RESET_KEY = 'BARRIO-RESET-2026-PUERTOMAS';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let TELEGRAM_TOKEN = '8788499800:AAF0Lcc7HbVJcB-DB6dxFpxaksixNxngqds'; 
let TELEGRAM_CHAT_ID = '2007857065'; 

function sendTelegramAlert(message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const data = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' });
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } };
  const req = https.request(url, options);
  req.on('error', (e) => console.error('Telegram Error:', e));
  req.write(data);
  req.end();
}

const mailTransporter = nodemailer.createTransport({
  host: 'mail.puertomas.cl', port: 465, secure: true,
  auth: { user: 'contacto@puertomas.cl', pass: 'TU_PASSWORD_AQUI' }
});

function sendEmailPin(to, nickname, pin) {
  const mailOptions = {
    from: '"BARRIO Seguridad" <no-reply@puertomas.cl>', to,
    subject: 'Tu PIN de Seguridad - BARRIO',
    html: `<h2>Hola ${nickname}!</h2><p>Tu PIN es: <b>${pin}</b></p>`
  };
  mailTransporter.sendMail(mailOptions).catch(e => console.error('Mail Error:', e));
}

async function queryAll(sql, params = []) { return await dbHelper.queryAll(sql, params); }
async function queryOne(sql, params = []) { return await dbHelper.queryOne(sql, params); }
async function runSql(sql, params = []) { return await dbHelper.runSql(sql, params); }

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isLocalOpen(ha, hc, dias) {
  const now = new Date(); const day = now.getDay(); const ct = now.toTimeString().slice(0, 5);
  let od = (dias === 'lun-dom') ? [0,1,2,3,4,5,6] : (dias === 'lun-vie' ? [1,2,3,4,5] : [1,2,3,4,5,6]);
  return od.includes(day) && ct >= ha && ct <= hc;
}

const adminTokens = new Set();
function authMw(req, res, next) {
  const t = req.headers.authorization?.replace('Bearer ', '');
  if (!t || !adminTokens.has(t)) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// PUBLIC API
app.get('/api/productos/buscar', async (req, res) => {
  const { q, lat, lng, radio = 1 } = req.query;
  let rows = await queryAll(`SELECT p.*, l.nombre as local_nombre, l.direccion, l.horario_apertura, l.horario_cierre, l.dias_atencion, l.latitud, l.longitud FROM productos p JOIN locales l ON p.local_id = l.id WHERE LOWER(p.nombre) LIKE LOWER(?)`, [`%${q}%`]);
  if (lat && lng) {
    rows = rows.map(r => ({ ...r, distancia: Math.round(haversineDistance(parseFloat(lat), parseFloat(lng), r.latitud, r.longitud) * 1000) }))
               .filter(r => r.distancia <= parseFloat(radio) * 1000);
  }
  res.json(rows.map(r => ({ ...r, abierto: isLocalOpen(r.horario_apertura, r.horario_cierre, r.dias_atencion) })));
});

app.get('/api/locales/:id', async (req, res) => {
  const l = await queryOne('SELECT * FROM locales WHERE id = ?', [req.params.id]);
  if (!l) return res.status(404).json({ error: 'No encontrado' });
  l.productos = await queryAll('SELECT * FROM productos WHERE local_id = ?', [l.id]);
  res.json(l);
});

app.get('/api/config', async (req, res) => {
  const rows = await queryAll('SELECT * FROM configuracion');
  const c = {}; rows.forEach(r => c[r.clave] = r.valor); res.json(c);
});

app.get('/api/servicios/buscar', async (req, res) => {
  const { q, lat, lng, radio = 1 } = req.query;
  let rows = await queryAll(`SELECT * FROM servicios WHERE LOWER(tipo) LIKE LOWER(?) OR LOWER(nombre_prestador) LIKE LOWER(?)`, [`%${q}%`, `%${q}%`]);
  if (lat && lng) {
    rows = rows.map(s => ({ ...s, distancia: Math.round(haversineDistance(parseFloat(lat), parseFloat(lng), s.latitud, s.longitud) * 1000) }))
               .filter(s => s.distancia <= parseFloat(radio) * 1000);
  }
  res.json(rows);
});

app.get('/api/servicios/tipos', async (req, res) => {
  const rows = await queryAll('SELECT DISTINCT tipo FROM servicios');
  res.json(rows.map(r => r.tipo));
});

app.get('/api/reportes', async (req, res) => {
  const sql = isUsingMysql() 
    ? `SELECT r.*, COALESCE(u.nickname, u.nombre) as autor_nick FROM reportes_ciudadanos r LEFT JOIN usuarios u ON r.usuario_id = u.id WHERE r.fecha_expiracion > NOW() OR r.fecha_expiracion IS NULL ORDER BY r.created_at DESC`
    : `SELECT r.*, COALESCE(u.nickname, u.nombre) as autor_nick FROM reportes_ciudadanos r LEFT JOIN usuarios u ON r.usuario_id = u.id WHERE r.fecha_expiracion > datetime('now') OR r.fecha_expiracion IS NULL ORDER BY r.created_at DESC`;
  res.json(await queryAll(sql));
});

app.post('/api/reportes', async (req, res) => {
  const { usuario_id, nombre_contacto, telefono, tipo_reporte, detalles, latitud, longitud, duracion_horas } = req.body;
  const user = usuario_id ? await queryOne('SELECT nickname, nombre FROM usuarios WHERE id = ?', [usuario_id]) : null;
  const exp = new Date(Date.now() + (parseInt(duracion_horas)||24)*3600000).toISOString().slice(0,19).replace('T',' ');
  await runSql('INSERT INTO reportes_ciudadanos (usuario_id, nombre_contacto, telefono, tipo_reporte, detalles, latitud, longitud, fecha_expiracion) VALUES (?,?,?,?,?,?,?,?)', [usuario_id||null, nombre_contacto, telefono, tipo_reporte, detalles||'', latitud, longitud, exp]);
  sendTelegramAlert(`📢 <b>NUEVO REPORTE</b>\nTipo: ${tipo_reporte}\nPor: ${user?.nickname || user?.nombre || nombre_contacto}\nDetalles: ${detalles}`);
  res.json({ ok: true });
});

app.post('/api/registro', async (req, res) => {
  const { nombre, telefono, email, nickname, pin_seguridad, device_id } = req.body;
  let user = await queryOne('SELECT * FROM usuarios WHERE telefono = ?', [telefono]);
  if (!user) {
    const r = await runSql('INSERT INTO usuarios (nombre, telefono, email, nickname, pin_seguridad, device_id) VALUES (?,?,?,?,?,?)', [nombre, telefono, email||'', nickname||'', pin_seguridad||'', device_id||'']);
    user = await queryOne('SELECT * FROM usuarios WHERE id = ?', [r.insertId]);
    sendTelegramAlert(`🆕 <b>NUEVO REGISTRO</b>\nNombre: ${nombre}\nNick: ${nickname}\nTel: ${telefono}`);
    if (email && pin_seguridad) sendEmailPin(email, nickname||nombre, pin_seguridad);
  } else {
    await runSql('UPDATE usuarios SET nombre=?, email=?, nickname=?, pin_seguridad=? WHERE id=?', [nombre, email||user.email, nickname||user.nickname, pin_seguridad||user.pin_seguridad, user.id]);
    user = { ...user, nombre, email, nickname, pin_seguridad };
    sendTelegramAlert(`🔄 <b>PERFIL ACTUALIZADO</b>\nUsuario: ${nickname || nombre}`);
  }
  res.json({ user });
});

app.get('/api/verificar-usuario/:id', async (req, res) => {
  const u = await queryOne('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'No encontrado' });
  res.json(u);
});

app.get('/api/muro', async (req, res) => {
  res.json(await queryAll('SELECT m.*, COALESCE(u.nickname, u.nombre) as autor FROM muro_comunitario m JOIN usuarios u ON m.usuario_id = u.id ORDER BY m.created_at DESC LIMIT 50'));
});

app.get('/api/mascotas', async (req, res) => {
  res.json(await queryAll('SELECT * FROM mascotas_perdidas ORDER BY created_at DESC'));
});

app.post('/api/mascotas', async (req, res) => {
  const { nombre_mascota, tipo_animal, nombre_contacto, telefono, ubicacion_extravio, caracteristicas, foto_base64 } = req.body;
  await runSql('INSERT INTO mascotas_perdidas (nombre_mascota, tipo_animal, nombre_contacto, telefono, ubicacion_extravio, caracteristicas, foto_base64) VALUES (?,?,?,?,?,?,?)', [nombre_mascota, tipo_animal, nombre_contacto, telefono, ubicacion_extravio, caracteristicas, foto_base64]);
  sendTelegramAlert(`🐶 <b>MASCOTA PERDIDA</b>\nNombre: ${nombre_mascota}\nContacto: ${nombre_contacto}\nLugar: ${ubicacion_extravio}`);
  res.json({ ok: true });
});

app.post('/api/muro', async (req, res) => {
  const { usuario_id, contenido } = req.body;
  const user = await queryOne('SELECT nickname, nombre, is_stolen FROM usuarios WHERE id = ?', [usuario_id]);
  await runSql('INSERT INTO muro_comunitario (usuario_id, contenido) VALUES (?,?)', [usuario_id, contenido]);
  if (user?.is_stolen) {
    sendTelegramAlert(`🚨 <b>EXTRAVÍO DETECTADO (MURO)</b>\nUsuario: ${user.nickname || user.nombre}\nContenido: ${contenido}`);
  } else {
    sendTelegramAlert(`💬 <b>NUEVO POST</b>\nAutor: ${user?.nickname || user?.nombre}\nMsg: ${contenido}`);
  }
  res.json({ ok: true });
});

app.post('/api/ping', async (req, res) => {
  const { device_id } = req.body;
  await runSql('INSERT INTO visitas (device_id) VALUES (?)', [device_id]);
  const u = await queryOne('SELECT is_stolen, nickname, nombre FROM usuarios WHERE device_id = ?', [device_id]);
  if (u?.is_stolen) sendTelegramAlert(`🕵️ <b>VIGILANCIA EXTRAVÍO</b>\nDispositivo detectado: ${u.nickname || u.nombre}`);
  res.json({ status: u?.is_stolen ? 'stolen' : 'ok' });
});

app.post('/api/stolen-location', async (req, res) => {
  const { device_id, latitud, longitud } = req.body;
  const u = await queryOne('SELECT id, nickname, nombre FROM usuarios WHERE device_id = ?', [device_id]);
  if (u) {
    await runSql('INSERT INTO rastreo_robos (usuario_id, latitud, longitud) VALUES (?,?,?)', [u.id, latitud, longitud]);
    sendTelegramAlert(`📍 <b>UBICACIÓN EXTRAVÍO</b>\nUsuario: ${u.nickname || u.nombre}\nLat: ${latitud}, Lng: ${longitud}`);
  }
  res.json({ ok: true });
});

app.post('/api/reportar-extravio', async (req, res) => {
  const { reported_phone, pin } = req.body;
  const u = await queryOne('SELECT id, nickname, nombre FROM usuarios WHERE telefono = ? AND pin_seguridad = ?', [reported_phone, pin]);
  if (!u) {
    sendTelegramAlert(`⚠️ <b>FALLO REPORTE EXTRAVÍO</b>\nIntento para: ${reported_phone} (PIN Incorrecto)`);
    return res.status(403).json({ error: 'PIN incorrecto' });
  }
  await runSql('UPDATE usuarios SET is_stolen = 1 WHERE id = ?', [u.id]);
  sendTelegramAlert(`🚨 <b>EXTREMA: EXTRAVÍO CONFIRMADO</b>\nTeléfono: ${reported_phone}\nUsuario: ${u.nickname || u.nombre}`);
  res.json({ success: true });
});

app.post('/api/emergencia', async (req, res) => {
  const { usuario_id, institucion, latitud, longitud } = req.body;
  const user = await queryOne('SELECT nickname, nombre, telefono FROM usuarios WHERE id = ?', [usuario_id]);
  await runSql('INSERT INTO registro_emergencias (usuario_id, institucion, latitud, longitud) VALUES (?,?,?,?)', [usuario_id, institucion, latitud, longitud]);
  sendTelegramAlert(`🚨 <b>EMERGENCIA ACTIVADA</b>\nInstitución: ${institucion}\nVecino: ${user?.nickname || user?.nombre}\nTel: ${user?.telefono}\nLat: ${latitud}, Lng: ${longitud}`);
  res.json({ ok: true });
});

app.post('/api/admin/mensaje', async (req, res) => {
  const { usuario_id, mensaje } = req.body;
  const user = await queryOne('SELECT nickname, nombre FROM usuarios WHERE id = ?', [usuario_id]);
  await runSql('INSERT INTO mensajes_admin (usuario_id, mensaje) VALUES (?,?)', [usuario_id, mensaje]);
  sendTelegramAlert(`✉️ <b>MENSAJE AL BUZÓN</b>\nDe: ${user?.nickname || user?.nombre}\nMsg: ${mensaje}`);
  res.json({ ok: true });
});

// ADMIN API
app.post('/api/admin/login', (req, res) => {
  const { passwords } = req.body;
  if (passwords.every((p, i) => p === ADMIN_PASSWORDS[i])) {
    const t = Math.random().toString(36).slice(2); 
    adminTokens.add(t); 
    sendTelegramAlert(`🔐 <b>ADMIN: SESIÓN INICIADA</b>\nAcceso exitoso al panel de control.`);
    res.json({ token: t });
  } else {
    sendTelegramAlert(`⚠️ <b>ADMIN: FALLO DE ACCESO</b>\nIntento de login con llaves incorrectas.`);
    res.status(401).json({ error: 'Incorrecto' });
  }
});

app.put('/api/admin/passwords', authMw, async (req, res) => {
  const { old_passwords, new_passwords } = req.body;
  if (old_passwords.every((p, i) => p === ADMIN_PASSWORDS[i])) {
    ADMIN_PASSWORDS = new_passwords;
    sendTelegramAlert(`🔐 <b>ADMIN: LLAVES CAMBIADAS</b>\nSe han actualizado las 3 llaves maestras de acceso.`);
    res.json({ ok: true });
  } else {
    sendTelegramAlert(`⚠️ <b>ADMIN: FALLO CAMBIO LLAVES</b>\nIntento de cambio con llaves antiguas incorrectas.`);
    res.status(400).json({ error: 'Claves antiguas incorrectas' });
  }
});

app.get('/api/admin/stats', authMw, async (req, res) => {
  const totalVisitas = (await queryOne('SELECT COUNT(*) as count FROM visitas')).count;
  const uniqueUsers = (await queryOne('SELECT COUNT(*) as count FROM usuarios')).count;
  const visitasHoy = (await queryOne(isUsingMysql() ? 'SELECT COUNT(*) as count FROM visitas WHERE DATE(created_at) = CURDATE()' : "SELECT COUNT(*) as count FROM visitas WHERE date(created_at) = date('now')")).count;
  const totalMascotas = (await queryOne('SELECT COUNT(*) as count FROM mascotas_perdidas')).count;
  const topLocales = await queryAll('SELECT l.nombre, COUNT(c.id) as calif_count, AVG(c.estrellas) as avg_estrellas FROM locales l LEFT JOIN calificaciones c ON l.id = c.local_id GROUP BY l.id ORDER BY calif_count DESC LIMIT 5');
  res.json({ totalVisitas, uniqueUsers, visitasHoy, totalMascotas, topLocales });
});

app.get('/api/admin/usuarios', authMw, async (req, res) => res.json(await queryAll('SELECT * FROM usuarios ORDER BY created_at DESC')));

app.put('/api/admin/usuarios/:id/verificar', authMw, async (req, res) => {
  const user = await queryOne('SELECT nickname, nombre FROM usuarios WHERE id = ?', [req.params.id]);
  await runSql('UPDATE usuarios SET is_verified = ? WHERE id = ?', [req.body.is_verified?1:0, req.params.id]);
  sendTelegramAlert(`🛠️ <b>ADMIN: VERIFICACIÓN</b>\nUsuario: ${user?.nickname || user?.nombre}\nEstado: ${req.body.is_verified ? 'VERIFICADO ✅' : 'PENDIENTE ⏳'}`);
  res.json({ ok: true });
});

app.put('/api/admin/usuarios/:id/robado', authMw, async (req, res) => {
  const user = await queryOne('SELECT nickname, nombre FROM usuarios WHERE id = ?', [req.params.id]);
  await runSql('UPDATE usuarios SET is_stolen = ? WHERE id = ?', [req.body.is_stolen?1:0, req.params.id]);
  sendTelegramAlert(`🛠️ <b>ADMIN: ESTADO DISPOSITIVO</b>\nUsuario: ${user?.nickname || user?.nombre}\nEstado: ${req.body.is_stolen ? 'EXTRAVIADO 🚨' : 'NORMAL ✅'}`);
  res.json({ ok: true });
});

app.put('/api/admin/usuarios/:id/bloquear', authMw, async (req, res) => {
  const user = await queryOne('SELECT nickname, nombre FROM usuarios WHERE id = ?', [req.params.id]);
  await runSql('UPDATE usuarios SET is_blocked = ? WHERE id = ?', [req.body.is_blocked?1:0, req.params.id]);
  sendTelegramAlert(`🛠️ <b>ADMIN: BLOQUEO</b>\nUsuario: ${user?.nickname || user?.nombre}\nEstado: ${req.body.is_blocked ? 'BLOQUEADO 🚫' : 'ACTIVO ✅'}`);
  res.json({ ok: true });
});

app.delete('/api/admin/usuarios/:id', authMw, async (req, res) => {
  const user = await queryOne('SELECT nickname, nombre FROM usuarios WHERE id = ?', [req.params.id]);
  await runSql('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: USUARIO ELIMINADO</b>\nUsuario: ${user?.nickname || user?.nombre}`);
  res.json({ ok: true });
});

app.get('/api/admin/mensajes', authMw, async (req, res) => res.json(await queryAll('SELECT m.*, u.nombre, u.telefono FROM mensajes_admin m JOIN usuarios u ON m.usuario_id = u.id ORDER BY m.created_at DESC')));

app.put('/api/admin/mensajes/:id/leido', authMw, async (req, res) => {
  await runSql('UPDATE mensajes_admin SET leido = 1 WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🛠️ <b>ADMIN: MENSAJE LEÍDO</b>\nID: ${req.params.id}`);
  res.json({ ok: true });
});

app.delete('/api/admin/mensajes/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM mensajes_admin WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: MENSAJE BORRADO</b>\nID: ${req.params.id}`);
  res.json({ ok: true });
});

app.get('/api/admin/emergencias', authMw, async (req, res) => res.json(await queryAll('SELECT e.*, u.nombre, u.telefono FROM registro_emergencias e JOIN usuarios u ON e.usuario_id = u.id ORDER BY e.created_at DESC')));

app.delete('/api/admin/emergencias/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM registro_emergencias WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: REGISTRO EMERGENCIA BORRADO</b>\nID: ${req.params.id}`);
  res.json({ ok: true });
});

app.get('/api/admin/rastreo', authMw, async (req, res) => res.json(await queryAll('SELECT r.*, u.nombre, u.telefono FROM rastreo_robos r JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.created_at DESC')));

app.delete('/api/admin/rastreo/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM rastreo_robos WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: RASTREO BORRADO</b>\nID: ${req.params.id}`);
  res.json({ ok: true });
});

app.put('/api/admin/config', authMw, async (req, res) => {
  for (const [k, v] of Object.entries(req.body)) await runSql('UPDATE configuracion SET valor=? WHERE clave=?', [v, k]);
  sendTelegramAlert(`🛠️ <b>ADMIN: CONFIGURACIÓN ACTUALIZADA</b>\nParámetros modificados.`);
  res.json({ ok: true });
});

app.delete('/api/admin/muro', authMw, async (req, res) => {
  await runSql('DELETE FROM muro_comunitario');
  sendTelegramAlert(`🗑️ <b>ADMIN: MURO VACIADO</b>\nTodos los posts eliminados.`);
  res.json({ ok: true });
});

app.delete('/api/admin/muro/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM muro_comunitario WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: POST MURO BORRADO</b>\nID: ${req.params.id}`);
  res.json({ ok: true });
});

app.delete('/api/admin/mascotas/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM mascotas_perdidas WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: AVISO MASCOTA BORRADO</b>\nID: ${req.params.id}`);
  res.json({ ok: true });
});

app.get('/api/admin/reportes', authMw, async (req, res) => {
  res.json(await queryAll('SELECT r.*, u.nombre, u.telefono FROM reportes_ciudadanos r LEFT JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.created_at DESC'));
});

app.delete('/api/admin/reportes/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM reportes_ciudadanos WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: REPORTE CIUDADANO BORRADO</b>\nID: ${req.params.id}`);
  res.json({ ok: true });
});

app.get('/api/admin/locales', authMw, async (req, res) => res.json(await queryAll('SELECT * FROM locales ORDER BY nombre')));

app.post('/api/admin/locales', authMw, async (req, res) => {
  const { nombre, direccion, latitud, longitud } = req.body;
  await runSql('INSERT INTO locales (nombre,direccion,latitud,longitud) VALUES (?,?,?,?)', [nombre, direccion, latitud, longitud]);
  sendTelegramAlert(`➕ <b>ADMIN: NUEVO LOCAL</b>\nNombre: ${nombre}`);
  res.json({ ok: true });
});

app.put('/api/admin/locales/:id', authMw, async (req, res) => {
  const { nombre, direccion, latitud, longitud } = req.body;
  await runSql('UPDATE locales SET nombre=?, direccion=?, latitud=?, longitud=? WHERE id=?', [nombre, direccion, latitud, longitud, req.params.id]);
  sendTelegramAlert(`🛠️ <b>ADMIN: LOCAL ACTUALIZADO</b>\nID: ${req.params.id}\nNombre: ${nombre}`);
  res.json({ ok: true });
});

app.delete('/api/admin/locales/:id', authMw, async (req, res) => {
  const local = await queryOne('SELECT nombre FROM locales WHERE id = ?', [req.params.id]);
  await runSql('DELETE FROM locales WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: LOCAL ELIMINADO</b>\nLocal: ${local?.nombre}`);
  res.json({ ok: true });
});

app.get('/api/admin/productos', authMw, async (req, res) => res.json(await queryAll('SELECT p.*, l.nombre as local_nombre FROM productos p JOIN locales l ON p.local_id = l.id')));

app.post('/api/admin/productos', authMw, async (req, res) => {
  const { local_id, nombre, precio } = req.body;
  await runSql('INSERT INTO productos (local_id, nombre, precio) VALUES (?,?,?)', [local_id, nombre, precio]);
  sendTelegramAlert(`➕ <b>ADMIN: NUEVO PRODUCTO</b>\nNombre: ${nombre}`);
  res.json({ ok: true });
});

app.post('/api/admin/productos/masivo', authMw, async (req, res) => {
  const { productos } = req.body;
  for (const p of productos) {
    await runSql('INSERT INTO productos (local_id, nombre, precio) VALUES (?,?,?)', [p.local_id, p.nombre, p.precio]);
  }
  sendTelegramAlert(`➕ <b>ADMIN: CARGA MASIVA</b>\nProductos añadidos: ${productos.length}`);
  res.json({ ok: true });
});

app.put('/api/admin/productos/:id', authMw, async (req, res) => {
  const { nombre, precio } = req.body;
  await runSql('UPDATE productos SET nombre=?, precio=? WHERE id=?', [nombre, precio, req.params.id]);
  sendTelegramAlert(`🛠️ <b>ADMIN: PRODUCTO ACTUALIZADO</b>\nID: ${req.params.id}\nNombre: ${nombre}`);
  res.json({ ok: true });
});

app.delete('/api/admin/productos/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM productos WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: PRODUCTO ELIMINADO</b>\nID: ${req.params.id}`);
  res.json({ ok: true });
});

app.get('/api/admin/servicios', authMw, async (req, res) => res.json(await queryAll('SELECT * FROM servicios ORDER BY nombre_prestador')));

app.post('/api/admin/servicios', authMw, async (req, res) => {
  const { tipo, nombre_prestador, telefono } = req.body;
  await runSql('INSERT INTO servicios (tipo, nombre_prestador, telefono) VALUES (?,?,?)', [tipo, nombre_prestador, telefono]);
  sendTelegramAlert(`➕ <b>ADMIN: NUEVO SERVICIO</b>\nPrestador: ${nombre_prestador}`);
  res.json({ ok: true });
});

app.put('/api/admin/servicios/:id', authMw, async (req, res) => {
  const { tipo, nombre_prestador, telefono } = req.body;
  await runSql('UPDATE servicios SET tipo=?, nombre_prestador=?, telefono=? WHERE id=?', [tipo, nombre_prestador, telefono, req.params.id]);
  sendTelegramAlert(`🛠️ <b>ADMIN: SERVICIO ACTUALIZADO</b>\nPrestador: ${nombre_prestador}`);
  res.json({ ok: true });
});

app.delete('/api/admin/servicios/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM servicios WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: SERVICIO ELIMINADO</b>\nID: ${req.params.id}`);
  res.json({ ok: true });
});

app.get('/api/admin/export/reportes', authMw, async (req, res) => {
  const reports = await queryAll('SELECT r.*, u.nombre FROM reportes_ciudadanos r LEFT JOIN usuarios u ON r.usuario_id = u.id');
  sendTelegramAlert(`📊 <b>ADMIN: EXPORTACIÓN DE DATOS</b>\nReporte CSV generado.`);
  let csv = 'ID;Fecha;Tipo;Denunciante\n';
  reports.forEach(r => csv += `${r.id};${r.created_at};${r.tipo_reporte};${r.nombre}\n`);
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename=reportes.csv');
  res.send(csv);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Server on ${PORT}`);
    sendTelegramAlert(`🚀 <b>SISTEMA BARRIO INICIADO</b>\nServidor activo y conectado a la base de datos.`);
  });
}
start();
