const express = require('express');
const path = require('path');
const cors = require('cors');
const https = require('https');
const { initDatabase, ...dbHelper } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
let ADMIN_PASSWORDS = ['barrio2025', 'admin2025', 'seguridad2025']; // Triple seguridad
const DEFAULT_PASSWORDS = ['barrio2025', 'admin2025', 'seguridad2025']; // Claves por defecto para reset
const MASTER_RESET_KEY = 'BARRIO-RESET-2026-PUERTOMAS'; // Clave maestra para reseteo de emergencia

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración Telegram (Obtenida del usuario)
let TELEGRAM_TOKEN = '8788499800:AAF0Lcc7HbVJcB-DB6dxFpxaksixNxngqds'; 
let TELEGRAM_CHAT_ID = '2007857065'; 

function sendTelegramAlert(message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Telegram no configurado:', message);
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const data = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' });
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
  };
  const req = https.request(url, options, (res) => {
    res.on('data', (d) => { /* console.log(d.toString()); */ });
  });
  req.on('error', (error) => { console.error('Error Telegram:', error); });
  req.write(data);
  req.end();
}

// --- Helpers ---
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isLocalOpen(ha, hc, dias) {
  const now = new Date();
  const day = now.getDay();
  const ct = now.toTimeString().slice(0, 5);
  let od;
  if (dias === 'lun-dom') od = [0,1,2,3,4,5,6];
  else if (dias === 'lun-vie') od = [1,2,3,4,5];
  else od = [1,2,3,4,5,6];
  if (!od.includes(day)) return false;
  return ct >= ha && ct <= hc;
}

async function queryAll(sql, params = []) {
  return await dbHelper.queryAll(sql, params);
}

async function queryOne(sql, params = []) {
  return await dbHelper.queryOne(sql, params);
}

async function runSql(sql, params = []) {
  return await dbHelper.runSql(sql, params);
}

// --- Auth ---
const adminTokens = new Set();
function authMw(req, res, next) {
  const t = req.headers.authorization?.replace('Bearer ', '');
  if (!t || !adminTokens.has(t)) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// ========== PUBLIC API ==========

app.get('/api/productos/buscar', async (req, res) => {
  const { q, lat, lng, radio = 1 } = req.query;
  if (!q) return res.status(400).json({ error: 'Parámetro q requerido' });

  let rows = await queryAll(`
    SELECT p.id, p.nombre, p.marca, p.precio, p.en_stock, p.unidad, p.local_id,
           l.nombre as local_nombre, l.direccion, l.horario_apertura, l.horario_cierre,
           l.dias_atencion, l.acepta_efectivo, l.acepta_tarjeta, l.latitud, l.longitud
    FROM productos p JOIN locales l ON p.local_id = l.id
    WHERE LOWER(p.nombre) LIKE LOWER(?)
    ORDER BY p.precio ASC
  `, [`%${q}%`]);

  // Add ratings
  for (let r of rows) {
    const rating = await queryOne('SELECT COALESCE(AVG(estrellas),0) as avg, COUNT(*) as cnt FROM calificaciones WHERE local_id = ?', [r.local_id]);
    r.calificacion_promedio = Math.round((rating?.avg || 0) * 10) / 10;
    r.total_calificaciones = rating?.cnt || 0;
  }

  if (lat && lng) {
    const uLat = parseFloat(lat), uLng = parseFloat(lng);
    const radiusKm = parseFloat(radio || 1);
    
    rows = rows.map(r => ({ 
      ...r, 
      distancia: Math.round(haversineDistance(uLat, uLng, r.latitud, r.longitud) * 1000) 
    })).filter(r => r.distancia <= radiusKm * 1000);
  }

  rows = rows.map(r => ({ ...r, abierto: isLocalOpen(r.horario_apertura, r.horario_cierre, r.dias_atencion) }));
  res.json(rows);
});

app.get('/api/locales/:id', async (req, res) => {
  const local = await queryOne('SELECT * FROM locales WHERE id = ?', [req.params.id]);
  if (!local) return res.status(404).json({ error: 'No encontrado' });

  const rating = await queryOne('SELECT COALESCE(AVG(estrellas),0) as avg, COUNT(*) as cnt FROM calificaciones WHERE local_id = ?', [local.id]);
  local.calificacion_promedio = Math.round((rating?.avg || 0) * 10) / 10;
  local.total_calificaciones = rating?.cnt || 0;
  local.productos = await queryAll('SELECT * FROM productos WHERE local_id = ? ORDER BY nombre', [local.id]);
  local.abierto = isLocalOpen(local.horario_apertura, local.horario_cierre, local.dias_atencion);
  res.json(local);
});

app.get('/api/servicios/buscar', async (req, res) => {
  const { q } = req.query;
  let sql = 'SELECT * FROM servicios';
  let params = [];
  if (q) { sql += ' WHERE LOWER(tipo) LIKE LOWER(?)'; params.push(`%${q}%`); }
  sql += ' ORDER BY tipo ASC';
  let rows = await queryAll(sql, params);
  res.json(rows);
});

app.get('/api/servicios/tipos', async (req, res) => {
  const rows = await queryAll('SELECT DISTINCT tipo FROM servicios ORDER BY tipo');
  res.json(rows.map(r => r.tipo));
});

app.get('/api/locales/:id/calificaciones', (req, res) => {
  res.json(queryAll('SELECT * FROM calificaciones WHERE local_id = ? ORDER BY created_at DESC', [req.params.id]));
});

app.post('/api/locales/:id/calificaciones', async (req, res) => {
  const { estrellas, comentario, device_id } = req.body;
  if (!estrellas || estrellas < 1 || estrellas > 5) return res.status(400).json({ error: 'Calificación 1-5' });
  if (!device_id) return res.status(400).json({ error: 'device_id requerido' });

  const existing = await queryOne('SELECT id FROM calificaciones WHERE local_id = ? AND device_id = ?', [req.params.id, device_id]);
  if (existing) {
    await runSql('UPDATE calificaciones SET estrellas=?, comentario=?, created_at=datetime("now") WHERE id=?', [estrellas, comentario || '', existing.id]);
    return res.json({ message: 'Calificación actualizada', id: existing.id });
  }
  await runSql('INSERT INTO calificaciones (local_id,estrellas,comentario,device_id) VALUES (?,?,?,?)', [req.params.id, estrellas, comentario || '', device_id]);
  const last = await queryOne('SELECT last_insert_rowid() as id');
  res.json({ message: 'Calificación enviada', id: last?.id });
});

app.get('/api/config', async (req, res) => {
  const rows = await queryAll('SELECT * FROM configuracion');
  const config = {};
  rows.forEach(r => { config[r.clave] = r.valor; });
  res.json(config);
});

app.get('/api/mascotas', async (req, res) => {
  res.json(await queryAll('SELECT * FROM mascotas_perdidas ORDER BY created_at DESC'));
});

app.post('/api/mascotas', async (req, res) => {
  const { nombre_contacto, telefono, ubicacion_extravio, direccion, foto_base64, tipo_animal, caracteristicas, nombre_mascota, comentarios, latitud, longitud } = req.body;
  if (!nombre_contacto || !telefono) return res.status(400).json({ error: 'Nombre y teléfono requeridos' });

  const user = await queryOne('SELECT is_blocked FROM usuarios WHERE telefono = ?', [telefono]);
  if (user && user.is_blocked) return res.status(403).json({ error: 'Usuario bloqueado por el administrador' });

  await runSql('INSERT INTO mascotas_perdidas (nombre_contacto,telefono,ubicacion_extravio,direccion,foto_base64,tipo_animal,caracteristicas,nombre_mascota,comentarios,latitud,longitud) VALUES (?,?,?,?,?,?,?,?,?,?,?)', 
    [nombre_contacto, telefono, ubicacion_extravio||'', direccion||'', foto_base64||'', tipo_animal||'', caracteristicas||'', nombre_mascota||'', comentarios||'', latitud || null, longitud || null]);
  res.json({ message: 'Aviso publicado' });
});

// ========== REGISTRO / USUARIOS ==========
app.post('/api/registro', async (req, res) => {
  const { nombre, telefono, direccion, device_id, terms_accepted } = req.body;
  if (!nombre || !telefono) return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const termsVal = terms_accepted ? 1 : 0;

  let user = await queryOne('SELECT * FROM usuarios WHERE telefono = ?', [telefono]);
  if (!user) {
    const result = await runSql('INSERT INTO usuarios (nombre, telefono, direccion, ip, device_id, terms_accepted) VALUES (?,?,?,?,?,?)', 
      [nombre, telefono, direccion || '', ip, device_id || '', termsVal]);
    const newId = result.insertId;
    user = await queryOne('SELECT * FROM usuarios WHERE id = ?', [newId]);
    sendTelegramAlert(`👤 <b>Nuevo Usuario Registrado</b>\nNombre: ${nombre}\nTel: ${telefono}\nDir: ${direccion || '-'}\nCiudad: Puerto Montt`);
  } else {
    await runSql('UPDATE usuarios SET nombre=?, direccion=?, ip=?, device_id=?, terms_accepted=? WHERE id=?', 
      [nombre, direccion || '', ip, device_id || '', termsVal, user.id]);
    user = { ...user, nombre, direccion, ip, device_id, terms_accepted: termsVal };
  }
  res.json({ message: 'Usuario registrado', user });
});

app.put('/api/usuarios/:id/accept-terms', async (req, res) => {
  await runSql('UPDATE usuarios SET terms_accepted = 1 WHERE id = ?', [req.params.id]);
  res.json({ message: 'Términos aceptados' });
});

// ========== MURO COMUNITARIO ==========
app.get('/api/muro', async (req, res) => {
  const rows = await queryAll(`
    SELECT m.id, m.contenido, m.created_at, u.nombre as autor
    FROM muro_comunitario m
    JOIN usuarios u ON m.usuario_id = u.id
    ORDER BY m.created_at DESC LIMIT 50
  `);
  res.json(rows);
});

app.post('/api/muro', async (req, res) => {
  const { usuario_id, contenido } = req.body;
  if (!usuario_id || !contenido) return res.status(400).json({ error: 'Faltan datos' });

  const user = await queryOne('SELECT nombre, telefono, direccion, is_blocked FROM usuarios WHERE id = ?', [usuario_id]);
  if (user && user.is_blocked) return res.status(403).json({ error: 'Usuario bloqueado por el administrador' });

  await runSql('INSERT INTO muro_comunitario (usuario_id, contenido) VALUES (?,?)', [usuario_id, contenido]);
  
  const userInfo = user ? `${user.nombre} (${user.telefono || 'Sin Tel'})\n📍 Dir: ${user.direccion || 'No especificada'}` : 'Desconocido';
  sendTelegramAlert(`📝 <b>Nueva Publicación en el Muro</b>\n👤 Vecino: ${userInfo}\n💬 Dice: "${contenido}"`);
  
  res.json({ message: 'Publicado en el muro' });
});

// ========== BUZÓN ADMIN ==========
app.post('/api/admin/mensaje', async (req, res) => {
  const { usuario_id, mensaje } = req.body;
  if (!usuario_id || !mensaje) return res.status(400).json({ error: 'Faltan datos' });

  const user = await queryOne('SELECT is_blocked FROM usuarios WHERE id = ?', [usuario_id]);
  if (user && user.is_blocked) return res.status(403).json({ error: 'Usuario bloqueado por el administrador' });

  await runSql('INSERT INTO mensajes_admin (usuario_id, mensaje) VALUES (?,?)', [usuario_id, mensaje]);
  
  const u = await queryOne('SELECT nombre, telefono FROM usuarios WHERE id = ?', [parseInt(usuario_id)]);
  const autorInfo = u ? `<b>${u.nombre}</b> (${u.telefono})` : `ID:${usuario_id}`;

  // Alerta especial si el mensaje contiene la palabra EXTRAVIASTE o EXTRAVIADO
  const upperM = mensaje.toUpperCase();
  if (upperM.includes('EXTRAVIASTE') || upperM.includes('EXTRAVIADO') || mensaje.includes('🚨')) {
    sendTelegramAlert(`🚨 <b>ALERTA DE EXTRAVÍO/SEGURIDAD</b>\nUsuario: ${autorInfo}\nDetalle: ${mensaje}`);
  } else {
    sendTelegramAlert(`✉️ <b>Nuevo Mensaje en Buzón</b>\nDe: ${autorInfo}\nContenido: ${mensaje.slice(0, 50)}...`);
  }


  res.json({ message: 'Mensaje enviado al administrador' });
});

// ========== REGISTRO EMERGENCIAS ==========
app.post('/api/emergencia', async (req, res) => {
  const { usuario_id, institucion, latitud, longitud } = req.body;
  if (!usuario_id || !institucion) return res.status(400).json({ error: 'Faltan datos' });

  const user = await queryOne('SELECT * FROM usuarios WHERE id = ?', [usuario_id]);
  if (!user) return res.status(404).json({ error: 'Usuario no identificado' });

  await runSql('INSERT INTO registro_emergencias (usuario_id, institucion, latitud, longitud) VALUES (?, ?, ?, ?)', 
    [usuario_id, institucion, latitud || null, longitud || null]);
  
  const googleMapsLink = latitud && longitud ? `https://maps.google.com/?q=${latitud},${longitud}` : 'Sin GPS';
  
  sendTelegramAlert(`🚨 <b>LLAMADA DE EMERGENCIA</b>\n` +
    `Institución: ${institucion}\n` +
    `Vecino: ${user.nombre}\n` +
    `Teléfono: ${user.telefono}\n` +
    `Dirección: ${user.direccion || 'No especificada'}\n` +
    `Mapa: ${googleMapsLink}`);

  res.json({ message: 'Emergencia registrada' });
});

// Ping / Estadísticas y Rastreo Extravíos
app.post('/api/ping', async (req, res) => {
  const { device_id } = req.body;
  if (!device_id) return res.status(400).json({ error: 'Faltan datos' });
  await runSql('INSERT INTO visitas (device_id) VALUES (?)', [device_id]);
  const user = await queryOne('SELECT is_stolen FROM usuarios WHERE device_id = ?', [device_id]);
  res.json({ status: user?.is_stolen ? 'stolen' : 'ok' });
});

app.post('/api/stolen-location', async (req, res) => {
  const { device_id, latitud, longitud } = req.body;
  if (!device_id || !latitud || !longitud) return res.status(400).json({ error: 'Faltan datos' });
  
  const user = await queryOne('SELECT id, nombre, telefono FROM usuarios WHERE device_id = ?', [device_id]);
  if (user) {
    await runSql('INSERT INTO rastreo_robos (usuario_id, latitud, longitud) VALUES (?,?,?)', [user.id, latitud, longitud]);
    
    const mapLink = `https://www.google.com/maps?q=${latitud},${longitud}`;
    const timestamp = new Date().toLocaleString('es-CL');
    
    // 1. Alerta a Telegram con formato urgente
    const alertMsg = `🚨 <b>ALERTA: TELÉFONO EXTRAVIADO EN USO</b>\n\n` +
                     `👤 <b>Usuario:</b> ${user.nombre}\n` +
                     `📱 <b>Teléfono:</b> ${user.telefono}\n` +
                     `📅 <b>Fecha/Hora:</b> ${timestamp}\n` +
                     `📍 <b>Ubicación:</b> <a href="${mapLink}">VER MAPA EN VIVO</a>\n\n` +
                     `<i>El sistema está rastreando este dispositivo automáticamente.</i>`;
    sendTelegramAlert(alertMsg);

    // 2. Registro en el Buzón (mensajes_admin)
    const dbMsg = `🚨 ALERTA DE RASTREO: El usuario ${user.nombre} (${user.telefono}) está operando el teléfono marcado como EXTRAVIADO. Ubicación detectada: ${mapLink}`;
    await runSql('INSERT INTO mensajes_admin (usuario_id, mensaje) VALUES (?, ?)', [user.id, dbMsg]);
  }
  res.json({ message: 'Ok' });
});

app.get('/api/verificar-usuario/:id', async (req, res) => {
  const user = await queryOne('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(user);
});



app.post('/api/reportar-extravio', async (req, res) => {
  const { reporting_user_id, reported_phone, mensaje_extra } = req.body;
  if (!reporting_user_id || !reported_phone) return res.status(400).json({ error: 'Datos incompletos' });

  const reportedUser = await queryOne('SELECT id, nombre FROM usuarios WHERE telefono = ?', [reported_phone]);
  const reporter = await queryOne('SELECT nombre, telefono FROM usuarios WHERE id = ?', [reporting_user_id]);
  const reporterInfo = reporter ? `<b>${reporter.nombre}</b> (${reporter.telefono})` : `ID:${reporting_user_id}`;

  const alertMsg = `🚨 <b>REPORTE DE EXTRAVÍO</b>\nDenunciante: ${reporterInfo}\nTeléfono Extraviado: <b>${reported_phone}</b>\nEstado: Marcado para rastreo silencioso.${mensaje_extra || ''}`;

  if (reportedUser) {
    await runSql('UPDATE usuarios SET is_stolen = 1 WHERE id = ?', [reportedUser.id]);
    sendTelegramAlert(`${alertMsg}\n<i>Usuario identificado en el sistema.</i>`);
  } else {
    sendTelegramAlert(`${alertMsg}\n<i>⚠️ El número no está registrado en la base de datos de la App.</i>`);
  }
  await runSql('INSERT INTO mensajes_admin (usuario_id, mensaje) VALUES (?, ?)', [reporting_user_id, `🚨 REPORTE EXTRAVÍO: Se reportó el número ${reported_phone}${mensaje_extra || ''}`]);
  res.json({ success: true, message: 'Reporte procesado' });
});


// ========== ADMIN API ==========

app.post('/api/admin/login', (req, res) => {
  const { passwords } = req.body;
  if (!Array.isArray(passwords) || passwords.length !== 3) {
    return res.status(400).json({ error: 'Se requieren 3 contraseñas' });
  }
  
  const isValid = passwords.every((p, i) => p === ADMIN_PASSWORDS[i]);
  
  if (!isValid) return res.status(401).json({ error: 'Contraseñas incorrectas' });
  
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  adminTokens.add(token);
  res.json({ token });
});

app.post('/api/admin/resolve-map', authMw, async (req, res) => {
  let { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requerida' });
  
  console.log(`[MAPS] Intentando resolver URL: ${url}`);

  if (url.includes('<iframe')) {
    const srcMatch = url.match(/src="([^"]+)"/);
    if (srcMatch) url = srcMatch[1];
  }

  // Helper para extraer de texto
  const extractCoords = (text) => {
    // 1. Patrón @lat,lng (Formato estándar web)
    let m = text.match(/@([-\d.]+),([-\d.]+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    // 2. Patrón !3dLAT!4dLNG (Formato interno de Google / Embeds)
    const d3 = text.match(/!3d([-\d.]+)/);
    const d4 = text.match(/!4d([-\d.]+)/) || text.match(/!2d([-\d.]+)/);
    if (d3 && d4) return { lat: parseFloat(d3[1]), lng: parseFloat(d4[1]) };

    // 3. Patrón /search/lat,lng (Formato de enlaces compartidos/cortos)
    m = text.match(/\/search\/([-\d.]+),\+?([-\d.]+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    // 4. Patrón q=lat,lng o center=lat,lng
    m = text.match(/[?&]q=([-\d.]+),([-\d.]+)/) || text.match(/center=([-\d.]+),([-\d.]+)/) || text.match(/ll=([-\d.]+),([-\d.]+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    return null;
  };

  // 1. Intento directo sobre el string pegado (ahorra tiempo y red)
  let coords = extractCoords(url);
  if (coords) {
    console.log(`[MAPS] Coordenadas extraídas directamente: ${coords.lat}, ${coords.lng}`);
    let address = '';
    const placeMatch = url.match(/\/place\/([^\/]+)/);
    if (placeMatch) {
      try { address = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')); } catch(e) {}
    }
    return res.json({ ...coords, address });
  }

  // 2. Si es link corto o no tiene coords, hacemos FETCH
  try {
    console.log(`[MAPS] Fetching URL...`);
    let response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    let finalUrl = response.url;
    let html = await response.text();
    console.log(`[MAPS] Final URL: ${finalUrl}`);

    // Intentar extraer de la URL final
    coords = extractCoords(finalUrl);
    
    // Si no está en la URL, buscar en el HTML
    if (!coords) {
      coords = extractCoords(html);
      if (!coords) {
        // Buscar patrones JSON internos de Google Maps en el HTML
        const jsonCoords = html.match(/\[null,null,([-\d.]+),([-\d.]+)\]/) || 
                           html.match(/\[\[([-3-4][0-9]\.[0-9]+),([-6-7][0-9]\.[0-9]+)\]\]/); // Específico para Chile
        if (jsonCoords) coords = { lat: parseFloat(jsonCoords[1]), lng: parseFloat(jsonCoords[2]) };
      }
    }

    if (coords) {
      console.log(`[MAPS] Coordenadas encontradas: ${coords.lat}, ${coords.lng}`);
      let address = '';
      const placeMatch = finalUrl.match(/\/place\/([^\/]+)/) || html.match(/"([^"]+)",null,null,null,null,null,\[null,\[([-\d.]+),([-\d.]+)\]/);
      if (placeMatch) {
        try { address = decodeURIComponent((placeMatch[1] || placeMatch[0]).replace(/\+/g, ' ')).replace(/"/g, ''); } catch(e) {}
      }
      return res.json({ ...coords, address });
    }

    console.error(`[MAPS] No se encontraron coordenadas en el contenido.`);
    res.status(400).json({ error: 'No se pudieron extraer las coordenadas. Intenta con el link que sale al presionar "Compartir" en Google Maps.' });
  } catch (err) {
    console.error(`[MAPS] Error de red:`, err);
    res.status(500).json({ error: 'Error de conexión con Google Maps' });
  }
});

// Mensajes Admin
app.get('/api/admin/mensajes', authMw, async (req, res) => {
  const rows = await queryAll(`
    SELECT m.*, u.nombre, u.telefono 
    FROM mensajes_admin m
    JOIN usuarios u ON m.usuario_id = u.id
    ORDER BY m.created_at DESC
  `);
  res.json(rows);
});
app.put('/api/admin/mensajes/:id/leido', authMw, async (req, res) => {
  await runSql('UPDATE mensajes_admin SET leido = 1 WHERE id = ?', [req.params.id]);
  res.json({ message: 'Marcado como leído' });
});

// Locales
app.get('/api/admin/locales', authMw, async (req, res) => res.json(await queryAll('SELECT * FROM locales ORDER BY nombre')));
app.post('/api/admin/locales', authMw, async (req, res) => {
  const { nombre, direccion, horario_apertura, horario_cierre, dias_atencion, acepta_efectivo, acepta_tarjeta, latitud, longitud } = req.body;
  await runSql('INSERT INTO locales (nombre,direccion,horario_apertura,horario_cierre,dias_atencion,acepta_efectivo,acepta_tarjeta,latitud,longitud) VALUES (?,?,?,?,?,?,?,?,?)',
    [nombre, direccion||'', horario_apertura||'08:00', horario_cierre||'20:00', dias_atencion||'lun-sab', acepta_efectivo?1:0, acepta_tarjeta?1:0, parseFloat(latitud), parseFloat(longitud)]);
  res.json({ message: 'Local creado' });
});
app.put('/api/admin/locales/:id', authMw, async (req, res) => {
  const { nombre, direccion, horario_apertura, horario_cierre, dias_atencion, acepta_efectivo, acepta_tarjeta, latitud, longitud } = req.body;
  await runSql('UPDATE locales SET nombre=?,direccion=?,horario_apertura=?,horario_cierre=?,dias_atencion=?,acepta_efectivo=?,acepta_tarjeta=?,latitud=?,longitud=? WHERE id=?',
    [nombre, direccion, horario_apertura, horario_cierre, dias_atencion, acepta_efectivo?1:0, acepta_tarjeta?1:0, parseFloat(latitud), parseFloat(longitud), req.params.id]);
  res.json({ message: 'Local actualizado' });
});
app.delete('/api/admin/locales/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM productos WHERE local_id = ?', [req.params.id]);
  await runSql('DELETE FROM calificaciones WHERE local_id = ?', [req.params.id]);
  await runSql('DELETE FROM locales WHERE id = ?', [req.params.id]);
  res.json({ message: 'Local eliminado' });
});

// Productos
app.get('/api/admin/productos', authMw, async (req, res) => res.json(await queryAll('SELECT p.*, l.nombre as local_nombre FROM productos p JOIN locales l ON p.local_id = l.id ORDER BY l.nombre, p.nombre')));
app.post('/api/admin/productos', authMw, async (req, res) => {
  const { local_id, nombre, marca, precio, en_stock, unidad } = req.body;
  await runSql('INSERT INTO productos (local_id,nombre,marca,precio,en_stock,unidad) VALUES (?,?,?,?,?,?)', [local_id, nombre, marca||'', parseFloat(precio), en_stock?1:0, unidad||'kg']);
  res.json({ message: 'Producto creado' });
});
app.put('/api/admin/productos/:id', authMw, async (req, res) => {
  const { local_id, nombre, marca, precio, en_stock, unidad } = req.body;
  await runSql('UPDATE productos SET local_id=?,nombre=?,marca=?,precio=?,en_stock=?,unidad=? WHERE id=?', [local_id, nombre, marca||'', parseFloat(precio), en_stock?1:0, unidad||'kg', req.params.id]);
  res.json({ message: 'Producto actualizado' });
});
app.post('/api/admin/productos/masivo', authMw, (req, res) => {
  const { local_id, productos } = req.body;
  if (!local_id || !Array.isArray(productos)) return res.status(400).json({ error: 'Datos inválidos' });
  const db = getDb();
  
  try {
    // Primero, eliminar todos los productos actuales de este local
    db.run('DELETE FROM productos WHERE local_id = ?', [local_id]);
    
    // Luego, insertar el nuevo listado completo
    const stmt = db.prepare('INSERT INTO productos (local_id,nombre,marca,precio,en_stock,unidad) VALUES (?,?,?,?,?,?)');
    for (const p of productos) {
      stmt.run([local_id, p.nombre, p.marca || '', parseFloat(p.precio), p.en_stock ? 1 : 0, p.unidad || 'kg']);
    }
    stmt.free();
    
    saveDb();
    res.json({ message: `Inventario actualizado: ${productos.length} productos` });
  } catch (err) {
    res.status(500).json({ error: 'Error procesando el listado' });
  }
});
app.delete('/api/admin/productos/:id', authMw, (req, res) => { runSql('DELETE FROM productos WHERE id=?', [req.params.id]); res.json({ message: 'Eliminado' }); });

// Servicios
app.get('/api/admin/servicios', authMw, async (req, res) => res.json(await queryAll('SELECT * FROM servicios ORDER BY tipo, nombre_prestador')));
app.post('/api/admin/servicios', authMw, async (req, res) => {
  const { tipo, nombre_prestador, telefono } = req.body;
  await runSql('INSERT INTO servicios (tipo,nombre_prestador,telefono) VALUES (?,?,?)', [tipo, nombre_prestador, telefono||'']);
  res.json({ message: 'Servicio creado' });
});
app.put('/api/admin/servicios/:id', authMw, async (req, res) => {
  const { tipo, nombre_prestador, telefono } = req.body;
  await runSql('UPDATE servicios SET tipo=?,nombre_prestador=?,telefono=? WHERE id=?', [tipo, nombre_prestador, telefono||'', req.params.id]);
  res.json({ message: 'Servicio actualizado' });
});
app.delete('/api/admin/servicios/:id', authMw, async (req, res) => { await runSql('DELETE FROM servicios WHERE id=?', [req.params.id]); res.json({ message: 'Eliminado' }); });

// Mascotas
app.delete('/api/admin/mascotas/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM mascotas_perdidas WHERE id=?', [req.params.id]);
  res.json({ message: 'Aviso eliminado' });
});

// Configuración
app.put('/api/admin/config', authMw, async (req, res) => {
  const { admin_whatsapp, plan_cuadrante, whatsapp_vecinos, tel_carabineros, tel_bomberos, tel_pdi, tel_ambulancia, tel_seguridad } = req.body;
  if (admin_whatsapp) await runSql('UPDATE configuracion SET valor=? WHERE clave=?', [admin_whatsapp, 'admin_whatsapp']);
  if (plan_cuadrante) await runSql('UPDATE configuracion SET valor=? WHERE clave=?', [plan_cuadrante, 'plan_cuadrante']);
  if (whatsapp_vecinos) await runSql('UPDATE configuracion SET valor=? WHERE clave=?', [whatsapp_vecinos, 'whatsapp_vecinos']);
  if (tel_carabineros) await runSql('UPDATE configuracion SET valor=? WHERE clave=?', [tel_carabineros, 'tel_carabineros']);
  if (tel_bomberos) await runSql('UPDATE configuracion SET valor=? WHERE clave=?', [tel_bomberos, 'tel_bomberos']);
  if (tel_pdi) await runSql('UPDATE configuracion SET valor=? WHERE clave=?', [tel_pdi, 'tel_pdi']);
  if (tel_ambulancia) await runSql('UPDATE configuracion SET valor=? WHERE clave=?', [tel_ambulancia, 'tel_ambulancia']);
  if (tel_seguridad) await runSql('UPDATE configuracion SET valor=? WHERE clave=?', [tel_seguridad, 'tel_seguridad']);
  res.json({ message: 'Configuración actualizada' });
});
// ===== USUARIOS =====
app.get('/api/admin/usuarios', authMw, async (req, res) => {
  res.json(await queryAll('SELECT * FROM usuarios ORDER BY created_at DESC'));
});

app.put('/api/admin/usuarios/:id/bloquear', authMw, async (req, res) => {
  const { is_blocked } = req.body;
  await runSql('UPDATE usuarios SET is_blocked = ? WHERE id = ?', [is_blocked?1:0, req.params.id]);
  res.json({ message: 'Estado actualizado' });
});

app.put('/api/admin/usuarios/:id/robado', authMw, async (req, res) => {
  const { is_stolen } = req.body;
  await runSql('UPDATE usuarios SET is_stolen=? WHERE id=?', [is_stolen ? 1 : 0, req.params.id]);
  res.json({ message: 'Estado de extravío actualizado' });
});

// ===== EMERGENCIAS =====
app.get('/api/admin/emergencias', authMw, async (req, res) => {
  const rows = await queryAll(`
    SELECT e.*, u.nombre, u.telefono 
    FROM registro_emergencias e
    JOIN usuarios u ON e.usuario_id = u.id
    ORDER BY e.created_at DESC
  `);
  res.json(rows);
});

// ===== MURO ADMIN =====
app.delete('/api/admin/muro', authMw, async (req, res) => {
  await runSql('DELETE FROM muro_comunitario');
  res.json({ message: 'Muro limpiado' });
});

app.delete('/api/admin/muro/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM muro_comunitario WHERE id=?', [req.params.id]);
  res.json({ message: 'Mensaje eliminado' });
});

// ===== RASTREO EXTRAVÍOS =====
app.get('/api/admin/rastreo', authMw, async (req, res) => {
  const rows = await queryAll(`
    SELECT r.*, u.nombre, u.telefono 
    FROM rastreo_robos r
    JOIN usuarios u ON r.usuario_id = u.id
    ORDER BY r.created_at DESC
  `);
  res.json(rows);
});

app.get('/api/stats', async (req, res) => {
  const visitas = await queryOne('SELECT COUNT(*) as count FROM visitas');
  const usuarios = await queryOne('SELECT COUNT(*) as count FROM usuarios');
  const locales = await queryOne('SELECT COUNT(*) as count FROM locales');
  res.json({ visitas: visitas?.count || 0, usuarios: usuarios?.count || 0, locales: locales?.count || 0 });
});

app.get('/api/admin/stats', authMw, async (req, res) => {
  const totalVisitas = await queryOne('SELECT COUNT(*) as count FROM visitas');
  const uniqueUsers = await queryOne('SELECT COUNT(DISTINCT device_id) as count FROM visitas');
  const visitasHoy = await queryOne("SELECT COUNT(*) as count FROM visitas WHERE date(created_at) = date('now')");
  
  const topLocales = await queryAll(`
    SELECT l.nombre, COUNT(c.id) as calif_count, AVG(c.estrellas) as avg_estrellas
    FROM locales l
    LEFT JOIN calificaciones c ON l.id = c.local_id
    GROUP BY l.id
    ORDER BY calif_count DESC
    LIMIT 5
  `);

  const totalMascotas = await queryOne('SELECT COUNT(*) as count FROM mascotas_perdidas');

  res.json({
    totalVisitas: totalVisitas.count,
    uniqueUsers: uniqueUsers.count,
    visitasHoy: visitasHoy.count,
    totalMascotas: totalMascotas.count,
    topLocales
  });
});
// Cambiar contraseñas
app.put('/api/admin/passwords', authMw, (req, res) => {
  const { old_passwords, new_passwords } = req.body;
  if (!Array.isArray(old_passwords) || old_passwords.length !== 3 || !Array.isArray(new_passwords) || new_passwords.length !== 3) {
    return res.status(400).json({ error: 'Se requieren 3 claves actuales y 3 nuevas' });
  }
  const isValid = old_passwords.every((p, i) => p === ADMIN_PASSWORDS[i]);
  if (!isValid) return res.status(401).json({ error: 'Las claves actuales son incorrectas' });
  ADMIN_PASSWORDS = [...new_passwords];
  // Invalidate all tokens
  adminTokens.clear();
  res.json({ message: 'Claves actualizadas' });
});
// Reset de emergencia (sin necesidad de estar logueado)
app.post('/api/emergency-reset', (req, res) => {
  const { master_key } = req.body;
  if (master_key !== MASTER_RESET_KEY) {
    return res.status(403).json({ error: 'Clave maestra incorrecta' });
  }
  ADMIN_PASSWORDS = [...DEFAULT_PASSWORDS];
  adminTokens.clear();
  console.log('\n⚠️  RESET DE EMERGENCIA: Las claves de administrador fueron restauradas a los valores por defecto.\n');
  res.json({ message: 'Claves restauradas a valores por defecto. Use las claves originales para ingresar.' });
});

// Admin User Management
app.put('/api/admin/usuarios/:id/verificar', authMw, async (req, res) => {
  const { is_verified } = req.body;
  await runSql('UPDATE usuarios SET is_verified = ? WHERE id = ?', [is_verified ? 1 : 0, req.params.id]);
  res.json({ message: 'Estado de verificación actualizado' });
});

app.delete('/api/admin/usuarios/:id', authMw, async (req, res) => {
  await runSql('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
  res.json({ message: 'Usuario eliminado' });
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));



async function start() {
  await initDatabase();
  
  // MIGRACIÓN: Marcar usuarios antiguos como verificados
  try {
    const result = await dbHelper.runSql('UPDATE usuarios SET is_verified = 1 WHERE is_verified = 0 OR is_verified IS NULL');
    console.log('✅ Migración de verificación completada');
  } catch(e) { console.error('Error migración:', e); }

  sendTelegramAlert('🚀 <b>Sistema Barrio Iniciado</b>\nLas notificaciones de Telegram están activas.');

  // Keep-Alive para Render
  const externalUrl = process.env.RENDER_EXTERNAL_URL;
  if (externalUrl) {
    const min = 5 * 60 * 1000; // 5 minutos
    const max = 10 * 60 * 1000; // 10 minutos
    const pingSelf = () => {
      fetch(`${externalUrl}/api/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: 'auto-ping-render' })
      }).then(() => console.log(`[Anti-Sleep] Ping enviado a ${externalUrl} a las ${new Date().toLocaleTimeString()}`))
        .catch(e => console.error('[Anti-Sleep] Error:', e.message));
      
      const nextPing = Math.floor(Math.random() * (max - min + 1) + min);
      setTimeout(pingSelf, nextPing);
    };
    setTimeout(pingSelf, min);
    console.log(`[Anti-Sleep] Activado para ${externalUrl}`);
  }

  app.listen(PORT, () => {
    console.log(`\n🏘️  BARRIO está corriendo en http://localhost:${PORT}`);
    console.log(`🔐 Clave maestra de reseteo: ${MASTER_RESET_KEY}`);
    console.log(`   Para resetear claves: POST /api/emergency-reset con { "master_key": "${MASTER_RESET_KEY}" }\n`);
  });
}
start();
