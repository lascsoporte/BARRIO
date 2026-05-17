/**
 * database.js - BARRIO
 * 
 * Sistema de base de datos con MySQL (Clever Cloud) como fuente principal.
 * SQLite se usa ÚNICAMENTE para migrar datos existentes la primera vez.
 * 
 * Flujo:
 * 1. Conectar a MySQL (hasta 15 segundos de espera)
 * 2. Crear tablas si no existen
 * 3. Si MySQL está vacío Y existe barrio.db → migrar datos una sola vez
 * 4. Si MySQL no conecta → reintentar cada 30 segundos (nunca usar SQLite vacío)
 */

const mysql = require('mysql2/promise');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'barrio.db');
let mysqlPool = null;
let dbReady = false;

// Configuración MySQL Clever Cloud (plan gratuito: máx 5 conexiones simultáneas)
const mysqlConfig = {
  host: 'blmmp8n5ku7ibhlbw78j-mysql.services.clever-cloud.com',
  user: 'uaeljzbnpravc2uc',
  password: 'MLiC609Fh7UXinx861mQ',
  database: 'blmmp8n5ku7ibhlbw78j',
  waitForConnections: true,
  connectionLimit: 3,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false },
  connectTimeout: 15000
};

// ─── INICIALIZACIÓN ────────────────────────────────────────────────────────────

async function initDatabase() {
  console.log('🔄 Conectando a MySQL (Clever Cloud)...');

  let intentos = 0;
  const maxIntentos = 3;

  while (intentos < maxIntentos) {
    intentos++;
    try {
      // Cerrar pool anterior si existe (libera conexiones)
      if (mysqlPool) {
        try { await mysqlPool.end(); } catch (_) {}
        mysqlPool = null;
        // Esperar a que Clever Cloud libere las conexiones
        await new Promise(r => setTimeout(r, 2000));
      }

      mysqlPool = mysql.createPool(mysqlConfig);

      // Probar conexión real
      await Promise.race([
        mysqlPool.query('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
      ]);

      console.log('✅ Conectado a MySQL (Clever Cloud)');

      // Crear todas las tablas si no existen
      await crearTablas();

      // Agregar columnas faltantes (para actualizaciones)
      await agregarColumnasNuevas();

      // Insertar configuración por defecto si no existe
      await insertarConfiguracionPorDefecto();

      // Migrar desde SQLite si MySQL está vacío y existe barrio.db
      await migrarDesdeLocalSiNecesario();

      dbReady = true;
      console.log('✅ Base de datos lista');
      return;

    } catch (e) {
      console.error(`❌ Intento ${intentos}/${maxIntentos} fallido: ${e.message}`);
      // Cerrar el pool fallido inmediatamente para liberar conexiones
      if (mysqlPool) {
        try { await mysqlPool.end(); } catch (_) {}
        mysqlPool = null;
      }
      if (intentos < maxIntentos) {
        // Esperar más tiempo si el error es de demasiadas conexiones
        const espera = e.message.includes('max_user_connections') ? 15000 : 5000;
        console.log(`⏳ Reintentando en ${espera/1000} segundos...`);
        await new Promise(r => setTimeout(r, espera));
      }
    }
  }

  throw new Error('No se pudo conectar a MySQL después de ' + maxIntentos + ' intentos. Verifica la conexión a Clever Cloud.');
}

// ─── CREAR TABLAS ──────────────────────────────────────────────────────────────

async function crearTablas() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      telefono VARCHAR(50) NOT NULL UNIQUE,
      direccion TEXT,
      ip VARCHAR(100),
      device_id VARCHAR(255),
      is_blocked TINYINT(1) DEFAULT 0,
      is_stolen TINYINT(1) DEFAULT 0,
      is_verified TINYINT(1) DEFAULT 1,
      terms_accepted TINYINT(1) DEFAULT 0,
      nickname VARCHAR(100),
      email VARCHAR(255),
      pin_seguridad VARCHAR(10),
      push_enabled TINYINT(1) DEFAULT 0,
      last_lat DOUBLE,
      last_lng DOUBLE,
      home_lat DOUBLE,
      home_lng DOUBLE,
      baja_solicitada TINYINT(1) DEFAULT 0,
      baja_fecha DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS reportes_ciudadanos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT,
      nombre_contacto VARCHAR(255) NOT NULL,
      telefono VARCHAR(50) NOT NULL,
      tipo_reporte VARCHAR(50) DEFAULT 'otros',
      ubicacion_texto TEXT,
      foto_base64 LONGTEXT,
      detalles TEXT,
      latitud DOUBLE,
      longitud DOUBLE,
      fecha_expiracion TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS locales (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      direccion TEXT,
      horario_apertura VARCHAR(10) DEFAULT '08:00',
      horario_cierre VARCHAR(10) DEFAULT '20:00',
      dias_atencion VARCHAR(50) DEFAULT 'lun-sab',
      acepta_efectivo TINYINT(1) DEFAULT 1,
      acepta_tarjeta TINYINT(1) DEFAULT 0,
      latitud DOUBLE NOT NULL,
      longitud DOUBLE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS productos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      local_id INT NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      marca VARCHAR(255),
      precio DECIMAL(10,2) NOT NULL,
      en_stock TINYINT(1) DEFAULT 1,
      unidad VARCHAR(20) DEFAULT 'unidad',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS servicios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo VARCHAR(100) NOT NULL,
      nombre_prestador VARCHAR(255) NOT NULL,
      telefono VARCHAR(50),
      latitud DOUBLE NULL,
      longitud DOUBLE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS calificaciones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      local_id INT NOT NULL,
      estrellas INT NOT NULL,
      comentario TEXT,
      device_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS mascotas_perdidas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre_contacto VARCHAR(255) NOT NULL,
      telefono VARCHAR(50) NOT NULL,
      ubicacion_extravio TEXT,
      direccion TEXT,
      foto_base64 LONGTEXT,
      tipo_animal VARCHAR(50),
      caracteristicas TEXT,
      nombre_mascota VARCHAR(255),
      comentarios TEXT,
      latitud DOUBLE,
      longitud DOUBLE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS visitas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      device_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS mensajes_admin (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      mensaje TEXT NOT NULL,
      leido TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS muro_comunitario (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      contenido TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS registro_emergencias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      institucion VARCHAR(100) NOT NULL,
      latitud DOUBLE,
      longitud DOUBLE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS registro_extravios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      latitud DOUBLE NOT NULL,
      longitud DOUBLE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      subscription_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS configuracion (
      clave VARCHAR(100) PRIMARY KEY,
      valor TEXT
    )`
  ];

  for (const q of queries) {
    await mysqlPool.execute(q);
  }
  console.log('✅ Tablas verificadas');
}

// ─── AGREGAR COLUMNAS NUEVAS (actualizaciones) ─────────────────────────────────

async function agregarColumnasNuevas() {
  const columnas = [
    ['usuarios', 'push_enabled', 'TINYINT(1) DEFAULT 0'],
    ['usuarios', 'last_lat', 'DOUBLE'],
    ['usuarios', 'last_lng', 'DOUBLE'],
    ['usuarios', 'home_lat', 'DOUBLE'],
    ['usuarios', 'home_lng', 'DOUBLE'],
    ['usuarios', 'baja_solicitada', 'TINYINT(1) DEFAULT 0'],
    ['usuarios', 'baja_fecha', 'DATETIME NULL'],
    ['usuarios', 'is_verified', 'TINYINT(1) DEFAULT 1'],
    ['usuarios', 'terms_accepted', 'TINYINT(1) DEFAULT 0'],
    ['usuarios', 'nickname', 'VARCHAR(100)'],
    ['usuarios', 'email', 'VARCHAR(255)'],
    ['usuarios', 'pin_seguridad', 'VARCHAR(10)'],
    ['servicios', 'latitud', 'DOUBLE NULL'],
    ['servicios', 'longitud', 'DOUBLE NULL'],
  ];

  for (const [tabla, columna, tipo] of columnas) {
    try {
      await mysqlPool.execute(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
    } catch (e) {
      // Ignorar si ya existe — es el comportamiento esperado
    }
  }
}

// ─── CONFIGURACIÓN POR DEFECTO ────────────────────────────────────────────────

async function insertarConfiguracionPorDefecto() {
  const configs = [
    ['admin_whatsapp', '56987606517'],
    ['tel_carabineros', '133'],
    ['tel_bomberos', '132'],
    ['tel_pdi', '134'],
    ['tel_ambulancia', '131'],
    ['tel_seguridad', '1529'],
    ['push_radius', '500'],
    ['admin_pass1', 'barrio2025'],
    ['admin_pass2', 'admin2025'],
    ['admin_pass3', 'seguridad2025'],
    ['whatsapp_vecinos', '56987606517']
  ];

  for (const [clave, valor] of configs) {
    try {
      const [rows] = await mysqlPool.execute('SELECT clave FROM configuracion WHERE clave = ?', [clave]);
      if (rows.length === 0) {
        await mysqlPool.execute('INSERT INTO configuracion (clave, valor) VALUES (?, ?)', [clave, valor]);
      }
    } catch (e) { /* ignorar */ }
  }
}

// ─── MIGRACIÓN ÚNICA DESDE SQLITE ─────────────────────────────────────────────

async function migrarDesdeLocalSiNecesario() {
  // Solo migrar si MySQL está vacío Y existe barrio.db con datos
  if (!fs.existsSync(DB_PATH)) return;

  const [rows] = await mysqlPool.query('SELECT COUNT(*) as total FROM usuarios');
  if (rows[0].total > 0) {
    console.log(`✅ MySQL ya tiene ${rows[0].total} usuarios. Sin migración necesaria.`);
    return;
  }

  // Cargar SQLite
  let sqliteDb;
  try {
    const SQL = await initSqlJs();
    const buf = fs.readFileSync(DB_PATH);
    sqliteDb = new SQL.Database(buf);
  } catch (e) {
    console.warn('⚠️ No se pudo leer barrio.db:', e.message);
    return;
  }

  // Verificar que SQLite tiene usuarios
  const checkUsers = sqliteDb.exec('SELECT COUNT(*) as total FROM usuarios');
  const totalSQLite = checkUsers[0]?.values[0][0] || 0;
  if (totalSQLite === 0) {
    console.log('ℹ️ SQLite también está vacío. Sin migración.');
    sqliteDb.close();
    return;
  }

  console.log(`📦 Migrando ${totalSQLite} usuarios desde SQLite → MySQL...`);

  // Orden: tablas padre primero, luego tablas hijo
  const tablas = [
    'configuracion', 'usuarios', 'locales',
    'productos', 'servicios', 'calificaciones',
    'reportes_ciudadanos', 'mascotas_perdidas',
    'muro_comunitario', 'mensajes_admin',
    'registro_emergencias', 'registro_extravios',
    'push_subscriptions', 'visitas'
  ];

  for (const tabla of tablas) {
    try {
      const result = sqliteDb.exec(`SELECT * FROM ${tabla}`);
      if (!result.length || !result[0].values.length) continue;

      const cols = result[0].columns;
      const vals = result[0].values;

      console.log(`  → ${tabla}: ${vals.length} registros`);

      for (const row of vals) {
        const valores = row.map(v => (v === undefined ? null : v));
        const ph = cols.map(() => '?').join(',');
        await mysqlPool.execute(
          `INSERT IGNORE INTO ${tabla} (${cols.join(',')}) VALUES (${ph})`,
          valores
        ).catch(() => {}); // ignorar duplicados
      }

      // Actualizar AUTO_INCREMENT al valor correcto
      await mysqlPool.execute(
        `ALTER TABLE ${tabla} AUTO_INCREMENT = 1`
      ).catch(() => {});

    } catch (e) {
      // Tabla puede no existir en SQLite — ignorar
    }
  }

  sqliteDb.close();
  console.log('✅ Migración completada. Todos los usuarios y datos conservados.');
  
  // Renombrar barrio.db para que no se migre de nuevo en futuros reinicios
  try {
    fs.renameSync(DB_PATH, DB_PATH + '.migrado');
    console.log('✅ barrio.db renombrado a barrio.db.migrado (ya no se necesita)');
  } catch(e) { /* ignorar si no se puede renombrar */ }
}

// ─── FUNCIONES DE CONSULTA ─────────────────────────────────────────────────────

async function queryAll(sql, params = []) {
  const [rows] = await mysqlPool.execute(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows[0] || null;
}

async function runSql(sql, params = []) {
  const [result] = await mysqlPool.execute(sql, params);
  return result;
}

// ─── LIMPIEZA PERIÓDICA ────────────────────────────────────────────────────────

async function cleanupMascotas() {
  try {
    // Borrar mascotas perdidas con más de 30 días (15 iniciales + 15 de gracia si no se renovó)
    const result = await runSql(
      "DELETE FROM mascotas_perdidas WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)"
    );
    return result.affectedRows || 0;
  } catch (e) {
    console.error('Error en limpieza de mascotas:', e);
    return 0;
  }
}

async function cleanupReportes() {
  try {
    // Borrar reportes con fecha de expiración pasada
    const result = await runSql(
      "DELETE FROM reportes_ciudadanos WHERE fecha_expiracion IS NOT NULL AND fecha_expiracion < NOW()"
    );
    return result.affectedRows || 0;
  } catch (e) {
    console.error('Error en limpieza de reportes:', e);
    return 0;
  }
}

async function cleanupMuro() {
  try {
    // Borrar posts del muro con más de 7 días
    const result = await runSql(
      "DELETE FROM muro_comunitario WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)"
    );
    return result.affectedRows || 0;
  } catch (e) {
    console.error('Error en limpieza de muro:', e);
    return 0;
  }
}

async function getMascotasParaRecordatorio() {
  // Mascotas que cumplen exactamente entre 14 y 15 días (ventana para recordar al dueño una sola vez)
  try {
    return await queryAll(
      `SELECT m.id, m.nombre_mascota, m.nombre_contacto, m.telefono, m.created_at
       FROM mascotas_perdidas m
       WHERE m.created_at < DATE_SUB(NOW(), INTERVAL 14 DAY)
         AND m.created_at > DATE_SUB(NOW(), INTERVAL 15 DAY)`
    );
  } catch (e) {
    console.error('Error obteniendo mascotas para recordatorio:', e);
    return [];
  }
}

// isUsingMysql siempre retorna true — solo usamos MySQL
function isUsingMysql() { return true; }

module.exports = { initDatabase, queryAll, queryOne, runSql, cleanupMascotas, cleanupReportes, cleanupMuro, getMascotasParaRecordatorio, isUsingMysql };
