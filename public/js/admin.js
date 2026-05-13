// Admin Panel - BARRIO
const Admin = {
  token: localStorage.getItem('barrio_admin_token') || null,
  currentTab: 'locales',

  route(container) {
    if (!this.token) return this.renderLogin(container);
    this.renderPanel(container);
  },

  renderLogin(container) {
    container.innerHTML = `
      <div class="admin-login fade-in" style="max-width:400px; margin:50px auto; padding:20px; text-align:center; background:white; border-radius:15px; box-shadow:0 10px 25px rgba(0,0,0,0.1);">
        <div style="font-size:3rem; margin-bottom:10px;">🔐</div>
        <h2>Panel Administrativo</h2>
        <p style="color:#666; font-size:0.9rem; margin-bottom:20px;">Ingresa las 3 llaves de seguridad</p>
        
        <input type="password" id="p1" placeholder="Llave 1" style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;">
        <input type="password" id="p2" placeholder="Llave 2" style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;">
        <input type="password" id="p3" placeholder="Llave 3" style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;">
        
        <button id="btnLogin" class="btn btn-primary" style="width:100%; padding:15px; font-weight:bold; margin-top:10px;">ACCEDER</button>
        <p id="errMsg" style="color:red; display:none; margin-top:15px; font-weight:bold;"></p>
        <button onclick="location.assign('/')" style="background:none; border:none; color:#999; margin-top:20px; cursor:pointer;">⬅ Volver al inicio</button>
      </div>
    `;

    document.getElementById('btnLogin').onclick = async () => {
      const keys = [
        document.getElementById('p1').value,
        document.getElementById('p2').value,
        document.getElementById('p3').value
      ];
      
      try {
        const res = await API.adminLogin(keys);
        this.token = res.token;
        localStorage.setItem('barrio_admin_token', res.token);
        this.renderPanel(container);
      } catch (e) {
        const err = document.getElementById('errMsg');
        err.textContent = "❌ Llaves incorrectas";
        err.style.display = "block";
      }
    };
  },

  async renderPanel(container) {
    container.innerHTML = `
      <div class="fade-in" style="padding:15px;">
        <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:15px; border-radius:12px; box-shadow:0 4px 10px rgba(0,0,0,0.05); margin-bottom:20px;">
          <h2 style="margin:0; font-size:1.2rem; color:var(--primary);">🔧 Administración</h2>
          <button id="btnLogout" class="btn btn-sm btn-outline" style="width:auto;">Salir</button>
        </div>

        <div class="admin-tabs" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:10px; margin-bottom:20px;">
          <button class="admin-tab active" data-tab="locales">🏪 Locales</button>
          <button class="admin-tab" data-tab="usuarios">👥 Usuarios</button>
          <button class="admin-tab" data-tab="stats">📊 Stats</button>
          <button class="admin-tab" data-tab="reportes">📢 Reportes</button>
        </div>

        <div id="adminContent" style="background:white; padding:20px; border-radius:12px; min-height:300px; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
          <div class="spinner"></div>
        </div>
      </div>
    `;

    document.getElementById('btnLogout').onclick = () => {
      localStorage.removeItem('barrio_admin_token');
      location.reload();
    };

    container.querySelectorAll('.admin-tab').forEach(tab => {
      tab.onclick = () => {
        container.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.tab;
        this.loadTab();
      };
    });

    this.loadTab();
  },

  async loadTab() {
    const box = document.getElementById('adminContent');
    box.innerHTML = '<p style="text-align:center; color:#999;">Cargando información...</p>';
    
    try {
      if (this.currentTab === 'locales') {
        const data = await API.adminGetLocales(this.token);
        box.innerHTML = `<h3>Locales (${data.length})</h3>` + data.map(l => `<div style="padding:10px; border-bottom:1px solid #eee;"><b>${l.nombre}</b><br><small>${l.direccion}</small></div>`).join('');
      } else if (this.currentTab === 'usuarios') {
        const data = await API.adminGetUsuarios(this.token);
        box.innerHTML = `<h3>Usuarios (${data.length})</h3>` + data.map(u => `<div style="padding:10px; border-bottom:1px solid #eee;">${u.nombre || '—'} (@${u.nickname || 'sin nick'}) — tel ${u.telefono || '—'}</div>`).join('');
      } else if (this.currentTab === 'stats') {
        const data = await API.adminGetStats(this.token);
        const top = (data.topLocales || []).map(l => `<li>${l.nombre}: ${l.calif_count || 0} calif. (media ${l.avg_estrellas != null ? Number(l.avg_estrellas).toFixed(1) : '—'})</li>`).join('');
        box.innerHTML = `
          <h3>Estadísticas</h3>
          <p>Visitas registradas: <b>${data.totalVisitas ?? 0}</b></p>
          <p>Visitas hoy: <b>${data.visitasHoy ?? 0}</b></p>
          <p>Usuarios: <b>${data.uniqueUsers ?? 0}</b></p>
          <p>Mascotas reportadas: <b>${data.totalMascotas ?? 0}</b></p>
          <h4>Locales con más calificaciones</h4>
          <ul style="padding-left:18px;">${top || '<li>Sin datos</li>'}</ul>`;
      } else if (this.currentTab === 'reportes') {
        const data = await API.adminGetReportes(this.token);
        box.innerHTML = `<h3>Reportes (${data.length})</h3>` + data.map(r => `<div style="padding:10px; border-bottom:1px solid #eee;"><b>${r.tipo_reporte || '—'}</b>: ${r.detalles || '—'}<br><small>${r.nombre || ''} ${r.telefono || ''}</small></div>`).join('');
      }
    } catch (e) {
      if (e.message.indexOf('401') !== -1 || e.message.indexOf('Sesión') !== -1) {
        localStorage.removeItem('barrio_admin_token');
        location.reload();
      }
      box.innerHTML = `<p style="color:red; text-align:center;">Error: ${e.message}</p>`;
    }
  }
};