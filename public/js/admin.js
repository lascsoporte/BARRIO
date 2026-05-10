// Admin Panel
const Admin = {
 token: localStorage.getItem('barrio_admin_token') || null,
 currentTab: 'locales',

 route(container, hash) {
 if (!this.token) return this.renderLogin(container);
 API.adminNotifyEntry(this.token).catch(()=>{}); this.renderPanel(container);
 },

 renderLogin(container) {
 container.innerHTML = `
 <button class="back-btn" onclick="location.assign('/')">⬅️ Volver</button>
 <div class="admin-login fade-in">
 <h2>🔒 Administración</h2>
 <p style="font-size:0.8rem;color:var(--text-light);margin-bottom:15px;">Se requieren las 3 llaves de seguridad para ingresar.</p>
 <div style="display:flex;flex-direction:column;gap:10px;">
 <input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="password" id="adminPass1" placeholder="Llave 1">
 <input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="password" id="adminPass2" placeholder="Llave 2">
 <input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="password" id="adminPass3" placeholder="Llave 3">
 </div>
 <button class="btn btn-primary" id="adminLoginBtn" style="margin-top:20px;">Ingresar</button>
 <p id="adminError" style="color:var(--danger);margin-top:10px;display:none;"></p>
 </div>
 `;
 const doLogin = async () => {
 const p1 = document.getElementById('adminPass1').value;
 const p2 = document.getElementById('adminPass2').value;
 const p3 = document.getElementById('adminPass3').value;
 try {
 const { token } = await API.adminLogin([p1, p2, p3]);
 this.token = token;
 localStorage.setItem('barrio_admin_token', token);
 API.adminNotifyEntry(this.token).catch(()=>{}); this.renderPanel(container);
 } catch (e) {
 const err = document.getElementById('adminError');
 err.textContent = 'Una o más llaves son incorrectas';
 err.style.display = 'block';
 }
 };
 document.getElementById('adminLoginBtn').addEventListener('click', doLogin);
 },

 async renderPanel(container) {
 container.innerHTML = `
 <div class="fade-in">
 <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px;">
 <h2 style="font-size:1.3rem;">🔧 Panel Admin</h2>
 <button class="btn btn-outline btn-sm" style="width:auto;font-size:0.8rem;" id="logoutBtn">Cerrar Sesión</button>
 </div>
 <div class="admin-tabs">
 <button class="admin-tab ${this.currentTab === 'usuarios' ? 'active' : ''}" data-tab="usuarios">Usuarios</button>
 <button class="admin-tab ${this.currentTab === 'mensajes' ? 'active' : ''}" data-tab="mensajes">Buzón</button>
 <button class="admin-tab ${this.currentTab === 'muro' ? 'active' : ''}" data-tab="muro">Muro</button>
 <button class="admin-tab ${this.currentTab === 'emergencias' ? 'active' : ''}" data-tab="emergencias">Emergencias</button>
 <button class="admin-tab ${this.currentTab === 'rastreo' ? 'active' : ''}" data-tab="rastreo">Rastreo</button>
 <button class="admin-tab ${this.currentTab === 'mascotas' ? 'active' : ''}" data-tab="mascotas">Mascotas</button>
 <button class="admin-tab ${this.currentTab === 'locales' ? 'active' : ''}" data-tab="locales">Locales</button>
 <button class="admin-tab ${this.currentTab === 'productos' ? 'active' : ''}" data-tab="productos">Productos</button>
 <button class="admin-tab ${this.currentTab === 'servicios' ? 'active' : ''}" data-tab="servicios">Servicios</button>
 <button class="admin-tab ${this.currentTab === 'config' ? 'active' : ''}" data-tab="config">Config</button>
 <button class="admin-tab ${this.currentTab === 'stats' ? 'active' : ''}" data-tab="stats">Estadis</button>
 <button class="admin-tab ${this.currentTab === 'seguridad' ? 'active' : ''}" data-tab="seguridad">Claves</button>
 </div>
 <div id="adminContent"><div class="loading"><div class="spinner"></div></div></div>
 </div>
 `;
 document.getElementById('logoutBtn').addEventListener('click', () => {
 this.token = null;
 localStorage.removeItem('barrio_admin_token');
 location.assign('/');
 });
 container.querySelectorAll('.admin-tab').forEach(tab => {
 tab.addEventListener('click', () => {
 this.currentTab = tab.dataset.tab;
 container.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
 tab.classList.add('active');
 this.loadTab();
 });
 });
 this.loadTab();
 },

 async loadTab() {
 const c = document.getElementById('adminContent');
 if (!c) return;
 c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
 try {
 if (this.currentTab === 'locales') await this.renderLocalesTab(c);
 else if (this.currentTab === 'productos') await this.renderProductosTab(c);
 else if (this.currentTab === 'servicios') await this.renderServiciosTab(c);
 else if (this.currentTab === 'mascotas') await this.renderMascotasTab(c);
 else if (this.currentTab === 'mensajes') await this.renderMensajesTab(c);
 else if (this.currentTab === 'muro') await this.renderMuroTab(c);
 else if (this.currentTab === 'usuarios') await this.renderUsuariosTab(c);
 else if (this.currentTab === 'emergencias') await this.renderEmergenciasTab(c);
 else if (this.currentTab === 'rastreo') await this.renderRastreoTab(c);
 else if (this.currentTab === 'config') await this.renderConfigTab(c);
 else if (this.currentTab === 'stats') await this.renderStatsTab(c);
 else if (this.currentTab === 'seguridad') await this.renderSeguridadTab(c);
 } catch (e) {
 if (e.message.includes('401') || e.message.includes('No autorizado')) {
 this.token = null; localStorage.removeItem('barrio_admin_token');
 App.toast('Sesión expirada'); location.hash = '#/admin';
 } else { setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`; }
 }
 },

 // ===== LOCALES TAB =====
 async renderLocalesTab(c) {
 const locales = await API.adminGetLocales(this.token);
 setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `
 <button class="btn btn-primary btn-sm" id="addLocalBtn" style="margin-bottom:16px;">➕ Agregar Local</button>
 <div id="localForm" style="display:none;"></div>
 <div id="localesList">${locales.map(l => `
 <div class="admin-list-item">
 <div class="item-info">
 <div class="item-name">🏪 ${l.nombre}</div>
 <div class="item-detail">${l.direccion} | ${l.horario_apertura}-${l.horario_cierre} | ${l.dias_atencion}</div>
 </div>
 <div class="admin-actions">
 <button class="btn-edit" data-id="${l.id}" data-action="edit-local">✏️</button>
 <button class="btn-delete" data-id="${l.id}" data-action="delete-local">🗑️</button>
 </div>
 </div>
 `).join('')}</div>
 `;
 document.getElementById('addLocalBtn').addEventListener('click', () => this.showLocalForm());
 c.querySelectorAll('[data-action="edit-local"]').forEach(btn => btn.addEventListener('click', () => {
 const l = locales.find(x => x.id == btn.dataset.id);
 this.showLocalForm(l);
 }));
 c.querySelectorAll('[data-action="delete-local"]').forEach(btn => btn.addEventListener('click', async () => {
 if (confirm('¿Eliminar este local y todos sus productos?')) {
 await API.adminDeleteLocal(btn.dataset.id, this.token);
 App.toast('Local eliminado'); this.loadTab();
 }
 }));
 },

 showLocalForm(data = null) {
 const f = document.getElementById('localForm');
 f.style.display = 'block';
 f.innerHTML = `
 <div class="admin-form">
 <h3 style="margin-bottom:12px;">${data ? 'Editar' : 'Nuevo'} Local</h3>
 <div class="form-group"><label>Nombre</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="fNombre" value="${data?.nombre || ''}"></div>
 <div class="form-group"><label>Dirección</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="fDireccion" value="${data?.direccion || ''}"></div>
 <div class="form-row">
 <div class="form-group"><label>Apertura</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="time" id="fApertura" value="${data?.horario_apertura || '08:00'}"></div>
 <div class="form-group"><label>Cierre</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="time" id="fCierre" value="${data?.horario_cierre || '20:00'}"></div>
 </div>
 <div class="form-group"><label>Días</label>
 <select id="fDias"><option value="lun-sab" ${data?.dias_atencion === 'lun-sab' ? 'selected' : ''}>Lun-Sáb</option><option value="lun-dom" ${data?.dias_atencion === 'lun-dom' ? 'selected' : ''}>Lun-Dom</option><option value="lun-vie" ${data?.dias_atencion === 'lun-vie' ? 'selected' : ''}>Lun-Vie</option></select>
 </div>
 <div class="form-check"><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="checkbox" id="fEfectivo" ${data?.acepta_efectivo !== 0 ? 'checked' : ''}><label for="fEfectivo">Acepta Efectivo</label></div>
 <div class="form-check"><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="checkbox" id="fTarjeta" ${data?.acepta_tarjeta ? 'checked' : ''}><label for="fTarjeta">Acepta Tarjeta</label></div>
 <div style="background:var(--bg-light); padding:12px; border-radius:8px; margin-bottom:12px;">
 <label style="font-weight:700; margin-bottom:8px; display:block;">Ubicación (Enlace de Google Maps)</label>
 <div style="display:flex; gap:8px; margin-bottom:8px;">
 <input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="fMapUrl" placeholder="Pega el link aquí (largo o corto)" style="flex:1;">
 <button class="btn btn-secondary btn-sm" id="btnExtractMap" style="width:auto; white-space:nowrap;">Extraer Ubicación</button>
 </div>
 <div class="form-row" style="opacity:0.7; pointer-events:none;">
 <div class="form-group"><label>Latitud</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="fLat" type="number" step="any" value="${data?.latitud || ''}"></div>
 <div class="form-group"><label>Longitud</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="fLng" type="number" step="any" value="${data?.longitud || ''}"></div>
 </div>
 </div>
 <div class="btn-group" style="flex-direction:row;gap:8px;">
 <button class="btn btn-primary btn-sm" id="saveLocal">💾 Guardar</button>
 <button class="btn btn-outline btn-sm" onclick="document.getElementById('localForm').style.display='none'">Cancelar</button>
 </div>
 </div>
 `;
 document.getElementById('btnExtractMap').addEventListener('click', async () => {
 const url = document.getElementById('fMapUrl').value.trim();
 if (!url) return App.toast('Pega un enlace primero');
 const btn = document.getElementById('btnExtractMap');
 btn.textContent = 'Extrayendo...'; btn.disabled = true;
 try {
 const { lat, lng, address } = await API.adminResolveMap(url, this.token);
 document.getElementById('fLat').value = lat;
 document.getElementById('fLng').value = lng;
 if (address) {
 document.getElementById('fDireccion').value = address;
 }
 App.toast('✅ Ubicación capturada');
 } catch (err) {
 App.toast(err.message || 'Error al capturar ubicación');
 }
 btn.textContent = 'Extraer Ubicación'; btn.disabled = false;
 });

 document.getElementById('saveLocal').addEventListener('click', async () => {
 const body = {
 nombre: document.getElementById('fNombre').value,
 direccion: document.getElementById('fDireccion').value,
 horario_apertura: document.getElementById('fApertura').value,
 horario_cierre: document.getElementById('fCierre').value,
 dias_atencion: document.getElementById('fDias').value,
 acepta_efectivo: document.getElementById('fEfectivo').checked,
 acepta_tarjeta: document.getElementById('fTarjeta').checked,
 latitud: document.getElementById('fLat').value,
 longitud: document.getElementById('fLng').value,
 };
 try {
 if (data) await API.adminUpdateLocal(data.id, body, this.token);
 else await API.adminCreateLocal(body, this.token);
 App.toast(data ? 'Local actualizado' : 'Local creado');
 this.loadTab();
 } catch (e) { App.toast('Error: ' + e.message); }
 });
 },

 // ===== PRODUCTOS TAB =====
 async renderProductosTab(c) {
 const [productos, locales] = await Promise.all([API.adminGetProductos(this.token), API.adminGetLocales(this.token)]);
 setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
 <button class="btn btn-primary btn-sm" id="addProdBtn">➕ Agregar Producto</button>
 <button class="btn btn-secondary btn-sm" id="bulkProdBtn">📁 Carga Masiva (CSV)</button>
 </div>
 <div id="bulkForm" style="display:none; background:var(--bg-card); padding:16px; border-radius:12px; margin-bottom:16px;">
 <h3 style="margin-bottom:12px;">Carga Masiva desde Excel</h3>
 <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:12px;">
 1. Descarga la <a href="/plantilla_barrio.xlsx" download style="color:var(--primary);font-weight:bold;">Plantilla Excel</a><br>
 2. Llénala en tu computadora y guárdala (asegúrate de mantenerla ordenada)<br>
 3. Sube el archivo aquí
 </p>
 <div class="form-group"><label>Local de destino</label><select id="bulkLocal">${locales.map(l => `<option value="${l.id}">${l.nombre}</option>`).join('')}</select></div>
 <div class="form-group"><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="file" id="bulkFile" accept=".xlsx, .xls, .csv"></div>
 <div class="btn-group" style="flex-direction:row;gap:8px;">
 <button class="btn btn-primary btn-sm" id="uploadBulkBtn">⬆️ Subir y Guardar</button>
 <button class="btn btn-outline btn-sm" onclick="document.getElementById('bulkForm').style.display='none'">Cancelar</button>
 </div>
 </div>
 <div id="prodForm" style="display:none;"></div>
 <div id="prodList">${productos.map(p => `
 <div class="admin-list-item">
 <div class="item-info">
 <div class="item-name">${p.nombre} ${p.marca ? `<span style="font-size:0.8rem;color:var(--text-light);">(${p.marca})</span>` : ''} - $${p.precio.toLocaleString('es-CL')}/${p.unidad}</div>
 <div class="item-detail">🏪 ${p.local_nombre} | ${p.en_stock ? '✅ Stock' : '❌ Sin stock'}</div>
 </div>
 <div class="admin-actions">
 <button class="btn-edit" data-id="${p.id}" data-action="edit-prod">✏️</button>
 <button class="btn-delete" data-id="${p.id}" data-action="del-prod">🗑️</button>
 </div>
 </div>
 `).join('')}</div>
 `;
 document.getElementById('addProdBtn').addEventListener('click', () => { document.getElementById('bulkForm').style.display='none'; this.showProdForm(locales); });
 document.getElementById('bulkProdBtn').addEventListener('click', () => { document.getElementById('prodForm').style.display='none'; document.getElementById('bulkForm').style.display='block'; });
 
 document.getElementById('uploadBulkBtn').addEventListener('click', async () => {
 const fileInput = document.getElementById('bulkFile');
 if (!fileInput.files || fileInput.files.length === 0) return App.toast('Selecciona un archivo Excel');
 const localId = document.getElementById('bulkLocal').value;
 const file = fileInput.files[0];
 const reader = new FileReader();
 reader.onload = async (e) => {
 try {
 const data = new Uint8Array(e.target.result);
 const workbook = XLSX.read(data, { type: 'array' });
 const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
 const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
 
 const productosToUpload = [];
 // Buscar desde la fila 12 (índice 11) ya que las anteriores tienen encabezados y metadata
 for (let i = 11; i < rows.length; i++) {
 const cols = rows[i];
 if (cols && cols.length >= 3 && cols[0] && cols[0] !== 'TIPO DE PRODUCTO') {
 // Convertir precio asegurándose que sea número, ignorando texto
 const rawPrecio = String(cols[2]).replace(/[^0-9.]/g, '');
 const precioVal = parseFloat(rawPrecio);
 if (!isNaN(precioVal)) {
 productosToUpload.push({
 nombre: String(cols[0]).trim(),
 marca: cols[1] ? String(cols[1]).trim() : '',
 precio: precioVal,
 unidad: cols[3] ? String(cols[3]).trim() : 'kg',
 en_stock: true
 });
 }
 }
 }
 
 if (productosToUpload.length === 0) return App.toast('El archivo no contiene productos válidos');
 
 const btn = document.getElementById('uploadBulkBtn');
 btn.textContent = 'Subiendo...';
 btn.disabled = true;
 await API.adminCreateProductosMasivo({ local_id: localId, productos: productosToUpload }, this.token);
 App.toast('Carga masiva completada');
 this.loadTab();
 } catch (err) {
 console.error(err);
 App.toast('Error al leer el archivo Excel');
 document.getElementById('uploadBulkBtn').textContent = '⬆️ Subir y Guardar';
 document.getElementById('uploadBulkBtn').disabled = false;
 }
 };
 reader.readAsArrayBuffer(file);
 });
 c.querySelectorAll('[data-action="edit-prod"]').forEach(btn => btn.addEventListener('click', () => {
 this.showProdForm(locales, productos.find(x => x.id == btn.dataset.id));
 }));
 c.querySelectorAll('[data-action="del-prod"]').forEach(btn => btn.addEventListener('click', async () => {
 if (confirm('¿Eliminar este producto?')) { await API.adminDeleteProducto(btn.dataset.id, this.token); App.toast('Eliminado'); this.loadTab(); }
 }));
 },

 showProdForm(locales, data = null) {
 const f = document.getElementById('prodForm');
 f.style.display = 'block';
 f.innerHTML = `
 <div class="admin-form">
 <h3 style="margin-bottom:12px;">${data ? 'Editar' : 'Nuevo'} Producto</h3>
 <div class="form-group"><label>Local</label><select id="pLocal">${locales.map(l => `<option value="${l.id}" ${data?.local_id == l.id ? 'selected' : ''}>${l.nombre}</option>`).join('')}</select></div>
 <div class="form-group"><label>Tipo de Producto</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="pNombre" value="${data?.nombre || ''}" placeholder="Ej: Arroz"></div>
 <div class="form-group"><label>Marca (Opcional)</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="pMarca" value="${data?.marca || ''}" placeholder="Ej: Los Chinos"></div>
 <div class="form-row">
 <div class="form-group"><label>Precio ($)</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="pPrecio" type="number" value="${data?.precio || ''}"></div>
 <div class="form-group"><label>Unidad</label><select id="pUnidad"><option value="kg" ${data?.unidad === 'kg' ? 'selected' : ''}>kg</option><option value="litro" ${data?.unidad === 'litro' ? 'selected' : ''}>litro</option><option value="unidad" ${data?.unidad === 'unidad' ? 'selected' : ''}>unidad</option><option value="docena" ${data?.unidad === 'docena' ? 'selected' : ''}>docena</option></select></div>
 </div>
 <div class="form-check"><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="checkbox" id="pStock" ${data?.en_stock !== 0 ? 'checked' : ''}><label for="pStock">En Stock</label></div>
 <div class="btn-group" style="flex-direction:row;gap:8px;">
 <button class="btn btn-primary btn-sm" id="saveProd">💾 Guardar</button>
 <button class="btn btn-outline btn-sm" onclick="document.getElementById('prodForm').style.display='none'">Cancelar</button>
 </div>
 </div>
 `;
 document.getElementById('saveProd').addEventListener('click', async () => {
 const body = { local_id: document.getElementById('pLocal').value, nombre: document.getElementById('pNombre').value, marca: document.getElementById('pMarca').value, precio: document.getElementById('pPrecio').value, en_stock: document.getElementById('pStock').checked, unidad: document.getElementById('pUnidad').value };
 try {
 if (data) await API.adminUpdateProducto(data.id, body, this.token);
 else await API.adminCreateProducto(body, this.token);
 App.toast(data ? 'Producto actualizado' : 'Producto creado'); this.loadTab();
 } catch (e) { App.toast('Error: ' + e.message); }
 });
 },

 // ===== SERVICIOS TAB =====
 async renderServiciosTab(c) {
 const servicios = await API.adminGetServicios(this.token);
 setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `
 <button class="btn btn-primary btn-sm" id="addServBtn" style="margin-bottom:16px;">➕ Agregar Servicio</button>
 <div id="servForm" style="display:none;"></div>
 <div>${servicios.map(s => `
 <div class="admin-list-item">
 <div class="item-info">
 <div class="item-name">🔧 ${s.tipo}</div>
 <div class="item-detail">${s.nombre_prestador} | 📞 ${s.telefono || 'Sin teléfono'}</div>
 </div>
 <div class="admin-actions">
 <button class="btn-edit" data-id="${s.id}" data-action="edit-serv">✏️</button>
 <button class="btn-delete" data-id="${s.id}" data-action="del-serv">🗑️</button>
 </div>
 </div>
 `).join('')}</div>
 `;
 document.getElementById('addServBtn').addEventListener('click', () => this.showServForm());
 c.querySelectorAll('[data-action="edit-serv"]').forEach(btn => btn.addEventListener('click', () => {
 this.showServForm(servicios.find(x => x.id == btn.dataset.id));
 }));
 c.querySelectorAll('[data-action="del-serv"]').forEach(btn => btn.addEventListener('click', async () => {
 if (confirm('¿Eliminar?')) { await API.adminDeleteServicio(btn.dataset.id, this.token); App.toast('Eliminado'); this.loadTab(); }
 }));
 },

 showServForm(data = null) {
 const f = document.getElementById('servForm');
 f.style.display = 'block';
 f.innerHTML = `
 <div class="admin-form">
 <h3 style="margin-bottom:12px;">${data ? 'Editar' : 'Nuevo'} Servicio</h3>
 <div class="form-group"><label>Categoría (Plural)</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="sTipo" value="${data?.tipo || ''}" placeholder="Ej: GASFITERS"></div>
 <div class="form-group"><label>Nombre prestador</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="sNombre" value="${data?.nombre_prestador || ''}"></div>
 <div class="form-group"><label>Teléfono</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="sTelefono" value="${data?.telefono || ''}" placeholder="+569..."></div>
 <div class="btn-group" style="flex-direction:row;gap:8px;">
 <button class="btn btn-primary btn-sm" id="saveServ">💾 Guardar</button>
 <button class="btn btn-outline btn-sm" onclick="document.getElementById('servForm').style.display='none'">Cancelar</button>
 </div>
 </div>
 `;
 document.getElementById('saveServ').addEventListener('click', async () => {
 const body = { tipo: document.getElementById('sTipo').value, nombre_prestador: document.getElementById('sNombre').value, telefono: document.getElementById('sTelefono').value };
 try {
 if (data) await API.adminUpdateServicio(data.id, body, this.token);
 else await API.adminCreateServicio(body, this.token);
 App.toast(data ? 'Servicio actualizado' : 'Servicio creado'); this.loadTab();
 } catch (e) { App.toast('Error: ' + e.message); }
 });
 },

 // ===== MASCOTAS TAB =====
 async renderMascotasTab(c) {
 const mascotas = await API.getMascotas();
   window._tempMascotas = mascotas.map(m => ({ 
     "Nombre Mascota": m.nombre_mascota || m.tipo_animal,
     "Contacto": m.nombre_contacto,
     "Teléfono": m.telefono,
     "Ubicación": m.ubicacion_extravio,
     "Características": m.caracteristicas,
     "Fecha Registro": new Date(m.created_at).toLocaleString()
   }));
 setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
     <h3 style="color:var(--primary); margin:0;">Avisos de Mascotas</h3>
     <button class="btn btn-outline btn-sm" id="dlMascotas">📥 Descargar Planilla</button>
   </div>
 <div id="adminMascotasList">${mascotas.map(m => `
 <div class="admin-list-item" style="flex-direction:column; align-items:flex-start; gap:10px;">
 ${m.foto_base64 ? `<img src="${m.foto_base64}" style="width:100px; height:100px; object-fit:cover; border-radius:8px;">` : '<div style="width:100px; height:100px; background:#EEE; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:0.7rem; color:#999;">Sin Foto</div>'}
 <div class="item-info">
 <div class="item-name">${m.nombre_mascota || m.tipo_animal || 'Mascota'} - ${m.ubicacion_extravio}</div>
 <div class="item-detail">
 <strong>Contacto:</strong> ${m.nombre_contacto} | <strong>Tel:</strong> ${m.telefono}<br>
 <strong>Tipo:</strong> ${m.tipo_animal} | <strong>Características:</strong> ${m.caracteristicas || '-'}<br>
 <small>${new Date(m.created_at).toLocaleString()}</small>
 </div>
 </div>
 <div class="admin-actions">
 <button class="btn-delete" onclick="if(confirm('¿Borrar aviso?')) Admin.deleteMascota(${m.id})">Borrar</button>
 </div>
 </div>
 `).join('') || '<p style="text-align:center;color:var(--text-light);">No hay avisos de mascotas.</p>'}</div>
 `;
 },
 async deleteMascota(id) {
 try { await API.adminDeleteMascota(id, this.token); App.toast('Aviso borrado'); this.loadTab(); }
 catch (e) { App.toast('Error al borrar aviso'); }
 },

 // ===== CONFIG TAB =====
 async renderConfigTab(c) {
 const config = await API.getConfig();
 setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `
 <div class="admin-form">
 <h3 style="margin-bottom:15px; color:var(--primary);">Configuración de Emergencias</h3>
 <p style="font-size:0.85rem; color:#666; margin-bottom:20px;">Edita los números que aparecerán en la sección de Emergencias de la App.</p>


 <h3 style="margin-top:25px; margin-bottom:15px; color:#E65100;">🚨 Teléfonos de Emergencia</h3>
 <div class="form-group">
 <label>Carabineros</label>
 <input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="text" id="confCarabineros" value="${config.tel_carabineros || '133'}" placeholder="Ej: 133">
 </div>
 <div class="form-group">
 <label>Bomberos</label>
 <input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="text" id="confBomberos" value="${config.tel_bomberos || '132'}" placeholder="Ej: 132">
 </div>
 <div class="form-group">
 <label>PDI</label>
 <input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="text" id="confPdi" value="${config.tel_pdi || '134'}" placeholder="Ej: 134">
 </div>
 <div class="form-group">
 <label>Ambulancia</label>
 <input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="text" id="confAmbulancia" value="${config.tel_ambulancia || '131'}" placeholder="Ej: 131">
 </div>
 <div class="form-group">
 <label>Seguridad Ciudadana</label>
 <input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="text" id="confSeguridad" value="${config.tel_seguridad || '1529'}" placeholder="Ej: 1529">
 </div>

 <button class="btn btn-primary" id="btnSaveConfig" style="margin-top:10px;">💾 Guardar Cambios</button>
 </div>
 `;
 document.getElementById('btnSaveConfig').addEventListener('click', async () => {
 const data = {
 tel_carabineros: document.getElementById('confCarabineros').value.trim(),
 tel_bomberos: document.getElementById('confBomberos').value.trim(),
 tel_pdi: document.getElementById('confPdi').value.trim(),
 tel_ambulancia: document.getElementById('confAmbulancia').value.trim(),
 tel_seguridad: document.getElementById('confSeguridad').value.trim()
 };

 const btn = document.getElementById('btnSaveConfig');
 btn.disabled = true; btn.textContent = 'Guardando...';
 try {
 await API.adminUpdateConfig(data, this.token);
 App.toast('Configuración guardada');
 // Update App config locally
 App.config = { ...App.config, ...data };
 } catch (e) { App.toast('Error guardando configuración'); }
 btn.disabled = false; btn.textContent = '💾 Guardar Cambios';
 });
 },

 // ===== SEGURIDAD TAB =====
 async renderSeguridadTab(c) {
 setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `
 <div class="admin-form">
 <h3 style="margin-bottom:15px; color:var(--primary);">🔐 Cambiar Claves de Acceso</h3>
 <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:15px;">Ingresa las 3 claves actuales y las 3 nuevas claves para actualizar el acceso al panel.</p>
 <h4 style="margin-bottom:8px; font-size:0.9rem;">Claves Actuales</h4>
 <div class="form-group"><label>Llave 1 Actual</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="password" id="secOld1" placeholder="Llave 1 actual"></div>
 <div class="form-group"><label>Llave 2 Actual</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="password" id="secOld2" placeholder="Llave 2 actual"></div>
 <div class="form-group"><label>Llave 3 Actual</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="password" id="secOld3" placeholder="Llave 3 actual"></div>
 <h4 style="margin-top:15px; margin-bottom:8px; font-size:0.9rem;">Nuevas Claves</h4>
 <div class="form-group"><label>Nueva Llave 1</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="password" id="secNew1" placeholder="Nueva llave 1"></div>
 <div class="form-group"><label>Nueva Llave 2</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="password" id="secNew2" placeholder="Nueva llave 2"></div>
 <div class="form-group"><label>Nueva Llave 3</label><input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="password" id="secNew3" placeholder="Nueva llave 3"></div>
 <button class="btn btn-primary" id="btnSavePasswords" style="margin-top:10px;">🔐 Guardar Nuevas Claves</button>
 </div>
 `;
 document.getElementById('btnSavePasswords').addEventListener('click', async () => {
 const old1 = document.getElementById('secOld1').value;
 const old2 = document.getElementById('secOld2').value;
 const old3 = document.getElementById('secOld3').value;
 const new1 = document.getElementById('secNew1').value;
 const new2 = document.getElementById('secNew2').value;
 const new3 = document.getElementById('secNew3').value;
 if (!new1 || !new2 || !new3) return App.toast('Las 3 nuevas claves son requeridas');
 const btn = document.getElementById('btnSavePasswords');
 btn.disabled = true; btn.textContent = 'Guardando...';
 try {
 await API.adminChangePasswords({ old_passwords: [old1, old2, old3], new_passwords: [new1, new2, new3] }, this.token);
 App.toast('Claves actualizadas correctamente');
 // Force re-login with new credentials
 this.token = null;
 localStorage.removeItem('barrio_admin_token');
 App.toast('Ingresa nuevamente con las nuevas claves');
 location.hash = '#/admin';
 } catch (e) {
 App.toast(e.message || 'Error al cambiar claves');
 }
 btn.disabled = false; btn.textContent = '🔐 Guardar Nuevas Claves';
 });
 },

 // ===== STATS TAB =====
 async renderStatsTab(c) {
 const stats = await API.adminGetStats(this.token);
 setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `
 <div class="fade-in">
 <h3 style="margin-bottom:20px; color:var(--primary);">📊 Estadísticas de Uso</h3>
 
 <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:24px;">
 <div class="card" style="text-align:center; padding:15px;">
 <div style="font-size:0.8rem; color:var(--text-light);">Visitas Registradas</div>
 <div style="font-size:1.5rem; font-weight:900; color:var(--primary);">${stats.totalVisitas}</div>
 </div>
 <div class="card" style="text-align:center; padding:15px;">
 <div style="font-size:0.8rem; color:var(--text-light);">Usuarios Registrados</div>
 <div style="font-size:1.5rem; font-weight:900; color:var(--success);">${stats.uniqueUsers}</div>
 </div>
 <div class="card" style="text-align:center; padding:15px;">
 <div style="font-size:0.8rem; color:var(--text-light);">Visitas Hoy</div>
 <div style="font-size:1.5rem; font-weight:900; color:#4A90E2;">${stats.visitasHoy}</div>
 </div>
 <div class="card" style="text-align:center; padding:15px;">
 <div style="font-size:0.8rem; color:var(--text-light);">Mascotas Reportadas</div>
 <div style="font-size:1.5rem; font-weight:900; color:#FF9800;">${stats.totalMascotas}</div>
 </div>
 </div>

 <h4 style="margin-bottom:12px; font-size:1rem;">🏪 Locales con más interacción</h4>
 <div class="card" style="padding:10px;">
 ${stats.topLocales.map(l => `
 <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
 <div style="font-weight:700;">${l.nombre}</div>
 <div style="font-size:0.85rem; color:var(--text-light);">
 ${l.calif_count} opiniones | ⭐ ${l.avg_estrellas ? l.avg_estrellas.toFixed(1) : '0'}
 </div>
 </div>
 `).join('') || '<p style="text-align:center; padding:10px;">No hay datos aún.</p>'}
 </div>

 <div style="margin-top:24px; padding:15px; background:rgba(74,144,226,0.1); border-radius:12px; font-size:0.85rem; color:#444;">
 💡 Estas estadísticas te ayudan a entender el crecimiento de <b>BARRIO</b>. Los usuarios únicos se basan en identificadores de dispositivo.
 </div>
 </div>
 `;
 },

 // ===== MENSAJES (BUZÓN) TAB =====
 async renderMensajesTab(c) {
 const mensajes = await API.adminGetMensajes(this.token);
 setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `
 <h3 style="margin-bottom:15px; color:var(--primary);">✉️ Buzón de Mensajes</h3>
 <div id="adminMensajesList">${mensajes.map(m => {
  let displayMessage = m.mensaje;
  const mapRegex = /https:\/\/www\.google\.com\/maps\?q=([\d.-]+),([\d.-]+)|https:\/\/maps\.google\.com\/\?q=([\d.-]+),([\d.-]+)/;
  const match = displayMessage.match(mapRegex);
  
  if (match) {
    const lat = match[1] || match[3];
    const lng = match[2] || match[4];
    const btnHtml = `<br><a href="https://maps.google.com/?q=${lat},${lng}" target="_blank" class="btn btn-primary btn-sm" style="display:inline-flex; margin-top:10px; width:auto; padding:8px 15px;">📍 VER EN MAPA</a>`;
    displayMessage = displayMessage.replace(match[0], btnHtml);
  }
  return `
 <div class="admin-list-item" style="${m.leido ? 'opacity:0.6;' : 'border-left: 4px solid var(--primary);'}">
 <div class="item-info">
 <div class="item-name">${m.nombre || 'Usuario Desconocido'} <span style="font-size:0.8rem; font-weight:normal; color:#666;">(${m.telefono || 'Sin Tel'})</span></div>
 <div class="item-detail" style="color:#222; margin-top:5px; font-size:1rem; font-weight:${m.leido ? 'normal' : 'bold'}; white-space:pre-line;">${displayMessage}</div>
 <div style="font-size:0.75rem; color:#999; margin-top:5px;">${new Date(m.created_at).toLocaleString()}</div>
 </div>
 <div class="admin-actions">
 ${!m.leido ? `<button class="btn btn-outline btn-sm" onclick="Admin.markLeido(${m.id})">Marcar Leído</button>` : ''}
   <button class="btn-delete" style="padding:5px 10px; font-size:0.75rem;" onclick="if(confirm('¿Borrar mensaje del buzón?')) Admin.deleteMensaje(${m.id})">Borrar</button>
 </div>
 </div>
 `}).join('') || '<p style="text-align:center;color:var(--text-light);">Buzón vacío.</p>'}</div>

 `;
 },
 async markLeido(id) {
 try { await API.adminMarkMensaje(id, this.token); this.loadTab(); } catch(e) { App.toast('Error'); }
 },

 // ===== MURO TAB =====
 async renderMuroTab(c) {
 const posts = await API.getMuro();
 setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
 <h3 style="color:var(--primary); margin:0;">💬 Muro Comunitario</h3>
 <button class="btn btn-sm" style="background:#D32F2F; color:white;" onclick="Admin.clearMuro()">🗑️ Limpiar Muro</button>
 </div>
 <div id="adminMuroList">${posts.map(p => `
 <div class="admin-list-item">
 <div class="item-info">
 <div class="item-name">${p.autor} <span style="font-size:0.75rem; color:#999; font-weight:normal;">(${new Date(p.created_at).toLocaleString()})</span></div>
 <div class="item-detail" style="margin-top:5px;">${p.contenido}</div>
 </div>
 <div class="admin-actions">
 <button class="btn-delete" onclick="if(confirm('¿Borrar mensaje?')) Admin.deleteMuroPost(${p.id})">Borrar</button>
 </div>
 </div>
 `).join('') || '<p style="text-align:center;color:var(--text-light);">El muro está vacío.</p>'}</div>
 `;
 },
 async clearMuro() {
 if(confirm('¿Estás seguro de vaciar completamente el muro comunitario?')) {
 try { await API.adminClearMuro(this.token); App.toast('Muro limpiado'); this.loadTab(); } catch(e) { App.toast('Error'); }
 }
 },
 async deleteMuroPost(id) {
 try { await API.adminDeleteMuroPost(id, this.token); App.toast('Mensaje borrado'); this.loadTab(); } catch(e) { App.toast('Error'); }
 },

 // ===== USUARIOS TAB =====
 async renderUsuariosTab(c) {
 const usuarios = await API.adminGetUsuarios(this.token);
 window._tempUsuariosExport = usuarios.map(u => ({ "Nombre": u.nombre || "No especificado", "Telefono": u.telefono || "No especificado", "Fecha": new Date(u.created_at).toLocaleDateString(), "Ubicacion": u.direccion || "No especificada", "Hora de Aceptación": u.terms_accepted ? new Date(u.created_at).toLocaleTimeString() : "No registrada", "Estado de Uso (Condicion)": u.is_blocked ? "Bloqueado" : (u.is_verified ? "Activo" : "En Verificación"), "Terminos y Condiciones": u.terms_accepted ? "Aceptados" : "Pendientes" }));
 setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
 <h3 style="color:var(--primary); margin:0;">👥 Usuarios (${usuarios.length})</h3>
 <button class="btn btn-outline btn-sm" onclick="Admin.downloadCSV(window._tempUsuariosExport, 'usuarios_barrio.csv')">📥 Descargar CSV</button>
 </div>
 <div id="adminUsuariosList">${usuarios.map(u => `
 <div class="admin-list-item" style="${u.is_blocked ? 'background:#ffebee;' : (u.is_verified ? '' : 'background:#e3f2fd;')} border-left: 5px solid ${u.is_blocked ? '#D32F2F' : (u.is_verified ? '#4CAF50' : '#1976D2')};">
 <div class="item-info">
 <div class="item-name">${u.nombre} ${u.is_verified ? '✅' : '⏳'}</div>
 <div class="item-detail">
 <strong>Tel:</strong> ${u.telefono} | <strong>Ubicación:</strong> ${u.direccion || "-"}<br>
 <strong>Términos:</strong> ${u.terms_accepted ? '✅ Aceptados' : '❌ Pendiente'}<br>
 <small>Registro: ${new Date(u.created_at).toLocaleString()}</small>
 </div>
 </div>
 <div class="admin-actions" style="flex-direction:column; gap:5px;">
 ${!u.is_verified ? `<button class="btn-sm" style="background:#4CAF50; color:white;" onclick="Admin.toggleVerifyUsuario(${u.id}, 1)">Aceptar Usuario</button>` : `<button class="btn-sm" style="background:#9E9E9E; color:white;" onclick="Admin.toggleVerifyUsuario(${u.id}, 0)">Quitar Verificación</button>`}
 <button class="btn-sm ${u.is_blocked ? 'btn-primary' : 'btn-delete'}" onclick="Admin.toggleBlockUsuario(${u.id}, ${u.is_blocked ? 0 : 1})">
 ${u.is_blocked ? 'Desbloquear' : 'Bloquear'}
 </button>
 <button class="btn-sm" style="background:${u.is_stolen ? '#2E7D32' : '#F57C00'}; color:white;" onclick="Admin.toggleStolenUsuario(${u.id}, ${u.is_stolen ? 0 : 1})">
 ${u.is_stolen ? 'No está extraviado' : 'Marcar Extraviado'}
 </button>
 <button class="btn-sm" style="background:#222; color:white;" onclick="Admin.deleteUsuario(${u.id})">ELIMINAR DEFINITIVO</button>
 </div>
 </div>
 `).join('') || '<p style="text-align:center;color:var(--text-light);">No hay usuarios.</p>'}</div>
 `;
 },
 async toggleVerifyUsuario(id, is_verified) {
 try { 
 await API.adminVerifyUsuario(id, is_verified, this.token); 
 App.toast('Estado de verificación actualizado'); 
 this.loadTab(); 
 } catch(e) { App.toast('Error al actualizar: ' + e.message); }
 },
 async deleteUsuario(id) {
 if(confirm('¿ELIMINAR DEFINITIVAMENTE A ESTE USUARIO? Se borrarán todos sus registros.')) {
 try { 
 await API.adminDeleteUsuario(id, this.token); 
 App.toast('Usuario eliminado'); 
 this.loadTab(); 
 } catch(e) { App.toast('Error: ' + e.message); }
 }
 },

 async toggleBlockUsuario(id, is_blocked) {

 if(confirm(is_blocked ? '¿Bloquear usuario? No podrá publicar.' : '¿Desbloquear usuario?')) {
 try { await API.adminToggleBlockUsuario(id, is_blocked, this.token); App.toast('Estado actualizado'); this.loadTab(); } catch(e) { App.toast('Error'); }
 }
 },
 async toggleStolenUsuario(id, is_stolen) {
 if(confirm(is_stolen ? '¿Marcar teléfono como extraviado? (Se activará rastreo silencioso al abrir la app)' : '¿Desmarcar estado de extravío?')) {
 try { await API.adminToggleStolenUsuario(id, is_stolen, this.token); App.toast('Estado actualizado'); this.loadTab(); } catch(e) { App.toast('Error'); }
 }
 },

 // ===== EMERGENCIAS TAB =====
 async renderEmergenciasTab(c) {
 const emergencias = await API.adminGetEmergencias(this.token);
 window._tempEmergencias = emergencias.map(e => ({ ...e, "Fecha": new Date(e.created_at).toLocaleDateString(), "Hora": new Date(e.created_at).toLocaleTimeString() }));
 setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
 <h3 style="color:var(--primary); margin:0;">Llamadas de Emergencia</h3>
 <button class="btn btn-outline btn-sm" onclick="Admin.downloadCSV(window._tempEmergencias, 'emergencias_barrio.csv')">Descargar CSV</button>
 </div>
 <div id="adminEmergenciasList">${emergencias.map(e => `
 <div class="admin-list-item">
 <div class="item-info">
 <div class="item-name">${e.institucion} <span style="font-size:0.75rem; color:#999;">(${new Date(e.created_at).toLocaleString()})</span></div>
 <div class="item-detail">
 Llamó: <strong>${e.nombre}</strong> (${e.telefono})<br>
 ${e.latitud ? `Ubicación: <a href="https://maps.google.com/?q=${e.latitud},${e.longitud}" target="_blank" style="color:var(--primary);">Ver en Mapa</a>` : 'Sin ubicación GPS'}
   <div style="margin-top:10px;"><button class="btn-delete" style="padding:5px 10px; font-size:0.75rem;" onclick="if(confirm('¿Borrar registro de emergencia?')) Admin.deleteEmergencia(${e.id})">Borrar</button></div>
 </div>
 </div>
 </div>
 `).join('') || '<p style="text-align:center;color:var(--text-light);">No hay registros de emergencia.</p>'}</div>
 `;
 },

 // ===== RASTREO ROBOS TAB =====
 async renderRastreoTab(c) {
 const rastreos = await API.adminGetRastreo(this.token);
 window._tempRastreos = rastreos.map(r => ({ ...r, "Fecha": new Date(r.created_at).toLocaleDateString(), "Hora": new Date(r.created_at).toLocaleTimeString() }));
 setTimeout(() => {
     const btn = document.getElementById('dlMascotas');
     if(btn) btn.onclick = () => Admin.downloadCSV(window._tempMascotas, 'mascotas_barrio.xlsx');
   }, 100);
   c.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
 <h3 style="color:var(--primary); margin:0;">Rastreo de Extravíos</h3>
 <button class="btn btn-outline btn-sm" onclick="Admin.downloadCSV(window._tempRastreos, 'rastreo_extravios.csv')">Descargar CSV</button>
 </div>
 <div style="margin-bottom:15px; font-size:0.85rem; color:#666;">
 Los puntos de rastreo aparecen aquí si un teléfono fue marcado como "Extraviado" en la pestaña Usuarios y luego intentó abrir la aplicación BARRIO.
 </div>
 <div id="adminRastreoList">${rastreos.map(r => `
 <div class="admin-list-item" style="border-left:4px solid #F57C00;">
 <div class="item-info">
 <div class="item-name">${r.nombre} <span style="font-size:0.75rem; color:#999;">(${new Date(r.created_at).toLocaleString()})</span></div>
 <div class="item-detail">
 Teléfono: <strong>${r.telefono}</strong><br>
 <a href="https://maps.google.com/?q=${r.latitud},${r.longitud}" target="_blank" style="color:var(--primary); display:inline-flex; align-items:center; margin-top:5px; font-weight:bold;">Ver Ubicación Exacta en Mapa</a>
   <div style="margin-top:10px;"><button class="btn-delete" style="padding:5px 10px; font-size:0.75rem;" onclick="if(confirm('¿Borrar registro de rastreo?')) Admin.deleteRastreo(${r.id})">Borrar</button></div>
 </div>
 </div>
 </div>
 `).join('') || '<p style="text-align:center;color:var(--text-light);">No hay ubicaciones registradas.</p>'}</div>
 `;

 },

 // CSV Helper
 
  async deleteMensaje(id) {
    try { await API.adminDeleteMensaje(id, this.token); this.loadTab(); } catch(e) { App.toast('Error al borrar'); }
  },
  async deleteEmergencia(id) {
    try { await API.adminDeleteEmergencia(id, this.token); this.loadTab(); } catch(e) { App.toast('Error al borrar'); }
  },
  async deleteRastreo(id) {
    try { await API.adminDeleteRastreo(id, this.token); this.loadTab(); } catch(e) { App.toast('Error al borrar'); }
  },

  downloadCSV(data, filename) {
 if(!data || !data.length) return App.toast("No hay datos para exportar");

 if (typeof XLSX !== 'undefined') {
   const ws = XLSX.utils.json_to_sheet(data);
   // Auto-size columns based on header length and content
   const cols = Object.keys(data[0]).map(key => ({
     wch: Math.max(key.length, ...data.map(row => String(row[key] || '').length)) + 2
   }));
   ws['!cols'] = cols;
   const wb = XLSX.utils.book_new();
   XLSX.utils.book_append_sheet(wb, ws, "Datos");
   XLSX.writeFile(wb, filename.replace('.csv', '.xlsx'));
   return;
 }

 const replacer = (key, value) => value === null ? '' : value; 
 const header = Object.keys(data[0]);
 const csv = [
 header.join(';'),
 ...data.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(';'))
 ].join('\r\n');
 const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
 const url = window.URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.setAttribute('href', url);
 a.setAttribute('download', filename);
 a.click();
 }
};

