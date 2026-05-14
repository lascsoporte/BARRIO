/**
 * Script de VERIFICACIÓN de Base de Datos - NO BORRA DATOS
 * 
 * Este script SOLO verifica y reporta el estado de la base de datos.
 * NO hace cambios destructivos.
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'barrio.db');

async function verificarBaseDatos() {
  console.log('🔍 VERIFICANDO BASE DE DATOS...\n');

  if (!fs.existsSync(DB_PATH)) {
    console.log('❌ ERROR: No existe el archivo barrio.db');
    console.log('💡 Solución: El servidor creará una nueva base de datos al iniciar.\n');
    return;
  }

  console.log(`✅ Archivo encontrado: ${DB_PATH}`);
  const stats = fs.statSync(DB_PATH);
  console.log(`📊 Tamaño: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`📅 Última modificación: ${stats.mtime.toLocaleString('es-CL')}\n`);

  const SQL = await initSqlJs();
  let db;

  try {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
    console.log('✅ Base de datos abierta correctamente\n');
  } catch (error) {
    console.log('❌ ERROR: No se puede abrir la base de datos');
    console.log(`   Detalles: ${error.message}`);
    console.log('\n💡 Solución: Renombra barrio.db a barrio.db.old y reinicia el servidor.\n');
    return;
  }

  try {
    // Verificar tabla usuarios
    console.log('📋 TABLA USUARIOS:');
    const tableInfo = db.exec("PRAGMA table_info(usuarios)");
    
    if (tableInfo.length === 0) {
      console.log('   ❌ No existe');
    } else {
      const columns = tableInfo[0].values.map(row => row[1]);
      console.log(`   ✅ Existe con ${columns.length} columnas`);
      
      // Contar usuarios
      const userCount = db.exec("SELECT COUNT(*) as total FROM usuarios");
      const total = userCount[0]?.values[0][0] || 0;
      console.log(`   👥 Total de usuarios: ${total}`);
      
      // Verificar columnas críticas
      const requiredColumns = [
        'id', 'nombre', 'telefono', 'nickname', 'email', 'pin_seguridad', 
        'device_id', 'home_lat', 'home_lng', 'is_verified', 'direccion'
      ];
      const missingColumns = requiredColumns.filter(col => !columns.includes(col));
      
      if (missingColumns.length > 0) {
        console.log(`   ⚠️  Columnas faltantes: ${missingColumns.join(', ')}`);
        console.log('   💡 Ejecuta: node fix_database.js para reparar');
      } else {
        console.log('   ✅ Todas las columnas necesarias están presentes');
      }
    }

    // Verificar otras tablas
    console.log('\n📋 OTRAS TABLAS:');
    const tables = [
      'reportes_ciudadanos',
      'locales',
      'productos',
      'servicios',
      'muro_comunitario',
      'mascotas_perdidas',
      'configuracion'
    ];

    for (const tableName of tables) {
      try {
        const result = db.exec(`SELECT COUNT(*) as count FROM ${tableName}`);
        const count = result[0]?.values[0][0] || 0;
        console.log(`   ${tableName}: ${count} registros`);
      } catch (e) {
        console.log(`   ${tableName}: ❌ No existe`);
      }
    }

    console.log('\n✅ VERIFICACIÓN COMPLETADA\n');

  } catch (error) {
    console.error('❌ Error durante la verificación:', error);
  }

  db.close();
}

// Ejecutar verificación
verificarBaseDatos().catch(err => {
  console.error('ERROR FATAL:', err);
  process.exit(1);
});
