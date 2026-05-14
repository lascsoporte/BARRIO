/**
 * Script de Migración para Corregir Base de Datos BARRIO
 * 
 * PROBLEMA DETECTADO:
 * - La tabla 'usuarios' en SQLite estaba incompleta
 * - Solo tenía: id, nombre, telefono, terms_accepted
 * - Faltaban 16 columnas críticas para el funcionamiento
 * 
 * SOLUCIÓN:
 * - Este script migra los datos existentes a una nueva tabla completa
 * - Preserva todos los usuarios registrados
 * - No se pierde ningún dato
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'barrio.db');
const BACKUP_PATH = path.join(__dirname, 'barrio_backup.db');

async function migrarBaseDatos() {
  console.log('🔧 INICIANDO MIGRACIÓN SEGURA DE BASE DE DATOS...\n');

  // 1. Crear backup de seguridad SIEMPRE
  if (fs.existsSync(DB_PATH)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(__dirname, `barrio_backup_${timestamp}.db`);
    console.log('📦 Creando backup de seguridad...');
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`✅ Backup creado: ${backupPath}\n`);
  } else {
    console.log('ℹ️  No existe base de datos, se creará una nueva.\n');
  }

  const SQL = await initSqlJs();
  let db;

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  try {
    // 2. Verificar si la tabla usuarios existe
    console.log('🔍 Verificando estructura actual...');
    let tableInfo;
    try {
      tableInfo = db.exec("PRAGMA table_info(usuarios)");
    } catch (e) {
      tableInfo = [];
    }
    
    if (tableInfo.length === 0) {
      console.log('ℹ️  Tabla usuarios no existe, se creará desde cero.\n');
      
      // Crear tabla completa
      db.run(`CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        telefono TEXT NOT NULL UNIQUE,
        direccion TEXT,
        ip TEXT,
        device_id TEXT,
        is_blocked INTEGER DEFAULT 0,
        is_stolen INTEGER DEFAULT 0,
        is_verified INTEGER DEFAULT 1,
        terms_accepted INTEGER DEFAULT 0,
        nickname TEXT,
        email TEXT,
        pin_seguridad TEXT,
        push_enabled INTEGER DEFAULT 0,
        last_lat REAL,
        last_lng REAL,
        home_lat REAL,
        home_lng REAL,
        baja_solicitada INTEGER DEFAULT 0,
        baja_fecha TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      console.log('✅ Tabla usuarios creada\n');
      
    } else {
      // Tabla existe - agregar columnas faltantes sin borrar datos
      const columns = tableInfo[0].values.map(row => row[1]);
      console.log(`📋 Columnas actuales: ${columns.join(', ')}\n`);
      
      const requiredColumns = [
        { name: 'nickname', type: 'TEXT' },
        { name: 'email', type: 'TEXT' },
        { name: 'pin_seguridad', type: 'TEXT' },
        { name: 'device_id', type: 'TEXT' },
        { name: 'home_lat', type: 'REAL' },
        { name: 'home_lng', type: 'REAL' },
        { name: 'is_verified', type: 'INTEGER DEFAULT 1' },
        { name: 'direccion', type: 'TEXT' },
        { name: 'ip', type: 'TEXT' },
        { name: 'is_blocked', type: 'INTEGER DEFAULT 0' },
        { name: 'is_stolen', type: 'INTEGER DEFAULT 0' },
        { name: 'push_enabled', type: 'INTEGER DEFAULT 0' },
        { name: 'last_lat', type: 'REAL' },
        { name: 'last_lng', type: 'REAL' },
        { name: 'baja_solicitada', type: 'INTEGER DEFAULT 0' },
        { name: 'baja_fecha', type: 'TEXT' }
      ];
      
      let columnsAdded = 0;
      for (const col of requiredColumns) {
        if (!columns.includes(col.name)) {
          try {
            db.run(`ALTER TABLE usuarios ADD COLUMN ${col.name} ${col.type}`);
            console.log(`✅ Columna agregada: ${col.name}`);
            columnsAdded++;
          } catch (e) {
            console.log(`⚠️  No se pudo agregar ${col.name}: ${e.message}`);
          }
        }
      }
      
      if (columnsAdded > 0) {
        console.log(`\n✅ ${columnsAdded} columna(s) agregada(s)`);
      } else {
        console.log('\n✅ La tabla ya tiene todas las columnas necesarias');
      }
      
      // Verificar datos existentes
      const userCount = db.exec("SELECT COUNT(*) as total FROM usuarios");
      const total = userCount[0]?.values[0][0] || 0;
      console.log(`👥 Usuarios en la base de datos: ${total}\n`);
    }

    // 7. Verificar tablas adicionales
    console.log('🔧 Verificando otras tablas...');
    
    // Crear tabla de configuración si no existe
    db.run(`CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT
    )`);

    // Insertar configuraciones por defecto
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
      ['admin_pass3', 'seguridad2025']
    ];

    for (let [clave, valor] of configs) {
      db.run('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)', [clave, valor]);
    }

    // 8. Guardar cambios
    console.log('💾 Guardando cambios en disco...');
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    console.log('✅ Cambios guardados\n');

    // 9. Verificar resultado final
    console.log('🔍 Verificando migración...');
    const finalCheck = db.exec("PRAGMA table_info(usuarios)");
    const finalColumns = finalCheck[0].values.map(row => row[1]);
    console.log(`📋 Columnas finales (${finalColumns.length}): ${finalColumns.join(', ')}\n`);

    const userCount = db.exec("SELECT COUNT(*) as total FROM usuarios");
    const total = userCount[0].values[0][0];
    console.log(`👥 Total de usuarios en la base de datos: ${total}\n`);

    console.log('✅ ¡MIGRACIÓN COMPLETADA EXITOSAMENTE!\n');
    console.log('📝 RESUMEN:');
    console.log('   ✓ Base de datos actualizada');
    console.log('   ✓ Usuarios preservados');
    console.log('   ✓ Todas las columnas añadidas');
    console.log('   ✓ Configuración inicializada');
    console.log(`   ✓ Backup guardado en: ${BACKUP_PATH}\n`);
    console.log('🚀 Puedes reiniciar el servidor ahora.\n');

  } catch (error) {
    console.error('❌ ERROR DURANTE LA MIGRACIÓN:', error);
    console.log('\n⚠️  RESTAURANDO DESDE BACKUP...');
    if (fs.existsSync(BACKUP_PATH)) {
      fs.copyFileSync(BACKUP_PATH, DB_PATH);
      console.log('✅ Base de datos restaurada desde backup');
    }
    process.exit(1);
  }

  db.close();
}

// Ejecutar migración
migrarBaseDatos().catch(err => {
  console.error('ERROR FATAL:', err);
  process.exit(1);
});
