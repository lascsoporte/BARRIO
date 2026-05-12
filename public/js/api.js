// API client for BARRIO
const API = {
  base: '',

  async get(url, token) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(this.base + url, { headers });
    
    if (!res.ok) {
      if (res.status === 401) throw new Error('Sesión expirada');
      throw new Error(`Error del servidor (${res.status})`);
    }
    return res.json();
  },

  async post(url, data, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(this.base + url, { method: 'POST', headers, body: JSON.stringify(data) });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error en la petición');
    }
    return res.json();
  },

  // Atajos para el Panel Admin
  adminLogin(passwords) { return this.post('/api/admin/login', { passwords }); },
  adminGetLocales(token) { return this.get('/api/admin/locales', token); },
  adminGetUsuarios(token) { return this.get('/api/admin/usuarios', token); },
  adminGetStats(token) { return this.get('/api/admin/stats', token); },
  getMascotas() { return this.get('/api/mascotas'); },
  getReportes() { return this.get('/api/admin/reportes'); }
};