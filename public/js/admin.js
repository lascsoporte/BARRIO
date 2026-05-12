// Admin Panel - BARRIO 2026 REPARADO
const Admin = {
  token: localStorage.getItem('barrio_admin_token') || null,
  currentTab: 'locales',

  route(container) {
    if (!this.token) return this.renderLogin(container);
    this.renderPanel(container);
  },

  renderLogin(container) {
    container.innerHTML = `
      <div class="admin-login fade-in" style="max-width:350px; margin: 40px auto; padding: 20px; background:white; border-radius:20px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.1);">
        <div style="font-size:3rem; margin-bottom:10px;">🔐</div>
        <h2 style="margin-bottom:5px;">Administración</h2>
        <p style="font-size:0.8rem; color:#666; margin-bottom:20px;">Ingresa tus credenciales de acceso.</p>
        
        <div style="text-align:left; display:flex; flex-direction:column; gap:12px;">
          <div>
            <label style="font-size:0.7rem; font-weight:900; color:#999; margin-left:5px;">USUARIO</label>
            <input type="text" id="adminUser" placeholder="admin" style="width:100%; padding:12px; border-radius:10px; border:1px solid #ddd; margin-top:4px; outline:none;">
          </div>
          <div>
            <label style="font-size:0.7rem; font-weight:900; color:#999; margin-left:5px;">CONTRASEÑA</label>
            <input type="password" id="adminPass" placeholder="••••••••" style="width:100%; padding:12px; border-radius:10px; border:1px solid #ddd; margin-top:4px; outline:none;">
          </div>
        </div>

        <button class="btn btn-primary" id="adminLoginBtn" style="margin-top:25px; width:100%; padding:15px; background:#FF6B35; color:white; border:none; border-radius:12px; font-weight:800; cursor:pointer;">INGRESAR</button>
        <p id="adminError" style="color:#d32f2f; margin-top:15px; display:none; font-size:0.85rem; font-weight:bold;"></p>
        
        <button onclick="location.assign('/')" style="background:none; border:none; color:#AAA; margin-top:20px; cursor:pointer; font-size:0.8rem;">⬅️ Volver al Inicio</button>
      </div>
    `;

    const doLogin = () => {
      const u = document.getElementById('adminUser').value.trim();
      const p = document.getElementById('adminPass').value.trim();
      const err = document.getElementById('adminError');

      // VERIFICACIÓN REPARADA
      if (u === 'admin' && p === 'AccesoTemporal2026') {
        this.token = "session_" + Date.now();
        localStorage.setItem('barrio_admin_token', this.token);
        this.renderPanel(container);
      } else {
        err.textContent = '❌ Usuario o clave incorrectos';
        err.style.display = 'block';
      }
    };

    document.getElementById('adminLoginBtn').onclick = doLogin;
    document.getElementById('adminPass').onkeypress = (e) => { if(e.key === 'Enter') doLogin(); };
  },

  async renderPanel(container) {
    container.innerHTML = `
      <div class="fade-in" style="padding:15px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <h2 style="margin:0; font-size:1.4rem;">🔧 Panel Admin</h2>
          <button class="btn btn-outline" onclick="Admin.logout()" style="width:auto; padding:8px 15px; font-size:0.7rem;">Cerrar Sesión</button>
        </div>
        <div id="adminContent">
          <p>Has ingresado correctamente. Cargando opciones...</p>
        </div>
      </div>
    `;
    // Aquí puedes llamar a tus funciones originales de renderLocalesTab(), etc.
  },

  logout() {
    this.token = null;
    localStorage.removeItem('barrio_admin_token');
    location.reload();
  }
};