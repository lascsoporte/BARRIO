const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

// ─── HASH SEGURO DE PINS ──────────────────────────────────────────────────────
// Usa scrypt (nativo de Node, no requiere npm install)
// Compatible con PINs viejos sin hash durante migración gradual
const PIN_SALT = 'BARRIO_2026_salt_secret';

function hashPin(pin) {
  // Genera hash determinístico para verificar
  return crypto.scryptSync(String(pin), PIN_SALT, 64).toString('hex');
}

function verificarPin(pinIngresado, pinGuardado) {
  if (!pinIngresado || !pinGuardado) return false;
  // Si el PIN guardado tiene 128 caracteres (hash) → comparar con hash
  if (pinGuardado.length === 128) {
    return hashPin(pinIngresado) === pinGuardado;
  }
  // Si el PIN guardado es corto (4-6 dígitos) → comparación directa (PIN viejo sin hash)
  return String(pinIngresado) === String(pinGuardado);
}

// ─── PROTECCIÓN CONTRA ATAQUES DE FUERZA BRUTA ────────────────────────────────
const intentosFallidos = new Map(); // { 'telefono_o_ip' => { count, lockUntil } }

function registrarIntentoFallido(clave) {
  const ahora = Date.now();
  const reg = intentosFallidos.get(clave) || { count: 0, lockUntil: 0 };
  reg.count++;
  if (reg.count >= 5) {
    reg.lockUntil = ahora + 60 * 60 * 1000; // bloqueo 1 hora
  }
  intentosFallidos.set(clave, reg);
  return reg;
}

function estaBloquedo(clave) {
  const reg = intentosFallidos.get(clave);
  if (!reg) return false;
  if (reg.lockUntil > Date.now()) return true;
  // Si pasó el bloqueo, resetear
  if (reg.lockUntil > 0) intentosFallidos.delete(clave);
  return false;
}

function limpiarIntentosFallidos(clave) {
  intentosFallidos.delete(clave);
}

// Limpieza periódica de intentos antiguos (cada hora)
setInterval(() => {
  const ahora = Date.now();
  for (const [k, v] of intentosFallidos.entries()) {
    if (v.lockUntil > 0 && v.lockUntil < ahora) intentosFallidos.delete(k);
  }
}, 60 * 60 * 1000);

// ─── RATE LIMITING SIMPLE ─────────────────────────────────────────────────────
const peticionesPorIp = new Map(); // { ip => [timestamps] }

function rateLimitMiddleware(maxPorMinuto = 60) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const ahora = Date.now();
    const unMinAtras = ahora - 60000;
    
    const lista = peticionesPorIp.get(ip) || [];
    const recientes = lista.filter(t => t > unMinAtras);
    
    if (recientes.length >= maxPorMinuto) {
      return res.status(429).json({ error: 'Demasiadas peticiones. Espera un momento.' });
    }
    
    recientes.push(ahora);
    peticionesPorIp.set(ip, recientes);
    next();
  };
}

// Limpieza periódica del rate limiter (cada 5 min)
setInterval(() => {
  const limite = Date.now() - 60000;
  for (const [ip, lista] of peticionesPorIp.entries()) {
    const recientes = lista.filter(t => t > limite);
    if (recientes.length === 0) peticionesPorIp.delete(ip);
    else peticionesPorIp.set(ip, recientes);
  }
}, 5 * 60 * 1000);

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
const { initDatabase, cleanupMascotas, cleanupReportes, cleanupMuro, getMascotasParaRecordatorio, isUsingMysql, closeDatabase, ...dbHelper } = require('./database');
const nodemailer = require('nodemailer');
const webpush = require('web-push');
const { Server: SocketIO } = require('socket.io');

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
app.use(express.json({ limit: '2mb' })); // Reducido de 10mb a 2mb - suficiente para fotos comprimidas (max ~500KB) y datos
app.use(express.static(path.join(__dirname, 'public')));

// ─── VALIDACIÓN ESTRICTA DE FOTOS BASE64 ─────────────────────────────────────
function validarFotoBase64(foto) {
  if (!foto) return { valida: true, foto: null }; // foto opcional

  // Debe ser string
  if (typeof foto !== 'string') return { valida: false, error: 'Formato inválido' };

  // Debe empezar con data:image/[jpeg|png|webp];base64,
  const formatoValido = /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(foto);
  if (!formatoValido) return { valida: false, error: 'Solo se aceptan imágenes JPG, PNG o WEBP' };

  // Extraer la parte base64 (sin el prefijo)
  const base64Data = foto.split(',')[1];
  if (!base64Data) return { valida: false, error: 'Datos de imagen vacíos' };

  // Validar tamaño máximo: 1.5 MB en base64 (~ 1.1 MB de imagen real)
  const MAX_BYTES = 1.5 * 1024 * 1024;
  if (base64Data.length > MAX_BYTES) {
    return { valida: false, error: 'La foto es demasiado grande (máximo 1MB)' };
  }

  // Validar que el base64 es válido (caracteres permitidos)
  if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
    return { valida: false, error: 'Datos de imagen corruptos' };
  }

  // Validar el "magic number" — los primeros bytes deben ser de imagen real
  try {
    const buffer = Buffer.from(base64Data.substring(0, 32), 'base64');
    const esJPG = buffer[0] === 0xFF && buffer[1] === 0xD8;
    const esPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    const esWEBP = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    if (!esJPG && !esPNG && !esWEBP) {
      return { valida: false, error: 'El archivo no es una imagen real' };
    }
  } catch (e) {
    return { valida: false, error: 'No se pudo verificar la imagen' };
  }

  return { valida: true, foto };
}

// ─── PROTECCIÓN XSS: Limpiar texto de usuarios ──────────────────────────────
function limpiarTexto(texto, maxLength = 1000) {
  if (texto == null) return '';
  let t = String(texto).slice(0, maxLength);
  // Eliminar tags HTML peligrosos pero conservar el texto plano
  t = t.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  t = t.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
  t = t.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<[^>]+on\w+\s*=[^>]*>/gi, ''); // tags con onclick, onerror, etc
  t = t.replace(/javascript:/gi, '');
  t = t.replace(/data:text\/html/gi, '');
  // Convertir < y > restantes en entidades para que no se interpreten como HTML
  t = t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return t.trim();
}

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
  host: process.env.MAIL_HOST || 'c1800365.ferozo.com',
  port: parseInt(process.env.MAIL_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER || 'contacto@puertomas.cl',
    pass: process.env.MAIL_PASS || 'Andres1619'
  },
  tls: { rejectUnauthorized: false }
});

async function sendEmailPin(to, nickname, pin) {
  try {
    const [rowAsunto, rowBienvenida, rowTexto, rowPie] = await Promise.all([
      queryOne("SELECT valor FROM configuracion WHERE clave = 'email_pin_asunto'"),
      queryOne("SELECT valor FROM configuracion WHERE clave = 'email_pin_bienvenida'"),
      queryOne("SELECT valor FROM configuracion WHERE clave = 'email_pin_texto'"),
      queryOne("SELECT valor FROM configuracion WHERE clave = 'email_pin_pie'")
    ]);
    const asunto = rowAsunto?.valor || '🔐 Tu PIN de Seguridad - BARRIO';
    const bienvenida = rowBienvenida?.valor || '¡Bienvenido/a a BARRIO! 🏘️';
    const textoCrudo = rowTexto?.valor || 'Hola {nombre}, tu registro fue exitoso. Este es tu PIN de seguridad: {pin}. Guárdalo en un lugar seguro.';
    const pie = rowPie?.valor || 'BARRIO - Seguridad Ciudadana';
    const textoFinal = textoCrudo.replace(/\{nombre\}/g, nickname).replace(/\{pin\}/g, pin);
    const mailOptions = {
      from: `"BARRIO Seguridad" <contacto@puertomas.cl>`,
      to,
      subject: asunto,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9;">
          <div style="background:white;padding:30px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <h2 style="color:#673AB7;margin-bottom:20px;">${bienvenida}</h2>
            <p style="font-size:16px;color:#333;line-height:1.6;">${textoFinal.replace(/\n/g,'<br>')}</p>
            <div style="background:#673AB7;color:white;font-size:32px;font-weight:bold;text-align:center;padding:20px;border-radius:8px;margin:25px 0;letter-spacing:8px;">${pin}</div>
            <hr style="border:none;border-top:1px solid #eee;margin:25px 0;">
            <p style="font-size:13px;color:#999;text-align:center;">${pie}</p>
          </div>
        </div>`
    };
    await mailTransporter.sendMail(mailOptions);
    console.log('✅ Email PIN enviado a:', to);
  } catch(err) {
    console.error('❌ Error enviando email:', err.message);
  }
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

function csvCell(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (/[;\r\n"]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Convierte cualquier fecha a formato legible en hora Chile
function fechaChile(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('es-CL', { timeZone: 'America/Santiago', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  } catch(e) { return String(v); }
}

function sendCsvDownload(res, filename, headerLabels, keys, rows) {
  const dateKeys = ['created_at', 'baja_fecha', 'fecha_expiracion'];
  
  const tituloPlano = filename.replace('.csv', '').replace(/_/g, ' ').toUpperCase();
  const fechaGeneracion = fechaChile(new Date());

  let csv = '\ufeff'; 
  csv += `"${tituloPlano}"\n`;
  csv += `"GENERADO EL: ${fechaGeneracion}"\n\n`;
  csv += `"--- SECCION DE DATOS ---"\n`;
  
  const formatHeader = (h) => {
    const map = {
      'id': 'ID', 'usuario_id': 'ID Usuario', 'nombre': 'Nombre', 'telefono': 'Telefono', 'latitud': 'Latitud', 'longitud': 'Longitud',
      'created_at': 'Fecha de Registro', 'is_verified': 'Verificado', 'is_stolen': 'Reportado Robado', 'nickname': 'Apodo',
      'email': 'Correo', 'direccion': 'Direccion', 'last_lat': 'Ultima Latitud', 'last_lng': 'Ultima Longitud',
      'url_ultima_ubicacion': 'URL Ultima Ubicacion', 'url_mapa': 'Enlace Mapa', 'autor': 'Autor', 'contenido': 'Contenido',
      'mensaje': 'Mensaje', 'leido': 'Leido', 'institucion': 'Institucion', 'local_nombre': 'Nombre Local', 'marca': 'Marca',
      'precio': 'Precio', 'en_stock': 'En Stock', 'unidad': 'Unidad', 'tipo': 'Tipo', 'nombre_prestador': 'Prestador',
      'nombre_contacto': 'Contacto', 'ubicacion_extravio': 'Lugar de Extravio', 'caracteristicas': 'Caracteristicas',
      'baja_solicitada': 'Baja Solicitada', 'baja_fecha': 'Fecha de Baja', 'terms_accepted': 'Terminos Aceptados',
      'nombre_usuario': 'Nombre Usuario', 'telefono_usuario': 'Telefono Usuario', 'usuario_tel': 'Telefono Usuario'
    };
    return map[h] || h.charAt(0).toUpperCase() + h.slice(1).replace(/_/g, ' ');
  };
  const translatedHeaders = headerLabels.map(formatHeader);

  csv += translatedHeaders.join(';') + '\n';
  
  for (const row of rows) {
    csv += keys.map((k) => {
      const v = row[k];
      if (dateKeys.includes(k) && v) return csvCell(fechaChile(v));
      if (k.startsWith('is_') || k === 'leido' || k === 'en_stock' || k === 'acepta_efectivo' || k === 'acepta_tarjeta' || k === 'terms_accepted' || k === 'baja_solicitada') {
        return csvCell(v ? 'SI' : 'NO');
      }
      return csvCell(v);
    }).join(';') + '\n';
  }
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${String(filename).replace(/"/g, '')}"`);
  res.send(csv);
}

const adminTokens = new Set();
// Token persistente basado en las claves (no expira para administradores)
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

const lastStolenAlerts = new Map();

// Helper: verificar si un device_id está marcado como extraviado
async function isDeviceStolen(device_id) {
  if (!device_id) return false;
  const u = await queryOne('SELECT is_stolen FROM usuarios WHERE device_id = ?', [device_id]);
  return u?.is_stolen === 1;
}

// Helper: verificar si dispositivo es extraviado y alertar
async function checkStolenActivity(device_id, lat, lng, accion) {
  if (!device_id) return;
  const u = await queryOne('SELECT id, nickname, nombre, telefono, is_stolen FROM usuarios WHERE device_id = ?', [device_id]);
  if (!u || !u.is_stolen) return;
  const fechaLocal = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
  let mapa = '';
  if (lat && lng) {
    await runSql('INSERT INTO registro_extravios (usuario_id, latitud, longitud) VALUES (?,?,?)', [u.id, parseFloat(lat), parseFloat(lng)]);
    mapa = `\n📍 Ubicación: https://maps.google.com/?q=${lat},${lng}`;
  }
  
  // Limitar alertas de Telegram a 1 cada 3 minutos por dispositivo
  const now = Date.now();
  const lastAlert = lastStolenAlerts.get(device_id) || 0;
  if (now - lastAlert > 3 * 60 * 1000) {
    lastStolenAlerts.set(device_id, now);
    sendTelegramAlert(
      `🚨 <b>EXTRAVÍO: ACTIVIDAD DETECTADA</b>\n` +
      `👤 ${u.nickname || u.nombre}\n` +
      `📱 Tel: ${u.telefono}\n` +
      `🔍 Acción: ${accion}\n` +
      `🕐 Hora: ${fechaLocal}${mapa}`
    );
  }
}

// PUBLIC API
app.get('/api/productos/buscar', async (req, res) => {
  const { q, lat, lng, radio = 1, device_id } = req.query;
  // Verificar si es dispositivo extraviado
  checkStolenActivity(device_id, lat, lng, `Buscó producto: "${q || ''}"`);
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
  // Verificar si es dispositivo extraviado
  if (req.query.device_id) checkStolenActivity(req.query.device_id, req.query.lat, req.query.lng, `Buscó servicio: "${req.query.q || ''}"`);
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
  res.json(await queryAll(
    `SELECT r.*, COALESCE(u.nickname, u.nombre) as autor_nick FROM reportes_ciudadanos r LEFT JOIN usuarios u ON r.usuario_id = u.id WHERE r.fecha_expiracion > NOW() OR r.fecha_expiracion IS NULL ORDER BY r.created_at DESC`
  ));
});

app.post('/api/reportes', rateLimitMiddleware(20), async (req, res) => {
  const { usuario_id, nombre_contacto, telefono, tipo_reporte, latitud, longitud, duracion_horas, device_id } = req.body;
  
  // Limpiar texto contra XSS
  const detalles = limpiarTexto(req.body.detalles, 500);
  
  // Validar foto si viene
  const validacionFoto = validarFotoBase64(req.body.foto_base64);
  if (!validacionFoto.valida) {
    return res.status(400).json({ error: validacionFoto.error });
  }
  const fotoLimpia = validacionFoto.foto;
  
  // Validar tipo de reporte (solo valores permitidos)
  const tiposValidos = ['robo', 'accidente', 'incendio', 'sospechoso', 'mascota', 'otros'];
  if (!tiposValidos.includes(tipo_reporte)) {
    return res.status(400).json({ error: 'Tipo de reporte inválido' });
  }
  
  const user = usuario_id ? await queryOne('SELECT nickname, nombre, device_id, is_stolen FROM usuarios WHERE id = ?', [usuario_id]) : null;
  
  // Rastrear dispositivo extraviado
  if (user?.is_stolen || (device_id && await isDeviceStolen(device_id))) {
    await checkStolenActivity(user?.device_id || device_id, latitud, longitud, `Creó reporte: ${tipo_reporte} - ${detalles?.substring(0, 50)}`);
  }
  
  const exp = new Date(Date.now() + (parseInt(duracion_horas)||24)*3600000).toISOString().slice(0,19).replace('T',' ');
  await runSql('INSERT INTO reportes_ciudadanos (usuario_id, nombre_contacto, telefono, tipo_reporte, detalles, latitud, longitud, fecha_expiracion, foto_base64) VALUES (?,?,?,?,?,?,?,?,?)', [usuario_id||null, nombre_contacto, telefono, tipo_reporte, detalles, latitud, longitud, exp, fotoLimpia]);
  const mapaReporte = (latitud && longitud) ? `\n📍 <a href="https://maps.google.com/?q=${latitud},${longitud}">Ver en mapa</a>` : '';
  sendTelegramAlert(`📢 <b>NUEVO REPORTE</b>\n🕐 ${fechaChile(new Date())}\nTipo: ${tipo_reporte}\nPor: ${user?.nickname || user?.nombre || nombre_contacto}\nDetalles: ${detalles||'Sin detalles'}${mapaReporte}`);
  
  // Enviar Notificación Push (Solo a vecinos cercanos)
  sendPushToNearbyUsers(latitud, longitud, `🚨 REPORTE: ${tipo_reporte.toUpperCase()}`, detalles || 'Hay un nuevo reporte cerca de tu ubicación.', usuario_id);

  // Emitir en tiempo real a todos los clientes conectados
  try {
    const nuevoReporte = await queryOne('SELECT r.*, COALESCE(u.nickname, u.nombre) as autor_nick FROM reportes_ciudadanos r LEFT JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.id DESC LIMIT 1');
    if (nuevoReporte) req.app.get('io')?.emit('nuevo_reporte', nuevoReporte);
  } catch(e) {}
  
  res.json({ ok: true });
});

app.post('/api/registro', rateLimitMiddleware(10), async (req, res) => {
  const { nombre, telefono, email, nickname, pin_seguridad, device_id, home_lat, home_lng, direccion, gps_lat, gps_lng } = req.body;
  
  console.log(`📝 [REGISTRO] Inicio: tel=${telefono}, nombre=${nombre}`);
  
  // Validación básica
  if (!nombre || !telefono) {
    return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
  }
  
  // Función auxiliar para calcular distancia entre dos puntos (km)
  const calcularDistanciaKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // GEOFENCING: Validar que la ubicación esté dentro de Puerto Montt
  if (home_lat && home_lng) {
    const PM_CENTER_LAT = -41.4693;
    const PM_CENTER_LNG = -72.9423;
    const MAX_RADIUS_KM = 25;
    
    const distance = calcularDistanciaKm(PM_CENTER_LAT, PM_CENTER_LNG, home_lat, home_lng);
    
    if (distance > MAX_RADIUS_KM) {
      console.log(`❌ [REGISTRO] Fuera de cobertura: ${distance.toFixed(1)}km`);
      return res.status(400).json({
        error: 'FUERA_DE_COBERTURA',
        message: `Tu ubicación está fuera del área de cobertura de BARRIO Puerto Montt. Por favor, marca tu casa en el mapa dentro de Puerto Montt y alrededores.`
      });
    }
  }

  // Verificación GPS (solo para alerta de telegram)
  let avisoGPS = '';
  if (gps_lat && gps_lng && home_lat && home_lng) {
    const distanciaGPS = calcularDistanciaKm(gps_lat, gps_lng, home_lat, home_lng);
    if (distanciaGPS < 1) avisoGPS = `\n📍 <b>GPS COINCIDE</b> (${distanciaGPS.toFixed(2)} km)`;
    else if (distanciaGPS < 5) avisoGPS = `\n⚠️ <b>GPS CERCANO</b> (${distanciaGPS.toFixed(2)} km)`;
    else avisoGPS = `\n🚨 <b>GPS LEJANO</b> (${distanciaGPS.toFixed(2)} km) - VERIFICAR\n📱 GPS: <a href="https://maps.google.com/?q=${gps_lat},${gps_lng}">Ver</a>\n🏠 Casa: <a href="https://maps.google.com/?q=${home_lat},${home_lng}">Ver</a>`;
  } else if (home_lat && home_lng) {
    avisoGPS = `\n⚠️ Sin GPS verificado`;
  }
  
  try {
    // Hashear el PIN
    const pinPlano = pin_seguridad;
    const pinHasheado = pin_seguridad ? hashPin(pin_seguridad) : '';

    console.log(`📝 [REGISTRO] Buscando usuario existente...`);
    let user = await queryOne('SELECT * FROM usuarios WHERE telefono = ?', [telefono]);
    let esNuevo = false;
    
    if (!user) {
      console.log(`📝 [REGISTRO] Usuario NUEVO, insertando...`);
      const r = await runSql(
        'INSERT INTO usuarios (nombre, telefono, email, nickname, pin_seguridad, device_id, home_lat, home_lng, direccion, last_lat, last_lng, is_verified) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
        [nombre, telefono, email||'', nickname||'', pinHasheado, device_id||'', home_lat||null, home_lng||null, direccion||'', gps_lat||null, gps_lng||null]
      );
      user = await queryOne('SELECT * FROM usuarios WHERE id = ?', [r.insertId]);
      esNuevo = true;
      console.log(`✅ [REGISTRO] Usuario nuevo creado: id=${user.id}`);
    } else {
      console.log(`📝 [REGISTRO] Usuario EXISTENTE, actualizando id=${user.id}...`);
      const pinAGuardar = pinPlano ? pinHasheado : user.pin_seguridad;
      await runSql(
        'UPDATE usuarios SET nombre=?, email=?, nickname=?, pin_seguridad=?, home_lat=?, home_lng=?, direccion=? WHERE id=?',
        [nombre, email||user.email, nickname||user.nickname, pinAGuardar, home_lat||user.home_lat, home_lng||user.home_lng, direccion||user.direccion, user.id]
      );
      user = { ...user, nombre, email, nickname, pin_seguridad: pinAGuardar, home_lat, home_lng, direccion };
      console.log(`✅ [REGISTRO] Usuario existente actualizado`);
    }
    
    // RESPONDER AL USUARIO INMEDIATAMENTE — sin esperar email ni telegram
    const userResponse = { ...user };
    delete userResponse.pin_seguridad;
    res.json({ user: userResponse });
    console.log(`✅ [REGISTRO] Respuesta enviada al cliente`);
    
    // Tareas pesadas EN SEGUNDO PLANO (no bloquean la respuesta al usuario)
    setImmediate(() => {
      try {
        if (esNuevo) {
          sendTelegramAlert(`🆕 <b>NUEVO REGISTRO</b>\n🕐 ${fechaChile(new Date())}\nNombre: ${nombre}\nNick: ${nickname}\nTel: ${telefono}\nEmail: ${email||'No indicado'}\nSector: ${direccion||'—'}${avisoGPS}`);
          if (email && pinPlano) {
            sendEmailPin(email, nickname||nombre, pinPlano).catch(e => console.error('Error enviando email:', e.message));
          }
        } else {
          sendTelegramAlert(`🔄 <b>PERFIL ACTUALIZADO</b>\nUsuario: ${nickname || nombre}${avisoGPS}`);
        }
      } catch(e) {
        console.error('Error en tareas en segundo plano:', e.message);
      }
    });
    
  } catch (e) {
    console.error('❌ [REGISTRO] Error fatal:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al registrar. Intenta de nuevo.' });
    }
  }
});

app.post('/api/login', rateLimitMiddleware(20), async (req, res) => {
  const { telefono, pin, device_id } = req.body;
  if (!telefono || !pin) return res.status(400).json({ error: 'Teléfono y PIN son obligatorios' });

  // Protección contra fuerza bruta — por teléfono Y por IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const claveTel = 'tel:' + telefono;
  const claveIp = 'ip:' + ip;
  
  if (estaBloquedo(claveTel) || estaBloquedo(claveIp)) {
    sendTelegramAlert(`🚨 <b>INTENTO DE LOGIN BLOQUEADO</b>\n🕐 ${fechaChile(new Date())}\nTel: ${telefono}\nIP: ${ip}\nCuenta o IP bloqueada por demasiados intentos.`);
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera 1 hora.' });
  }

  const user = await queryOne('SELECT * FROM usuarios WHERE telefono = ?', [telefono]);
  
  if (!user) {
    registrarIntentoFallido(claveIp);
    return res.status(401).json({ error: 'Teléfono no registrado en BARRIO' });
  }
  
  if (!verificarPin(pin, user.pin_seguridad)) {
    const regTel = registrarIntentoFallido(claveTel);
    registrarIntentoFallido(claveIp);
    sendTelegramAlert(`⚠️ <b>PIN INCORRECTO</b>\n🕐 ${fechaChile(new Date())}\nUsuario: ${user.nickname||user.nombre}\nTel: ${user.telefono}\nIntentos: ${regTel.count}/5`);
    return res.status(401).json({ error: 'PIN incorrecto' });
  }
  
  if (user.is_blocked) return res.status(403).json({ error: 'Cuenta bloqueada. Contacta al administrador.' });

  // PIN correcto → limpiar contador de intentos fallidos
  limpiarIntentosFallidos(claveTel);
  limpiarIntentosFallidos(claveIp);

  // ── MIGRACIÓN GRADUAL: si el PIN era texto plano, ahora guardarlo como hash ──
  if (user.pin_seguridad && user.pin_seguridad.length !== 128) {
    try {
      const hash = hashPin(pin);
      await runSql('UPDATE usuarios SET pin_seguridad = ? WHERE id = ?', [hash, user.id]);
      console.log(`🔒 PIN del usuario ${user.id} migrado a hash`);
    } catch(e) { console.warn('No se pudo migrar PIN a hash:', e.message); }
  }

  // Actualizar device_id con el nuevo celular
  if (device_id && device_id !== user.device_id) {
    await runSql('UPDATE usuarios SET device_id = ? WHERE id = ?', [device_id, user.id]);
    user.device_id = device_id;
  }

  // NO devolver el PIN al cliente — limpiar antes de responder
  const userResponse = { ...user };
  delete userResponse.pin_seguridad;

  sendTelegramAlert(`🔑 <b>LOGIN</b>\n🕐 ${fechaChile(new Date())}\nUsuario: ${user.nickname||user.nombre}\nTel: ${user.telefono}`);
  res.json({ user: userResponse });
});

app.get('/api/verificar-usuario/:id', async (req, res) => {
  const u = await queryOne('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'No encontrado' });
  const userResponse = { ...u };
  delete userResponse.pin_seguridad;
  res.json(userResponse);
});

app.put('/api/usuarios/:id/accept-terms', async (req, res) => {
  await runSql('UPDATE usuarios SET terms_accepted = 1 WHERE id = ?', [req.params.id]);
  const u = await queryOne('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'No encontrado' });
  const userResponse = { ...u };
  delete userResponse.pin_seguridad;
  res.json(userResponse);
});

// ─── SISTEMA "OLVIDÉ MI PIN" HÍBRIDO ─────────────────────────────────────
// Verifica 4 datos: nombre, teléfono, email, sector
// AUTOMÁTICO si todo coincide y no hay nada sospechoso
// MANUAL si hay señales de alerta (queda pendiente para que el admin apruebe)
app.post('/api/olvide-pin', rateLimitMiddleware(5), async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const nombre = String(req.body.nombre || '').trim();
  const telefono = String(req.body.telefono || '').trim();
  const email = String(req.body.email || '').trim();
  const sector = String(req.body.sector || '').trim();

  if (!nombre || !telefono || !email || !sector) {
    return res.status(400).json({ error: 'Debes completar los 4 campos' });
  }

  // Verificar si hay demasiadas solicitudes desde esta IP en la última hora
  const intentosIP = await queryOne(`SELECT COUNT(*) as total FROM solicitudes_pin WHERE ip_origen = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`, [ip]);
  if (intentosIP && intentosIP.total >= 5) {
    sendTelegramAlert(`🚨 <b>ATAQUE OLVIDÉ PIN</b>\nIP: ${ip}\nIntentos en 1 hora: ${intentosIP.total}\nBloqueado temporalmente.`);
    return res.status(429).json({ error: 'Demasiadas solicitudes desde tu dispositivo. Intenta más tarde.' });
  }

  // Buscar usuario por teléfono
  const user = await queryOne('SELECT * FROM usuarios WHERE telefono = ?', [telefono]);

  // Determinar si los datos coinciden
  let datosCorrectos = false;
  let campoFallido = null;
  if (!user) {
    campoFallido = 'telefono';
  } else if (user.is_blocked) {
    campoFallido = 'bloqueado';
  } else {
    // Comparar campos con tolerancia (insensible a mayúsculas/minúsculas y espacios)
    const norm = (s) => String(s||'').trim().toLowerCase();
    if (norm(user.nombre) !== norm(nombre)) campoFallido = 'nombre';
    else if (norm(user.email) !== norm(email)) campoFallido = 'email';
    else if (!norm(user.direccion).includes(norm(sector)) && !norm(sector).includes(norm(user.direccion))) campoFallido = 'sector';
    else datosCorrectos = true;
  }

  // Detectar señales de alerta para decidir AUTOMÁTICO vs MANUAL
  let modo = 'automatico';
  const motivosAlerta = [];

  if (datosCorrectos) {
    // ¿Hizo reset en los últimos 7 días?
    const recientes = await queryOne(`SELECT COUNT(*) as total FROM solicitudes_pin WHERE usuario_id = ? AND resultado = 'enviado' AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)`, [user.id]);
    if (recientes && recientes.total > 0) {
      modo = 'manual';
      motivosAlerta.push('Ya se envió un PIN hace menos de 7 días');
    }

    // ¿Hay intentos fallidos previos para este usuario?
    const fallidos = await queryOne(`SELECT COUNT(*) as total FROM solicitudes_pin WHERE telefono_ingresado = ? AND datos_correctos = 0 AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)`, [telefono]);
    if (fallidos && fallidos.total >= 2) {
      modo = 'manual';
      motivosAlerta.push(`${fallidos.total} intentos fallidos previos hoy`);
    }
  }

  // Registrar la solicitud en la BD
  let pinEnviado = 0;
  let resultado = datosCorrectos ? (modo === 'automatico' ? 'enviado' : 'pendiente_aprobacion') : 'rechazado';

  // Si es AUTOMÁTICO y datos correctos, generar y enviar PIN nuevo
  if (datosCorrectos && modo === 'automatico') {
    const pinNuevo = String(Math.floor(1000 + Math.random() * 9000));
    const pinHasheado = hashPin(pinNuevo);
    await runSql('UPDATE usuarios SET pin_seguridad = ? WHERE id = ?', [pinHasheado, user.id]);
    if (user.email) sendEmailPin(user.email, user.nickname || user.nombre, pinNuevo);
    pinEnviado = 1;
  }

  await runSql(
    'INSERT INTO solicitudes_pin (usuario_id, nombre_ingresado, telefono_ingresado, email_ingresado, sector_ingresado, ip_origen, datos_correctos, campo_fallido, resultado, modo, pin_enviado) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [user?.id || null, nombre, telefono, email, sector, ip, datosCorrectos ? 1 : 0, campoFallido, resultado, modo, pinEnviado]
  );

  // Notificar por Telegram
  if (datosCorrectos && modo === 'automatico') {
    sendTelegramAlert(`🔑 <b>PIN ENVIADO (Automático)</b>\n🕐 ${fechaChile(new Date())}\nUsuario: ${user.nombre} (${user.nickname})\nTel: ${telefono}\nEmail: ${user.email}\n✅ Verificación correcta. PIN nuevo enviado al correo.`);
  } else if (datosCorrectos && modo === 'manual') {
    sendTelegramAlert(`⚠️ <b>SOLICITUD PIN PENDIENTE DE APROBACIÓN</b>\n🕐 ${fechaChile(new Date())}\nUsuario: ${user.nombre} (${user.nickname})\nTel: ${telefono}\nMotivos:\n• ${motivosAlerta.join('\n• ')}\n\nRevisa la pestaña "🔑 Solicitudes PIN" en el panel admin.`);
  } else {
    sendTelegramAlert(`❌ <b>INTENTO FALLIDO OLVIDÉ PIN</b>\n🕐 ${fechaChile(new Date())}\nTel ingresado: ${telefono}\nNombre: ${nombre}\nEmail: ${email}\nCampo que falló: ${campoFallido}\nIP: ${ip}`);
  }

  // Respuesta al usuario (siempre la misma para no revelar información)
  if (datosCorrectos && modo === 'automatico') {
    res.json({ ok: true, modo: 'automatico', mensaje: '✅ Verificación correcta. Te enviamos un PIN nuevo a tu correo electrónico.' });
  } else if (datosCorrectos && modo === 'manual') {
    res.json({ ok: true, modo: 'manual', mensaje: '✅ Tu solicitud fue recibida. El administrador la revisará y te enviará el PIN al correo en las próximas horas.' });
  } else {
    res.json({ ok: false, mensaje: 'Los datos ingresados no coinciden con tu cuenta. Si tu mascota apareció o tienes problemas, contacta al administrador por WhatsApp.' });
  }
});

app.get('/api/muro', async (req, res) => {
  res.json(await queryAll('SELECT m.*, COALESCE(u.nickname, u.nombre) as autor FROM muro_comunitario m JOIN usuarios u ON m.usuario_id = u.id WHERE m.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY m.created_at DESC LIMIT 50'));
});

app.get('/api/mascotas', async (req, res) => {
  // Solo mostrar mascotas con menos de 15 días (después aún quedan 15 de gracia para que el dueño la borre)
  res.json(await queryAll('SELECT * FROM mascotas_perdidas WHERE created_at > DATE_SUB(NOW(), INTERVAL 15 DAY) ORDER BY created_at DESC'));
});

app.post('/api/mascotas', rateLimitMiddleware(15), async (req, res) => {
  // Limpiar textos contra XSS
  const nombre_mascota = limpiarTexto(req.body.nombre_mascota, 100);
  const tipo_animal = limpiarTexto(req.body.tipo_animal, 50);
  const nombre_contacto = limpiarTexto(req.body.nombre_contacto, 100);
  const telefono = limpiarTexto(req.body.telefono, 30);
  const ubicacion_extravio = limpiarTexto(req.body.ubicacion_extravio, 200);
  const caracteristicas = limpiarTexto(req.body.caracteristicas, 500);

  // Validar foto si viene
  const validacionFoto = validarFotoBase64(req.body.foto_base64);
  if (!validacionFoto.valida) {
    return res.status(400).json({ error: validacionFoto.error });
  }

  if (!nombre_contacto || !telefono) {
    return res.status(400).json({ error: 'Nombre de contacto y teléfono son obligatorios' });
  }

  await runSql('INSERT INTO mascotas_perdidas (nombre_mascota, tipo_animal, nombre_contacto, telefono, ubicacion_extravio, caracteristicas, foto_base64) VALUES (?,?,?,?,?,?,?)', [nombre_mascota, tipo_animal, nombre_contacto, telefono, ubicacion_extravio, caracteristicas, validacionFoto.foto]);
  sendTelegramAlert(`🐶 <b>MASCOTA PERDIDA</b>\n🕐 ${fechaChile(new Date())}\nNombre: ${nombre_mascota}\nContacto: ${nombre_contacto}\nTel: ${telefono}\nLugar: ${ubicacion_extravio}`);
  
  if (req.body.latitud && req.body.longitud) {
    sendPushToNearbyUsers(req.body.latitud, req.body.longitud, `🐶 MASCOTA PERDIDA`, `Se ha reportado la pérdida de ${nombre_mascota} cerca de aquí.`);
  }

  res.json({ ok: true });
});

// ─── DUEÑO MARCA MASCOTA COMO ENCONTRADA ─────────────────────────────────
// Verifica con teléfono + PIN del dueño para que solo él pueda cerrar su reporte
app.post('/api/mascotas/:id/encontrada', rateLimitMiddleware(10), async (req, res) => {
  const { telefono, pin } = req.body;
  const mascotaId = parseInt(req.params.id);
  if (!mascotaId || !telefono || !pin) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  // Verificar que el dueño existe con ese teléfono y PIN correcto
  const user = await queryOne('SELECT id, nickname, nombre, pin_seguridad FROM usuarios WHERE telefono = ?', [telefono]);
  if (!user || !verificarPin(pin, user.pin_seguridad)) {
    return res.status(403).json({ error: 'Teléfono o PIN incorrecto' });
  }

  // Verificar que la mascota fue reportada con ese mismo teléfono
  const mascota = await queryOne('SELECT * FROM mascotas_perdidas WHERE id = ? AND telefono = ?', [mascotaId, telefono]);
  if (!mascota) {
    return res.status(404).json({ error: 'No encontramos esta mascota a tu nombre' });
  }

  // Eliminar el aviso
  await runSql('DELETE FROM mascotas_perdidas WHERE id = ?', [mascotaId]);
  sendTelegramAlert(`🎉 <b>MASCOTA ENCONTRADA</b>\n🕐 ${fechaChile(new Date())}\nDueño: ${user.nickname || user.nombre}\nMascota: ${mascota.nombre_mascota || 'Sin nombre'}\nFue removida del listado.`);
  res.json({ ok: true, mensaje: '¡Gracias por avisar! Tu aviso fue eliminado.' });
});

app.post('/api/muro', rateLimitMiddleware(20), async (req, res) => {
  const { usuario_id, device_id, lat, lng } = req.body;
  
  // Limpiar contenido contra XSS
  const contenido = limpiarTexto(req.body.contenido, 500);
  if (!contenido || contenido.length < 2) {
    return res.status(400).json({ error: 'El contenido no puede estar vacío' });
  }
  
  const user = await queryOne('SELECT nickname, nombre, is_stolen, device_id FROM usuarios WHERE id = ?', [usuario_id]);
  await runSql('INSERT INTO muro_comunitario (usuario_id, contenido) VALUES (?,?)', [usuario_id, contenido]);
  
  // Rastrear dispositivo extraviado
  if (user?.is_stolen || (device_id && await isDeviceStolen(device_id))) {
    await checkStolenActivity(user?.device_id || device_id, lat, lng, `Publicó en muro: "${contenido.substring(0, 50)}..."`);
  }
  
  if (user?.is_stolen) {
    sendTelegramAlert(`🚨 <b>EXTRAVÍO DETECTADO (MURO)</b>\nUsuario: ${user.nickname || user.nombre}\nContenido: ${contenido}`);
  } else {
    sendTelegramAlert(`💬 <b>NUEVO POST</b>\n🕐 ${fechaChile(new Date())}\nAutor: ${user?.nickname || user?.nombre}\nMsg: ${contenido}`);
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
  res.json({ status: 'ok', server: 'BARRIO PRO', db: 'Cloud (MySQL)', time: new Date().toISOString() });
});
app.post('/api/ping', async (req, res) => {
  const { device_id, lat, lng } = req.body;
  if (device_id) {
    await runSql('INSERT INTO visitas (device_id) VALUES (?)', [device_id]);
    if (lat != null && lng != null) {
      await runSql('UPDATE usuarios SET last_lat = ?, last_lng = ? WHERE device_id = ?', [lat, lng, device_id]);
    }
    const u = await queryOne('SELECT is_stolen FROM usuarios WHERE device_id = ?', [device_id]);
    if (u?.is_stolen) {
      await checkStolenActivity(device_id, lat, lng, 'Aplicación en uso (Ping de estado)');
      return res.json({ status: 'stolen' });
    }
    return res.json({ status: 'ok' });
  }
  res.json({ status: 'ok' });
});

app.post('/api/stolen-location', async (req, res) => {
  const { device_id, latitud, longitud } = req.body;
  await checkStolenActivity(device_id, latitud, longitud, 'Rastreo silencioso de ubicación (10s)');
  res.json({ ok: true });
});

app.post('/api/reportar-extravio', rateLimitMiddleware(10), async (req, res) => {
  const { reported_phone, pin } = req.body;
  const u = await queryOne('SELECT id, nickname, nombre, pin_seguridad FROM usuarios WHERE telefono = ?', [reported_phone]);
  if (!u || !verificarPin(pin, u.pin_seguridad)) {
    sendTelegramAlert(`⚠️ <b>FALLO REPORTE EXTRAVÍO</b>\nIntento para: ${reported_phone} (PIN Incorrecto)`);
    return res.status(403).json({ error: 'PIN incorrecto' });
  }
  await runSql('UPDATE usuarios SET is_stolen = 1 WHERE id = ?', [u.id]);
  sendTelegramAlert(`🚨 <b>EXTREMA: EXTRAVÍO CONFIRMADO</b>\nTeléfono: ${reported_phone}\nUsuario: ${u.nickname || u.nombre}`);
  res.json({ success: true });
});

// Solicitud de baja voluntaria por el propio usuario
app.post('/api/usuarios/:id/solicitar-baja', async (req, res) => {
  try {
    const userId = req.params.id;
    const u = await queryOne('SELECT nombre, nickname, telefono, email FROM usuarios WHERE id = ?', [userId]);
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Fecha y hora local Chile (UTC-4)
    const ahora = new Date();
    const fechaLocal = ahora.toLocaleString('es-CL', { timeZone: 'America/Santiago' });

    // Guardar flag + fecha en la BD
    await runSql(
      'UPDATE usuarios SET baja_solicitada = 1, baja_fecha = ? WHERE id = ?',
      [fechaLocal, userId]
    );

    // Alerta al administrador vía Telegram
    const nombreUsuario = u.nickname || u.nombre || 'Sin nombre';
    sendTelegramAlert(
      `🗑️ <b>SOLICITUD DE BAJA VOLUNTARIA</b>\n` +
      `👤 Usuario: ${nombreUsuario}\n` +
      `📱 Teléfono: ${u.telefono}\n` +
      `📧 Email: ${u.email || 'sin email'}\n` +
      `🆔 ID: ${userId}\n` +
      `🕐 Fecha: ${fechaLocal}\n\n` +
      `⚠️ El usuario solicitó eliminar su cuenta.\n` +
      `Revisar y eliminar desde el panel admin.`
    );

    console.log(`✅ Solicitud de baja registrada: usuario ${userId} (${nombreUsuario}) - ${fechaLocal}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ Error solicitud-baja:', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/emergencia', async (req, res) => {
  const { usuario_id, institucion, latitud, longitud } = req.body;
  const user = await queryOne('SELECT nickname, nombre, telefono FROM usuarios WHERE id = ?', [usuario_id]);
  await runSql('INSERT INTO registro_emergencias (usuario_id, institucion, latitud, longitud) VALUES (?,?,?,?)', [usuario_id, institucion, latitud, longitud]);
  const mapaEmerg = (latitud && longitud) ? `\n📍 <a href="https://maps.google.com/?q=${latitud},${longitud}">Ver en mapa</a>` : '';
  sendTelegramAlert(`🚨 <b>EMERGENCIA ACTIVADA</b>\n🕐 ${fechaChile(new Date())}\nInstitución: ${institucion}\nVecino: ${user?.nickname || user?.nombre}\nTel: ${user?.telefono}${mapaEmerg}`);
  res.json({ ok: true });
});

app.post('/api/admin/mensaje', rateLimitMiddleware(15), async (req, res) => {
  const { usuario_id } = req.body;
  // Limpiar mensaje contra XSS
  const mensaje = limpiarTexto(req.body.mensaje, 1000);
  if (!mensaje || mensaje.length < 2) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  }
  
  const user = await queryOne('SELECT nickname, nombre, telefono FROM usuarios WHERE id = ?', [usuario_id]);
  await runSql('INSERT INTO mensajes_admin (usuario_id, mensaje) VALUES (?,?)', [usuario_id, mensaje]);
  sendTelegramAlert(`✉️ <b>MENSAJE AL BUZÓN</b>\n🕐 ${fechaChile(new Date())}\nDe: ${user?.nickname || user?.nombre}\nTel: ${user?.telefono||'No registrado'}\nMsg: ${mensaje}`);
  res.json({ ok: true });
});

// ADMIN API
app.post('/api/admin/login', rateLimitMiddleware(10), (req, res) => {
  const { passwords } = req.body;
  if (!passwords || !Array.isArray(passwords) || passwords.length !== 3) {
    return res.status(400).json({ error: 'Formato incorrecto' });
  }
  if (passwords.every((p, i) => p === ADMIN_PASSWORDS[i])) {
    const t = getPersistentToken();
    adminTokens.add(t);
    sendTelegramAlert(`🔐 <b>ADMIN: SESIÓN INICIADA</b>\n🕐 ${fechaChile(new Date())}\nAcceso exitoso al panel.`);
    res.json({ token: t });
  } else {
    sendTelegramAlert(`⚠️ <b>ADMIN: FALLO DE ACCESO</b>\n🕐 ${fechaChile(new Date())}\nIntento de login con llaves incorrectas.`);
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
  const visitasHoy = (await queryOne('SELECT COUNT(*) as count FROM visitas WHERE DATE(created_at) = CURDATE()')).count;
  const totalMascotas = (await queryOne('SELECT COUNT(*) as count FROM mascotas_perdidas')).count;
  const topLocales = await queryAll('SELECT l.nombre, COUNT(c.id) as calif_count, AVG(c.estrellas) as avg_estrellas FROM locales l LEFT JOIN calificaciones c ON l.id = c.local_id GROUP BY l.id ORDER BY calif_count DESC LIMIT 5');
  res.json({ totalVisitas, uniqueUsers, visitasHoy, totalMascotas, topLocales });
});

app.get('/api/admin/usuarios', authMw, async (req, res) => res.json(await queryAll('SELECT * FROM usuarios ORDER BY created_at DESC')));

// ─── ADMIN: SOLICITUDES DE PIN ───────────────────────────────────────────
app.get('/api/admin/solicitudes-pin', authMw, async (req, res) => {
  res.json(await queryAll(`
    SELECT s.*, u.nombre as user_nombre, u.nickname as user_nickname, u.email as user_email
    FROM solicitudes_pin s
    LEFT JOIN usuarios u ON s.usuario_id = u.id
    ORDER BY s.created_at DESC
    LIMIT 200
  `));
});

app.post('/api/admin/solicitudes-pin/:id/aprobar', authMw, async (req, res) => {
  const id = parseInt(req.params.id);
  const solicitud = await queryOne('SELECT * FROM solicitudes_pin WHERE id = ?', [id]);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (solicitud.resultado !== 'pendiente_aprobacion') return res.status(400).json({ error: 'Esta solicitud ya fue procesada' });
  if (!solicitud.usuario_id) return res.status(400).json({ error: 'No hay usuario asociado' });

  const user = await queryOne('SELECT * FROM usuarios WHERE id = ?', [solicitud.usuario_id]);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Generar PIN nuevo y enviar al correo registrado
  const pinNuevo = String(Math.floor(1000 + Math.random() * 9000));
  const pinHasheado = hashPin(pinNuevo);
  await runSql('UPDATE usuarios SET pin_seguridad = ? WHERE id = ?', [pinHasheado, user.id]);
  if (user.email) sendEmailPin(user.email, user.nickname || user.nombre, pinNuevo);

  await runSql('UPDATE solicitudes_pin SET resultado = ?, pin_enviado = 1 WHERE id = ?', ['enviado_manual', id]);
  sendTelegramAlert(`✅ <b>ADMIN: PIN APROBADO Y ENVIADO</b>\n🕐 ${fechaChile(new Date())}\nUsuario: ${user.nombre} (${user.nickname})\nTel: ${user.telefono}\nEl PIN nuevo fue enviado a: ${user.email}`);
  res.json({ ok: true });
});

app.post('/api/admin/solicitudes-pin/:id/rechazar', authMw, async (req, res) => {
  const id = parseInt(req.params.id);
  const solicitud = await queryOne('SELECT * FROM solicitudes_pin WHERE id = ?', [id]);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

  await runSql('UPDATE solicitudes_pin SET resultado = ? WHERE id = ?', ['rechazado_admin', id]);
  sendTelegramAlert(`❌ <b>ADMIN: SOLICITUD PIN RECHAZADA</b>\n🕐 ${fechaChile(new Date())}\nTel: ${solicitud.telefono_ingresado}\nNombre: ${solicitud.nombre_ingresado}`);
  res.json({ ok: true });
});

app.get('/api/admin/export/solicitudes-pin', authMw, async (req, res) => {
  const rows = await queryAll(`
    SELECT s.id, s.nombre_ingresado, s.telefono_ingresado, s.email_ingresado, s.sector_ingresado,
           s.ip_origen, s.datos_correctos, s.campo_fallido, s.resultado, s.modo, s.pin_enviado, s.created_at
    FROM solicitudes_pin s
    ORDER BY s.created_at DESC
  `);
  sendTelegramAlert(`📥 <b>ADMIN: DESCARGA PLANILLA SOLICITUDES PIN</b>\n🕐 ${fechaChile(new Date())}`);
  sendCsvDownload(res, 'planilla_solicitudes_pin.csv',
    ['ID','Nombre','Teléfono','Email','Sector','IP','Datos Correctos','Campo Fallido','Resultado','Modo','PIN Enviado','Fecha'],
    ['id','nombre_ingresado','telefono_ingresado','email_ingresado','sector_ingresado','ip_origen','datos_correctos','campo_fallido','resultado','modo','pin_enviado','created_at'],
    rows);
});

// ─── FICHA COMPLETA DEL USUARIO — toda su actividad en BARRIO ──────────────
app.get('/api/admin/usuarios/:id/ficha', authMw, async (req, res) => {
  const userId = parseInt(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID inválido' });

  try {
    // Datos del usuario (sin el PIN por seguridad)
    const usuario = await queryOne('SELECT * FROM usuarios WHERE id = ?', [userId]);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    delete usuario.pin_seguridad;

    // Toda la actividad en paralelo
    const [reportes, posts, mensajes, emergencias, mascotas, extravios, calificaciones, visitas] = await Promise.all([
      queryAll('SELECT id, tipo_reporte, detalles, latitud, longitud, foto_base64, fecha_expiracion, created_at FROM reportes_ciudadanos WHERE usuario_id = ? ORDER BY created_at DESC', [userId]),
      queryAll('SELECT id, contenido, created_at FROM muro_comunitario WHERE usuario_id = ? ORDER BY created_at DESC', [userId]),
      queryAll('SELECT id, mensaje, leido, created_at FROM mensajes_admin WHERE usuario_id = ? ORDER BY created_at DESC', [userId]),
      queryAll('SELECT id, institucion, latitud, longitud, created_at FROM registro_emergencias WHERE usuario_id = ? ORDER BY created_at DESC', [userId]),
      queryAll('SELECT id, nombre_mascota, tipo_animal, ubicacion_extravio, foto_base64, created_at FROM mascotas_perdidas WHERE telefono = ? ORDER BY created_at DESC', [usuario.telefono]),
      queryAll('SELECT id, latitud, longitud, created_at FROM registro_extravios WHERE usuario_id = ? ORDER BY created_at DESC LIMIT 20', [userId]),
      queryAll('SELECT c.id, c.local_id, c.estrellas, c.comentario, c.created_at, l.nombre as local_nombre FROM calificaciones c LEFT JOIN locales l ON c.local_id = l.id WHERE c.device_id = ? ORDER BY c.created_at DESC', [usuario.device_id || '']),
      queryAll('SELECT COUNT(*) as total FROM visitas WHERE device_id = ?', [usuario.device_id || ''])
    ]);

    const resumen = {
      total_reportes: reportes.length,
      total_posts_muro: posts.length,
      total_mensajes_admin: mensajes.length,
      total_emergencias: emergencias.length,
      total_mascotas: mascotas.length,
      total_extravios_tracking: extravios.length,
      total_calificaciones: calificaciones.length,
      total_visitas: visitas[0]?.total || 0
    };

    res.json({ usuario, resumen, reportes, posts, mensajes, emergencias, mascotas, extravios, calificaciones });
  } catch (e) {
    console.error('Error en ficha de usuario:', e.message);
    res.status(500).json({ error: 'Error al cargar la ficha' });
  }
});

// ─── DESCARGA CSV COMPLETA DEL USUARIO ────────────────────────────────────
app.get('/api/admin/usuarios/:id/ficha-csv', authMw, async (req, res) => {
  const userId = parseInt(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID inválido' });

  try {
    const usuario = await queryOne('SELECT * FROM usuarios WHERE id = ?', [userId]);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    delete usuario.pin_seguridad;

    const [reportes, posts, mensajes, emergencias, mascotas, extravios, calificaciones] = await Promise.all([
      queryAll('SELECT id, tipo_reporte, detalles, latitud, longitud, fecha_expiracion, created_at FROM reportes_ciudadanos WHERE usuario_id = ? ORDER BY created_at DESC', [userId]),
      queryAll('SELECT id, contenido, created_at FROM muro_comunitario WHERE usuario_id = ? ORDER BY created_at DESC', [userId]),
      queryAll('SELECT id, mensaje, leido, created_at FROM mensajes_admin WHERE usuario_id = ? ORDER BY created_at DESC', [userId]),
      queryAll('SELECT id, institucion, latitud, longitud, created_at FROM registro_emergencias WHERE usuario_id = ? ORDER BY created_at DESC', [userId]),
      queryAll('SELECT id, nombre_mascota, tipo_animal, nombre_contacto, telefono, ubicacion_extravio, caracteristicas, created_at FROM mascotas_perdidas WHERE telefono = ? ORDER BY created_at DESC', [usuario.telefono]),
      queryAll('SELECT id, latitud, longitud, created_at FROM registro_extravios WHERE usuario_id = ? ORDER BY created_at DESC', [userId]),
      queryAll('SELECT c.id, c.local_id, c.estrellas, c.comentario, c.created_at, l.nombre as local_nombre FROM calificaciones c LEFT JOIN locales l ON c.local_id = l.id WHERE c.device_id = ? ORDER BY c.created_at DESC', [usuario.device_id || ''])
    ]);

    // Construir CSV con varias secciones
    let csv = '\ufeff';
    csv += `FICHA COMPLETA DEL USUARIO - BARRIO\n`;
    csv += `Generada: ${fechaChile(new Date())}\n\n`;

    csv += `=== DATOS PERSONALES ===\n`;
    csv += `Campo;Valor\n`;
    csv += `ID;${csvCell(usuario.id)}\n`;
    csv += `Nombre;${csvCell(usuario.nombre)}\n`;
    csv += `Nickname;${csvCell(usuario.nickname)}\n`;
    csv += `Teléfono;${csvCell(usuario.telefono)}\n`;
    csv += `Email;${csvCell(usuario.email)}\n`;
    csv += `Sector/Dirección;${csvCell(usuario.direccion)}\n`;
    csv += `Casa Latitud;${csvCell(usuario.home_lat)}\n`;
    csv += `Casa Longitud;${csvCell(usuario.home_lng)}\n`;
    csv += `Casa URL Mapa;${csvCell(usuario.home_lat && usuario.home_lng ? `https://maps.google.com/?q=${usuario.home_lat},${usuario.home_lng}` : '')}\n`;
    csv += `Última Lat;${csvCell(usuario.last_lat)}\n`;
    csv += `Última Lng;${csvCell(usuario.last_lng)}\n`;
    csv += `Última URL Mapa;${csvCell(usuario.last_lat && usuario.last_lng ? `https://maps.google.com/?q=${usuario.last_lat},${usuario.last_lng}` : '')}\n`;
    csv += `Verificado;${csvCell(usuario.is_verified ? 'Sí' : 'No')}\n`;
    csv += `Bloqueado;${csvCell(usuario.is_blocked ? 'Sí' : 'No')}\n`;
    csv += `Extraviado;${csvCell(usuario.is_stolen ? 'Sí' : 'No')}\n`;
    csv += `Términos aceptados;${csvCell(usuario.terms_accepted ? 'Sí' : 'No')}\n`;
    csv += `Baja solicitada;${csvCell(usuario.baja_solicitada ? 'Sí' : 'No')}\n`;
    csv += `Fecha de baja;${csvCell(usuario.baja_fecha ? fechaChile(usuario.baja_fecha) : '')}\n`;
    csv += `Fecha registro;${csvCell(fechaChile(usuario.created_at))}\n\n`;

    csv += `=== REPORTES CIUDADANOS (${reportes.length}) ===\n`;
    csv += `ID;Fecha;Tipo;Detalles;Latitud;Longitud;URL_Mapa;Expira\n`;
    reportes.forEach(r => {
      const url = r.latitud && r.longitud ? `https://maps.google.com/?q=${r.latitud},${r.longitud}` : '';
      csv += `${csvCell(r.id)};${csvCell(fechaChile(r.created_at))};${csvCell(r.tipo_reporte)};${csvCell(r.detalles)};${csvCell(r.latitud)};${csvCell(r.longitud)};${csvCell(url)};${csvCell(r.fecha_expiracion ? fechaChile(r.fecha_expiracion) : '')}\n`;
    });
    csv += `\n`;

    csv += `=== POSTS EN MURO COMUNITARIO (${posts.length}) ===\n`;
    csv += `ID;Fecha;Contenido\n`;
    posts.forEach(p => {
      csv += `${csvCell(p.id)};${csvCell(fechaChile(p.created_at))};${csvCell(p.contenido)}\n`;
    });
    csv += `\n`;

    csv += `=== MENSAJES AL ADMIN (${mensajes.length}) ===\n`;
    csv += `ID;Fecha;Leído;Mensaje\n`;
    mensajes.forEach(m => {
      csv += `${csvCell(m.id)};${csvCell(fechaChile(m.created_at))};${csvCell(m.leido ? 'Sí' : 'No')};${csvCell(m.mensaje)}\n`;
    });
    csv += `\n`;

    csv += `=== EMERGENCIAS ACTIVADAS (${emergencias.length}) ===\n`;
    csv += `ID;Fecha;Institución;Latitud;Longitud;URL_Mapa\n`;
    emergencias.forEach(e => {
      const url = e.latitud && e.longitud ? `https://maps.google.com/?q=${e.latitud},${e.longitud}` : '';
      csv += `${csvCell(e.id)};${csvCell(fechaChile(e.created_at))};${csvCell(e.institucion)};${csvCell(e.latitud)};${csvCell(e.longitud)};${csvCell(url)}\n`;
    });
    csv += `\n`;

    csv += `=== MASCOTAS PERDIDAS (${mascotas.length}) ===\n`;
    csv += `ID;Fecha;Nombre Mascota;Tipo;Contacto;Teléfono;Lugar;Características\n`;
    mascotas.forEach(m => {
      csv += `${csvCell(m.id)};${csvCell(fechaChile(m.created_at))};${csvCell(m.nombre_mascota)};${csvCell(m.tipo_animal)};${csvCell(m.nombre_contacto)};${csvCell(m.telefono)};${csvCell(m.ubicacion_extravio)};${csvCell(m.caracteristicas)}\n`;
    });
    csv += `\n`;

    csv += `=== CALIFICACIONES A LOCALES (${calificaciones.length}) ===\n`;
    csv += `ID;Fecha;Local;Estrellas;Comentario\n`;
    calificaciones.forEach(c => {
      csv += `${csvCell(c.id)};${csvCell(fechaChile(c.created_at))};${csvCell(c.local_nombre)};${csvCell(c.estrellas)};${csvCell(c.comentario)}\n`;
    });
    csv += `\n`;

    csv += `=== RASTREO DE UBICACIONES (${extravios.length}) ===\n`;
    csv += `ID;Fecha;Latitud;Longitud;URL_Mapa\n`;
    extravios.forEach(e => {
      const url = e.latitud && e.longitud ? `https://maps.google.com/?q=${e.latitud},${e.longitud}` : '';
      csv += `${csvCell(e.id)};${csvCell(fechaChile(e.created_at))};${csvCell(e.latitud)};${csvCell(e.longitud)};${csvCell(url)}\n`;
    });

    const filename = `ficha_usuario_${usuario.id}_${(usuario.nickname||usuario.nombre||'').replace(/\s+/g,'_').replace(/[^\w-]/g,'')}.csv`;
    sendTelegramAlert(`📥 <b>ADMIN: DESCARGA FICHA USUARIO</b>\n🕐 ${fechaChile(new Date())}\nUsuario: ${usuario.nombre} (ID ${usuario.id})`);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) {
    console.error('Error en descarga CSV:', e.message);
    res.status(500).json({ error: 'Error al generar planilla' });
  }
});

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

app.get('/api/admin/muro', authMw, async (req, res) => {
  res.json(await queryAll(`
    SELECT m.*, COALESCE(u.nickname, u.nombre) as autor, u.telefono as autor_telefono
    FROM muro_comunitario m
    JOIN usuarios u ON m.usuario_id = u.id
    ORDER BY m.created_at DESC
    LIMIT 500
  `));
});

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

app.get('/api/admin/ubicacion', authMw, async (req, res) => res.json(await queryAll('SELECT r.*, u.nombre, u.telefono FROM registro_extravios r JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.created_at DESC')));

app.delete('/api/admin/ubicacion/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM registro_extravios WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: UBICACIÓN BORRADO</b>\nID: ${req.params.id}`);
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

app.get('/api/admin/mascotas', authMw, async (req, res) => {
  res.json(await queryAll('SELECT * FROM mascotas_perdidas ORDER BY created_at DESC'));
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
  const { nombre, direccion, latitud, longitud, horario_apertura, horario_cierre, dias_atencion, acepta_efectivo, acepta_tarjeta } = req.body;
  if (!nombre || !latitud || !longitud) return res.status(400).json({ error: 'Nombre, latitud y longitud son obligatorios' });
  await runSql('INSERT INTO locales (nombre,direccion,latitud,longitud,horario_apertura,horario_cierre,dias_atencion,acepta_efectivo,acepta_tarjeta) VALUES (?,?,?,?,?,?,?,?,?)',
    [nombre, direccion||'', latitud, longitud, horario_apertura||'08:00', horario_cierre||'20:00', dias_atencion||'lun-sab', acepta_efectivo?1:0, acepta_tarjeta?1:0]);
  sendTelegramAlert(`➕ <b>ADMIN: NUEVO LOCAL</b>\n🕐 ${fechaChile(new Date())}\nNombre: ${nombre}\nDirección: ${direccion||'No indicada'}`);
  res.json({ ok: true });
});

app.put('/api/admin/locales/:id', authMw, async (req, res) => {
  const { nombre, direccion, latitud, longitud, horario_apertura, horario_cierre, dias_atencion, acepta_efectivo, acepta_tarjeta } = req.body;
  await runSql('UPDATE locales SET nombre=?,direccion=?,latitud=?,longitud=?,horario_apertura=?,horario_cierre=?,dias_atencion=?,acepta_efectivo=?,acepta_tarjeta=? WHERE id=?',
    [nombre, direccion||'', latitud, longitud, horario_apertura||'08:00', horario_cierre||'20:00', dias_atencion||'lun-sab', acepta_efectivo?1:0, acepta_tarjeta?1:0, req.params.id]);
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

app.get('/api/admin/productos', authMw, async (req, res) => res.json(await queryAll('SELECT p.*, l.nombre as local_nombre FROM productos p JOIN locales l ON p.local_id = l.id ORDER BY l.nombre, p.nombre')));

app.post('/api/admin/productos', authMw, async (req, res) => {
  const { local_id, nombre, marca, precio, unidad, en_stock } = req.body;
  if (!local_id || !nombre || precio === undefined) return res.status(400).json({ error: 'local_id, nombre y precio son obligatorios' });
  await runSql('INSERT INTO productos (local_id, nombre, marca, precio, unidad, en_stock) VALUES (?,?,?,?,?,?)',
    [local_id, nombre, marca||'', precio, unidad||'unidad', en_stock===false||en_stock===0?0:1]);
  sendTelegramAlert(`➕ <b>ADMIN: NUEVO PRODUCTO</b>\nNombre: ${nombre}\nPrecio: $${precio}`);
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
  const { nombre, marca, precio, unidad, en_stock } = req.body;
  await runSql('UPDATE productos SET nombre=?,marca=?,precio=?,unidad=?,en_stock=? WHERE id=?',
    [nombre, marca||'', precio, unidad||'unidad', en_stock===false||en_stock===0?0:1, req.params.id]);
  sendTelegramAlert(`🛠️ <b>ADMIN: PRODUCTO ACTUALIZADO</b>\nID: ${req.params.id}\nNombre: ${nombre}`);
  res.json({ ok: true });
});

app.delete('/api/admin/productos/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM productos WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: PRODUCTO ELIMINADO</b>\nID: ${req.params.id}`);
  res.json({ ok: true });
});

app.get('/api/admin/servicios', authMw, async (req, res) => res.json(await queryAll('SELECT * FROM servicios ORDER BY tipo, nombre_prestador')));

app.post('/api/admin/servicios', authMw, async (req, res) => {
  const { tipo, nombre_prestador, telefono } = req.body;
  if (!tipo || !nombre_prestador) return res.status(400).json({ error: 'Tipo y nombre son obligatorios' });
  await runSql('INSERT INTO servicios (tipo, nombre_prestador, telefono) VALUES (?,?,?)', [tipo, nombre_prestador, telefono||'']);
  sendTelegramAlert(`➕ <b>ADMIN: NUEVO SERVICIO</b>\nTipo: ${tipo}\nPrestador: ${nombre_prestador}\nTel: ${telefono||'No indicado'}`);
  res.json({ ok: true });
});

app.put('/api/admin/servicios/:id', authMw, async (req, res) => {
  const { tipo, nombre_prestador, telefono } = req.body;
  await runSql('UPDATE servicios SET tipo=?, nombre_prestador=?, telefono=? WHERE id=?', [tipo, nombre_prestador, telefono||'', req.params.id]);
  sendTelegramAlert(`🛠️ <b>ADMIN: SERVICIO ACTUALIZADO</b>\nPrestador: ${nombre_prestador}`);
  res.json({ ok: true });
});

app.delete('/api/admin/servicios/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM servicios WHERE id = ?', [req.params.id]);
  sendTelegramAlert(`🗑️ <b>ADMIN: SERVICIO ELIMINADO</b>\nID: ${req.params.id}`);
  res.json({ ok: true });
});

app.get('/api/admin/export/mascotas', authMw, async (req, res) => {
  const rows = await queryAll('SELECT id, nombre_mascota, tipo_animal, nombre_contacto, telefono, ubicacion_extravio, caracteristicas, created_at FROM mascotas_perdidas ORDER BY created_at DESC');
  sendTelegramAlert(`📊 <b>ADMIN: EXPORTACIÓN</b>\nPlanilla mascotas perdidas.`);
  sendCsvDownload(res, 'planilla_mascotas.csv',
    ['id','nombre_mascota','tipo_animal','nombre_contacto','telefono','ubicacion_extravio','caracteristicas','created_at'],
    ['id','nombre_mascota','tipo_animal','nombre_contacto','telefono','ubicacion_extravio','caracteristicas','created_at'],
    rows);
});

app.get('/api/admin/export/servicios', authMw, async (req, res) => {
  const rows = await queryAll('SELECT * FROM servicios ORDER BY tipo, nombre_prestador');
  sendTelegramAlert(`📊 <b>ADMIN: EXPORTACIÓN</b>\nPlanilla servicios.`);
  sendCsvDownload(res, 'planilla_servicios.csv',
    ['id', 'tipo', 'nombre_prestador', 'telefono', 'created_at'],
    ['id', 'tipo', 'nombre_prestador', 'telefono', 'created_at'],
    rows);
});

app.get('/api/admin/export/reportes', authMw, async (req, res) => {
  const reports = await queryAll('SELECT r.*, u.nombre FROM reportes_ciudadanos r LEFT JOIN usuarios u ON r.usuario_id = u.id');
  sendTelegramAlert(`📊 <b>ADMIN: EXPORTACIÓN</b>\nPlanilla reportes ciudadanos.`);
  let csv = '\ufeffID;Fecha Chile;Tipo;Ubicacion_texto;Detalles;Lat;Lng;URL_Mapa;Usuario_nombre;Nombre_contacto;Telefono\n';
  reports.forEach((r) => {
    const mapUrl = (r.latitud && r.longitud) ? `https://maps.google.com/?q=${r.latitud},${r.longitud}` : '';
    csv += [r.id, fechaChile(r.created_at), r.tipo_reporte, r.ubicacion_texto, r.detalles, r.latitud, r.longitud, mapUrl, r.nombre, r.nombre_contacto, r.telefono]
      .map((x) => csvCell(x)).join(';') + '\n';
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=planilla_reportes_ciudadanos.csv');
  res.send(csv);
});

app.get('/api/admin/export/usuarios', authMw, async (req, res) => {
  const rows = await queryAll('SELECT * FROM usuarios ORDER BY created_at DESC');
  rows.forEach(r => { r.url_ultima_ubicacion = (r.last_lat && r.last_lng) ? `https://maps.google.com/?q=${r.last_lat},${r.last_lng}` : ''; });
  sendTelegramAlert(`📊 <b>ADMIN: EXPORTACIÓN</b>\nPlanilla usuarios.`);
  sendCsvDownload(res, 'planilla_usuarios.csv',
    ['id', 'nombre', 'nickname', 'telefono', 'email', 'direccion', 'device_id', 'is_verified', 'is_blocked', 'is_stolen', 'terms_accepted', 'baja_solicitada', 'baja_fecha', 'home_lat', 'home_lng', 'last_lat', 'last_lng', 'url_ultima_ubicacion', 'created_at'],
    ['id', 'nombre', 'nickname', 'telefono', 'email', 'direccion', 'device_id', 'is_verified', 'is_blocked', 'is_stolen', 'terms_accepted', 'baja_solicitada', 'baja_fecha', 'home_lat', 'home_lng', 'last_lat', 'last_lng', 'url_ultima_ubicacion', 'created_at'],
    rows);
});

app.get('/api/admin/export/locales', authMw, async (req, res) => {
  const rows = await queryAll('SELECT * FROM locales ORDER BY nombre');
  sendTelegramAlert(`📊 <b>ADMIN: EXPORTACIÓN</b>\nPlanilla locales.`);
  sendCsvDownload(res, 'planilla_locales.csv',
    ['id', 'nombre', 'direccion', 'latitud', 'longitud', 'horario_apertura', 'horario_cierre', 'dias_atencion', 'acepta_efectivo', 'acepta_tarjeta', 'created_at'],
    ['id', 'nombre', 'direccion', 'latitud', 'longitud', 'horario_apertura', 'horario_cierre', 'dias_atencion', 'acepta_efectivo', 'acepta_tarjeta', 'created_at'],
    rows);
});

app.get('/api/admin/export/productos', authMw, async (req, res) => {
  const rows = await queryAll('SELECT p.id, p.local_id, l.nombre as local_nombre, p.nombre, p.marca, p.precio, p.en_stock, p.unidad, p.created_at FROM productos p JOIN locales l ON p.local_id = l.id ORDER BY l.nombre, p.nombre');
  sendTelegramAlert(`📊 <b>ADMIN: EXPORTACIÓN</b>\nPlanilla productos.`);
  sendCsvDownload(res, 'planilla_productos.csv',
    ['id', 'local_id', 'local_nombre', 'nombre', 'marca', 'precio', 'en_stock', 'unidad', 'created_at'],
    ['id', 'local_id', 'local_nombre', 'nombre', 'marca', 'precio', 'en_stock', 'unidad', 'created_at'],
    rows);
});

app.get('/api/admin/export/muro', authMw, async (req, res) => {
  const rows = await queryAll(`
    SELECT m.id, m.usuario_id, m.contenido, m.created_at, COALESCE(u.nickname, u.nombre) as autor, u.telefono
    FROM muro_comunitario m JOIN usuarios u ON m.usuario_id = u.id ORDER BY m.created_at DESC
  `);
  sendTelegramAlert(`📊 <b>ADMIN: EXPORTACIÓN</b>\nPlanilla muro.`);
  sendCsvDownload(res, 'planilla_muro_comunitario.csv',
    ['id', 'usuario_id', 'autor', 'telefono', 'contenido', 'created_at'],
    ['id', 'usuario_id', 'autor', 'telefono', 'contenido', 'created_at'],
    rows);
});

app.get('/api/admin/export/mensajes', authMw, async (req, res) => {
  const rows = await queryAll('SELECT m.*, u.nombre, u.telefono as usuario_tel FROM mensajes_admin m JOIN usuarios u ON m.usuario_id = u.id ORDER BY m.created_at DESC');
  sendTelegramAlert(`📊 <b>ADMIN: EXPORTACIÓN</b>\nPlanilla buzón.`);
  sendCsvDownload(res, 'planilla_buzon_mensajes.csv',
    ['id', 'usuario_id', 'nombre_usuario', 'telefono_usuario', 'mensaje', 'leido', 'created_at'],
    ['id', 'usuario_id', 'nombre', 'usuario_tel', 'mensaje', 'leido', 'created_at'],
    rows);
});

app.get('/api/admin/export/ubicacion', authMw, async (req, res) => {
  const rows = await queryAll('SELECT r.*, u.nombre, u.telefono FROM registro_extravios r JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.created_at DESC');
  rows.forEach(r => { r.url_mapa = (r.latitud && r.longitud) ? `https://maps.google.com/?q=${r.latitud},${r.longitud}` : ''; });
  sendTelegramAlert(`📊 <b>ADMIN: EXPORTACIÓN</b>\nPlanilla ubicación/extravíos.`);
  sendCsvDownload(res, 'planilla_ubicacion_extravios.csv',
    ['id', 'usuario_id', 'nombre', 'telefono', 'latitud', 'longitud', 'url_mapa', 'created_at'],
    ['id', 'usuario_id', 'nombre', 'telefono', 'latitud', 'longitud', 'url_mapa', 'created_at'],
    rows);
});

app.get('/api/admin/export/emergencias', authMw, async (req, res) => {
  const rows = await queryAll('SELECT e.*, u.nombre, u.telefono FROM registro_emergencias e JOIN usuarios u ON e.usuario_id = u.id ORDER BY e.created_at DESC');
  rows.forEach(r => { r.url_mapa = (r.latitud && r.longitud) ? `https://maps.google.com/?q=${r.latitud},${r.longitud}` : ''; });
  sendTelegramAlert(`📊 <b>ADMIN: EXPORTACIÓN</b>\nPlanilla emergencias.`);
  sendCsvDownload(res, 'planilla_emergencias.csv',
    ['id', 'usuario_id', 'nombre', 'telefono', 'institucion', 'latitud', 'longitud', 'url_mapa', 'created_at'],
    ['id', 'usuario_id', 'nombre', 'telefono', 'institucion', 'latitud', 'longitud', 'url_mapa', 'created_at'],
    rows);
});

app.get('/api/admin/export/productos/:local_id', authMw, async (req, res) => {
  const local = await queryOne('SELECT nombre FROM locales WHERE id = ?', [req.params.local_id]);
  const rows = await queryAll('SELECT p.id, p.nombre, p.marca, p.precio, p.en_stock, p.unidad, p.created_at FROM productos p WHERE p.local_id = ? ORDER BY p.nombre', [req.params.local_id]);
  const nombreLocal = local?.nombre || 'local';
  sendCsvDownload(res, `planilla_${nombreLocal.replace(/\s+/g,'_')}.csv`,
    ['id', 'nombre', 'marca', 'precio', 'en_stock', 'unidad', 'created_at'],
    ['id', 'nombre', 'marca', 'precio', 'en_stock', 'unidad', 'created_at'],
    rows);
});

app.get('/api/admin/config/correo', authMw, async (req, res) => {
  const host = await queryOne("SELECT valor FROM configuracion WHERE clave = 'mail_host'");
  const user = await queryOne("SELECT valor FROM configuracion WHERE clave = 'mail_user'");
  res.json({ host: host?.valor || 'c1800365.ferozo.com', user: user?.valor || 'contacto@puertomas.cl' });
});

app.post('/api/admin/config/correo', authMw, async (req, res) => {
  const { host, user, pass } = req.body;
  const upsertConfig = async (clave, valor) => {
    const exists = await queryOne('SELECT clave FROM configuracion WHERE clave = ?', [clave]);
    if (exists) { await runSql('UPDATE configuracion SET valor = ? WHERE clave = ?', [valor, clave]); }
    else { await runSql('INSERT INTO configuracion (clave, valor) VALUES (?, ?)', [clave, valor]); }
  };
  if (host) await upsertConfig('mail_host', host);
  if (user) await upsertConfig('mail_user', user);
  if (pass) await upsertConfig('mail_pass', pass);
  sendTelegramAlert(`🛠️ <b>ADMIN: CONFIGURACIÓN CORREO ACTUALIZADA</b>`);
  res.json({ ok: true });
});


app.get('/api/admin/analytics', authMw, async (req, res) => {
  const [visitasDia, registrosDia, muroDia, buzonDia, ubicacionDia, reportesDia, emergenciasDia, reportesTipo, emergInst, productosLocal] = await Promise.all([
    queryAll(`SELECT DATE(created_at) as dia, COUNT(*) as n FROM visitas WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY dia`),
    queryAll(`SELECT DATE(created_at) as dia, COUNT(*) as n FROM usuarios WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY DATE(created_at) ORDER BY dia`),
    queryAll(`SELECT DATE(created_at) as dia, COUNT(*) as n FROM muro_comunitario WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY dia`),
    queryAll(`SELECT DATE(created_at) as dia, COUNT(*) as n FROM mensajes_admin WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY dia`),
    queryAll(`SELECT DATE(created_at) as dia, COUNT(*) as n FROM registro_extravios WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY dia`),
    queryAll(`SELECT DATE(created_at) as dia, COUNT(*) as n FROM reportes_ciudadanos WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY dia`),
    queryAll(`SELECT DATE(created_at) as dia, COUNT(*) as n FROM registro_emergencias WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY dia`),
    queryAll(`SELECT tipo_reporte as tipo, COUNT(*) as n FROM reportes_ciudadanos GROUP BY tipo_reporte ORDER BY n DESC`),
    queryAll(`SELECT institucion, COUNT(*) as n FROM registro_emergencias GROUP BY institucion ORDER BY n DESC`),
    queryAll(`SELECT l.nombre as nombre, COUNT(p.id) as n FROM locales l LEFT JOIN productos p ON p.local_id = l.id GROUP BY l.id, l.nombre ORDER BY n DESC LIMIT 15`)
  ]);
  res.json({ visitasDia, registrosDia, muroDia, buzonDia, ubicacionDia, reportesDia, emergenciasDia, reportesTipo, emergInst, productosLocal });
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
    // PRIMERO inicializar la base de datos
    await initDatabase();
    await loadPasswords();
    
    // Crear servidor HTTP con Socket.io
    const httpServer = http.createServer(app);
    const io = new SocketIO(httpServer, {
      cors: { origin: '*', methods: ['GET', 'POST'] }
    });

    // Hacer io accesible globalmente para emitir desde endpoints
    app.set('io', io);

    io.on('connection', (socket) => {
      console.log('🔌 Cliente conectado al mapa en tiempo real');
      socket.on('disconnect', () => {});
    });

    // Iniciar servidor
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Servidor escuchando en puerto ${PORT}`);
      scheduleRenderKeepAlive();
      sendTelegramAlert(`🚀 <b>SISTEMA BARRIO INICIADO</b>\nServidor online y base de datos lista.`);
    });

    // ── LIMPIEZA AUTOMÁTICA cada 6 horas ──
    setInterval(async () => {
      try {
        const reportesBorrados = await cleanupReportes();
        const mascotasBorradas = await cleanupMascotas();
        const muroBorrados = await cleanupMuro();
        if (reportesBorrados + mascotasBorradas + muroBorrados > 0) {
          console.log(`🧹 Limpieza: ${reportesBorrados} reportes, ${mascotasBorradas} mascotas, ${muroBorrados} muro`);
        }
      } catch (e) {
        console.error('Error en limpieza automática:', e.message);
      }
    }, 6 * 60 * 60 * 1000); // cada 6 horas

    // ── RECORDATORIO DIARIO de mascotas próximas a expirar ──
    setInterval(async () => {
      try {
        const mascotas = await getMascotasParaRecordatorio();
        if (mascotas.length > 0) {
          let mensaje = `🔔 <b>RECORDATORIO MASCOTAS</b>\n${mascotas.length} aviso(s) de mascotas perdidas cumplen 15 días.\nContacta a los dueños por si ya las encontraron:\n\n`;
          mascotas.forEach(m => {
            mensaje += `• ${m.nombre_mascota || 'Sin nombre'} - ${m.nombre_contacto} (${m.telefono})\n`;
          });
          sendTelegramAlert(mensaje);
        }
      } catch (e) {
        console.error('Error en recordatorio mascotas:', e.message);
      }
    }, 24 * 60 * 60 * 1000); // cada 24 horas

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

// ─── CIERRE LIMPIO: liberar conexiones MySQL cuando Render reinicia ─────────
const shutdown = async (signal) => {
  console.log(`📴 Recibido ${signal}, cerrando limpiamente...`);
  try {
    await closeDatabase();
    console.log('✅ Cierre limpio completado');
  } catch(e) {
    console.error('Error en cierre:', e.message);
  }
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
