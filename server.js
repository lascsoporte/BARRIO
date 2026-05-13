const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { URL } = require('url');

/** GET con redirecciones (sin depender de fetch; compatible Node 16 en Render). */
function httpGetWithRedirects(targetUrl, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const follow = (u, left) => {
      let parsed;
      try {
        parsed = new URL(u);
      } catch (e) {
        return reject(new Error('URL inválida'));
      }
      const isHttps = parsed.protocol === 'https:';
      const lib = isHttps ? https : http;
      const opts = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      };
      const req = lib.request(opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && left > 0) {
          res.resume();
          const next = new URL(res.headers.location, u).href;
          return follow(next, left - 1);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            finalUrl: u,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });
      req.on('error', reject);
      req.setTimeout(25000, () => {
        req.destroy();
        reject(new Error('Timeout al obtener URL'));
      });
      req.end();
    };
    follow(targetUrl, maxRedirects);
  });
}
const { initDatabase, cleanupMascotas, cleanupReportes, isUsingMysql, ...dbHelper } = require('./database');
const nodemailer = require('nodemailer');
const webpush = require('web-push');

// VAPID keys para notificaciones push
const publicVapidKey = 'BPfYyug0EiK_oS0FRF8w-k2WpxoDs79-DZjjFI505RsAeUrzi5e88XPgsj8Pp2YV6pZfMtnb-IXiYN8tJ9mgrFc';
const privateVapidKey = 'U1cp2rbRx71On29mhZ9N6cTn-hBs74iLq6K_Nx16mh4';
webpush.setVapidDetails('mailto:contacto@puertomas.cl', publicVapidKey, privateVapidKey);

const app = express();
const PORT = process.env.PORT || 3000;
let ADMIN_PASSWORDS = ['barrio2025', 'admin2025', 'seguridad2025'];

async function loadPasswords() {
  try {
    const p1 = await dbHelper.queryOne("SELECT valor FROM configuracion WHERE clave = 'admin_pass1'");
    const p2 = await dbHelper.queryOne("SELECT valor FROM configuracion WHERE clave = 'admin_pass2'");
    const p3 = await dbHelper.queryOne("SELECT valor FROM configuracion WHERE clave = 'admin_pass3'");
    if (p1 && p2 && p3) {
      ADMIN_PASSWORDS = [p1.valor, p2.valor, p3.valor];
    }
  } catch(e) {}
}
const DEFAULT_PASSWORDS = ['barrio2025', 'admin2025', 'seguridad2025'];
const MASTER_RESET_KEY = 'BARRIO-RESET-2026-PUERTOMAS';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8788499800:AAF0Lcc7HbVJcB-DB6dxFpxaksixNxngqds';
let TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '2007857065';

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

// Helper para notificaciones push por proximidad
async function sendPushToNearbyUsers(reportLat, reportLng, title, body, excludeUserId) {
  const radiusConfig = await queryOne("SELECT valor FROM configuracion WHERE clave = 'push_radius'");
  const radius = parseFloat(radiusConfig?.valor || 500);
  
  const subscriptions = await queryAll(`
    SELECT ps.subscription_json, u.id, u.last_lat, u.last_lng, u.home_lat, u.home_lng
    FROM push_subscriptions ps
    JOIN usuarios u ON ps.usuario_id = u.id
    WHERE u.push_enabled = 1 AND u.id != ?
  `, [excludeUserId || 0]);

  for (let s of subscriptions) {
    // Prioridad: 1. Ubicación dinámica (si la app está abierta) 2. Ubicación del hogar (si la app está cerrada)
    const userLat = s.last_lat || s.home_lat;
    const userLng = s.last_lng || s.home_lng;

    if (userLat && userLng) {
      const dist = haversineDistance(reportLat, reportLng, userLat, userLng) * 1000;
      if (dist > radius) continue;
    }

    try {
      const payload = JSON.stringify({ title, body, lat: reportLat, lng: reportLng });
      await webpush.sendNotification(JSON.parse(s.subscription_json), payload);
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        await runSql('DELETE FROM push_subscriptions WHERE usuario_id = ?', [s.id]);
        await runSql('UPDATE usuarios SET push_enabled = 0 WHERE id = ?', [s.id]);
      }
    }
  }
}

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
// Token persistente basado en las claves (para que no expire si el servidor se reinicia)
const getPersistentToken = () => Buffer.from(ADMIN_PASSWORDS.join(':')).toString('base64');

function authMw(req, res, next) {
  const t = req.headers.authorization?.replace('Bearer ', '');
  if (!t) return res.status(401).json({ error: 'No autorizado' });
  
  // Acepta tokens de la sesión actual O el token persistente de las llaves
  if (adminTokens.has(t) || t === getPersistentToken()) {
    return next();
  }
  
  res.status(401).json({ error: 'Sesión expirada o no autorizada' });
}

// PUBLIC API
app.get('/api/productos/buscar', async (req, res) => {
  const { q, lat, lng, radio = 1 } = req.query;
  const qPat = (q && String(q).trim()) ? `%${q}%` : '%';
  let rows = await queryAll(`SELECT p.*, l.nombre as local_nombre, l.direccion, l.horario_apertura, l.horario_cierre, l.dias_atencion, l.latitud, l.longitud FROM productos p JOIN locales l ON p.local_id = l.id WHERE LOWER(p.nombre) LIKE LOWER(?)`, [qPat]);
  if (lat && lng) {
    rows = rows.map(r => ({ ...r, distancia: Math.round(haversineDistance(parseFloat(lat), parseFloat(lng), r.latitud, r.longitud) * 1000) }))
               .filter(r => r.distancia <= parseFloat(radio) * 1000);
  }
  res.json(rows.map(r => ({ ...r, abierto: isLocalOpen(r.horario_apertura, r.horario_cierre, r.dias_atencion) })));
});

app.get('/api/locales/:id/calificaciones', async (req, res) => {
  res.json(await queryAll('SELECT * FROM calificaciones WHERE local_id = ? ORDER BY created_at DESC', [req.params.id]));
});

app.post('/api/locales/:id/calificaciones', async (req, res) => {
  const { estrellas, comentario, device_id } = req.body;
  if (!estrellas || estrellas < 1 || estrellas > 5) return res.status(400).json({ error: 'Calificación 1-5' });
  if (!device_id) return res.status(400).json({ error: 'device_id requerido' });
  const existing = await queryOne('SELECT id FROM calificaciones WHERE local_id = ? AND device_id = ?', [req.params.id, device_id]);
  if (existing) {
    await runSql('UPDATE calificaciones SET estrellas=?, comentario=? WHERE id=?', [estrellas, comentario || '', existing.id]);
    return res.json({ message: 'Calificación actualizada', id: existing.id });
  }
  const r = await runSql('INSERT INTO calificaciones (local_id, estrellas, comentario, device_id) VALUES (?,?,?,?)', [req.params.id, estrellas, comentario || '', device_id]);
  res.json({ message: 'Calificación enviada', id: r.insertId });
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
  const qPat = (q && String(q).trim()) ? `%${q}%` : '%';
  let rows = await queryAll(`SELECT * FROM servicios WHERE LOWER(tipo) LIKE LOWER(?) OR LOWER(nombre_prestador) LIKE LOWER(?)`, [qPat, qPat]);
  if (lat && lng) {
    const uLat = parseFloat(lat);
    const uLng = parseFloat(lng);
    const rKm = parseFloat(radio) || 1;
    rows = rows
      .map(s => {
        if (s.latitud == null || s.longitud == null) return { ...s, distancia: null };
        return { ...s, distancia: Math.round(haversineDistance(uLat, uLng, parseFloat(s.latitud), parseFloat(s.longitud)) * 1000) };
      })
      .filter(s => s.distancia === null || s.distancia <= rKm * 1000);
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
  
  // Enviar Notificación Push (Solo a vecinos cercanos)
  sendPushToNearbyUsers(latitud, longitud, `🚨 REPORTE: ${tipo_reporte.toUpperCase()}`, detalles || 'Hay un nuevo reporte cerca de tu ubicación.', usuario_id);
  
  res.json({ ok: true });
});

app.post('/api/registro', async (req, res) => {
  const { nombre, telefono, email, nickname, pin_seguridad, device_id, home_lat, home_lng, direccion } = req.body;
  let user = await queryOne('SELECT * FROM usuarios WHERE telefono = ?', [telefono]);
  if (!user) {
    const r = await runSql('INSERT INTO usuarios (nombre, telefono, email, nickname, pin_seguridad, device_id, home_lat, home_lng, direccion) VALUES (?,?,?,?,?,?,?,?,?)', [nombre, telefono, email||'', nickname||'', pin_seguridad||'', device_id||'', home_lat||null, home_lng||null, direccion||'']);
    user = await queryOne('SELECT * FROM usuarios WHERE id = ?', [r.insertId]);
    sendTelegramAlert(`🆕 <b>NUEVO REGISTRO</b>\nNombre: ${nombre}\nNick: ${nickname}\nTel: ${telefono}`);
    if (email && pin_seguridad) sendEmailPin(email, nickname||nombre, pin_seguridad);
  } else {
    await runSql('UPDATE usuarios SET nombre=?, email=?, nickname=?, pin_seguridad=?, home_lat=?, home_lng=?, direccion=? WHERE id=?', [nombre, email||user.email, nickname||user.nickname, pin_seguridad||user.pin_seguridad, home_lat||user.home_lat, home_lng||user.home_lng, direccion||user.direccion, user.id]);
    user = { ...user, nombre, email, nickname, pin_seguridad, home_lat, home_lng, direccion };
    sendTelegramAlert(`🔄 <b>PERFIL ACTUALIZADO</b>\nUsuario: ${nickname || nombre}`);
  }
  res.json({ user });
});

app.get('/api/verificar-usuario/:id', async (req, res) => {
  const u = await queryOne('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'No encontrado' });
  res.json(u);
});

app.put('/api/usuarios/:id/accept-terms', async (req, res) => {
  await runSql('UPDATE usuarios SET terms_accepted = 1 WHERE id = ?', [req.params.id]);
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
  
  // Como mascotas no tiene lat/lng obligatorio en el form pero sí en la DB, si están presentes, notificar
  if (req.body.latitud && req.body.longitud) {
    sendPushToNearbyUsers(req.body.latitud, req.body.longitud, `🐶 MASCOTA PERDIDA`, `Se ha reportado la pérdida de ${nombre_mascota} cerca de aquí.`);
  }

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

app.post('/api/push/subscribe', async (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) return res.status(400).json({ error: 'Faltan datos' });
  await runSql('DELETE FROM push_subscriptions WHERE usuario_id = ?', [userId]);
  await runSql('INSERT INTO push_subscriptions (usuario_id, subscription_json) VALUES (?, ?)', [userId, JSON.stringify(subscription)]);
  await runSql('UPDATE usuarios SET push_enabled = 1 WHERE id = ?', [userId]);
  res.status(201).json({ ok: true });
});

app.get('/api/ping', async (req, res) => {
  res.json({ status: 'ok', server: 'BARRIO PRO', db: isUsingMysql() ? 'Cloud' : 'Local', time: new Date().toISOString() });
});
app.post('/api/ping', async (req, res) => {
  const { device_id, lat, lng } = req.body;
  if (device_id) {
    await runSql('INSERT INTO visitas (device_id) VALUES (?)', [device_id]);
    if (lat != null && lng != null) {
      await runSql('UPDATE usuarios SET last_lat = ?, last_lng = ? WHERE device_id = ?', [lat, lng, device_id]);
    }
    const u = await queryOne('SELECT is_stolen, nickname, nombre FROM usuarios WHERE device_id = ?', [device_id]);
    if (u?.is_stolen) sendTelegramAlert(`🕵️ <b>VIGILANCIA EXTRAVÍO</b>\nDispositivo detectado: ${u.nickname || u.nombre}`);
    return res.json({ status: u?.is_stolen ? 'stolen' : 'ok' });
  }
  res.json({ status: 'ok' });
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
  if (!passwords || !Array.isArray(passwords) || passwords.length !== 3) {
    return res.status(400).json({ error: 'Formato incorrecto' });
  }
  if (passwords.every((p, i) => p === ADMIN_PASSWORDS[i])) {
    const t = getPersistentToken(); // Usar token persistente
    adminTokens.add(t); 
    sendTelegramAlert(`🔐 <b>ADMIN: SESIÓN INICIADA</b>\nAcceso exitoso al panel de control.`);
    res.json({ token: t });
  } else {
    sendTelegramAlert(`⚠️ <b>ADMIN: FALLO DE ACCESO</b>\nIntento de login con llaves incorrectas.`);
    res.status(401).json({ error: 'Incorrecto' });
  }
});

app.post('/api/admin/notify-entry', authMw, (req, res) => {
  res.json({ ok: true });
});

app.post('/api/admin/resolve-map', authMw, async (req, res) => {
  let { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requerida' });
  if (typeof url === 'string' && url.includes('<iframe')) {
    const srcMatch = url.match(/src="([^"]+)"/);
    if (srcMatch) url = srcMatch[1];
  }
  const extractCoords = (text) => {
    let m = text.match(/@([-\d.]+),([-\d.]+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    const d3 = text.match(/!3d([-\d.]+)/);
    const d4 = text.match(/!4d([-\d.]+)/) || text.match(/!2d([-\d.]+)/);
    if (d3 && d4) return { lat: parseFloat(d3[1]), lng: parseFloat(d4[1]) };
    m = text.match(/\/search\/([-\d.]+),\+?([-\d.]+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    m = text.match(/[?&]q=([-\d.]+),([-\d.]+)/) || text.match(/center=([-\d.]+),([-\d.]+)/) || text.match(/ll=([-\d.]+),([-\d.]+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    return null;
  };
  let coords = extractCoords(url);
  if (coords) {
    let address = '';
    const placeMatch = url.match(/\/place\/([^/]+)/);
    if (placeMatch) {
      try { address = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')); } catch (e) { /* ignore */ }
    }
    return res.json({ ...coords, address });
  }
  try {
    const response = await httpGetWithRedirects(url);
    const finalUrl = response.finalUrl;
    const html = response.body;
    coords = extractCoords(finalUrl) || extractCoords(html);
    if (!coords) {
      const jsonCoords = html.match(/\[null,null,([-\d.]+),([-\d.]+)\]/);
      if (jsonCoords) coords = { lat: parseFloat(jsonCoords[1]), lng: parseFloat(jsonCoords[2]) };
    }
    if (coords) {
      let address = '';
      const placeMatch = finalUrl.match(/\/place\/([^/]+)/);
      if (placeMatch) {
        try { address = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')); } catch (e) { /* ignore */ }
      }
      return res.json({ ...coords, address });
    }
    return res.status(400).json({ error: 'No se pudieron extraer las coordenadas. Usa el enlace "Compartir" de Google Maps.' });
  } catch (err) {
    console.error('[resolve-map]', err);
    return res.status(500).json({ error: 'Error de conexión al resolver el mapa' });
  }
});

app.put('/api/admin/passwords', authMw, async (req, res) => {
  const { old_passwords, new_passwords } = req.body;
  if (!Array.isArray(old_passwords) || !Array.isArray(new_passwords) || old_passwords.length !== 3 || new_passwords.length !== 3) {
    return res.status(400).json({ error: 'Se requieren 3 claves actuales y 3 nuevas' });
  }
  if (old_passwords.every((p, i) => p === ADMIN_PASSWORDS[i])) {
    ADMIN_PASSWORDS = new_passwords;
    try {
      await runSql('UPDATE configuracion SET valor=? WHERE clave=?', [new_passwords[0], 'admin_pass1']);
      await runSql('UPDATE configuracion SET valor=? WHERE clave=?', [new_passwords[1], 'admin_pass2']);
      await runSql('UPDATE configuracion SET valor=? WHERE clave=?', [new_passwords[2], 'admin_pass3']);
    } catch (e) {
      console.error('No se pudieron guardar las nuevas claves en configuracion:', e);
    }
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
  await runSql('DELETE FROM productos WHERE local_id = ?', [req.params.id]);
  await runSql('DELETE FROM calificaciones WHERE local_id = ?', [req.params.id]);
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

function scheduleRenderKeepAlive() {
  const raw = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
  const base = String(raw).replace(/\/$/, '');
  if (!base) {
    console.log('[Anti-Sleep] Define PUBLIC_URL o RENDER_EXTERNAL_URL (URL pública https) para ping automático cada 7–10 min.');
    return;
  }
  const minMs = 7 * 60 * 1000;
  const maxMs = 10 * 60 * 1000;
  const pingUrl = `${base}/api/ping`;
  const scheduleNext = () => {
    const delay = minMs + Math.floor(Math.random() * (maxMs - minMs));
    setTimeout(() => {
      httpGetWithRedirects(pingUrl)
        .then((r) => console.log(`[Anti-Sleep] GET ${pingUrl} → ${r.statusCode}`))
        .catch((e) => console.error('[Anti-Sleep]', e.message))
        .finally(() => scheduleNext());
    }, delay);
  };
  scheduleNext();
  console.log(`[Anti-Sleep] Activo → ${pingUrl} (intervalo aleatorio 7–10 min)`);
}

async function start() {
  try {
    app.listen(PORT, '0.0.0.0', async () => {
      console.log(`Servidor escuchando en puerto ${PORT}`);
      try {
        await initDatabase();
        await loadPasswords();
        scheduleRenderKeepAlive();
        sendTelegramAlert(`🚀 <b>SISTEMA BARRIO INICIADO</b>\nServidor online y base de datos lista.`);
      } catch (dbErr) {
        console.error('Error de base de datos:', dbErr);
        sendTelegramAlert(`🚨 <b>PROBLEMA DE BASE DE DATOS</b>\n${dbErr.message}`);
      }
    });
  } catch (e) {
    console.error('CRITICAL START ERROR:', e);
    try { sendTelegramAlert(`🚨 <b>ERROR CRÍTICO DE INICIO</b>\n${e.message}`); } catch (_) { /* ignore */ }
    setTimeout(() => process.exit(1), 1000);
  }
}

// Prevenir que errores no capturados maten el proceso
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  sendTelegramAlert(`⚠️ <b>EXCEPCIÓN NO CAPTURADA</b>\n${err.message}`);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

start();
