# 📧 Configuración del Sistema de Emails

## Variables de Entorno Necesarias

Para que el sistema de emails funcione correctamente, debes configurar las siguientes variables de entorno en tu servidor:

```bash
MAIL_HOST=mail.puertomas.cl
MAIL_PORT=465
MAIL_USER=contacto@puertomas.cl
MAIL_PASS=TU_PASSWORD_REAL_AQUI
```

### Cómo configurar en Render.com

1. Ve a tu proyecto en Render
2. Haz clic en "Environment"
3. Agrega estas variables:
   - `MAIL_HOST` → `mail.puertomas.cl`
   - `MAIL_PORT` → `465`
   - `MAIL_USER` → `contacto@puertomas.cl`
   - `MAIL_PASS` → **[TU CONTRASEÑA REAL DEL EMAIL]**

4. Guarda y reinicia el servicio

### Cómo configurar localmente (.env)

Crea un archivo `.env` en la raíz del proyecto:

```
MAIL_HOST=mail.puertomas.cl
MAIL_PORT=465
MAIL_USER=contacto@puertomas.cl
MAIL_PASS=tu_password_real_aqui
```

Luego instala dotenv y carga las variables:

```bash
npm install dotenv
```

En `server.js`, agrega al inicio:
```javascript
require('dotenv').config();
```

---

## ✅ Cambios Aplicados en esta Versión

### 1. 🔄 Flujo de Onboarding Corregido
- **Disclaimer** → **Registro** → **GPS** → **Push Notifications** → **Banner de Instalación** → **Pantalla Principal**
- Todas las ventanas emergentes ahora aparecen EN SECUENCIA, una a la vez
- No más ventanas superpuestas ni confusión

### 2. 🔧 GPS: Timeout de Seguridad
- Ya no se queda pegado en "Solicitando..."
- Si en 8 segundos no responde, cierra automáticamente y continúa
- El usuario puede omitir el GPS sin problemas

### 3. 🔔 Push Notifications: Timeout de Seguridad
- Si en 10 segundos no responde, cierra automáticamente
- Ya no bloquea la app indefinidamente
- Manejo robusto de errores

### 4. 📲 Banner de Instalación VISIBLE
- Aparece correctamente en la pantalla principal (debajo del botón "COMPARTIR APP")
- Se muestra solo si el navegador soporta instalación PWA
- Respeta el "Ahora no" del usuario
- Se oculta automáticamente si la app ya está instalada

### 5. 📧 Sistema de Emails REPARADO
- Email del PIN ahora tiene formato profesional con HTML
- Configuración mediante variables de entorno
- Logs en consola para debugging (`✅ Email PIN enviado` o `❌ Error enviando email`)
- **IMPORTANTE:** Debes configurar `MAIL_PASS` en las variables de entorno

### 6. 🌍 Geofencing: Validación de Puerto Montt
- Solo permite registro si la casa marcada está dentro de **25km del centro de Puerto Montt**
- Mensaje claro al usuario si está fuera de cobertura
- Preparado para futuras expansiones a otras ciudades
- Centro actual: `-41.4693, -72.9423`

### 7. 🔄 Reset Completo al Eliminar Usuario
- Si el admin elimina a un usuario, se limpia TODO el `localStorage`
- El usuario ve un aviso claro de que su cuenta fue eliminada
- Debe volver a registrarse desde cero (disclaimer, registro, etc.)

---

## 🧪 Cómo Probar el Sistema de Emails

1. Configura las variables de entorno correctamente
2. Reinicia el servidor
3. Registra un nuevo usuario con un email válido
4. Revisa la consola del servidor, deberías ver:
   ```
   ✅ Email PIN enviado a: usuario@example.com
   ```
5. Revisa la bandeja de entrada del email (y la carpeta de spam por si acaso)

Si ves `❌ Error enviando email: ...` en la consola, verifica:
- Que las credenciales del email sean correctas
- Que el servidor de email (`mail.puertomas.cl`) esté accesible
- Que el puerto 465 esté abierto

---

## 📍 Cómo Ajustar el Área de Cobertura

En `server.js`, línea ~283, puedes modificar:

```javascript
const PM_CENTER_LAT = -41.4693;  // Centro de Puerto Montt
const PM_CENTER_LNG = -72.9423;
const MAX_RADIUS_KM = 25;        // Radio máximo en kilómetros
```

Para expandir a otras ciudades, puedes:
1. Aumentar el `MAX_RADIUS_KM`
2. Cambiar las coordenadas del centro
3. Crear múltiples instancias de la app (una por ciudad)

---

## 🐛 Debugging

Si algo no funciona:

1. **GPS pegado:** Abre las DevTools (F12) → Console, busca errores de geolocalización
2. **Push no aparece:** Verifica que el navegador soporte `PushManager` y `serviceWorker`
3. **Banner no aparece:** Solo funciona en HTTPS y navegadores compatibles (Chrome/Edge Android, Safari iOS)
4. **Email no llega:** Revisa la consola del servidor para ver logs de envío

---

¡Listo! 🎉
