const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDatabase, getDb, saveDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
let ADMIN_PASSWORDS = ['barrio2025', 'admin2025', 'seguridad2025']; // Triple seguridad
const DEFAULT_PASSWORDS = ['barrio2025', 'admin2025', 'seguridad2025']; // Claves por defecto para reset
const MASTER_RESET_KEY = 'BARRIO-RESET-2026-PUERTOMAS'; // Clave maestra para reseteo de emergencia

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

// --- Auth ---
const adminTokens = new Set();
function authMw(req, res, next) {
  const t = req.headers.authorization?.replace('Bearer ', '');
  if (!t || !adminTokens.has(t)) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// ========== PUBLIC API ==========

app.get('/api/productos/buscar', (req, res) => {
  const { q, lat, lng, radio = 1 } = req.query;
  if (!q) return res.status(400).json({ error: 'Parámetro q requerido' });

  let rows = queryAll(`
    SELECT p.id, p.nombre, p.marca, p.precio, p.en_stock, p.unidad, p.local_id,
           l.nombre as local_nombre, l.direccion, l.horario_apertura, l.horario_cierre,
           l.dias_atencion, l.acepta_efectivo, l.acepta_tarjeta, l.latitud, l.longitud
    FROM productos p JOIN locales l ON p.local_id = l.id
    WHERE LOWER(p.nombre) LIKE LOWER(?)
    ORDER BY p.precio ASC
  `, [`%${q}%`]);

  // Add ratings
  rows = rows.map(r => {
    const rating = queryOne('SELECT COALESCE(AVG(estrellas),0) as avg, COUNT(*) as cnt FROM calificaciones WHERE local_id = ?', [r.local_id]);
    r.calificacion_promedio = Math.round((rating?.avg || 0) * 10) / 10;
    r.total_calificaciones = rating?.cnt || 0;
    return r;
  });

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

app.get('/api/locales/:id', (req, res) => {
  const local = queryOne('SELECT * FROM locales WHERE id = ?', [req.params.id]);
  if (!local) return res.status(404).json({ error: 'No encontrado' });

  const rating = queryOne('SELECT COALESCE(AVG(estrellas),0) as avg, COUNT(*) as cnt FROM calificaciones WHERE local_id = ?', [local.id]);
  local.calificacion_promedio = Math.round((rating?.avg || 0) * 10) / 10;
  local.total_calificaciones = rating?.cnt || 0;
  local.productos = queryAll('SELECT * FROM productos WHERE local_id = ? ORDER BY nombre', [local.id]);
  local.abierto = isLocalOpen(local.horario_apertura, local.horario_cierre, local.dias_atencion);
  res.json(local);
});

app.get('/api/servicios/buscar', (req, res) => {
  const { q } = req.query;
  let sql = 'SELECT * FROM servicios';
  let params = [];
  if (q) { sql += ' WHERE LOWER(tipo) LIKE LOWER(?)'; params.push(`%${q}%`); }
  sql += ' ORDER BY tipo ASC';
  let rows = queryAll(sql, params);
  res.json(rows);
});

app.get('/api/servicios/tipos', (req, res) => {
  const rows = queryAll('SELECT DISTINCT tipo FROM servicios ORDER BY tipo');
  res.json(rows.map(r => r.tipo));
});

app.get('/api/locales/:id/calificaciones', (req, res) => {
  res.json(queryAll('SELECT * FROM calificaciones WHERE local_id = ? ORDER BY created_at DESC', [req.params.id]));
});

app.post('/api/locales/:id/calificaciones', (req, res) => {
  const { estrellas, comentario, device_id } = req.body;
  if (!estrellas || estrellas < 1 || estrellas > 5) return res.status(400).json({ error: 'Calificación 1-5' });
  if (!device_id) return res.status(400).json({ error: 'device_id requerido' });

  const existing = queryOne('SELECT id FROM calificaciones WHERE local_id = ? AND device_id = ?', [req.params.id, device_id]);
  if (existing) {
    runSql('UPDATE calificaciones SET estrellas=?, comentario=?, created_at=datetime("now") WHERE id=?', [estrellas, comentario || '', existing.id]);
    return res.json({ message: 'Calificación actualizada', id: existing.id });
  }
  runSql('INSERT INTO calificaciones (local_id,estrellas,comentario,device_id) VALUES (?,?,?,?)', [req.params.id, estrellas, comentario || '', device_id]);
  const last = queryOne('SELECT last_insert_rowid() as id');
  res.json({ message: 'Calificación enviada', id: last.id });
});

app.get('/api/config', (req, res) => {
  const rows = queryAll('SELECT * FROM configuracion');
  const config = {};
  rows.forEach(r => { config[r.clave] = r.valor; });
  res.json(config);
});

app.get('/api/mascotas', (req, res) => {
  res.json(queryAll('SELECT * FROM mascotas_perdidas ORDER BY created_at DESC'));
});

app.post('/api/mascotas', (req, res) => {
  const { nombre_contacto, telefono, ubicacion_extravio, direccion, foto_base64, tipo_animal, caracteristicas, nombre_mascota, comentarios, latitud, longitud } = req.body;
  if (!nombre_contacto || !telefono) return res.status(400).json({ error: 'Nombre y teléfono requeridos' });
  runSql('INSERT INTO mascotas_perdidas (nombre_contacto,telefono,ubicacion_extravio,direccion,foto_base64,tipo_animal,caracteristicas,nombre_mascota,comentarios,latitud,longitud) VALUES (?,?,?,?,?,?,?,?,?,?,?)', 
    [nombre_contacto, telefono, ubicacion_extravio||'', direccion||'', foto_base64||'', tipo_animal||'', caracteristicas||'', nombre_mascota||'', comentarios||'', latitud || null, longitud || null]);
  res.json({ message: 'Aviso publicado' });
});

// Ping / Estadísticas
app.post('/api/ping', (req, res) => {
  const { device_id } = req.body;
  if (device_id) {
    runSql('INSERT INTO visitas (device_id) VALUES (?)', [device_id]);
  }
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// Locales
app.get('/api/admin/locales', authMw, (req, res) => res.json(queryAll('SELECT * FROM locales ORDER BY nombre')));
app.post('/api/admin/locales', authMw, (req, res) => {
  const { nombre, direccion, horario_apertura, horario_cierre, dias_atencion, acepta_efectivo, acepta_tarjeta, latitud, longitud } = req.body;
  runSql('INSERT INTO locales (nombre,direccion,horario_apertura,horario_cierre,dias_atencion,acepta_efectivo,acepta_tarjeta,latitud,longitud) VALUES (?,?,?,?,?,?,?,?,?)',
    [nombre, direccion||'', horario_apertura||'08:00', horario_cierre||'20:00', dias_atencion||'lun-sab', acepta_efectivo?1:0, acepta_tarjeta?1:0, parseFloat(latitud), parseFloat(longitud)]);
  res.json({ message: 'Local creado' });
});
app.put('/api/admin/locales/:id', authMw, (req, res) => {
  const { nombre, direccion, horario_apertura, horario_cierre, dias_atencion, acepta_efectivo, acepta_tarjeta, latitud, longitud } = req.body;
  runSql('UPDATE locales SET nombre=?,direccion=?,horario_apertura=?,horario_cierre=?,dias_atencion=?,acepta_efectivo=?,acepta_tarjeta=?,latitud=?,longitud=? WHERE id=?',
    [nombre, direccion, horario_apertura, horario_cierre, dias_atencion, acepta_efectivo?1:0, acepta_tarjeta?1:0, parseFloat(latitud), parseFloat(longitud), req.params.id]);
  res.json({ message: 'Local actualizado' });
});
app.delete('/api/admin/locales/:id', authMw, (req, res) => {
  runSql('DELETE FROM productos WHERE local_id = ?', [req.params.id]);
  runSql('DELETE FROM calificaciones WHERE local_id = ?', [req.params.id]);
  runSql('DELETE FROM locales WHERE id = ?', [req.params.id]);
  res.json({ message: 'Local eliminado' });
});

// Productos
app.get('/api/admin/productos', authMw, (req, res) => res.json(queryAll('SELECT p.*, l.nombre as local_nombre FROM productos p JOIN locales l ON p.local_id = l.id ORDER BY l.nombre, p.nombre')));
app.post('/api/admin/productos', authMw, (req, res) => {
  const { local_id, nombre, marca, precio, en_stock, unidad } = req.body;
  runSql('INSERT INTO productos (local_id,nombre,marca,precio,en_stock,unidad) VALUES (?,?,?,?,?,?)', [local_id, nombre, marca||'', parseFloat(precio), en_stock?1:0, unidad||'kg']);
  res.json({ message: 'Producto creado' });
});
app.put('/api/admin/productos/:id', authMw, (req, res) => {
  const { local_id, nombre, marca, precio, en_stock, unidad } = req.body;
  runSql('UPDATE productos SET local_id=?,nombre=?,marca=?,precio=?,en_stock=?,unidad=? WHERE id=?', [local_id, nombre, marca||'', parseFloat(precio), en_stock?1:0, unidad||'kg', req.params.id]);
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
app.get('/api/admin/servicios', authMw, (req, res) => res.json(queryAll('SELECT * FROM servicios ORDER BY tipo, nombre_prestador')));
app.post('/api/admin/servicios', authMw, (req, res) => {
  const { tipo, nombre_prestador, telefono } = req.body;
  runSql('INSERT INTO servicios (tipo,nombre_prestador,telefono) VALUES (?,?,?)', [tipo, nombre_prestador, telefono||'']);
  res.json({ message: 'Servicio creado' });
});
app.put('/api/admin/servicios/:id', authMw, (req, res) => {
  const { tipo, nombre_prestador, telefono } = req.body;
  runSql('UPDATE servicios SET tipo=?,nombre_prestador=?,telefono=? WHERE id=?', [tipo, nombre_prestador, telefono||'', req.params.id]);
  res.json({ message: 'Servicio actualizado' });
});
app.delete('/api/admin/servicios/:id', authMw, (req, res) => { runSql('DELETE FROM servicios WHERE id=?', [req.params.id]); res.json({ message: 'Eliminado' }); });

// Mascotas
app.delete('/api/admin/mascotas/:id', authMw, (req, res) => {
  runSql('DELETE FROM mascotas_perdidas WHERE id=?', [req.params.id]);
  res.json({ message: 'Aviso eliminado' });
});

// Configuración
app.put('/api/admin/config', authMw, (req, res) => {
  const { admin_whatsapp, plan_cuadrante, whatsapp_vecinos, tel_carabineros, tel_bomberos, tel_pdi, tel_ambulancia, tel_seguridad } = req.body;
  if (admin_whatsapp) runSql('UPDATE configuracion SET valor=? WHERE clave=?', [admin_whatsapp, 'admin_whatsapp']);
  if (plan_cuadrante) runSql('UPDATE configuracion SET valor=? WHERE clave=?', [plan_cuadrante, 'plan_cuadrante']);
  if (whatsapp_vecinos) runSql('UPDATE configuracion SET valor=? WHERE clave=?', [whatsapp_vecinos, 'whatsapp_vecinos']);
  if (tel_carabineros) runSql('UPDATE configuracion SET valor=? WHERE clave=?', [tel_carabineros, 'tel_carabineros']);
  if (tel_bomberos) runSql('UPDATE configuracion SET valor=? WHERE clave=?', [tel_bomberos, 'tel_bomberos']);
  if (tel_pdi) runSql('UPDATE configuracion SET valor=? WHERE clave=?', [tel_pdi, 'tel_pdi']);
  if (tel_ambulancia) runSql('UPDATE configuracion SET valor=? WHERE clave=?', [tel_ambulancia, 'tel_ambulancia']);
  if (tel_seguridad) runSql('UPDATE configuracion SET valor=? WHERE clave=?', [tel_seguridad, 'tel_seguridad']);
  res.json({ message: 'Configuración actualizada' });
});

app.get('/api/admin/stats', authMw, (req, res) => {
  const totalVisitas = queryOne('SELECT COUNT(*) as count FROM visitas');
  const uniqueUsers = queryOne('SELECT COUNT(DISTINCT device_id) as count FROM visitas');
  const visitasHoy = queryOne("SELECT COUNT(*) as count FROM visitas WHERE date(created_at) = date('now')");
  
  const topLocales = queryAll(`
    SELECT l.nombre, COUNT(c.id) as calif_count, AVG(c.estrellas) as avg_estrellas
    FROM locales l
    LEFT JOIN calificaciones c ON l.id = c.local_id
    GROUP BY l.id
    ORDER BY calif_count DESC
    LIMIT 5
  `);

  const totalMascotas = queryOne('SELECT COUNT(*) as count FROM mascotas_perdidas');

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

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Start
async function start() {
  await initDatabase();

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
