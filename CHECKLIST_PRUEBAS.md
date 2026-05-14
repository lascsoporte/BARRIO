# ✅ CHECKLIST DE PRUEBAS - BARRIO Puerto Montt

## 📋 Pruebas de Registro y Onboarding

### 1. Flujo Completo de Primer Registro
- [ ] Abrir la app por primera vez
- [ ] Ver pantalla de **Disclaimer/Términos**
- [ ] Aceptar términos
- [ ] Ver formulario de **Registro** con scroll funcional
- [ ] Llenar todos los campos (nombre, teléfono, email, nickname, PIN 4 dígitos)
- [ ] Marcar ubicación de casa en el mapa (dentro de Puerto Montt)
- [ ] Click en "Registrarme AHORA"
- [ ] Verificar que llega **email con PIN** a la bandeja de entrada
- [ ] Ver modal de **GPS** ("Activa el GPS")
  - [ ] Probar "ACTIVAR AHORA" → debe pedir permiso de ubicación
  - [ ] Probar "Omitir por ahora" → debe cerrar y continuar
- [ ] Ver modal de **Push Notifications** ("¡Mantente Alerta!")
  - [ ] Probar "SÍ, ACTIVAR ALERTAS" → debe pedir permiso de notificaciones
  - [ ] Probar "Ahora no, gracias" → debe cerrar y continuar
- [ ] Ver modal de **Instalación** ("¡Instala BARRIO!")
  - [ ] Si el navegador soporta PWA: ver botón "INSTALAR EN MI TELÉFONO"
  - [ ] Si no soporta: ver instrucciones manuales
  - [ ] Probar "Ahora no" → debe cerrar
- [ ] Llegar a la **pantalla principal** con mapa y 4 botones

**⏱️ Timeouts:**
- GPS debe cerrarse automáticamente si no responde en 8 segundos
- Push debe cerrarse automáticamente si no responde en 10 segundos

---

## 🗺️ Pruebas de Geofencing (Puerto Montt)

### 2. Registro dentro de Puerto Montt
- [ ] Registrarse marcando casa dentro de la ciudad
- [ ] Registro debe completarse sin errores

### 3. Registro fuera de Puerto Montt
- [ ] Registrarse marcando casa lejos (ej: Santiago, Valdivia)
- [ ] Debe aparecer error: **"Tu ubicación está fuera del área de cobertura de BARRIO Puerto Montt"**
- [ ] No debe permitir completar el registro
- [ ] Debe pedir marcar ubicación dentro de Puerto Montt

**Radio actual:** 25km desde el centro de Puerto Montt (-41.4693, -72.9423)

---

## 📲 Pruebas de Banner de Instalación

### 4. Banner en Pantalla Principal
- [ ] Ir a la pantalla principal (home)
- [ ] Scroll hacia abajo
- [ ] Ver banner naranja **"📲 ¡Instala BARRIO!"** (solo si el navegador soporta PWA)
- [ ] Click en "INSTALAR" → debe abrir prompt nativo del navegador
- [ ] Click en "Ahora no" → banner debe desaparecer
- [ ] Cerrar app y volver a abrir → banner NO debe aparecer de nuevo

**Navegadores compatibles:**
- ✅ Chrome/Edge Android
- ✅ Safari iOS (con instrucciones manuales)
- ❌ Firefox, otros navegadores de escritorio

---

## 📧 Pruebas de Email

### 5. Recepción de PIN por Email
- [ ] Registrarse con email válido
- [ ] Esperar 1-2 minutos
- [ ] Revisar bandeja de entrada (y spam)
- [ ] Verificar email de **"BARRIO Seguridad"**
- [ ] Email debe tener formato HTML bonito con el PIN de 4 dígitos destacado
- [ ] Verificar que el PIN coincide con el que ingresaste

**Si no llega el email:**
1. Revisar consola del servidor: debe decir `✅ Email PIN enviado a: ...`
2. Si dice `❌ Error enviando email: ...` → verificar credenciales de `MAIL_PASS`
3. Revisar carpeta de spam
4. Verificar que `MAIL_HOST` es accesible

---

## 🔄 Pruebas de Reset y Re-entrada

### 6. Cerrar y Volver a Abrir (Usuario Normal)
- [ ] Cerrar navegador/app completamente
- [ ] Volver a abrir la app
- [ ] Debe ir directo a pantalla principal (NO pedir disclaimer ni registro de nuevo)
- [ ] No debe pedir GPS ni Push si ya se descartaron

### 7. Admin Elimina Usuario
- [ ] Admin elimina tu usuario desde el panel
- [ ] Cerrar app
- [ ] Volver a abrir
- [ ] Debe mostrar aviso: **"Cuenta no encontrada"**
- [ ] Click en "ENTENDIDO, CONTINUAR"
- [ ] Debe mostrar disclaimer y registro desde cero (como primera vez)

### 8. Usuario Desinstala App (PWA)
- [ ] Instalar app como PWA
- [ ] Usar la app normalmente
- [ ] Desinstalar la PWA del teléfono
- [ ] Volver a instalar/abrir desde navegador
- [ ] Debe mostrar disclaimer y registro desde cero

---

## 🚨 Pruebas de Funcionalidades Principales

### 9. Botón EMERGENCIA
- [ ] Click en botón rojo "EMERGENCIA"
- [ ] Debe aparecer bottom-sheet con teléfonos de emergencia
- [ ] Click en "Carabineros (133)" → debe iniciar llamada
- [ ] Otros teléfonos deben funcionar igual

### 10. Botón REPORTAR
- [ ] Click en botón naranja "REPORTAR"
- [ ] Llenar formulario de reporte
- [ ] Marcar ubicación en mapa
- [ ] Enviar reporte
- [ ] Verificar que aparece en el mapa de la home

### 11. Botón BUSCAR
- [ ] Click en botón azul "BUSCAR"
- [ ] Buscar algo (ej: "pan")
- [ ] Debe mostrar resultados de locales cercanos

### 12. Botón EL MURO
- [ ] Click en botón verde "EL MURO"
- [ ] Ver mensajes de la comunidad
- [ ] Publicar mensaje nuevo
- [ ] Verificar que aparece en el muro

---

## 📱 Pruebas de Responsive y UX

### 13. Scroll en Formulario de Registro
- [ ] Abrir en móvil (o DevTools mobile)
- [ ] Llenar formulario de registro
- [ ] Verificar que se puede hacer **scroll** en todo el formulario
- [ ] Ningún campo debe quedar fuera de vista
- [ ] El teclado del móvil no debe tapar los campos

### 14. Ventanas Emergentes en Secuencia
- [ ] Las ventanas deben aparecer **una a la vez**
- [ ] No debe haber superposición de modales
- [ ] Orden correcto: Disclaimer → Registro → GPS → Push → Instalar → Home
- [ ] Cada modal debe esperar a que el anterior se cierre

---

## 🐛 Casos Extremos

### 15. GPS Denegado o No Disponible
- [ ] Denegar permiso de GPS
- [ ] App debe continuar funcionando (sin ubicación)
- [ ] No debe quedar trabada en el modal de GPS

### 16. Push Notifications No Soportadas
- [ ] Abrir en navegador sin soporte de Push
- [ ] Modal de Push no debe aparecer
- [ ] App debe continuar normal

### 17. Sin Conexión a Internet
- [ ] Desconectar internet
- [ ] Intentar usar la app
- [ ] Debe mostrar mensajes de error apropiados
- [ ] No debe crashear

---

## 🔍 Logs de Consola (Debugging)

Mientras pruebas, abre DevTools (F12) → Console y busca:

**Logs esperados:**
```
App: Usuario eliminado por admin. Reiniciando como nueva instalación...
✅ Email PIN enviado a: usuario@example.com
GPS Activado ✅
✅ Alertas activadas correctamente
✅ App instalada correctamente
```

**Errores comunes:**
```
❌ Error enviando email: ... → Verificar MAIL_PASS
Error al verificar usuario o cargar config → Usuario eliminado
No pudimos acceder al GPS → Permisos denegados
```

---

## ✅ Resumen de Verificación

Si todos los checkboxes están marcados, la app está funcionando perfectamente. Si algo falla, revisa:

1. **Email no llega** → Variables de entorno `MAIL_PASS`
2. **Modales se quedan pegados** → Verificar timeouts (8s GPS, 10s Push)
3. **Banner no aparece** → Solo funciona en navegadores compatibles con PWA
4. **Registro fuera de PM aceptado** → Verificar geofencing en server.js línea 283
5. **Usuario eliminado pero no resetea** → Verificar método `_fullReset()` en app.js

---

**Fecha de última actualización:** Mayo 2026
**Versión:** ANTIGRAVITY_BARRIO_PM_FINAL
