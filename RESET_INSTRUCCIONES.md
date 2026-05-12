# 🔐 BARRIO - Instrucciones de Reseteo de Emergencia

## Si olvidaste las claves de acceso al panel de administrador:

### Opción 1: Desde la consola del servidor
Cuando inicias el servidor con `node server.js`, en la consola aparece la **clave maestra de reseteo**.

### Opción 2: Usando el endpoint de emergencia
Envía esta petición HTTP desde cualquier navegador o herramienta:

```
POST /api/emergency-reset
Content-Type: application/json

{
  "master_key": "BARRIO-RESET-2026-PUERTOMAS"
}
```

### Opción 3: Desde la terminal del servidor
Ejecuta este comando mientras el servidor está corriendo:

```bash
node -e "fetch('http://localhost:3000/api/emergency-reset', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({master_key:'BARRIO-RESET-2026-PUERTOMAS'})}).then(r=>r.json()).then(d=>console.log(d))"
```

### Resultado
Las claves se restaurarán a los valores por defecto:
- **Llave 1:** barrio2025
- **Llave 2:** admin2025
- **Llave 3:** seguridad2025

> ⚠️ **IMPORTANTE:** Después de resetear, ingresa al panel admin y cambia las claves inmediatamente desde la pestaña "🔐 Claves".
