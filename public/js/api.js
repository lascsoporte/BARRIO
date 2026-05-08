// API client
const API = {
  base: '',

  async get(url) {
    const res = await fetch(this.base + url);
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return res.json();
  },

  async post(url, data, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(this.base + url, { method: 'POST', headers, body: JSON.stringify(data) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error ${res.status}`);
    }
    return res.json();
  },

  async put(url, data, token) {
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    const res = await fetch(this.base + url, { method: 'PUT', headers, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return res.json();
  },

  async del(url, token) {
    const headers = { 'Authorization': `Bearer ${token}` };
    const res = await fetch(this.base + url, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return res.json();
  },

  // Public endpoints
  searchProducts(q, lat, lng, radio = 1) {
    let url = `/api/productos/buscar?q=${encodeURIComponent(q)}`;
    if (lat && lng) url += `&lat=${lat}&lng=${lng}&radio=${radio}`;
    return this.get(url);
  },

  getStore(id) { return this.get(`/api/locales/${id}`); },

  searchServices(q, lat, lng, radio = 1) {
    let url = `/api/servicios/buscar?q=${encodeURIComponent(q || '')}`;
    if (lat && lng) url += `&lat=${lat}&lng=${lng}&radio=${radio}`;
    return this.get(url);
  },

  getServiceTypes() { return this.get('/api/servicios/tipos'); },

  getRatings(storeId) { return this.get(`/api/locales/${storeId}/calificaciones`); },

  submitRating(storeId, data) { return this.post(`/api/locales/${storeId}/calificaciones`, data); },

  getConfig() { return this.get('/api/config'); },
  getMascotas() { return this.get('/api/mascotas'); },
  createMascota(data) { return this.post('/api/mascotas', data); },

  // Nuevas funciones
  registerUser(data) { return this.post('/api/registro', data); },
  getMuro() { return this.get('/api/muro'); },
  postMuro(data) { return this.post('/api/muro', data); },
  sendAdminMessage(data) { return this.post('/api/admin/mensaje', data); },
  logEmergencia(data) { return this.post('/api/emergencia', data); },
  logStolenLocation(data) { return this.post('/api/stolen-location', data); },
  checkUser(id) { return this.get(`/api/verificar-usuario/${id}`); },


  // Admin endpoints
  adminLogin(passwords) { return this.post('/api/admin/login', { passwords }); },
  adminResolveMap(url, token) { return this.post('/api/admin/resolve-map', { url }, token); },

  adminGetLocales(token) {
    return fetch('/api/admin/locales', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
  },
  adminCreateLocal(data, token) { return this.post('/api/admin/locales', data, token); },
  adminUpdateLocal(id, data, token) { return this.put(`/api/admin/locales/${id}`, data, token); },
  adminDeleteLocal(id, token) { return this.del(`/api/admin/locales/${id}`, token); },

  adminGetProductos(token) {
    return fetch('/api/admin/productos', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
  },
  adminCreateProducto(data, token) { return this.post('/api/admin/productos', data, token); },
  adminCreateProductosMasivo(data, token) { return this.post('/api/admin/productos/masivo', data, token); },
  adminUpdateProducto(id, data, token) { return this.put(`/api/admin/productos/${id}`, data, token); },
  adminDeleteProducto(id, token) { return this.del(`/api/admin/productos/${id}`, token); },

  adminGetServicios(token) {
    return fetch('/api/admin/servicios', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
  },
  adminCreateServicio(data, token) { return this.post('/api/admin/servicios', data, token); },
  adminUpdateServicio(id, data, token) { return this.put(`/api/admin/servicios/${id}`, data, token); },
  adminDeleteServicio(id, token) { return this.del(`/api/admin/servicios/${id}`, token); },

  adminDeleteMascota(id, token) { return this.del(`/api/admin/mascotas/${id}`, token); },
  adminUpdateConfig(data, token) { return this.put('/api/admin/config', data, token); },
  adminChangePasswords(data, token) { return this.put('/api/admin/passwords', data, token); },
  adminGetStats(token) {
    return fetch('/api/admin/stats', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
  },
  adminGetMensajes(token) {
    return fetch('/api/admin/mensajes', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
  },
  adminMarkMensaje(id, token) {
    return this.put(`/api/admin/mensajes/${id}/leido`, {}, token);
  },
  adminGetUsuarios(token) {
    return fetch('/api/admin/usuarios', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
  },
  adminToggleStolenUsuario(id, is_stolen, token) {
    return this.put(`/api/admin/usuarios/${id}/robado`, { is_stolen }, token);
  },
  adminVerifyUsuario(id, is_verified, token) {
    return this.put(`/api/admin/usuarios/${id}/verificar`, { is_verified }, token);
  },
  adminDeleteUsuario(id, token) {
    return this.del(`/api/admin/usuarios/${id}`, token);
  },
  adminGetEmergencias(token) {
    return fetch('/api/admin/emergencias', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
  },
  adminGetRastreo(token) {
    return fetch('/api/admin/rastreo', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
  },
  adminClearMuro(token) { return this.del('/api/admin/muro', token); },
  adminDeleteMuroPost(id, token) { return this.del(`/api/admin/muro/${id}`, token); },
  ping(device_id) { return this.post('/api/ping', { device_id }); }
};
