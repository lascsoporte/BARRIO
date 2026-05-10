const mysql = require('mysql2/promise');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'barrio.db');
let sqliteDb = null;
let mysqlPool = null;

// Configuración MySQL (Clever Cloud - Persistencia Total)
const mysqlConfig = {
  host: 'blmmp8n5ku7ibhlbw78j-mysql.services.clever-cloud.com',
  user: 'uaeljzbnpravc2uc',
  password: 'MLiC609Fh7UXinx861mQ',
  database: 'blmmp8n5ku7ibhlbw78j',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false } // Requerido por algunos servicios cloud
};

let useMysql = false;

async function initDatabase() {
  console.log('🔄 Conectando a Base de Datos en la Nube...');
  
  try {
    mysqlPool = mysql.createPool(mysqlConfig);
    // Prueba de conexión
    await mysqlPool.query('SELECT 1');
    useMysql = true;
    console.log('✅ ¡CONECTADO A CLEVER CLOUD! (Persistencia Activa)');
    
    // Crear tablas en la nube si no existen
    await createCloudTables();
  } catch (e) {
    console.warn('⚠️ Error conectando a la nube, usando SQLite local:', e.message);
    useMysql = false;
  }

  if (!useMysql) {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      const buf = fs.readFileSync(DB_PATH);
      sqliteDb = new SQL.Database(buf);
    } else {
      sqliteDb = new SQL.Database();
    }
    initSqliteTables();
    console.log('✅ Usando SQLite (Local)');
  }
}

async function createCloudTables() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(255) NOT NULL, telefono VARCHAR(50) NOT NULL UNIQUE,
      direccion TEXT, ip VARCHAR(100), device_id VARCHAR(255), 
      is_blocked TINYINT(1) DEFAULT 0, is_stolen TINYINT(1) DEFAULT 0, is_verified TINYINT(1) DEFAULT 0, terms_accepted TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS locales (
      id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(255) NOT NULL, direccion TEXT,
      horario_apertura VARCHAR(10) DEFAULT '08:00', horario_cierre VARCHAR(10) DEFAULT '20:00',
      dias_atencion VARCHAR(50) DEFAULT 'lun-sab', acepta_efectivo TINYINT(1) DEFAULT 1,
      acepta_tarjeta TINYINT(1) DEFAULT 0, latitud DOUBLE NOT NULL, longitud DOUBLE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS productos (
      id INT AUTO_INCREMENT PRIMARY KEY, local_id INT NOT NULL, nombre VARCHAR(255) NOT NULL,
      marca VARCHAR(255), precio DECIMAL(10,2) NOT NULL, en_stock TINYINT(1) DEFAULT 1, unidad VARCHAR(20) DEFAULT 'kg',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS servicios (
      id INT AUTO_INCREMENT PRIMARY KEY, tipo VARCHAR(100) NOT NULL, nombre_prestador VARCHAR(255) NOT NULL,
      telefono VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS calificaciones (
      id INT AUTO_INCREMENT PRIMARY KEY, local_id INT NOT NULL,
      estrellas INT NOT NULL, comentario TEXT, device_id VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS mascotas_perdidas (
      id INT AUTO_INCREMENT PRIMARY KEY, nombre_contacto VARCHAR(255) NOT NULL, telefono VARCHAR(50) NOT NULL,
      ubicacion_extravio TEXT, direccion TEXT, foto_base64 LONGTEXT, tipo_animal VARCHAR(50),
      caracteristicas TEXT, nombre_mascota VARCHAR(255), comentarios TEXT, latitud DOUBLE, longitud DOUBLE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS visitas (
      id INT AUTO_INCREMENT PRIMARY KEY, device_id VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS mensajes_admin (
      id INT AUTO_INCREMENT PRIMARY KEY, usuario_id INT NOT NULL, mensaje TEXT NOT NULL,
      leido TINYINT(1) DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS muro_comunitario (
      id INT AUTO_INCREMENT PRIMARY KEY, usuario_id INT NOT NULL, contenido TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS registro_emergencias (
      id INT AUTO_INCREMENT PRIMARY KEY, usuario_id INT NOT NULL, institucion VARCHAR(100) NOT NULL,
      latitud DOUBLE, longitud DOUBLE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS rastreo_robos (
      id INT AUTO_INCREMENT PRIMARY KEY, usuario_id INT NOT NULL, latitud DOUBLE NOT NULL,
      longitud DOUBLE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS configuracion ( clave VARCHAR(100) PRIMARY KEY, valor TEXT )`
  ];

  for (let q of queries) {
    await mysqlPool.execute(q);
  }

  // Asegurar que las nuevas columnas existan (para bases de datos ya creadas)
  try {
    await mysqlPool.execute('ALTER TABLE usuarios ADD COLUMN is_verified TINYINT(1) DEFAULT 0');
    console.log('✅ Columna is_verified añadida a usuarios');
  } catch (e) {
    // Si ya existe, fallará pero no pasa nada
  }

  try {
    await mysqlPool.execute('ALTER TABLE usuarios ADD COLUMN terms_accepted TINYINT(1) DEFAULT 0');
    console.log('✅ Columna terms_accepted añadida a usuarios');
  } catch (e) {
    // Si ya existe, fallará pero no pasa nada
  }

  // Configuración inicial
  const [rows] = await mysqlPool.execute('SELECT COUNT(*) as count FROM configuracion');
  if (rows[0].count === 0) {
    await mysqlPool.execute("INSERT INTO configuracion (clave, valor) VALUES ('admin_whatsapp', '56987606517')");
    await mysqlPool.execute("INSERT INTO configuracion (clave, valor) VALUES ('tel_carabineros', '133')");
    await mysqlPool.execute("INSERT INTO configuracion (clave, valor) VALUES ('tel_bomberos', '132')");
    await mysqlPool.execute("INSERT INTO configuracion (clave, valor) VALUES ('tel_pdi', '134')");
    await mysqlPool.execute("INSERT INTO configuracion (clave, valor) VALUES ('tel_ambulancia', '131')");
    await mysqlPool.execute("INSERT INTO configuracion (clave, valor) VALUES ('tel_seguridad', '1529')");
  }
}

async function queryAll(sql, params = []) {
  if (useMysql) {
    const [rows] = await mysqlPool.execute(sql, params);
    return rows;
  } else {
    const stmt = sqliteDb.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }
}

async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows[0] || null;
}

async function runSql(sql, params = []) {
  if (useMysql) {
    const [result] = await mysqlPool.execute(sql, params);
    return result;
  } else {
    sqliteDb.run(sql, params);
    saveSqlite();
    // Obtener el último ID insertado en SQLite para compatibilidad
    const last = sqliteDb.exec('SELECT last_insert_rowid() as id');
    const id = last[0]?.values[0][0];
    return { insertId: id };
  }
}

function saveSqlite() {
  if (!useMysql && sqliteDb) {
    const data = sqliteDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

function initSqliteTables() {
  // Mantener lógica de SQLite para fallback local
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, telefono TEXT UNIQUE, terms_accepted INTEGER DEFAULT 0)`);
  // ... (simplificado para fallback)
}

async function cleanupMascotas() {
  const sql = useMysql 
    ? "DELETE FROM mascotas_perdidas WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)"
    : "DELETE FROM mascotas_perdidas WHERE created_at < DATETIME('now', '-30 days')";
  try {
    const result = await runSql(sql);
    return result.affectedRows || 0;
  } catch (e) {
    console.error('Error en limpieza de mascotas:', e);
    return 0;
  }
}

module.exports = { initDatabase, queryAll, queryOne, runSql, cleanupMascotas };
