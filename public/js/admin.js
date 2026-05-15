// Admin Panel - BARRIO
const Admin = {
  token: localStorage.getItem('barrio_admin_token') || null,
  currentTab: 'resumen',
  _chart: null,
  _chart2: null,
  _chartJsPromise: null,

  esc(t) {
    if (t == null || t === '') return '';
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  formatDate(d) {
    if (!d) return '—';
    try {
      const date = new Date(d);
      if (isNaN(date)) return this.esc(d);
      return date.toLocaleString('es-CL', { timeZone: 'America/Santiago' });
    } catch(e) { return this.esc(d); }
  },

  trunc(s, n = 120) {
    const t = s == null ? '' : String(s);
    return t.length <= n ? t : t.slice(0, n) + '…';
  },

  toast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#323232;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;font-size:0.9rem;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  },

  yn(v) {
    if (v === 1 || v === true || v === '1') return 'Sí';
    if (v === 0 || v === false || v === '0') return 'No';
    return '—';
  },

  mapBtn(lat, lng) {
    if (lat == null || lng == null || lat === '' || lng === '') return '<span style="color:#999;">—</span>';
    const u = `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
    return `<a href="${this.esc(u)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:4px 10px;font-size:11px;background:#1976D2;color:white;border-radius:6px;text-decoration:none;font-weight:bold;">🗺️ Ver mapa</a>`;
  },

  exportBtn(path, filename, label) {
    return `<button type="button" class="btn btn-sm btn-primary" data-export="${this.esc(path)}" data-filename="${this.esc(filename)}" style="margin:2px 0;">📥 ${this.esc(label||'Descargar CSV')}</button>`;
  },

  bindDownloads(box) {
    box.querySelectorAll('[data-export]').forEach((btn) => {
      btn.onclick = async () => {
        try {
          await API.adminDownloadBlob(btn.getAttribute('data-export'), this.token, btn.getAttribute('data-filename'));
        } catch(e) { alert('No se pudo descargar: ' + e.message); }
      };
    });
  },

  ensureChartJs() {
    if (window.Chart) return Promise.resolve();
    if (this._chartJsPromise) return this._chartJsPromise;
    this._chartJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar Chart.js'));
      document.head.appendChild(s);
    });
    return this._chartJsPromise;
  },

  destroyChart() {
    [this._chart, this._chart2].forEach((c) => { if (c) { try { c.destroy(); } catch(e) {} } });
    this._chart = null; this._chart2 = null;
  },

  async drawChart(canvasId, config) {
    await this.ensureChartJs();
    this.destroyChart();
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    this._chart = new Chart(canvas.getContext('2d'), config);
  },

  lineChart(title, series, color, fillColor) {
    color = color || '#FF6B35'; fillColor = fillColor || 'rgba(255,107,53,0.12)';
    return { type:'line', data:{ labels:(series||[]).map(x=>String(x.dia||'').slice(0,10)), datasets:[{ label:title, data:(series||[]).map(x=>Number(x.n)||0), fill:true, tension:0.25, borderColor:color, backgroundColor:fillColor }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true, labels:{ font:{ size:10 } } } }, scales:{ x:{ ticks:{ maxRotation:45, font:{ size:9 } } }, y:{ beginAtZero:true, ticks:{ precision:0 } } } } };
  },

  barChart(title, items, keyLabel, keyValue, horizontal) {
    keyLabel = keyLabel||'nombre'; keyValue = keyValue||'n';
    return { type:'bar', data:{ labels:(items||[]).map(x=>String(x[keyLabel]||'').slice(0,22)), datasets:[{ label:title, data:(items||[]).map(x=>Number(x[keyValue])||0), backgroundColor:'rgba(46,196,182,0.55)', borderColor:'#2EC4B6', borderWidth:1 }] }, options:{ responsive:true, maintainAspectRatio:false, indexAxis:horizontal?'y':'x', plugins:{ legend:{ display:false } }, scales:{ x:{ beginAtZero:true, ticks:{ font:{ size:9 } } }, y:{ ticks:{ font:{ size:9 } } } } } };
  },

  chartBlock(title) {
    return `<h4 style="margin:16px 0 8px;font-size:0.95rem;color:#444;">${title}</h4><div class="admin-chart-box"><canvas id="adminChartCanvas"></canvas></div>`;
  },

  route(container) {
    if (!this.token) return this.renderLogin(container);
    this.renderPanel(container);
  },

  renderLogin(container) {
    container.innerHTML = `
      <div style="max-width:400px;margin:50px auto;padding:20px;text-align:center;background:white;border-radius:15px;box-shadow:0 10px 25px rgba(0,0,0,0.1);">
        <div style="font-size:3rem;margin-bottom:10px;">🔐</div>
        <h2>Panel administrativo BARRIO</h2>
        <p style="color:#666;font-size:0.9rem;margin-bottom:20px;">Ingresa las 3 llaves de seguridad</p>
        <input type="password" id="p1" placeholder="Llave 1" style="width:100%;padding:12px;margin-bottom:10px;border-radius:8px;border:1px solid #ddd;">
        <input type="password" id="p2" placeholder="Llave 2" style="width:100%;padding:12px;margin-bottom:10px;border-radius:8px;border:1px solid #ddd;">
        <input type="password" id="p3" placeholder="Llave 3" style="width:100%;padding:12px;margin-bottom:10px;border-radius:8px;border:1px solid #ddd;">
        <button type="button" id="btnLogin" class="btn btn-primary" style="width:100%;padding:15px;font-weight:bold;margin-top:10px;">ACCEDER</button>
        <p id="errMsg" style="color:red;display:none;margin-top:15px;font-weight:bold;"></p>
        <button type="button" onclick="location.assign('/')" style="background:none;border:none;color:#999;margin-top:20px;cursor:pointer;">⬅ Volver al inicio</button>
      </div>`;
    document.getElementById('btnLogin').onclick = async () => {
      const keys = ['p1','p2','p3'].map(id => document.getElementById(id).value);
      try {
        const res = await API.adminLogin(keys);
        this.token = res.token;
        localStorage.setItem('barrio_admin_token', res.token);
        this.renderPanel(container);
      } catch(e) {
        const err = document.getElementById('errMsg');
        err.textContent = '❌ Llaves incorrectas';
        err.style.display = 'block';
      }
    };
  },

  async renderPanel(container) {
    container.innerHTML = `
      <style>
        .admin-wrap { padding:12px; max-width:1280px; margin:0 auto; }
        .admin-table-wrap { overflow-x:auto; margin-top:10px; border:1px solid #eee; border-radius:10px; }
        .admin-table { width:100%; border-collapse:collapse; font-size:11px; min-width:700px; }
        .admin-table th { background:#fff3e0; text-align:left; padding:8px 6px; border-bottom:2px solid #FF6B35; white-space:nowrap; position:sticky; top:0; z-index:1; }
        .admin-table td { padding:7px 6px; border-bottom:1px solid #eee; vertical-align:top; }
        .admin-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:10px; }
        .admin-chart-box { height:220px; margin:4px 0 12px; position:relative; }
        .admin-tabs { display:flex; gap:6px; overflow-x:auto; padding-bottom:8px; margin-bottom:8px; flex-wrap:wrap; }
        .admin-tab { flex-shrink:0; padding:8px 10px; border-radius:10px; border:1px solid #ddd; background:#fafafa; cursor:pointer; font-weight:800; font-size:11px; }
        .admin-tab.active { background:var(--primary,#FF6B35); color:#fff; border-color:var(--primary,#FF6B35); }
        .admin-form { background:#f9f9f9; border:1px solid #eee; border-radius:12px; padding:16px; margin-bottom:16px; }
        .admin-form input, .admin-form select, .admin-form textarea { width:100%; padding:9px 12px; border-radius:8px; border:1px solid #ddd; font-size:13px; box-sizing:border-box; margin-bottom:8px; font-family:inherit; }
        .admin-form label { display:block; font-size:11px; font-weight:700; color:#666; margin-bottom:3px; }
        .admin-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        @media(max-width:600px){ .admin-form-grid { grid-template-columns:1fr; } }
        .btn-del { background:#D32F2F; color:white; border:none; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:11px; }
        .btn-edit { background:#1976D2; color:white; border:none; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:11px; }
        .btn-ok { background:#388E3C; color:white; border:none; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:11px; }
      </style>
      <div class="admin-wrap fade-in">
        <div style="display:flex;justify-content:space-between;align-items:center;background:white;padding:14px;border-radius:12px;box-shadow:0 4px 10px rgba(0,0,0,0.06);margin-bottom:10px;">
          <h2 style="margin:0;font-size:1.1rem;color:var(--primary,#FF6B35);">🔧 Administración BARRIO</h2>
          <button type="button" id="btnLogout" class="btn btn-sm btn-outline">Salir</button>
        </div>
        <div class="admin-tabs">
          <button type="button" class="admin-tab active" data-tab="usuarios">👥 Usuarios</button>
          <button type="button" class="admin-tab" data-tab="reportes">📢 Reportes</button>
          <button type="button" class="admin-tab" data-tab="buzon">📬 Buzón</button>
          <button type="button" class="admin-tab" data-tab="muro">💬 Muro</button>
          <button type="button" class="admin-tab" data-tab="emergencias">🚨 Emergencias</button>
          <button type="button" class="admin-tab" data-tab="ubicacion">📍 Rastreo</button>
          <button type="button" class="admin-tab" data-tab="mascotas">🐶 Mascotas</button>
          <button type="button" class="admin-tab" data-tab="locales">🏪 Locales</button>
          <button type="button" class="admin-tab" data-tab="productos">📦 Productos</button>
          <button type="button" class="admin-tab" data-tab="servicios">🔧 Servicios</button>
          <button type="button" class="admin-tab" data-tab="resumen">📊 Resumen</button>
          <button type="button" class="admin-tab" data-tab="configuracion">⚙️ Configuración</button>
        </div>
        <div id="adminContent" style="background:white;padding:14px;border-radius:12px;min-height:300px;box-shadow:0 4px 10px rgba(0,0,0,0.05);"></div>
      </div>`;

    document.getElementById('btnLogout').onclick = () => {
      localStorage.removeItem('barrio_admin_token');
      location.reload();
    };

    container.querySelectorAll('.admin-tab').forEach((tab) => {
      tab.onclick = () => {
        container.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.tab;
        this.loadTab();
      };
    });

    this.currentTab = 'usuarios';
    this.loadTab();
  },

  async loadTab() {
    const box = document.getElementById('adminContent');
    this.destroyChart();
    box.innerHTML = '<p style="text-align:center;color:#888;padding:40px;">Cargando…</p>';

    try {

      // ── RESUMEN ──
      if (this.currentTab === 'resumen') {
        const [st, analytics] = await Promise.all([API.adminGetStats(this.token), API.adminGetAnalytics(this.token)]);
        box.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;">
            <div style="background:#FFF3E0;padding:14px;border-radius:10px;text-align:center;"><div style="font-size:1.8rem;font-weight:900;color:#FF6B35;">${st.uniqueUsers||0}</div><div style="font-size:11px;color:#666;">Usuarios</div></div>
            <div style="background:#E8F5E9;padding:14px;border-radius:10px;text-align:center;"><div style="font-size:1.8rem;font-weight:900;color:#388E3C;">${st.totalVisitas||0}</div><div style="font-size:11px;color:#666;">Visitas totales</div></div>
            <div style="background:#E3F2FD;padding:14px;border-radius:10px;text-align:center;"><div style="font-size:1.8rem;font-weight:900;color:#1976D2;">${st.visitasHoy||0}</div><div style="font-size:11px;color:#666;">Visitas hoy</div></div>
            <div style="background:#F3E5F5;padding:14px;border-radius:10px;text-align:center;"><div style="font-size:1.8rem;font-weight:900;color:#673AB7;">${st.totalMascotas||0}</div><div style="font-size:11px;color:#666;">Mascotas perdidas</div></div>
          </div>
          ${this.chartBlock('Visitas por día (14 días)')}
          <h4 style="margin:12px 0 4px;font-size:0.95rem;">Reportes por tipo</h4>
          <div class="admin-chart-box"><canvas id="adminChartCanvas2"></canvas></div>`;
        await this.ensureChartJs();
        this.destroyChart();
        const c1 = document.getElementById('adminChartCanvas');
        const c2 = document.getElementById('adminChartCanvas2');
        if (c1 && window.Chart) this._chart = new Chart(c1.getContext('2d'), this.lineChart('Visitas', analytics.visitasDia, '#FF6B35', 'rgba(255,107,53,0.12)'));
        if (c2 && window.Chart) this._chart2 = new Chart(c2.getContext('2d'), this.barChart('Cantidad', analytics.reportesTipo, 'tipo', 'n', true));
        return;
      }

      // ── MASCOTAS PERDIDAS ──
      if (this.currentTab === 'mascotas') {
        const data = await API.adminGetMascotas(this.token);
        box.innerHTML = `
          <div class="admin-toolbar">${this.exportBtn('/api/admin/export/mascotas','planilla_mascotas.csv','📥 Planilla mascotas')}</div>
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Fecha</th><th>Mascota</th><th>Tipo</th><th>Contacto</th><th>Tel</th><th>Lugar</th><th>Características</th><th>Foto</th><th>Acción</th>
          </tr></thead><tbody>
          ${data.map(m=>`<tr>
            <td>${this.esc(m.id)}</td>
            <td>${this.formatDate(m.created_at)}</td>
            <td><b>${this.esc(m.nombre_mascota||'Sin nombre')}</b></td>
            <td>${this.esc(m.tipo_animal||'—')}</td>
            <td>${this.esc(m.nombre_contacto)}</td>
            <td>${this.esc(m.telefono)}</td>
            <td>${this.esc(this.trunc(m.ubicacion_extravio||'—',40))}</td>
            <td>${this.esc(this.trunc(m.caracteristicas||'—',60))}</td>
            <td>${m.foto_base64?`<img src="${m.foto_base64}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;">`:'—'}</td>
            <td><button class="btn-del btn-del-mascota" data-id="${m.id}">🗑️</button></td>
          </tr>`).join('')}
          </tbody></table></div>`;
        this.bindDownloads(box);
        box.querySelectorAll('.btn-del-mascota').forEach(btn => {
          btn.onclick = async () => {
            if (!confirm('¿Eliminar este aviso de mascota?')) return;
            try { await API.del(`/api/admin/mascotas/${btn.dataset.id}`, this.token); this.toast('Aviso eliminado'); this.loadTab(); }
            catch(e) { alert(e.message); }
          };
        });
        return;
      }

      // ── LOCALES ──
      if (this.currentTab === 'locales') {
        const [locales, analytics] = await Promise.all([API.adminGetLocales(this.token), API.adminGetAnalytics(this.token)]);
        box.innerHTML = `
          <div class="admin-form">
            <h3 style="margin:0 0 12px;font-size:1rem;color:#FF6B35;">➕ Agregar / Editar Local</h3>
            <input type="hidden" id="localId">
            <div class="admin-form-grid">
              <div><label>Nombre del local *</label><input type="text" id="localNombre" placeholder="Ej: Minimarket El Barrio"></div>
              <div><label>Dirección</label><input type="text" id="localDireccion" placeholder="Ej: Calle Los Aromos 123"></div>
              <div><label>Horario apertura</label><input type="time" id="localApertura" value="08:00"></div>
              <div><label>Horario cierre</label><input type="time" id="localCierre" value="20:00"></div>
              <div><label>Días de atención</label>
                <select id="localDias">
                  <option value="lun-sab">Lunes a Sábado</option>
                  <option value="lun-dom">Lunes a Domingo</option>
                  <option value="lun-vie">Lunes a Viernes</option>
                </select>
              </div>
              <div style="display:flex;gap:16px;align-items:flex-end;padding-bottom:8px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;"><input type="checkbox" id="localEfectivo" checked> Acepta efectivo</label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;"><input type="checkbox" id="localTarjeta"> Acepta tarjeta</label>
              </div>
            </div>
            <label>Link de Google Maps (pega el link del local)</label>
            <input type="text" id="localMapsUrl" placeholder="https://maps.google.com/... o link compartido de Google Maps">
            <div class="admin-form-grid">
              <div><label>Latitud (se llena automáticamente)</label><input type="number" id="localLat" placeholder="-41.4693" step="any"></div>
              <div><label>Longitud (se llena automáticamente)</label><input type="number" id="localLng" placeholder="-72.9423" step="any"></div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" id="btnResolverMapa" class="btn btn-sm" style="background:#1976D2;color:white;">🗺️ Extraer coordenadas del link</button>
              <button type="button" id="btnGuardarLocal" class="btn btn-primary" style="min-width:160px;">💾 Guardar Local</button>
              <button type="button" id="btnCancelarLocal" class="btn btn-sm btn-outline" style="display:none;">✖ Cancelar</button>
            </div>
          </div>
          <div class="admin-toolbar">
            ${this.exportBtn('/api/admin/export/locales','planilla_locales.csv','📥 Planilla todos los locales')}
          </div>
          ${this.chartBlock('Productos por local (top 15)')}
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Nombre</th><th>Dirección</th><th>Horario</th><th>Días</th><th>Efectivo</th><th>Tarjeta</th><th>Mapa</th><th>Planilla</th><th>Acciones</th>
          </tr></thead><tbody>
          ${locales.map(l=>`<tr>
            <td>${this.esc(l.id)}</td>
            <td><b>${this.esc(l.nombre)}</b></td>
            <td>${this.esc(l.direccion)}</td>
            <td>${this.esc(l.horario_apertura)}–${this.esc(l.horario_cierre)}</td>
            <td>${this.esc(l.dias_atencion)}</td>
            <td>${this.yn(l.acepta_efectivo)}</td>
            <td>${this.yn(l.acepta_tarjeta)}</td>
            <td>${this.mapBtn(l.latitud,l.longitud)}</td>
            <td><button type="button" class="btn-ok btn-planilla-local" data-id="${l.id}" data-nombre="${this.esc(l.nombre)}">📥 Planilla</button></td>
            <td style="white-space:nowrap;">
              <button type="button" class="btn-edit btn-edit-local" data-local='${JSON.stringify({id:l.id,nombre:l.nombre,direccion:l.direccion||'',latitud:l.latitud,longitud:l.longitud,horario_apertura:l.horario_apertura,horario_cierre:l.horario_cierre,dias_atencion:l.dias_atencion,acepta_efectivo:l.acepta_efectivo,acepta_tarjeta:l.acepta_tarjeta})}' style="margin:2px;">✏️ Editar</button>
              <button type="button" class="btn-del btn-del-local" data-id="${l.id}" data-nombre="${this.esc(l.nombre)}" style="margin:2px;">🗑️ Eliminar</button>
            </td>
          </tr>`).join('')}
          </tbody></table></div>`;

        this.bindDownloads(box);

        box.querySelectorAll('.btn-planilla-local').forEach(btn => {
          btn.onclick = () => {
            API.adminDownloadBlob(`/api/admin/export/productos/${btn.dataset.id}`, this.token, `planilla_${btn.dataset.nombre}.csv`)
              .catch(e => alert('Error: ' + e.message));
          };
        });

        document.getElementById('btnResolverMapa').onclick = async () => {
          const url = document.getElementById('localMapsUrl').value.trim();
          if (!url) { alert('Pega primero el link de Google Maps'); return; }
          const btn = document.getElementById('btnResolverMapa');
          btn.textContent = 'Extrayendo...'; btn.disabled = true;
          try {
            const r = await API.post('/api/admin/resolve-map', { url }, this.token);
            document.getElementById('localLat').value = r.lat;
            document.getElementById('localLng').value = r.lng;
            if (r.address && !document.getElementById('localNombre').value) document.getElementById('localNombre').value = r.address;
            btn.textContent = '✅ ¡Coordenadas extraídas!';
          } catch(e) {
            alert('No se pudo extraer: ' + e.message);
            btn.textContent = '🗺️ Extraer coordenadas del link';
          }
          btn.disabled = false;
        };

        const limpiarFormLocal = () => {
          ['localId','localNombre','localDireccion','localMapsUrl','localLat','localLng'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
          const ap = document.getElementById('localApertura'); if(ap) ap.value='08:00';
          const ci = document.getElementById('localCierre'); if(ci) ci.value='20:00';
          const di = document.getElementById('localDias'); if(di) di.value='lun-sab';
          const ef = document.getElementById('localEfectivo'); if(ef) ef.checked=true;
          const ta = document.getElementById('localTarjeta'); if(ta) ta.checked=false;
          document.getElementById('btnCancelarLocal').style.display='none';
          document.getElementById('btnGuardarLocal').textContent='💾 Guardar Local';
        };

        document.getElementById('btnCancelarLocal').onclick = limpiarFormLocal;

        document.getElementById('btnGuardarLocal').onclick = async () => {
          const id = document.getElementById('localId').value;
          const nombre = document.getElementById('localNombre').value.trim();
          const lat = parseFloat(document.getElementById('localLat').value);
          const lng = parseFloat(document.getElementById('localLng').value);
          if (!nombre) { alert('El nombre es obligatorio'); return; }
          if (!lat || !lng || isNaN(lat) || isNaN(lng)) { alert('Las coordenadas son obligatorias. Usa "Extraer coordenadas del link"'); return; }
          const datos = { nombre, direccion:document.getElementById('localDireccion').value.trim(), latitud:lat, longitud:lng, horario_apertura:document.getElementById('localApertura').value, horario_cierre:document.getElementById('localCierre').value, dias_atencion:document.getElementById('localDias').value, acepta_efectivo:document.getElementById('localEfectivo').checked, acepta_tarjeta:document.getElementById('localTarjeta').checked };
          const btn = document.getElementById('btnGuardarLocal');
          btn.disabled=true; btn.textContent='Guardando...';
          try {
            if (id) { await API.put(`/api/admin/locales/${id}`, datos, this.token); }
            else { await API.post('/api/admin/locales', datos, this.token); }
            this.toast(id ? '✅ Local actualizado' : '✅ Local creado');
            this.loadTab();
          } catch(e) { btn.disabled=false; btn.textContent='💾 Guardar Local'; alert('Error: '+e.message); }
        };

        box.querySelectorAll('.btn-edit-local').forEach(btn => {
          btn.onclick = () => {
            const l = JSON.parse(btn.getAttribute('data-local'));
            document.getElementById('localId').value = l.id;
            document.getElementById('localNombre').value = l.nombre;
            document.getElementById('localDireccion').value = l.direccion||'';
            document.getElementById('localLat').value = l.latitud;
            document.getElementById('localLng').value = l.longitud;
            document.getElementById('localApertura').value = l.horario_apertura||'08:00';
            document.getElementById('localCierre').value = l.horario_cierre||'20:00';
            document.getElementById('localDias').value = l.dias_atencion||'lun-sab';
            document.getElementById('localEfectivo').checked = l.acepta_efectivo==1||l.acepta_efectivo===true;
            document.getElementById('localTarjeta').checked = l.acepta_tarjeta==1||l.acepta_tarjeta===true;
            document.getElementById('btnCancelarLocal').style.display='inline-block';
            document.getElementById('btnGuardarLocal').textContent='💾 Actualizar Local';
            document.getElementById('btnGuardarLocal').scrollIntoView({behavior:'smooth'});
          };
        });

        box.querySelectorAll('.btn-del-local').forEach(btn => {
          btn.onclick = async () => {
            if (!confirm(`¿Eliminar local "${btn.dataset.nombre}"?\nSe eliminarán también todos sus productos.`)) return;
            try { await API.del(`/api/admin/locales/${btn.dataset.id}`, this.token); this.toast('Local eliminado'); this.loadTab(); }
            catch(e) { alert('Error: '+e.message); }
          };
        });

        await this.drawChart('adminChartCanvas', this.barChart('Productos por local', analytics.productosLocal, 'nombre', 'n', true));
        return;
      }

      // ── PRODUCTOS ──
      if (this.currentTab === 'productos') {
        const [productos, locales, analytics] = await Promise.all([API.adminGetProductos(this.token), API.adminGetLocales(this.token), API.adminGetAnalytics(this.token)]);
        const opLocales = locales.map(l=>`<option value="${l.id}">${this.esc(l.nombre)}</option>`).join('');
        box.innerHTML = `
          <div class="admin-form">
            <h3 style="margin:0 0 12px;font-size:1rem;color:#FF6B35;">➕ Agregar / Editar Producto</h3>
            <input type="hidden" id="prodId">
            <div class="admin-form-grid">
              <div><label>Local *</label><select id="prodLocal"><option value="">— Selecciona un local —</option>${opLocales}</select></div>
              <div><label>Nombre del producto *</label><input type="text" id="prodNombre" placeholder="Ej: Pan marraqueta"></div>
              <div><label>Marca</label><input type="text" id="prodMarca" placeholder="Ej: Castaño"></div>
              <div><label>Precio ($) *</label><input type="number" id="prodPrecio" placeholder="1500" min="0"></div>
              <div><label>Unidad</label>
                <select id="prodUnidad">
                  <option value="unidad">Unidad</option>
                  <option value="kg">Kilogramo (kg)</option>
                  <option value="g">Gramo (g)</option>
                  <option value="lt">Litro (lt)</option>
                  <option value="ml">Mililitro (ml)</option>
                  <option value="docena">Docena</option>
                  <option value="paquete">Paquete</option>
                </select>
              </div>
              <div style="display:flex;align-items:flex-end;padding-bottom:8px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;"><input type="checkbox" id="prodStock" checked> En stock</label>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" id="btnGuardarProd" class="btn btn-primary" style="min-width:160px;">💾 Guardar Producto</button>
              <button type="button" id="btnCancelarProd" class="btn btn-sm btn-outline" style="display:none;">✖ Cancelar</button>
            </div>
          </div>
          <div class="admin-toolbar">
            ${this.exportBtn('/api/admin/export/productos','planilla_todos_productos.csv','📥 Todos los productos')}
            <select id="filtroLocal" style="padding:6px 10px;border-radius:8px;border:1px solid #ddd;font-size:12px;">
              <option value="">🔍 Filtrar por local...</option>${opLocales}
            </select>
          </div>
          ${this.chartBlock('Productos por local (top 15)')}
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Local</th><th>Producto</th><th>Marca</th><th>Precio</th><th>Unidad</th><th>Stock</th><th>Fecha</th><th>Acciones</th>
          </tr></thead><tbody id="tbodyProd">
          ${productos.map(p=>`<tr data-local="${p.local_id}">
            <td>${this.esc(p.id)}</td>
            <td>${this.esc(p.local_nombre)}</td>
            <td>${this.esc(p.nombre)}</td>
            <td>${this.esc(p.marca)}</td>
            <td>$${this.esc(p.precio)}</td>
            <td>${this.esc(p.unidad)}</td>
            <td>${this.yn(p.en_stock)}</td>
            <td>${this.formatDate(p.created_at)}</td>
            <td style="white-space:nowrap;">
              <button type="button" class="btn-edit btn-edit-prod" data-prod='${JSON.stringify({id:p.id,local_id:p.local_id,nombre:p.nombre,marca:p.marca||'',precio:p.precio,unidad:p.unidad||'unidad',en_stock:p.en_stock})}' style="margin:2px;">✏️</button>
              <button type="button" class="btn-del btn-del-prod" data-id="${p.id}" data-nombre="${this.esc(p.nombre)}" style="margin:2px;">🗑️</button>
            </td>
          </tr>`).join('')}
          </tbody></table></div>`;

        this.bindDownloads(box);

        document.getElementById('filtroLocal').onchange = (e) => {
          const val = e.target.value;
          document.querySelectorAll('#tbodyProd tr').forEach(tr => { tr.style.display = (!val || tr.dataset.local === val) ? '' : 'none'; });
        };

        const limpiarFormProd = () => {
          ['prodId','prodNombre','prodMarca','prodPrecio'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
          const pl = document.getElementById('prodLocal'); if(pl) pl.value='';
          const pu = document.getElementById('prodUnidad'); if(pu) pu.value='unidad';
          const ps = document.getElementById('prodStock'); if(ps) ps.checked=true;
          document.getElementById('btnCancelarProd').style.display='none';
          document.getElementById('btnGuardarProd').textContent='💾 Guardar Producto';
        };

        document.getElementById('btnCancelarProd').onclick = limpiarFormProd;

        document.getElementById('btnGuardarProd').onclick = async () => {
          const id = document.getElementById('prodId').value;
          const local_id = document.getElementById('prodLocal').value;
          const nombre = document.getElementById('prodNombre').value.trim();
          const precio = parseFloat(document.getElementById('prodPrecio').value);
          if (!local_id) { alert('Selecciona un local'); return; }
          if (!nombre) { alert('El nombre es obligatorio'); return; }
          if (isNaN(precio) || precio < 0) { alert('El precio debe ser un número válido'); return; }
          const datos = { local_id:parseInt(local_id), nombre, marca:document.getElementById('prodMarca').value.trim(), precio, unidad:document.getElementById('prodUnidad').value, en_stock:document.getElementById('prodStock').checked };
          const btn = document.getElementById('btnGuardarProd');
          btn.disabled=true; btn.textContent='Guardando...';
          try {
            if (id) { await API.put(`/api/admin/productos/${id}`, datos, this.token); }
            else { await API.post('/api/admin/productos', datos, this.token); }
            this.toast(id ? '✅ Producto actualizado' : '✅ Producto creado');
            this.loadTab();
          } catch(e) { btn.disabled=false; btn.textContent='💾 Guardar Producto'; alert('Error: '+e.message); }
        };

        box.querySelectorAll('.btn-edit-prod').forEach(btn => {
          btn.onclick = () => {
            const p = JSON.parse(btn.getAttribute('data-prod'));
            document.getElementById('prodId').value = p.id;
            document.getElementById('prodLocal').value = p.local_id;
            document.getElementById('prodNombre').value = p.nombre;
            document.getElementById('prodMarca').value = p.marca||'';
            document.getElementById('prodPrecio').value = p.precio;
            document.getElementById('prodUnidad').value = p.unidad||'unidad';
            document.getElementById('prodStock').checked = p.en_stock==1||p.en_stock===true;
            document.getElementById('btnCancelarProd').style.display='inline-block';
            document.getElementById('btnGuardarProd').textContent='💾 Actualizar Producto';
            document.getElementById('btnGuardarProd').scrollIntoView({behavior:'smooth'});
          };
        });

        box.querySelectorAll('.btn-del-prod').forEach(btn => {
          btn.onclick = async () => {
            if (!confirm(`¿Eliminar producto "${btn.dataset.nombre}"?`)) return;
            try { await API.del(`/api/admin/productos/${btn.dataset.id}`, this.token); this.toast('Producto eliminado'); this.loadTab(); }
            catch(e) { alert('Error: '+e.message); }
          };
        });

        await this.drawChart('adminChartCanvas', this.barChart('Productos por local', analytics.productosLocal, 'nombre', 'n', true));
        return;
      }

      // ── SERVICIOS ──
      if (this.currentTab === 'servicios') {
        const servicios = await API.adminGetServicios(this.token);
        box.innerHTML = `
          <div class="admin-form">
            <h3 style="margin:0 0 12px;font-size:1rem;color:#FF6B35;">➕ Agregar / Editar Servicio</h3>
            <input type="hidden" id="servId">
            <div class="admin-form-grid">
              <div><label>Categoría *</label>
                <input type="text" id="servTipo" placeholder="Ej: Gasfitería, Electricidad…" list="catSug">
                <datalist id="catSug"><option value="Gasfitería"><option value="Electricidad"><option value="Pintura"><option value="Jardinería"><option value="Carpintería"><option value="Fumigación"><option value="Limpieza"><option value="Cerrajería"><option value="Albañilería"><option value="Fletes"><option value="Computación"></datalist>
              </div>
              <div><label>Nombre del prestador *</label><input type="text" id="servNombre" placeholder="Ej: Juan Pérez"></div>
              <div><label>Teléfono</label><input type="tel" id="servTelefono" placeholder="+56912345678"></div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" id="btnGuardarServ" class="btn btn-primary" style="min-width:160px;">💾 Guardar Servicio</button>
              <button type="button" id="btnCancelarServ" class="btn btn-sm btn-outline" style="display:none;">✖ Cancelar</button>
            </div>
          </div>
          <div class="admin-toolbar">
            ${this.exportBtn('/api/admin/export/servicios','planilla_servicios.csv','📥 Planilla servicios')}
          </div>
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Categoría</th><th>Nombre prestador</th><th>Teléfono</th><th>Fecha</th><th>Acciones</th>
          </tr></thead><tbody>
          ${servicios.map(s=>`<tr>
            <td>${this.esc(s.id)}</td>
            <td><b>${this.esc(s.tipo)}</b></td>
            <td>${this.esc(s.nombre_prestador)}</td>
            <td>${this.esc(s.telefono)}</td>
            <td>${this.formatDate(s.created_at)}</td>
            <td style="white-space:nowrap;">
              <button type="button" class="btn-edit btn-edit-serv" data-serv='${JSON.stringify({id:s.id,tipo:s.tipo,nombre_prestador:s.nombre_prestador,telefono:s.telefono||''})}' style="margin:2px;">✏️ Editar</button>
              <button type="button" class="btn-del btn-del-serv" data-id="${s.id}" data-nombre="${this.esc(s.nombre_prestador)}" style="margin:2px;">🗑️ Eliminar</button>
            </td>
          </tr>`).join('')}
          </tbody></table></div>`;

        this.bindDownloads(box);

        const limpiarFormServ = () => {
          ['servId','servTipo','servNombre','servTelefono'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
          document.getElementById('btnCancelarServ').style.display='none';
          document.getElementById('btnGuardarServ').textContent='💾 Guardar Servicio';
        };

        document.getElementById('btnCancelarServ').onclick = limpiarFormServ;

        document.getElementById('btnGuardarServ').onclick = async () => {
          const id = document.getElementById('servId').value;
          const tipo = document.getElementById('servTipo').value.trim();
          const nombre = document.getElementById('servNombre').value.trim();
          const telefono = document.getElementById('servTelefono').value.trim();
          if (!tipo) { alert('La categoría es obligatoria'); return; }
          if (!nombre) { alert('El nombre del prestador es obligatorio'); return; }
          const btn = document.getElementById('btnGuardarServ');
          btn.disabled=true; btn.textContent='Guardando...';
          try {
            if (id) { await API.put(`/api/admin/servicios/${id}`, {tipo,nombre_prestador:nombre,telefono}, this.token); }
            else { await API.post('/api/admin/servicios', {tipo,nombre_prestador:nombre,telefono}, this.token); }
            this.toast(id ? '✅ Servicio actualizado' : '✅ Servicio creado');
            this.loadTab();
          } catch(e) { btn.disabled=false; btn.textContent='💾 Guardar Servicio'; alert('Error: '+e.message); }
        };

        box.querySelectorAll('.btn-edit-serv').forEach(btn => {
          btn.onclick = () => {
            const s = JSON.parse(btn.getAttribute('data-serv'));
            document.getElementById('servId').value = s.id;
            document.getElementById('servTipo').value = s.tipo;
            document.getElementById('servNombre').value = s.nombre_prestador;
            document.getElementById('servTelefono').value = s.telefono||'';
            document.getElementById('btnCancelarServ').style.display='inline-block';
            document.getElementById('btnGuardarServ').textContent='💾 Actualizar Servicio';
            document.getElementById('btnGuardarServ').scrollIntoView({behavior:'smooth'});
          };
        });

        box.querySelectorAll('.btn-del-serv').forEach(btn => {
          btn.onclick = async () => {
            if (!confirm(`¿Eliminar servicio de "${btn.dataset.nombre}"?`)) return;
            try { await API.del(`/api/admin/servicios/${btn.dataset.id}`, this.token); this.toast('Servicio eliminado'); this.loadTab(); }
            catch(e) { alert('Error: '+e.message); }
          };
        });
        return;
      }

      // Para el resto cargamos analytics
      const analytics = await API.adminGetAnalytics(this.token);

      // ── USUARIOS ──
      if (this.currentTab === 'usuarios') {
        const data = await API.adminGetUsuarios(this.token);
        box.innerHTML = `
          <div class="admin-toolbar">${this.exportBtn('/api/admin/export/usuarios','planilla_usuarios.csv','📥 Planilla usuarios')}</div>
          ${this.chartBlock('Altas por día (30 días)')}
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Nombre</th><th>Nick</th><th>Tel</th><th>Email</th><th>Verif.</th><th>Bloq.</th><th>Extravío</th><th>Última ubic.</th><th>Registro</th><th>Baja</th><th>Acciones</th>
          </tr></thead><tbody>
          ${data.map(u=>`<tr>
            <td>${this.esc(u.id)}</td>
            <td>${this.esc(u.nombre)}</td>
            <td>${this.esc(u.nickname)}</td>
            <td>${this.esc(u.telefono)}</td>
            <td>${this.esc(u.email)}</td>
            <td>${this.yn(u.is_verified)}</td>
            <td>${this.yn(u.is_blocked)}</td>
            <td>${this.yn(u.is_stolen)}</td>
            <td>${this.mapBtn(u.last_lat,u.last_lng)}</td>
            <td>${this.formatDate(u.created_at)}</td>
            <td style="${u.baja_solicitada?'background:#FFEBEE;color:#D32F2F;font-weight:900;':''}">${u.baja_solicitada?`⚠️ ${this.formatDate(u.baja_fecha)}`:'No'}</td>
            <td style="white-space:nowrap;">
              <button class="btn-ok btn-verify" data-id="${u.id}" data-val="${u.is_verified?1:0}" style="margin:2px;">${u.is_verified?'✅ Verif.':'⏳ Verificar'}</button>
              <button class="btn-edit btn-block" data-id="${u.id}" data-val="${u.is_blocked?1:0}" style="background:${u.is_blocked?'#FF9800':'#607D8B'};margin:2px;">${u.is_blocked?'🔓 Desbloquear':'🔒 Bloquear'}</button>
              <button class="btn-edit btn-stolen" data-id="${u.id}" data-val="${u.is_stolen?1:0}" style="background:${u.is_stolen?'#E53935':'#78909C'};margin:2px;">${u.is_stolen?'🚨 Extraviado':'📱 Normal'}</button>
              <button class="btn-del btn-delete-user" data-id="${u.id}" data-nombre="${this.esc(u.nickname||u.nombre)}" style="margin:2px;">🗑️</button>
            </td>
          </tr>`).join('')}
          </tbody></table></div>`;
        this.bindDownloads(box);
        box.querySelectorAll('.btn-verify').forEach(btn => { btn.onclick = async () => { const n=parseInt(btn.dataset.val)?0:1; if(!confirm(`¿${n?'VERIFICAR':'Quitar verificación'}?`)) return; try { await API.adminVerifyUsuario(btn.dataset.id,n,this.token); this.loadTab(); } catch(e) { alert(e.message); } }; });
        box.querySelectorAll('.btn-block').forEach(btn => { btn.onclick = async () => { const n=parseInt(btn.dataset.val)?0:1; if(!confirm(`¿${n?'BLOQUEAR':'DESBLOQUEAR'}?`)) return; try { await API.adminToggleBlockUsuario(btn.dataset.id,n,this.token); this.loadTab(); } catch(e) { alert(e.message); } }; });
        box.querySelectorAll('.btn-stolen').forEach(btn => { btn.onclick = async () => { const n=parseInt(btn.dataset.val)?0:1; if(!confirm(`¿${n?'Marcar como EXTRAVIADO':'Marcar como NORMAL'}?`)) return; try { await API.adminToggleStolenUsuario(btn.dataset.id,n,this.token); this.loadTab(); } catch(e) { alert(e.message); } }; });
        box.querySelectorAll('.btn-delete-user').forEach(btn => { btn.onclick = async () => { if(!confirm(`⚠️ ¿Eliminar PERMANENTEMENTE a "${btn.dataset.nombre}"?`)) return; try { await API.adminDeleteUsuario(btn.dataset.id,this.token); this.toast('Usuario eliminado'); this.loadTab(); } catch(e) { alert(e.message); } }; });
        await this.drawChart('adminChartCanvas', this.lineChart('Usuarios / día', analytics.registrosDia, '#2EC4B6', 'rgba(46,196,182,0.12)'));
        return;
      }

      // ── MURO ──
      if (this.currentTab === 'muro') {
        const data = await API.adminGetMuro(this.token);
        box.innerHTML = `
          <div class="admin-toolbar">
            ${this.exportBtn('/api/admin/export/muro','planilla_muro.csv','📥 Planilla muro')}
            <button type="button" class="btn btn-sm" style="background:#D32F2F;color:white;" id="btnVaciarMuro">🗑️ Vaciar todo el muro</button>
          </div>
          ${this.chartBlock('Posts por día (14 días)')}
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Fecha</th><th>Autor</th><th>Tel</th><th>Contenido</th><th>Acción</th>
          </tr></thead><tbody>
          ${data.map(m=>`<tr>
            <td>${this.esc(m.id)}</td>
            <td>${this.formatDate(m.created_at)}</td>
            <td>${this.esc(m.autor)}</td>
            <td>${this.esc(m.autor_telefono)}</td>
            <td>${this.esc(this.trunc(m.contenido,200))}</td>
            <td><button class="btn-del btn-del-post" data-id="${m.id}">🗑️</button></td>
          </tr>`).join('')}
          </tbody></table></div>`;
        this.bindDownloads(box);
        document.getElementById('btnVaciarMuro').onclick = async () => { if(!confirm('¿Vaciar TODOS los posts?')) return; try { await API.del('/api/admin/muro',this.token); this.toast('Muro vaciado'); this.loadTab(); } catch(e) { alert(e.message); } };
        box.querySelectorAll('.btn-del-post').forEach(btn => { btn.onclick = async () => { if(!confirm('¿Eliminar este post?')) return; try { await API.del(`/api/admin/muro/${btn.dataset.id}`,this.token); this.toast('Post eliminado'); this.loadTab(); } catch(e) { alert(e.message); } }; });
        await this.drawChart('adminChartCanvas', this.lineChart('Posts / día', analytics.muroDia, '#673AB7', 'rgba(103,58,183,0.12)'));
        return;
      }

      // ── BUZÓN ──
      if (this.currentTab === 'buzon') {
        const data = await API.adminGetMensajes(this.token);
        box.innerHTML = `
          <div class="admin-toolbar">${this.exportBtn('/api/admin/export/mensajes','planilla_buzon.csv','📥 Planilla buzón')}</div>
          ${this.chartBlock('Mensajes por día (14 días)')}
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Fecha</th><th>Usuario</th><th>Tel</th><th>Leído</th><th>Mensaje</th><th>Acciones</th>
          </tr></thead><tbody>
          ${data.map(m=>`<tr style="${!m.leido?'background:#FFF8E1;':''}">
            <td>${this.esc(m.id)}</td>
            <td>${this.formatDate(m.created_at)}</td>
            <td>${this.esc(m.nombre)}</td>
            <td>${this.esc(m.telefono)}</td>
            <td>${m.leido?'✅':'🔴 No'}</td>
            <td>${this.esc(this.trunc(m.mensaje,240))}</td>
            <td style="white-space:nowrap;">
              ${!m.leido?`<button class="btn-ok btn-leer" data-id="${m.id}" style="margin:2px;">✅ Leído</button>`:''}
              <button class="btn-del btn-del-msg" data-id="${m.id}" style="margin:2px;">🗑️</button>
            </td>
          </tr>`).join('')}
          </tbody></table></div>`;
        this.bindDownloads(box);
        box.querySelectorAll('.btn-leer').forEach(btn => { btn.onclick = async () => { try { await API.put(`/api/admin/mensajes/${btn.dataset.id}/leido`,{},this.token); this.loadTab(); } catch(e) { alert(e.message); } }; });
        box.querySelectorAll('.btn-del-msg').forEach(btn => { btn.onclick = async () => { if(!confirm('¿Eliminar este mensaje?')) return; try { await API.del(`/api/admin/mensajes/${btn.dataset.id}`,this.token); this.toast('Mensaje eliminado'); this.loadTab(); } catch(e) { alert(e.message); } }; });
        await this.drawChart('adminChartCanvas', this.lineChart('Mensajes / día', analytics.buzonDia, '#1976D2', 'rgba(25,118,210,0.12)'));
        return;
      }

      // ── RASTREO ──
      if (this.currentTab === 'ubicacion') {
        const data = await API.adminGetRastreo(this.token);
        box.innerHTML = `
          <div class="admin-toolbar">${this.exportBtn('/api/admin/export/ubicacion','planilla_ubicacion_extravios.csv','📥 Planilla ubicación extravíos')}</div>
          ${this.chartBlock('Puntos de ubicación por día (14 días)')}
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Fecha</th><th>Usuario</th><th>Tel</th><th>Lat</th><th>Lng</th><th>Mapa</th>
          </tr></thead><tbody>
          ${data.map(r=>`<tr>
            <td>${this.esc(r.id)}</td>
            <td>${this.formatDate(r.created_at)}</td>
            <td>${this.esc(r.nombre)}</td>
            <td>${this.esc(r.telefono)}</td>
            <td>${this.esc(r.latitud)}</td>
            <td>${this.esc(r.longitud)}</td>
            <td>${this.mapBtn(r.latitud,r.longitud)}</td>
          </tr>`).join('')}
          </tbody></table></div>`;
        this.bindDownloads(box);
        await this.drawChart('adminChartCanvas', this.lineChart('Rastreos / día', analytics.ubicacionDia, '#E65100', 'rgba(230,81,0,0.12)'));
        return;
      }

      // ── REPORTES ──
      if (this.currentTab === 'reportes') {
        const data = await API.adminGetReportes(this.token);
        box.innerHTML = `
          <div class="admin-toolbar">${this.exportBtn('/api/admin/export/reportes','planilla_reportes.csv','📥 Planilla reportes')}</div>
          <h4 style="margin:12px 0 4px;font-size:0.95rem;">Reportes por día (14 días)</h4>
          <div class="admin-chart-box"><canvas id="adminChartCanvas"></canvas></div>
          <h4 style="margin:12px 0 4px;font-size:0.95rem;">Por tipo</h4>
          <div class="admin-chart-box"><canvas id="adminChartCanvas2"></canvas></div>
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Mapa</th><th>Contacto</th><th>Tel</th><th>Acción</th>
          </tr></thead><tbody>
          ${data.map(r=>`<tr>
            <td>${this.esc(r.id)}</td>
            <td>${this.formatDate(r.created_at)}</td>
            <td><b>${this.esc(r.tipo_reporte)}</b></td>
            <td>${this.esc(this.trunc(r.detalles,100))}</td>
            <td>${this.mapBtn(r.latitud,r.longitud)}</td>
            <td>${this.esc(r.nombre_contacto)}</td>
            <td>${this.esc(r.telefono)}</td>
            <td><button class="btn-del btn-del-reporte" data-id="${r.id}">🗑️</button></td>
          </tr>`).join('')}
          </tbody></table></div>`;
        this.bindDownloads(box);
        box.querySelectorAll('.btn-del-reporte').forEach(btn => { btn.onclick = async () => { if(!confirm('¿Eliminar este reporte?')) return; try { await API.del(`/api/admin/reportes/${btn.dataset.id}`,this.token); this.toast('Reporte eliminado'); this.loadTab(); } catch(e) { alert(e.message); } }; });
        await this.ensureChartJs(); this.destroyChart();
        const c1=document.getElementById('adminChartCanvas'); const c2=document.getElementById('adminChartCanvas2');
        if (c1&&window.Chart) this._chart = new Chart(c1.getContext('2d'), this.lineChart('Reportes / día', analytics.reportesDia, '#FF6B35', 'rgba(255,107,53,0.12)'));
        if (c2&&window.Chart) this._chart2 = new Chart(c2.getContext('2d'), this.barChart('Por tipo', analytics.reportesTipo, 'tipo', 'n', true));
        return;
      }

      // ── EMERGENCIAS ──
      if (this.currentTab === 'emergencias') {
        const data = await API.adminGetEmergencias(this.token);
        box.innerHTML = `
          <div class="admin-toolbar">${this.exportBtn('/api/admin/export/emergencias','planilla_emergencias.csv','📥 Planilla emergencias')}</div>
          <h4 style="margin:12px 0 4px;font-size:0.95rem;">Emergencias por día (14 días)</h4>
          <div class="admin-chart-box"><canvas id="adminChartCanvas"></canvas></div>
          <h4 style="margin:12px 0 4px;font-size:0.95rem;">Por institución</h4>
          <div class="admin-chart-box"><canvas id="adminChartCanvas2"></canvas></div>
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Fecha</th><th>Usuario</th><th>Tel</th><th>Institución</th><th>Mapa</th><th>Acción</th>
          </tr></thead><tbody>
          ${data.map(e=>`<tr>
            <td>${this.esc(e.id)}</td>
            <td>${this.formatDate(e.created_at)}</td>
            <td>${this.esc(e.nombre)}</td>
            <td>${this.esc(e.telefono)}</td>
            <td><b>${this.esc(e.institucion)}</b></td>
            <td>${this.mapBtn(e.latitud,e.longitud)}</td>
            <td><button class="btn-del btn-del-emerg" data-id="${e.id}">🗑️</button></td>
          </tr>`).join('')}
          </tbody></table></div>`;
        this.bindDownloads(box);
        box.querySelectorAll('.btn-del-emerg').forEach(btn => { btn.onclick = async () => { if(!confirm('¿Eliminar este registro?')) return; try { await API.del(`/api/admin/emergencias/${btn.dataset.id}`,this.token); this.toast('Registro eliminado'); this.loadTab(); } catch(e) { alert(e.message); } }; });
        await this.ensureChartJs(); this.destroyChart();
        const c1=document.getElementById('adminChartCanvas'); const c2=document.getElementById('adminChartCanvas2');
        if (c1&&window.Chart) this._chart = new Chart(c1.getContext('2d'), this.lineChart('Emergencias / día', analytics.emergenciasDia, '#D32F2F', 'rgba(211,47,47,0.12)'));
        if (c2&&window.Chart) this._chart2 = new Chart(c2.getContext('2d'), this.barChart('Por institución', analytics.emergInst, 'institucion', 'n', true));
        return;
      }

      // ── CONFIGURACIÓN ──
      if (this.currentTab === 'configuracion') {
        const config = await API.getConfig();
        box.innerHTML = `
          <h3 style="margin:0 0 16px;font-size:1rem;color:#FF6B35;">⚙️ Configuración del sistema BARRIO</h3>

          <div class="admin-form">
            <h4 style="margin:0 0 10px;font-size:0.95rem;color:#333;">📧 Texto del correo de bienvenida con PIN</h4>
            <p style="font-size:12px;color:#666;margin-bottom:10px;">Este es el correo que reciben los usuarios al registrarse con su PIN. Usa <b>{nombre}</b> para el nombre y <b>{pin}</b> para el PIN.</p>
            <div><label>Asunto del correo</label><input type="text" id="cfgAsunto" value="${this.esc(config.email_pin_asunto||'🔐 Tu PIN de Seguridad - BARRIO')}"></div>
            <div><label>Título de bienvenida</label><input type="text" id="cfgBienvenida" value="${this.esc(config.email_pin_bienvenida||'¡Bienvenido/a a BARRIO! 🏘️')}"></div>
            <div><label>Cuerpo del mensaje (usa {nombre} y {pin})</label><textarea id="cfgTexto" rows="4">${this.esc(config.email_pin_texto||'Hola {nombre}, tu registro fue exitoso. Este es tu PIN de seguridad para acceder a funciones especiales de BARRIO: {pin}. Guárdalo en un lugar seguro.')}</textarea></div>
            <div><label>Pie del correo</label><input type="text" id="cfgPie" value="${this.esc(config.email_pin_pie||'BARRIO - Seguridad Ciudadana')}"></div>
            <button type="button" id="btnGuardarEmail" class="btn btn-primary">💾 Guardar texto del correo</button>
            <p id="msgEmail" style="font-size:12px;margin-top:8px;display:none;"></p>
          </div>

          <div class="admin-form">
            <h4 style="margin:0 0 10px;font-size:0.95rem;color:#333;">📡 Parámetros generales</h4>
            <div class="admin-form-grid">
              <div><label>Radio de alertas push (metros)</label><input type="number" id="cfgRadio" value="${this.esc(config.push_radius||'500')}" min="100" max="5000"></div>
              <div><label>WhatsApp vecinos (número)</label><input type="text" id="cfgWhatsapp" value="${this.esc(config.whatsapp_vecinos||'')}"></div>
            </div>
            <button type="button" id="btnGuardarConfig" class="btn btn-primary">💾 Guardar parámetros</button>
            <p id="msgConfig" style="font-size:12px;margin-top:8px;display:none;"></p>
          </div>

          <div class="admin-form">
            <h4 style="margin:0 0 10px;font-size:0.95rem;color:#333;">🔐 Cambiar llaves de acceso al panel</h4>
            <div class="admin-form-grid">
              <div><label>Llave actual 1</label><input type="password" id="oldP1" placeholder="Llave actual 1"></div>
              <div><label>Nueva llave 1</label><input type="password" id="newP1" placeholder="Nueva llave 1"></div>
              <div><label>Llave actual 2</label><input type="password" id="oldP2" placeholder="Llave actual 2"></div>
              <div><label>Nueva llave 2</label><input type="password" id="newP2" placeholder="Nueva llave 2"></div>
              <div><label>Llave actual 3</label><input type="password" id="oldP3" placeholder="Llave actual 3"></div>
              <div><label>Nueva llave 3</label><input type="password" id="newP3" placeholder="Nueva llave 3"></div>
            </div>
            <button type="button" id="btnCambiarLlaves" class="btn btn-primary">🔐 Cambiar llaves</button>
            <p id="msgLlaves" style="font-size:12px;margin-top:8px;display:none;"></p>
          </div>`;

        // Guardar texto correo
        document.getElementById('btnGuardarEmail').onclick = async () => {
          const btn = document.getElementById('btnGuardarEmail');
          const msg = document.getElementById('msgEmail');
          btn.disabled = true;
          try {
            await API.put('/api/admin/config', {
              email_pin_asunto: document.getElementById('cfgAsunto').value,
              email_pin_bienvenida: document.getElementById('cfgBienvenida').value,
              email_pin_texto: document.getElementById('cfgTexto').value,
              email_pin_pie: document.getElementById('cfgPie').value
            }, this.token);
            msg.textContent = '✅ Texto del correo guardado correctamente';
            msg.style.color = 'green'; msg.style.display = 'block';
          } catch(e) { msg.textContent = '❌ Error: '+e.message; msg.style.color='red'; msg.style.display='block'; }
          btn.disabled = false;
        };

        // Guardar parámetros
        document.getElementById('btnGuardarConfig').onclick = async () => {
          const btn = document.getElementById('btnGuardarConfig');
          const msg = document.getElementById('msgConfig');
          btn.disabled = true;
          try {
            await API.put('/api/admin/config', { push_radius: document.getElementById('cfgRadio').value, whatsapp_vecinos: document.getElementById('cfgWhatsapp').value }, this.token);
            msg.textContent = '✅ Parámetros guardados';
            msg.style.color = 'green'; msg.style.display = 'block';
          } catch(e) { msg.textContent = '❌ Error: '+e.message; msg.style.color='red'; msg.style.display='block'; }
          btn.disabled = false;
        };

        // Cambiar llaves
        document.getElementById('btnCambiarLlaves').onclick = async () => {
          const old_passwords = ['oldP1','oldP2','oldP3'].map(id => document.getElementById(id).value);
          const new_passwords = ['newP1','newP2','newP3'].map(id => document.getElementById(id).value);
          if (new_passwords.some(p => !p.trim())) { alert('Las nuevas llaves no pueden estar vacías'); return; }
          const btn = document.getElementById('btnCambiarLlaves');
          const msg = document.getElementById('msgLlaves');
          btn.disabled = true;
          try {
            await API.put('/api/admin/passwords', {old_passwords, new_passwords}, this.token);
            msg.textContent = '✅ Llaves actualizadas. Usa las nuevas llaves en tu próximo acceso.';
            msg.style.color = 'green'; msg.style.display = 'block';
            ['oldP1','oldP2','oldP3','newP1','newP2','newP3'].forEach(id => document.getElementById(id).value = '');
          } catch(e) { msg.textContent = '❌ Error: '+e.message; msg.style.color='red'; msg.style.display='block'; }
          btn.disabled = false;
        };
        return;
      }

    } catch(e) {
      if (String(e.message).includes('401')) { localStorage.removeItem('barrio_admin_token'); location.reload(); return; }
      box.innerHTML = `<p style="color:red;text-align:center;padding:20px;">❌ Error al cargar: ${this.esc(e.message)}</p>`;
    }
  },
};
