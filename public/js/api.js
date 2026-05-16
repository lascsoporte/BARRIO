// API client - BARRIO 2026 (Versión Estable)
const API = {
  base: '',

  async get(url, token) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // Timeout de 8 segundos — evita esperar al servidor dormido
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(this.base + url, { headers, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        if (res.status === 401) throw new Error('401-EXPIRADO');
        throw new Error(`Error ${res.status}`);
      }
      return res.json();
    } catch(e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('TIMEOUT');
      throw e;
    }
  },

  async post(url, data, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(this.base + url, { method: 'POST', headers, body: JSON.stringify(data) });
    if (!res.ok) {
      if (res.status === 401) throw new Error('401-EXPIRADO');
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error ${res.status}`);
    }
    return res.json();
  },

  async put(url, data, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(this.base + url, { method: 'PUT', headers, body: JSON.stringify(data) });
    if (!res.ok) {
      if (res.status === 401) throw new Error('401-EXPIRADO');
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error ${res.status}`);
    }
    return res.json();
  },

  async del(url, token) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(this.base + url, { method: 'DELETE', headers });
    if (!res.ok) {
      if (res.status === 401) throw new Error('401-EXPIRADO');
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error ${res.status}`);
    }
    return res.json();
  },

  // Public endpoints
  searchProducts(q, lat, lng, radio = 1) {
    const did = localStorage.getItem('barrio_device_id') || '';
    let url = `/api/productos/buscar?q=${encodeURIComponent(q)}&device_id=${encodeURIComponent(did)}`;
    if (lat && lng) url += `&lat=${lat}&lng=${lng}&radio=${radio}`;
    return this.get(url);
  },

  getStore(id) { return this.get(`/api/locales/${id}`); },

  searchServices(q, lat, lng, radio = 1) {
    const did = localStorage.getItem('barrio_device_id') || '';
    let url = `/api/servicios/buscar?q=${encodeURIComponent(q || '')}&device_id=${encodeURIComponent(did)}`;
    if (lat && lng) url += `&lat=${lat}&lng=${lng}&radio=${radio}`;
    return this.get(url);
  },

  getServiceTypes() { return this.get('/api/servicios/tipos'); },
  getRatings(storeId) { return this.get(`/api/locales/${storeId}/calificaciones`); },
  submitRating(storeId, data) { return this.post(`/api/locales/${storeId}/calificaciones`, data); },
  getConfig() { return this.get('/api/config'); },
  getReportes() { return this.get('/api/reportes'); },
  createReporte(data) { return this.post('/api/reportes', data); },
  getMascotas() { return this.get('/api/mascotas'); },
  createMascota(data) { return this.post('/api/mascotas', data); },

  // Nuevas funciones
  registerUser(data) { return this.post('/api/registro', data); },
  getMuro() { return this.get('/api/muro'); },
  postMuro(data) { return this.post('/api/muro', data); },
  sendAdminMessage(data) { return this.post('/api/admin/mensaje', data); },
  logEmergencia(data) { return this.post('/api/emergencia', data); },
  logStolenLocation(data) { return this.post('/api/stolen-location', data); },
  reportarExtravio(data) { return this.post('/api/reportar-extravio', data); },
  checkUser(id) { return this.get(`/api/verificar-usuario/${id}`); },
  acceptTerms(id) { return this.put(`/api/usuarios/${id}/accept-terms`, {}); },

  // Admin endpoints
  adminLogin(passwords) { return this.post('/api/admin/login', { passwords }); },
  adminResolveMap(url, token) { return this.post('/api/admin/resolve-map', { url }, token); },

  adminGetLocales(token) { return this.get('/api/admin/locales', token); },
  adminCreateLocal(data, token) { return this.post('/api/admin/locales', data, token); },
  adminUpdateLocal(id, data, token) { return this.put(`/api/admin/locales/${id}`, data, token); },
  adminDeleteLocal(id, token) { return this.del(`/api/admin/locales/${id}`, token); },

  adminGetProductos(token) { return this.get('/api/admin/productos', token); },
  adminCreateProducto(data, token) { return this.post('/api/admin/productos', data, token); },
  adminCreateProductosMasivo(data, token) { return this.post('/api/admin/productos/masivo', data, token); },
  adminUpdateProducto(id, data, token) { return this.put(`/api/admin/productos/${id}`, data, token); },
  adminDeleteProducto(id, token) { return this.del(`/api/admin/productos/${id}`, token); },

  adminGetServicios(token) { return this.get('/api/admin/servicios', token); },
  adminCreateServicio(data, token) { return this.post('/api/admin/servicios', data, token); },
  adminUpdateServicio(id, data, token) { return this.put(`/api/admin/servicios/${id}`, data, token); },
  adminDeleteServicio(id, token) { return this.del(`/api/admin/servicios/${id}`, token); },

  adminGetReportes(token) { return this.get('/api/admin/reportes', token); },
  adminDeleteMascota(id, token) { return this.del(`/api/admin/mascotas/${id}`, token); },
  adminDeleteMensaje(id, token) { return this.del(`/api/admin/mensajes/${id}`, token); },
  adminDeleteEmergencia(id, token) { return this.del(`/api/admin/emergencias/${id}`, token); },
  adminDeleteRastreo(id, token) { return this.del(`/api/admin/ubicacion/${id}`, token); },
  adminUpdateConfig(data, token) { return this.put('/api/admin/config', data, token); },
  adminChangePasswords(data, token) { return this.put('/api/admin/passwords', data, token); },
  adminGetStats(token) { return this.get('/api/admin/stats', token); },
  adminGetMensajes(token) { return this.get('/api/admin/mensajes', token); },
  adminMarkMensaje(id, token) { return this.put(`/api/admin/mensajes/${id}/leido`, {}, token); },
  adminGetUsuarios(token) { return this.get('/api/admin/usuarios', token); },
  adminToggleStolenUsuario(id, is_stolen, token) { return this.put(`/api/admin/usuarios/${id}/robado`, { is_stolen }, token); },
  adminToggleBlockUsuario(id, is_blocked, token) { return this.put(`/api/admin/usuarios/${id}/bloquear`, { is_blocked }, token); },
  adminVerifyUsuario(id, is_verified, token) { return this.put(`/api/admin/usuarios/${id}/verificar`, { is_verified }, token); },
  adminDeleteUsuario(id, token) { return this.del(`/api/admin/usuarios/${id}`, token); },
  adminGetEmergencias(token) { return this.get('/api/admin/emergencias', token); },
  adminGetRastreo(token) { return this.get('/api/admin/ubicacion', token); },
  adminGetMascotas(token) { return this.get('/api/admin/mascotas', token); },
  adminGetFichaUsuario(id, token) { return this.get(`/api/admin/usuarios/${id}/ficha`, token); },
  adminGetMuro(token) { return this.get('/api/admin/muro', token); },
  adminGetAnalytics(token) { return this.get('/api/admin/analytics', token); },
  async adminDownloadBlob(path, token, filename) {
    const res = await fetch(this.base + path, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      if (res.status === 401) throw new Error('401-EXPIRADO');
      throw new Error(`Error ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  adminClearMuro(token) { return this.del('/api/admin/muro', token); },
  adminDeleteMuroPost(id, token) { return this.del(`/api/admin/muro/${id}`, token); },
  savePushSubscription(data) { return this.post('/api/push/subscribe', data); },
  ping(device_id, lat, lng) { return this.post('/api/ping', { device_id, lat, lng }); }
};