# 📝 CAMBIOS DE TERMINOLOGÍA - BARRIO APP

## 🔄 RESUMEN DE CAMBIOS

Se actualizó la terminología en toda la aplicación para usar términos más apropiados:

| Anterior | Nuevo |
|----------|-------|
| ROBO | EXTRAVÍO |
| robo | extravío |
| Robo | Extravío |
| RASTREO | UBICACIÓN |
| rastreo | ubicación |
| Rastreo | Ubicación |
| rastreo_robos | registro_extravios |

---

## 📂 ARCHIVOS MODIFICADOS

### Backend:
- ✅ `server.js` - Lógica de servidor
- ✅ `database.js` - Estructura de BD

### Frontend:
- ✅ `public/js/app.js` - App principal
- ✅ `public/js/api.js` - Cliente API
- ✅ `public/js/admin.js` - Panel Admin

### Base de Datos:
- ✅ Tabla: `rastreo_robos` → `registro_extravios`
- ✅ Tipo reporte: `'robo'` → `'extravío'`

### Documentación:
- ✅ Todos los archivos `.md`

---

## 🚀 CÓMO APLICAR LOS CAMBIOS

### PASO 1: Reemplazar archivos del código

Copia estos archivos a tu carpeta BARRIO:
```
✅ server.js
✅ database.js
✅ public/js/app.js
✅ public/js/api.js
✅ public/js/admin.js
```

### PASO 2: Actualizar base de datos existente

Si ya tienes usuarios y datos, ejecuta:

```bash
node actualizar_terminologia.js
```

Este script:
- ✅ Crea backup automático
- ✅ Renombra tabla `rastreo_robos` → `registro_extravios`
- ✅ Actualiza reportes tipo "robo" → "extravío"
- ✅ Funciona con MySQL y SQLite

### PASO 3: Reiniciar servidor

```bash
node server.js
```

---

## 🔍 VERIFICACIÓN

### En Panel Admin:

1. **Menú lateral:**
   - Antes: "Rastreo de Robos"
   - Ahora: "Ubicación de Extravíos" ✅

2. **Tipos de reporte:**
   - Antes: 🚨 Robo
   - Ahora: 🚨 Extravío ✅

3. **Tabla en BD:**
   - Antes: `rastreo_robos`
   - Ahora: `registro_extravios` ✅

### En la App:

1. **Botón de reporte:**
   - Antes: 🚨 Robo
   - Ahora: 🚨 Extravío ✅

2. **Alertas Telegram:**
   - Antes: "🚨 EXTRAVÍO: ACTIVIDAD DETECTADA"
   - Ahora: "🚨 EXTRAVÍO: ACTIVIDAD DETECTADA" ✅
   (Este ya estaba bien)

3. **Panel Admin - Sección:**
   - Antes: "Rastreo de Extravíos"
   - Ahora: "Ubicación de Extravíos" ✅

---

## 📊 IMPACTO EN DATOS EXISTENTES

### ⚠️ IMPORTANTE:

- ✅ **NO se pierden datos**
- ✅ Todos los registros se mantienen
- ✅ Solo cambian nombres de tabla y tipos
- ✅ Backup automático antes de cambios

### Datos que se actualizan:

1. **Tabla en BD:**
   ```sql
   -- Antes:
   SELECT * FROM rastreo_robos;
   
   -- Ahora:
   SELECT * FROM registro_extravios;
   ```

2. **Reportes existentes:**
   ```sql
   -- Se actualizan automáticamente:
   UPDATE reportes_ciudadanos 
   SET tipo_reporte = 'extravío' 
   WHERE tipo_reporte = 'robo';
   ```

3. **Endpoints API:**
   ```
   Antes: GET /api/admin/rastreo
   Ahora: GET /api/admin/ubicación
   ```

---

## 🎯 FUNCIONALIDAD

### ANTES:
```
Usuario marca teléfono como robado
    ↓
Sistema hace "rastreo" del teléfono
    ↓
Panel Admin: "Rastreo de Robos"
    ↓
Tabla BD: rastreo_robos
    ↓
Tipo reporte: "robo"
```

### AHORA:
```
Usuario marca teléfono como extraviado
    ↓
Sistema registra "ubicación" del teléfono
    ↓
Panel Admin: "Ubicación de Extravíos"
    ↓
Tabla BD: registro_extravios
    ↓
Tipo reporte: "extravío"
```

**La funcionalidad es EXACTAMENTE la misma, solo cambia la terminología** ✅

---

## 📱 INTERFAZ DE USUARIO

### Botones de Reporte (app principal):

```
┌──────────────────────────────────┐
│  Tipo de Reporte:                │
├──────────────────────────────────┤
│  🚨 Extravío  (antes: Robo) ✅   │
│  🚗 Choque                        │
│  🔥 Incendio                      │
│  👤 Sospechoso                    │
│  🐶 Mascota                       │
│  📍 Otros                         │
└──────────────────────────────────┘
```

### Panel Admin - Menú:

```
┌──────────────────────────────────┐
│  📊 Dashboard                     │
│  👥 Usuarios                      │
│  📢 Reportes                      │
│  🏪 Locales                       │
│  📦 Productos                     │
│  🔧 Servicios                     │
│  🐶 Mascotas                      │
│  💬 Muro                          │
│  📨 Buzón                         │
│  🚨 Emergencias                   │
│  📍 Ubicación de Extravíos ✅     │
│      (antes: Rastreo de Robos)   │
│  ⚙️  Configuración                │
│  📊 Analytics                     │
└──────────────────────────────────┘
```

---

## ⚡ MIGRACIÓN RÁPIDA

### Si tienes el servidor corriendo:

1. Detener servidor (Ctrl+C)
2. Copiar nuevos archivos
3. Ejecutar: `node actualizar_terminologia.js`
4. Iniciar: `node server.js`

**Tiempo total: 2-3 minutos** ⏱️

---

## 🔒 SEGURIDAD

- ✅ Script crea backup antes de modificar
- ✅ Si falla, restaura automáticamente
- ✅ No afecta datos de usuarios
- ✅ No requiere re-registro

---

## 📞 SOPORTE

Si tienes problemas durante la actualización:

1. El script crea backups automáticos:
   ```
   barrio_backup_terminologia_2026-05-14T20-00-00.db
   ```

2. Para restaurar:
   ```bash
   cp barrio_backup_terminologia_FECHA.db barrio.db
   node server.js
   ```

3. Los cambios son solo de nombres, la funcionalidad no cambia

---

**Versión:** 2.3 (Terminología corregida)
**Fecha:** Mayo 14, 2026
**Estado:** ✅ LISTO PARA PRODUCCIÓN
