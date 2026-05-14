// Admin Panel - BARRIO (extendido: tablas, gráficas, mapas, planillas CSV)
const Admin = {
  token: localStorage.getItem('barrio_admin_token') || null,
  currentTab: 'resumen',
  _chart: null,
  _chart2: null,
  _chartJsPromise: null,

  esc(t) {
    if (t == null || t === '') return '';
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatDate(d) {
    if (!d) return '—';
    try {
      const date = new Date(d);
      if (isNaN(date)) return this.esc(d); // Si no es fecha válida, devolver tal cual
      return date.toLocaleString('es-CL', { timeZone: 'America/Santiago' });
    } catch(e) {
      return this.esc(d);
    }
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
    if (lat == null || lng == null || lat === '' || lng === '') return '<span class="admin-muted">—</span>';
    const u = `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
    return `<a href="${this.esc(u)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline" style="padding:4px 10px;font-size:11px;">🗺️ Ver mapa</a>`;
  },

  exportBtn(path, filename, label = 'Descargar planilla CSV') {
    const L = label || 'Descargar planilla CSV';
    return `<button type="button" class="btn btn-sm btn-primary" data-export="${this.esc(path)}" data-filename="${this.esc(filename)}" style="margin:2px 0;">📥 ${this.esc(L)}</button>`;
  },

  bindDownloads(box) {
    box.querySelectorAll('[data-export]').forEach((btn) => {
      btn.onclick = async () => {
        const path = btn.getAttribute('data-export');
        const file = btn.getAttribute('data-filename');
        try {
          await API.adminDownloadBlob(path, this.token, file);
        } catch (e) {
          alert('No se pudo descargar: ' + e.message);
        }
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
    [this._chart, this._chart2].forEach((c) => {
      if (c) {
        try {
          c.destroy();
        } catch (e) {
          /* ignore */
        }
      }
    });
    this._chart = null;
    this._chart2 = null;
  },

  async drawChart(canvasId, config) {
    await this.ensureChartJs();
    this.destroyChart();
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    this._chart = new Chart(canvas.getContext('2d'), config);
  },

  lineChart(title, series, color = '#FF6B35', fillColor = 'rgba(255,107,53,0.12)') {
    const labels = (series || []).map((x) => String(x.dia || '').slice(0, 10));
    const data = (series || []).map((x) => Number(x.n) || 0);
    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: title,
            data,
            fill: true,
            tension: 0.25,
            borderColor: color,
            backgroundColor: fillColor,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { font: { size: 10 } } } },
        scales: {
          x: { ticks: { maxRotation: 45, font: { size: 9 } } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    };
  },

  barChart(title, items, keyLabel = 'nombre', keyValue = 'n', horizontal = false) {
    const labels = (items || []).map((x) => String(x[keyLabel] ?? '').slice(0, 22));
    const data = (items || []).map((x) => Number(x[keyValue]) || 0);
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: title, data, backgroundColor: 'rgba(46,196,182,0.55)', borderColor: '#2EC4B6', borderWidth: 1 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? 'y' : 'x',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { font: { size: 9 } } },
          y: { ticks: { font: { size: 9 } } },
        },
      },
    };
  },

  chartBlock(title) {
    return `
      <h4 style="margin:16px 0 8px;font-size:0.95rem;color:#444;">${title}</h4>
      <div class="admin-chart-box"><canvas id="adminChartCanvas"></canvas></div>`;
  },

  route(container) {
    if (!this.token) return this.renderLogin(container);
    this.renderPanel(container);
  },

  renderLogin(container) {
    container.innerHTML = `
      <div class="admin-login fade-in" style="max-width:400px; margin:50px auto; padding:20px; text-align:center; background:white; border-radius:15px; box-shadow:0 10px 25px rgba(0,0,0,0.1);">
        <div style="font-size:3rem; margin-bottom:10px;">🔐</div>
        <h2>Panel administrativo</h2>
        <p style="color:#666; font-size:0.9rem; margin-bottom:20px;">Ingresa las 3 llaves de seguridad</p>
        <input type="password" id="p1" placeholder="Llave 1" style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;">
        <input type="password" id="p2" placeholder="Llave 2" style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;">
        <input type="password" id="p3" placeholder="Llave 3" style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;">
        <button type="button" id="btnLogin" class="btn btn-primary" style="width:100%; padding:15px; font-weight:bold; margin-top:10px;">ACCEDER</button>
        <p id="errMsg" style="color:red; display:none; margin-top:15px; font-weight:bold;"></p>
        <button type="button" onclick="location.assign('/')" style="background:none; border:none; color:#999; margin-top:20px; cursor:pointer;">⬅ Volver al inicio</button>
      </div>`;

    document.getElementById('btnLogin').onclick = async () => {
      const keys = [document.getElementById('p1').value, document.getElementById('p2').value, document.getElementById('p3').value];
      try {
        const res = await API.adminLogin(keys);
        this.token = res.token;
        localStorage.setItem('barrio_admin_token', res.token);
        this.renderPanel(container);
      } catch (e) {
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
        .admin-table { width:100%; border-collapse:collapse; font-size:11px; min-width:900px; }
        .admin-table th { background:#fff3e0; text-align:left; padding:8px 6px; border-bottom:2px solid #FF6B35; white-space:nowrap; position:sticky; top:0; z-index:1; }
        .admin-table td { padding:7px 6px; border-bottom:1px solid #eee; vertical-align:top; }
        .admin-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:10px; }
        .admin-chart-box { height:220px; margin:4px 0 12px; position:relative; }
        .admin-muted { color:#999; font-size:11px; }
        .admin-tabs { display:flex; gap:8px; overflow-x:auto; padding-bottom:8px; margin-bottom:8px; flex-wrap:wrap; }
        .admin-tab { flex-shrink:0; padding:9px 12px; border-radius:10px; border:1px solid #ddd; background:#fafafa; cursor:pointer; font-weight:800; font-size:11px; }
        .admin-tab.active { background:var(--primary,#FF6B35); color:#fff; border-color:var(--primary,#FF6B35); }
      </style>
      <div class="admin-wrap fade-in">
        <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:14px; border-radius:12px; box-shadow:0 4px 10px rgba(0,0,0,0.06); margin-bottom:10px;">
          <h2 style="margin:0; font-size:1.1rem; color:var(--primary,#FF6B35);">🔧 Administración BARRIO</h2>
          <button type="button" id="btnLogout" class="btn btn-sm btn-outline">Salir</button>
        </div>
        <div class="admin-tabs">
          <button type="button" class="admin-tab active" data-tab="resumen">📊 Resumen</button>
          <button type="button" class="admin-tab" data-tab="locales">🏪 Locales</button>
          <button type="button" class="admin-tab" data-tab="productos">📦 Productos</button>
          <button type="button" class="admin-tab" data-tab="usuarios">👥 Usuarios</button>
          <button type="button" class="admin-tab" data-tab="muro">💬 Muro</button>
          <button type="button" class="admin-tab" data-tab="buzon">📬 Buzón</button>
          <button type="button" class="admin-tab" data-tab="ubicación">📍 Rastreo</button>
          <button type="button" class="admin-tab" data-tab="reportes">📢 Reportes</button>
          <button type="button" class="admin-tab" data-tab="emergencias">🚨 Emergencias</button>
        </div>
        <div id="adminContent" style="background:white; padding:14px; border-radius:12px; min-height:300px; box-shadow:0 4px 10px rgba(0,0,0,0.05);"></div>
      </div>`;

    document.getElementById('btnLogout').onclick = () => {
      localStorage.removeItem('barrio_admin_token');
      location.reload();
    };

    container.querySelectorAll('.admin-tab').forEach((tab) => {
      tab.onclick = () => {
        container.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.tab;
        this.loadTab();
      };
    });

    this.currentTab = 'resumen';
    this.loadTab();
  },

  async loadTab() {
    const box = document.getElementById('adminContent');
    this.destroyChart();
    box.innerHTML = '<p style="text-align:center;color:#888;">Cargando…</p>';

    try {
      const analytics = await API.adminGetAnalytics(this.token);
      let html = '';

      if (this.currentTab === 'resumen') {
        const st = await API.adminGetStats(this.token);
        html = `
          <p><b>Visitas totales:</b> ${st.totalVisitas ?? 0} · <b>Hoy:</b> ${st.visitasHoy ?? 0} · <b>Usuarios:</b> ${st.uniqueUsers ?? 0} · <b>Mascotas:</b> ${st.totalMascotas ?? 0}</p>
          <h4 style="margin:12px 0 4px;font-size:0.95rem;">Visitas por día (14 días)</h4>
          <div class="admin-chart-box"><canvas id="adminChartCanvas"></canvas></div>
          <h4 style="margin:12px 0 4px;font-size:0.95rem;">Reportes por tipo</h4>
          <div class="admin-chart-box"><canvas id="adminChartCanvas2"></canvas></div>`;
        box.innerHTML = html;
        this.bindDownloads(box);
        await this.ensureChartJs();
        this.destroyChart();
        const c1 = document.getElementById('adminChartCanvas');
        const c2 = document.getElementById('adminChartCanvas2');
        if (c1 && window.Chart) this._chart = new Chart(c1.getContext('2d'), this.lineChart('Visitas', analytics.visitasDia, '#FF6B35', 'rgba(255,107,53,0.12)'));
        if (c2 && window.Chart) this._chart2 = new Chart(c2.getContext('2d'), this.barChart('Cantidad', analytics.reportesTipo, 'tipo', 'n', true));
        return;
      }

      if (this.currentTab === 'locales') {
        const data = await API.adminGetLocales(this.token);
        html = `
          <div class="admin-toolbar">
            ${this.exportBtn('/api/admin/export/locales', 'planilla_locales.csv', 'Planilla de locales (.csv)')}
          </div>
          ${this.chartBlock('Productos registrados por local (top 15)')}
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Nombre</th><th>Dirección</th><th>Lat</th><th>Lng</th><th>Horario</th><th>Mapa</th>
          </tr></thead><tbody>
          ${data
            .map(
              (l) => `<tr>
            <td>${this.esc(l.id)}</td>
            <td><b>${this.esc(l.nombre)}</b></td>
            <td>${this.esc(l.direccion)}</td>
            <td>${this.esc(l.latitud)}</td>
            <td>${this.esc(l.longitud)}</td>
            <td>${this.esc(l.horario_apertura)}–${this.esc(l.horario_cierre)} ${this.esc(l.dias_atencion || '')}</td>
            <td>${this.mapBtn(l.latitud, l.longitud)}</td>
          </tr>`
            )
            .join('')}
          </tbody></table></div>`;
        box.innerHTML = html;
        this.bindDownloads(box);
        await this.drawChart('adminChartCanvas', this.barChart('Productos por local', analytics.productosLocal, 'nombre', 'n', true));
        return;
      }

      if (this.currentTab === 'productos') {
        const data = await API.adminGetProductos(this.token);
        html = `
          <div class="admin-toolbar">
            ${this.exportBtn('/api/admin/export/productos', 'planilla_productos.csv', 'Planilla de productos (.csv)')}
          </div>
          ${this.chartBlock('Cantidad de productos por local (mismo criterio que Locales)')}
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Local</th><th>Producto</th><th>Marca</th><th>Precio</th><th>Stock</th><th>Unidad</th><th>Alta</th>
          </tr></thead><tbody>
          ${data
            .map(
              (p) => `<tr>
            <td>${this.esc(p.id)}</td>
            <td>${this.esc(p.local_nombre)}</td>
            <td>${this.esc(p.nombre)}</td>
            <td>${this.esc(p.marca)}</td>
            <td>${this.esc(p.precio)}</td>
            <td>${this.yn(p.en_stock)}</td>
            <td>${this.esc(p.unidad)}</td>
            <td>${this.formatDate(p.created_at)}</td>
          </tr>`
            )
            .join('')}
          </tbody></table></div>`;
        box.innerHTML = html;
        this.bindDownloads(box);
        await this.drawChart('adminChartCanvas', this.barChart('Productos por local', analytics.productosLocal, 'nombre', 'n', true));
        return;
      }

      if (this.currentTab === 'usuarios') {
        const data = await API.adminGetUsuarios(this.token);
        html = `
          <div class="admin-toolbar">
            ${this.exportBtn('/api/admin/export/usuarios', 'planilla_usuarios.csv', 'Planilla de usuarios (.csv)')}
          </div>
          ${this.chartBlock('Altas de usuarios por día (últimos 30 días)')}
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Nombre</th><th>Nick</th><th>Tel</th><th>Email</th><th>Verif.</th><th>Bloq.</th><th>Extravío</th><th>Términos</th><th>Última ubicación</th><th>Registro</th><th style="background:#FFEBEE;color:#D32F2F;">🗑️ Baja</th><th style="background:#FFEBEE;color:#D32F2F;">Fecha solicitud</th><th>Device</th><th>Acciones</th>
          </tr></thead><tbody>
          ${data
            .map(
              (u) => `<tr>
            <td>${this.esc(u.id)}</td>
            <td>${this.esc(u.nombre)}</td>
            <td>${this.esc(u.nickname)}</td>
            <td>${this.esc(u.telefono)}</td>
            <td>${this.esc(u.email)}</td>
            <td>${this.yn(u.is_verified)}</td>
            <td>${this.yn(u.is_blocked)}</td>
            <td>${this.yn(u.is_stolen)}</td>
            <td>${this.yn(u.terms_accepted)}</td>
            <td>${this.mapBtn(u.last_lat, u.last_lng)}</td>
            <td>${this.formatDate(u.created_at)}</td>
            <td style="${u.baja_solicitada ? 'background:#FFEBEE;color:#D32F2F;font-weight:900;' : ''}">${u.baja_solicitada ? '⚠️ SÍ' : 'No'}</td>
            <td style="${u.baja_solicitada ? 'background:#FFEBEE;color:#D32F2F;font-size:11px;' : 'color:#999;font-size:11px;'}">${this.formatDate(u.baja_fecha)}</td>
            <td class="admin-muted">${this.esc((u.device_id || '').slice(0, 24))}</td>
            <td style="white-space:nowrap;">
              <button class="admin-action-btn btn-verify" data-id="${u.id}" data-val="${u.is_verified ? 1 : 0}" title="${u.is_verified ? 'Quitar verificación' : 'Verificar usuario'}" style="background:${u.is_verified ? '#4CAF50' : '#9E9E9E'};color:white;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:0.75rem;margin:2px;">
                ${u.is_verified ? '✅ Verif.' : '⏳ Verificar'}
              </button>
              <button class="admin-action-btn btn-block" data-id="${u.id}" data-val="${u.is_blocked ? 1 : 0}" title="${u.is_blocked ? 'Desbloquear' : 'Bloquear usuario'}" style="background:${u.is_blocked ? '#FF9800' : '#607D8B'};color:white;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:0.75rem;margin:2px;">
                ${u.is_blocked ? '🔓 Desbloquear' : '🔒 Bloquear'}
              </button>
              <button class="admin-action-btn btn-stolen" data-id="${u.id}" data-val="${u.is_stolen ? 1 : 0}" title="${u.is_stolen ? 'Quitar extravío' : 'Marcar extraviado'}" style="background:${u.is_stolen ? '#E53935' : '#78909C'};color:white;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:0.75rem;margin:2px;">
                ${u.is_stolen ? '🚨 Extraviado' : '📱 Normal'}
              </button>
              <button class="admin-action-btn btn-delete" data-id="${u.id}" data-nombre="${this.esc(u.nickname || u.nombre)}" title="Eliminar usuario permanentemente" style="background:#D32F2F;color:white;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:0.75rem;margin:2px;">
                🗑️ Eliminar
              </button>
            </td>
          </tr>`
            )
            .join('')}
          </tbody></table></div>`;
        box.innerHTML = html;
        this.bindDownloads(box);

        // ── Botones de acción de usuarios ──
        box.querySelectorAll('.btn-verify').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const current = parseInt(btn.dataset.val);
            const nuevo = current ? 0 : 1;
            const accion = nuevo ? 'VERIFICAR' : 'QUITAR verificación de';
            if (!confirm(`¿${accion} este usuario?`)) return;
            try {
              await API.adminVerifyUsuario(id, nuevo, this.token);
              this.loadTab();
            } catch(e) { alert('Error: ' + e.message); }
          });
        });

        box.querySelectorAll('.btn-block').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const current = parseInt(btn.dataset.val);
            const nuevo = current ? 0 : 1;
            const accion = nuevo ? 'BLOQUEAR' : 'DESBLOQUEAR';
            if (!confirm(`¿${accion} este usuario?`)) return;
            try {
              await API.adminToggleBlockUsuario(id, nuevo, this.token);
              this.loadTab();
            } catch(e) { alert('Error: ' + e.message); }
          });
        });

        box.querySelectorAll('.btn-stolen').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const current = parseInt(btn.dataset.val);
            const nuevo = current ? 0 : 1;
            const accion = nuevo ? 'marcar como EXTRAVIADO' : 'marcar como NORMAL';
            if (!confirm(`¿Deseas ${accion} el dispositivo de este usuario?`)) return;
            try {
              await API.adminToggleStolenUsuario(id, nuevo, this.token);
              this.loadTab();
            } catch(e) { alert('Error: ' + e.message); }
          });
        });

        box.querySelectorAll('.btn-delete').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const nombre = btn.dataset.nombre;
            if (!confirm(`⚠️ ¿Eliminar PERMANENTEMENTE al usuario "${nombre}" (ID: ${id})?\n\nEsta acción no se puede deshacer.`)) return;
            try {
              await API.adminDeleteUsuario(id, this.token);
              this.toast(`Usuario "${nombre}" eliminado.`);
              this.loadTab();
            } catch(e) { alert('Error al eliminar: ' + e.message); }
          });
        });

        await this.drawChart('adminChartCanvas', this.lineChart('Usuarios / día', analytics.registrosDia, '#2EC4B6', 'rgba(46,196,182,0.12)'));
        return;
      }

      if (this.currentTab === 'muro') {
        const data = await API.adminGetMuro(this.token);
        html = `
          <div class="admin-toolbar">
            ${this.exportBtn('/api/admin/export/muro', 'planilla_muro_comunitario.csv', 'Planilla del muro (.csv)')}
          </div>
          ${this.chartBlock('Publicaciones en el muro por día (14 días)')}
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Fecha</th><th>Autor</th><th>Tel</th><th>Contenido</th>
          </tr></thead><tbody>
          ${data
            .map(
              (m) => `<tr>
            <td>${this.esc(m.id)}</td>
            <td>${this.formatDate(m.created_at)}</td>
            <td>${this.esc(m.autor)}</td>
            <td>${this.esc(m.autor_telefono)}</td>
            <td>${this.esc(this.trunc(m.contenido, 200))}</td>
          </tr>`
            )
            .join('')}
          </tbody></table></div>`;
        box.innerHTML = html;
        this.bindDownloads(box);
        await this.drawChart('adminChartCanvas', this.lineChart('Posts / día', analytics.muroDia, '#673AB7', 'rgba(103,58,183,0.12)'));
        return;
      }

      if (this.currentTab === 'buzon') {
        const data = await API.adminGetMensajes(this.token);
        html = `
          <div class="admin-toolbar">
            ${this.exportBtn('/api/admin/export/mensajes', 'planilla_buzon_mensajes.csv', 'Planilla buzón (.csv)')}
          </div>
          ${this.chartBlock('Mensajes al buzón por día (14 días)')}
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Fecha</th><th>Usuario</th><th>Tel</th><th>Leído</th><th>Mensaje</th>
          </tr></thead><tbody>
          ${data
            .map(
              (m) => `<tr>
            <td>${this.esc(m.id)}</td>
            <td>${this.formatDate(m.created_at)}</td>
            <td>${this.esc(m.nombre)}</td>
            <td>${this.esc(m.telefono)}</td>
            <td>${this.yn(m.leido)}</td>
            <td>${this.esc(this.trunc(m.mensaje, 240))}</td>
          </tr>`
            )
            .join('')}
          </tbody></table></div>`;
        box.innerHTML = html;
        this.bindDownloads(box);
        await this.drawChart('adminChartCanvas', this.lineChart('Mensajes / día', analytics.buzonDia, '#1976D2', 'rgba(25,118,210,0.12)'));
        return;
      }

      if (this.currentTab === 'ubicación') {
        const data = await API.adminGetRastreo(this.token);
        html = `
          <div class="admin-toolbar">
            ${this.exportBtn('/api/admin/export/ubicación', 'planilla_ubicación_extravios.csv', 'Planilla ubicación (.csv)')}
          </div>
          ${this.chartBlock('Puntos de ubicación registrados por día (14 días)')}
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Fecha</th><th>Usuario</th><th>Tel</th><th>Lat</th><th>Lng</th><th>Mapa</th>
          </tr></thead><tbody>
          ${data
            .map(
              (r) => `<tr>
            <td>${this.esc(r.id)}</td>
            <td>${this.formatDate(r.created_at)}</td>
            <td>${this.esc(r.nombre)}</td>
            <td>${this.esc(r.telefono)}</td>
            <td>${this.esc(r.latitud)}</td>
            <td>${this.esc(r.longitud)}</td>
            <td>${this.mapBtn(r.latitud, r.longitud)}</td>
          </tr>`
            )
            .join('')}
          </tbody></table></div>`;
        box.innerHTML = html;
        this.bindDownloads(box);
        await this.drawChart('adminChartCanvas', this.lineChart('Rastreos / día', analytics.ubicaciónDia, '#E65100', 'rgba(230,81,0,0.12)'));
        return;
      }

      if (this.currentTab === 'reportes') {
        const data = await API.adminGetReportes(this.token);
        html = `
          <div class="admin-toolbar">
            ${this.exportBtn('/api/admin/export/reportes', 'planilla_reportes_ciudadanos.csv', 'Planilla reportes (.csv)')}
          </div>
          <h4 style="margin:12px 0 4px;font-size:0.95rem;">Reportes por día (14 días)</h4>
          <div class="admin-chart-box"><canvas id="adminChartCanvas"></canvas></div>
          <h4 style="margin:12px 0 4px;font-size:0.95rem;">Por tipo</h4>
          <div class="admin-chart-box"><canvas id="adminChartCanvas2"></canvas></div>
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Ubicación texto</th><th>Lat</th><th>Lng</th><th>Mapa</th><th>Contacto</th><th>Tel</th>
          </tr></thead><tbody>
          ${data
            .map(
              (r) => `<tr>
            <td>${this.esc(r.id)}</td>
            <td>${this.formatDate(r.created_at)}</td>
            <td>${this.esc(r.tipo_reporte)}</td>
            <td>${this.esc(this.trunc(r.detalles, 120))}</td>
            <td>${this.esc(this.trunc(r.ubicacion_texto, 80))}</td>
            <td>${this.esc(r.latitud)}</td>
            <td>${this.esc(r.longitud)}</td>
            <td>${this.mapBtn(r.latitud, r.longitud)}</td>
            <td>${this.esc(r.nombre_contacto)}</td>
            <td>${this.esc(r.telefono)}</td>
          </tr>`
            )
            .join('')}
          </tbody></table></div>`;
        box.innerHTML = html;
        this.bindDownloads(box);
        await this.ensureChartJs();
        this.destroyChart();
        const c1 = document.getElementById('adminChartCanvas');
        const c2 = document.getElementById('adminChartCanvas2');
        if (c1 && window.Chart) {
          this._chart = new Chart(c1.getContext('2d'), this.lineChart('Reportes / día', analytics.reportesDia, '#FF6B35', 'rgba(255,107,53,0.12)'));
        }
        if (c2 && window.Chart) {
          this._chart2 = new Chart(c2.getContext('2d'), this.barChart('Por tipo', analytics.reportesTipo, 'tipo', 'n', true));
        }
        return;
      }

      if (this.currentTab === 'emergencias') {
        const data = await API.adminGetEmergencias(this.token);
        html = `
          <div class="admin-toolbar">
            ${this.exportBtn('/api/admin/export/emergencias', 'planilla_emergencias.csv', 'Planilla emergencias (.csv)')}
          </div>
          <h4 style="margin:12px 0 4px;font-size:0.95rem;">Emergencias por día (14 días)</h4>
          <div class="admin-chart-box"><canvas id="adminChartCanvas"></canvas></div>
          <h4 style="margin:12px 0 4px;font-size:0.95rem;">Por institución</h4>
          <div class="admin-chart-box"><canvas id="adminChartCanvas2"></canvas></div>
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
            <th>ID</th><th>Fecha</th><th>Usuario</th><th>Tel</th><th>Institución</th><th>Lat</th><th>Lng</th><th>Mapa</th>
          </tr></thead><tbody>
          ${data
            .map(
              (e) => `<tr>
            <td>${this.esc(e.id)}</td>
            <td>${this.formatDate(e.created_at)}</td>
            <td>${this.esc(e.nombre)}</td>
            <td>${this.esc(e.telefono)}</td>
            <td><b>${this.esc(e.institucion)}</b></td>
            <td>${this.esc(e.latitud)}</td>
            <td>${this.esc(e.longitud)}</td>
            <td>${this.mapBtn(e.latitud, e.longitud)}</td>
          </tr>`
            )
            .join('')}
          </tbody></table></div>`;
        box.innerHTML = html;
        this.bindDownloads(box);
        await this.ensureChartJs();
        this.destroyChart();
        const c1 = document.getElementById('adminChartCanvas');
        const c2 = document.getElementById('adminChartCanvas2');
        if (c1 && window.Chart) {
          this._chart = new Chart(c1.getContext('2d'), this.lineChart('Emergencias / día', analytics.emergenciasDia, '#D32F2F', 'rgba(211,47,47,0.12)'));
        }
        if (c2 && window.Chart) {
          this._chart2 = new Chart(c2.getContext('2d'), this.barChart('Por institución', analytics.emergInst, 'institucion', 'n', true));
        }
        return;
      }
    } catch (e) {
      if (String(e.message).includes('401')) {
        localStorage.removeItem('barrio_admin_token');
        location.reload();
        return;
      }
      box.innerHTML = `<p style="color:red;text-align:center;">Error: ${this.esc(e.message)}</p>`;
    }
  },
};
