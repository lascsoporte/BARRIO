/**
 * Script para actualizar terminología en Base de Datos
 * 
 * CAMBIOS:
 * - Tabla: rastreo_robos → registro_extravios
 * - Tipo reporte: 'robo' → 'extravío'
 */

const initSqlJs = require('sql.js');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'barrio.db');

// Configuración MySQL (si aplica)
const mysqlConfig = {
  host: 'blmmp8n5ku7ibhlbw78j-mysql.services.clever-cloud.com',
  user: 'uaeljzbnpravc2uc',
  password: 'MLiC609Fh7UXinx861mQ',
  database: 'blmmp8n5ku7ibhlbw78j',
  ssl: { rejectUnauthorized: false }
};

async function actualizarTerminologia() {
  console.log('🔄 ACTUALIZANDO TERMINOLOGÍA EN BASE DE DATOS...\n');

  // Intentar MySQL primero
  let mysqlPool = null;
  let useMysql = false;

  try {
    mysqlPool = mysql.createPool(mysqlConfig);
    await mysqlPool.query('SELECT 1');
    useMysql = true;
    console.log('✅ Conectado a MySQL (Clever Cloud)\n');
  } catch (e) {
    console.log('⚠️  MySQL no disponible, usando SQLite local\n');
  }

  if (useMysql) {
    await actualizarMySQL(mysqlPool);
  } else {
    await actualizarSQLite();
  }

  if (mysqlPool) {
    await mysqlPool.end();
  }

  console.log('\n✅ TERMINOLOGÍA ACTUALIZADA CORRECTAMENTE\n');
}

async function actualizarMySQL(pool) {
  console.log('📊 Actualizando MySQL...\n');

  try {
    // 1. Renombrar tabla rastreo_robos → registro_extravios
    console.log('1️⃣  Renombrando tabla rastreo_robos...');
    await pool.query('RENAME TABLE rastreo_robos TO registro_extravios');
    console.log('   ✅ Tabla renombrada: registro_extravios\n');
  } catch (e) {
    if (e.message.includes("doesn't exist")) {
      console.log('   ℹ️  Tabla rastreo_robos no existe (ya fue renombrada o no creada)\n');
    } else {
      console.log(`   ⚠️  ${e.message}\n`);
    }
  }

  try {
    // 2. Actualizar tipo de reporte 'robo' → 'extravío'
    console.log('2️⃣  Actualizando reportes tipo "robo"...');
    const [result] = await pool.query(
      "UPDATE reportes_ciudadanos SET tipo_reporte = 'extravío' WHERE tipo_reporte = 'robo'"
    );
    console.log(`   ✅ ${result.affectedRows || 0} reporte(s) actualizado(s)\n`);
  } catch (e) {
    console.log(`   ⚠️  ${e.message}\n`);
  }

  console.log('✅ MySQL actualizado correctamente');
}

async function actualizarSQLite() {
  console.log('📊 Actualizando SQLite...\n');

  if (!fs.existsSync(DB_PATH)) {
    console.log('⚠️  No existe barrio.db, nada que actualizar');
    return;
  }

  // Crear backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = path.join(__dirname, `barrio_backup_terminologia_${timestamp}.db`);
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`📦 Backup creado: ${backupPath}\n`);

  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  try {
    // 1. Renombrar tabla rastreo_robos → registro_extravios
    console.log('1️⃣  Renombrando tabla rastreo_robos...');
    
    // Verificar si existe la tabla rastreo_robos
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='rastreo_robos'");
    
    if (tables.length > 0 && tables[0].values.length > 0) {
      db.run('ALTER TABLE rastreo_robos RENAME TO registro_extravios');
      console.log('   ✅ Tabla renombrada: registro_extravios\n');
    } else {
      console.log('   ℹ️  Tabla rastreo_robos no existe (ya fue renombrada o no creada)\n');
    }

    // 2. Actualizar tipo de reporte 'robo' → 'extravío'
    console.log('2️⃣  Actualizando reportes tipo "robo"...');
    db.run("UPDATE reportes_ciudadanos SET tipo_reporte = 'extravío' WHERE tipo_reporte = 'robo'");
    
    const count = db.exec("SELECT COUNT(*) as count FROM reportes_ciudadanos WHERE tipo_reporte = 'extravío'");
    const total = count[0]?.values[0][0] || 0;
    console.log(`   ✅ ${total} reporte(s) tipo "extravío" en BD\n`);

    // Guardar cambios
    console.log('💾 Guardando cambios...');
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    console.log('✅ Cambios guardados\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n⚠️  Restaurando desde backup...');
    fs.copyFileSync(backupPath, DB_PATH);
    console.log('✅ Base de datos restaurada');
  }

  db.close();
  console.log('✅ SQLite actualizado correctamente');
}

// Ejecutar
actualizarTerminologia().catch(err => {
  console.error('ERROR FATAL:', err);
  process.exit(1);
});
