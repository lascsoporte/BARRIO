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
  console.log('🔧 INICIANDO MIGRACIÓN DE BASE DE DATOS...\n');

  // 1. Crear backup de seguridad
  if (fs.existsSync(DB_PATH)) {
    console.log('📦 Creando backup de seguridad...');
    fs.copyFileSync(DB_PATH, BACKUP_PATH);
    console.log(`✅ Backup creado: ${BACKUP_PATH}\n`);
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
    // 2. Verificar si la tabla usuarios existe y tiene la estructura incorrecta
    console.log('🔍 Verificando estructura actual...');
    const tableInfo = db.exec("PRAGMA table_info(usuarios)");
    
    if (tableInfo.length === 0) {
      console.log('ℹ️  Tabla usuarios no existe, se creará desde cero.');
    } else {
      const columns = tableInfo[0].values.map(row => row[1]); // Obtener nombres de columnas
      console.log(`📋 Columnas actuales: ${columns.join(', ')}`);
      
      const requiredColumns = [
        'nickname', 'email', 'pin_seguridad', 'device_id', 
        'home_lat', 'home_lng', 'is_verified', 'direccion'
      ];
      
      const missingColumns = requiredColumns.filter(col => !columns.includes(col));
      
      if (missingColumns.length > 0) {
        console.log(`\n⚠️  COLUMNAS FALTANTES DETECTADAS: ${missingColumns.join(', ')}\n`);
        
        // 3. Guardar datos existentes
        console.log('💾 Guardando usuarios existentes...');
        const existingUsers = db.exec("SELECT * FROM usuarios");
        let usersData = [];
        
        if (existingUsers.length > 0 && existingUsers[0].values.length > 0) {
          const cols = existingUsers[0].columns;
          usersData = existingUsers[0].values.map(row => {
            const user = {};
            cols.forEach((col, idx) => {
              user[col] = row[idx];
            });
            return user;
          });
          console.log(`✅ ${usersData.length} usuario(s) encontrado(s)\n`);
        }

        // 4. Eliminar tabla antigua
        console.log('🗑️  Eliminando tabla antigua...');
        db.run("DROP TABLE IF EXISTS usuarios");
        console.log('✅ Tabla eliminada\n');

        // 5. Crear tabla nueva completa
        console.log('🏗️  Creando tabla nueva con estructura completa...');
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
        console.log('✅ Tabla creada con TODAS las columnas\n');

        // 6. Restaurar usuarios con valores por defecto para columnas faltantes
        if (usersData.length > 0) {
          console.log('♻️  Restaurando usuarios con valores actualizados...');
          for (const user of usersData) {
            db.run(`INSERT INTO usuarios (
              id, nombre, telefono, terms_accepted,
              nickname, email, pin_seguridad, device_id,
              home_lat, home_lng, direccion, is_verified,
              is_blocked, is_stolen, push_enabled,
              created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
              user.id,
              user.nombre,
              user.telefono,
              user.terms_accepted || 0,
              user.nickname || user.nombre, // Usar nombre como nickname si no existe
              user.email || '',
              user.pin_seguridad || '0000', // PIN por defecto
              user.device_id || '',
              user.home_lat || null,
              user.home_lng || null,
              user.direccion || '',
              1, // is_verified = 1 (verificado por defecto)
              user.is_blocked || 0,
              user.is_stolen || 0,
              user.push_enabled || 0,
              user.created_at || new Date().toISOString()
            ]);
          }
          console.log(`✅ ${usersData.length} usuario(s) restaurado(s) exitosamente\n`);
        }
      } else {
        console.log('✅ La tabla usuarios ya tiene todas las columnas necesarias\n');
      }
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
