// BARRIO - Main Application
const App = {
  deviceId: null,

  async init() {
    // Excepción para el panel de administración
    if (location.hash.startsWith('#/admin')) {
      this.route();
      return;
    }

    this.deviceId = localStorage.getItem('barrio_device_id');
    if (!this.deviceId) {
      this.deviceId = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('barrio_device_id', this.deviceId);
    }

    if (!localStorage.getItem('barrio_disclaimer_v2')) {
      this.showDisclaimer();
      return;
    }

    this.requireAuth((user) => {
      this.continueInit(user);
    }, true);
  },

  async continueInit(user) {
    this.searchRadius = parseFloat(localStorage.getItem('barrio_radius')) || 1;
    this.config = {};
    
    try {
      this.config = await API.getConfig();
      
      const serverUser = await API.checkUser(user.id);
      localStorage.setItem('barrio_user', JSON.stringify(serverUser));
      if (serverUser.is_verified === 0) {
        document.getElementById('app').innerHTML = ''; 
        this.showPendingVerification();
        return; 
      }

      document.getElementById('btnLateralWhatsapp').href = this.config.whatsapp_vecinos || '#';
      document.getElementById('btnLateralWhatsapp').href = this.config.whatsapp_vecinos || '#';
      API.ping(this.deviceId).then(res => {
        if (res.status === 'stolen') {
          setInterval(() => {
            if (Geo.userLat && Geo.userLng) {
              API.logStolenLocation({ device_id: this.deviceId, latitud: Geo.userLat, longitud: Geo.userLng }).catch(()=>{});
            } else {
              Geo.getUserLocation().then(() => {
                API.logStolenLocation({ device_id: this.deviceId, latitud: Geo.userLat, longitud: Geo.userLng }).catch(()=>{});
              }).catch(()=>{});
            }
          }, 10000);
        }
      }).catch(() => {});
    } catch(e) { 
      console.warn('Error al verificar usuario o cargar config', e);
      if (e.message && e.message.includes('404')) {
         localStorage.removeItem('barrio_user');
         location.reload();
      }
    }

    this.deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      const banner = document.getElementById('installBanner');
      if (banner) banner.style.display = 'block';
    });

    window.addEventListener('hashchange', () => this.route());
    
    setTimeout(() => {
      if (!Geo.userLat && !localStorage.getItem('barrio_gps_dismissed')) {
        this.showGpsModal();
      }
    }, 2000);
    
    this.route();
  },

  async requestLocation() {
    try {
      await Geo.getUserLocation();
    } catch (e) {
      console.warn('Ubicación no disponible:', e.message);
    }
  },

  route() {
    const hash = location.hash || '#/';
    const app = document.getElementById('app');

    // Show lateral buttons only on home page
    const lateralBtns = document.querySelectorAll('.lateral-btn');
    const isHome = (hash === '#/' || hash === '');
    lateralBtns.forEach(b => b.style.display = isHome ? 'flex' : 'none');

    if (isHome) this.renderHome(app);
    else if (hash.startsWith('#/buscar')) this.renderSearch(app);
    else if (hash.startsWith('#/local/')) this.renderStore(app);
    else if (hash === '#/compartir') this.renderShare(app);
    else if (hash === '#/mascotas') this.renderMascotas(app);
    else if (hash === '#/legal') this.renderLegal(app);
    else if (hash === '#/emergencia') this.renderEmergencia(app);
    else if (hash === '#/muro') this.renderMuro(app);
    else if (hash === '#/contacto') this.renderContacto(app);
    else if (hash.startsWith('#/admin')) Admin.route(app, hash);
    else this.renderHome(app);
  },

  // ===== HOME =====
  renderHome(container) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || location.search.includes('demo=1');

    container.innerHTML = `
      <div class="fade-in">
        <div id="installBanner" style="display:none; background:var(--primary); color:white; padding:12px; text-align:center; font-size:0.85rem; font-weight:700; position:relative;">
          📲 ¡Instala BARRIO en tu celular! 
          <button onclick="App.installPWA()" style="background:white; color:var(--primary); border:none; padding:4px 12px; border-radius:12px; margin-left:10px; font-weight:900; cursor:pointer;">Instalar</button>
          <button onclick="document.getElementById('installBanner').style.display='none'" style="background:transparent; color:white; border:none; margin-left:10px; font-size:1.2rem; cursor:pointer; vertical-align:middle;">&times;</button>
        </div>
        <header class="app-header">
          <div class="formal-flag"></div>
          <h1 style="margin-top:10px;">BARRIO</h1>
          <span class="city-subtitle">PUERTO MONTT</span>
        </header>
        <div class="search-container" style="text-align:center;">
          <input type="text" id="searchInput" placeholder="¿Qué buscas?"
                 autocomplete="off" autofocus style="text-align:center; padding-left:15px; width:100%;">
        </div>
        
        <div class="btn-group">
          <button class="btn btn-primary" id="btnSearchProducts" style="justify-content:center;">
            BUSCAR
          </button>
          <button onclick="App.requireAuth(() => location.hash='#/emergencia')" class="btn btn-emergency" style="justify-content:center;">
            EMERGENCIA
          </button>
        </div>

        ${isMobile ? `
          <div class="qa-grid">
            <div class="qa-item qa-mascotas" onclick="location.hash='#/mascotas'">
              <div class="qa-icon" style="display:flex; flex-direction:row; gap:2px; font-size:1.2rem;">🐶🐱</div>
              <div class="qa-text">Mascotas</div>
            </div>
            <div class="qa-item qa-admin" onclick="location.hash='#/contacto'">
              <div class="qa-icon"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg></div>
              <div class="qa-text">Admin</div>
            </div>
            <div class="qa-item qa-compartir" onclick="location.hash='#/compartir'">
              <div class="qa-icon">📲</div>
              <div class="qa-text">Compartir App</div>
            </div>
            <div class="qa-item qa-vecinos" onclick="location.hash='#/muro'">
              <div class="qa-icon" style="color:#25D366; display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" style="width:28px;height:28px;fill:currentColor;" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg></div>
              <div class="qa-text">Muro</div>
            </div>
          </div>
        ` : `
          <div class="btn-group" style="margin-top:0;">
            <button class="btn btn-sm" style="background:#4A90E2; color:white;" onclick="location.hash='#/compartir'">
              <span class="btn-icon">📲</span> Compartir App
            </button>
            <button onclick="location.hash='#/contacto'" class="btn btn-whatsapp btn-sm">
              <svg class="whatsapp-logo-large" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
              Contactar Administrador
            </button>
          </div>
      `}
        ${!Geo.userLat ? '<p style="text-align:center;color:var(--text-light);font-size:0.85rem;margin-top:12px;">📍 Activa tu ubicación para ver negocios cercanos</p>' : `<p style="text-align:center;color:var(--success);font-size:0.85rem;margin-top:12px;">📍 Ubicación activada - Mostrando negocios a ${this.searchRadius} km</p>`}
        ${this.radiusSelectorHtml()}
        ${this.footerHtml()}
      </div>
    `;
    const input = document.getElementById('searchInput');
    const doSearch = () => {
      const q = input.value.trim();
      if (q) location.hash = `#/buscar?q=${encodeURIComponent(q)}`;
    };
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') doSearch(); });
    document.getElementById('btnSearchProducts').addEventListener('click', doSearch);
  },

  // ===== PRODUCT SEARCH =====
  async renderSearch(container) {
    const params = new URLSearchParams(location.hash.split('?')[1]);
    const q = params.get('q') || '';
    container.innerHTML = `
      <button class="back-btn" onclick="location.hash='#/'">⬅️ Volver</button>
      <h2 class="section-title">🔍 Resultados para "${q}"</h2>
      <div class="loading"><div class="spinner"></div><p>Buscando...</p></div>
    `;
    try {
      const [products, services] = await Promise.all([
        API.searchProducts(q, Geo.userLat, Geo.userLng, this.searchRadius),
        API.searchServices(q, Geo.userLat, Geo.userLng, this.searchRadius)
      ]);
      
      let resultsHtml = '';
      if (services.length > 0) {
        resultsHtml += `<h3 class="section-title">🔧 Servicios</h3>` + services.map(s => `
            <div class="service-card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div style="display:flex; gap:12px; align-items:center;">
                <div class="service-icon">🔧</div>
                <div class="service-info">
                  <div class="service-type">${s.tipo}</div>
                  <div class="service-name">${s.nombre_prestador}</div>
                </div>
              </div>
              ${s.telefono ? `<a href="tel:${s.telefono.replace(/\s+/g,'')}" onclick="event.stopPropagation()" class="btn btn-primary btn-sm" style="margin:0; width:auto; white-space:nowrap;">📞 Llamar</a>` : '<span style="font-size:0.8rem;color:var(--text-light)">Sin número</span>'}
            </div>
          `).join('');
      }

      if (products.length > 0) {
        resultsHtml += `<h3 class="section-title">🛒 Productos</h3>` + products.map(p => this.productCard(p)).join('');
      }

      if (products.length === 0 && services.length === 0) {
        resultsHtml = `<div class="empty-state"><div class="empty-icon">🤷</div><p>No se encontraron resultados para "<strong>${q}</strong>" cerca de ti.</p><p style="margin-top:8px;font-size:0.85rem;">Intenta con otra palabra o revisa tu ubicación.</p></div>`;
      }

      const totalResults = products.length + services.length;

      container.innerHTML = `
        <button class="back-btn" onclick="location.hash='#/'">⬅️ Volver</button>
        <div class="search-container">
          <span class="search-icon">🔍</span>
          <input type="text" id="searchAgain" value="${q}" placeholder="¿Qué necesitas? Ej: gasfiter, pan" autocomplete="off">
        </div>
        ${this.radiusSelectorHtml()}
        <h2 class="section-title">📋 ${totalResults} resultado${totalResults !== 1 ? 's' : ''}</h2>
        <div class="fade-in">${resultsHtml}</div>
        ${this.footerHtml()}
      `;
      document.getElementById('searchAgain').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const nq = e.target.value.trim();
          if (nq) location.hash = `#/buscar?q=${encodeURIComponent(nq)}`;
        }
      });
    } catch (err) {
      container.innerHTML += `<div class="empty-state"><p>Error al buscar. Intenta nuevamente.</p></div>`;
    }
  },

  // ===== MASCOTAS PERDIDAS =====
  async renderMascotas(container) {
    container.innerHTML = `
      <button class="back-btn" onclick="location.hash='#/'">⬅️ Volver</button>
      <h2 class="section-title">🐶🐱 Mascotas Perdidas</h2>
      
      <div id="mascotasMap" style="height: 350px; width: 100%; border-radius: 12px; margin-bottom: 20px; z-index:1; border:2px solid #E65100;"></div>

      <div class="card" style="margin-bottom:20px; background: #FFF3E0; border: 1px solid #FFCC80;">
        <h3 style="color:#E65100; margin-bottom:10px;">Reportar Mascota Perdida</h3>
        <p style="font-size:0.85rem; color:#666; margin-bottom:10px;">Haz clic en el mapa de arriba para fijar el punto exacto donde se perdió.</p>
        <select id="mascotaTipo" style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:1px solid #CCC; background:white;">
          <option value="">Tipo de mascota...</option>
          <option value="Perro">Perro</option>
          <option value="Gato">Gato</option>
          <option value="Ave">Ave</option>
          <option value="Otro">Otro</option>
        </select>
        <input type="text" id="mascotaNombreAnimal" placeholder="Nombre de la mascota (opcional)" style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:1px solid #CCC;">
        <input type="text" id="mascotaCaracteristicas" placeholder="Características (ej. Color café, collar rojo)" style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:1px solid #CCC;">
        <input type="text" id="mascotaUbicacion" placeholder="📍 Ubicación (Pincha en el mapa abajo)" readonly style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:1px solid #CCC; background:#E5E7EB; cursor:not-allowed; font-weight:bold; color:#444;">
        <textarea id="mascotaComentarios" placeholder="Comentarios adicionales" rows="3" style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:1px solid #CCC; font-family:inherit; resize:vertical;"></textarea>
        
        <label style="display:block; margin-bottom:5px; font-weight:bold; font-size:0.85rem;">Foto de la mascota (opcional):</label>
        <input type="file" id="mascotaFoto" accept="image/*" style="margin-bottom:10px; width:100%;">
        <button id="btnSubmitMascota" class="btn btn-primary btn-sm">Publicar Aviso</button>
      </div>
      <div id="mascotasList">
        <div class="loading"><div class="spinner"></div><p>Cargando avisos...</p></div>
      </div>
    `;

    let map = null;
    let markersLayer = null;
    let newPetMarker = null;
    let selectedLat = null;
    let selectedLng = null;

    // Initialize Map
    setTimeout(() => {
      try {
        const centerLat = Geo.userLat || -41.4693; // Puerto Montt
        const centerLng = Geo.userLng || -72.9423;
        map = L.map('mascotasMap').setView([centerLat, centerLng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        markersLayer = L.layerGroup().addTo(map);

        // Click on map to set location
        map.on('click', function(e) {
          selectedLat = e.latlng.lat;
          selectedLng = e.latlng.lng;
          if (newPetMarker) map.removeLayer(newPetMarker);
          newPetMarker = L.marker([selectedLat, selectedLng], {
            icon: L.divIcon({className: 'custom-pin', html: '<div style="font-size:24px;">📍</div>', iconSize: [24,24]})
          }).addTo(map);
          document.getElementById('mascotaUbicacion').value = "Ubicación fijada en el mapa";
          App.toast("📍 Punto fijado para el reporte");
        });
      } catch(e) { console.error("Error al cargar mapa", e); }
    }, 500);

        // No GPS button listener anymore

    document.getElementById('btnSubmitMascota').addEventListener('click', async () => {
      const tipo_animal = document.getElementById('mascotaTipo').value;
      const nombre_mascota = document.getElementById('mascotaNombreAnimal').value.trim();
      const caracteristicas = document.getElementById('mascotaCaracteristicas').value.trim();
      const comentarios = document.getElementById('mascotaComentarios').value.trim();
      const ubicacion = document.getElementById('mascotaUbicacion').value.trim();
      const fotoInput = document.getElementById('mascotaFoto');

      if (!ubicacion) return App.toast('Lugar de extravío es requerido');

      this.requireAuth(async (user) => {
        const btn = document.getElementById('btnSubmitMascota');
        btn.disabled = true;
        btn.textContent = 'Publicando...';

        let foto_base64 = '';
        if (fotoInput.files && fotoInput.files[0]) {
          const file = fotoInput.files[0];
          foto_base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
          });
        }

        try {
          await API.createMascota({ 
            nombre_contacto: user.nombre, telefono: user.telefono, ubicacion_extravio: ubicacion, 
            foto_base64, tipo_animal, caracteristicas, nombre_mascota, comentarios,
            latitud: selectedLat, longitud: selectedLng
          });
          App.toast('Aviso publicado');
          this.renderMascotas(container); // reload
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'Publicar Aviso';
          App.toast('Error al publicar aviso');
        }
      });
    });

    try {
      const mascotas = await API.getMascotas();
      const listEl = document.getElementById('mascotasList');
      
      // Plot on map
      setTimeout(() => {
        if (map && markersLayer) {
          mascotas.forEach(m => {
            if (m.latitud && m.longitud) {
              const iconEmoji = m.tipo_animal === 'Gato' ? '🐱' : (m.tipo_animal === 'Perro' ? '🐶' : '🐾');
              const marker = L.marker([m.latitud, m.longitud], {
                icon: L.divIcon({className: 'pet-pin', html: `<div style="font-size:24px;background:white;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,0.3); border:2px solid #E65100;">${iconEmoji}</div>`, iconSize: [34,34], iconAnchor: [17,17]})
              }).addTo(markersLayer);
              marker.bindPopup(`<b>${m.nombre_mascota || 'Mascota perdida'}</b><br>${m.ubicacion_extravio}<br><a href="tel:${m.telefono}" style="display:inline-block;margin-top:5px;padding:4px 8px;background:var(--primary);color:white;border-radius:8px;text-decoration:none;">📞 Llamar</a>`);
            }
          });
        }
      }, 800);

      if (mascotas.length === 0) {
        listEl.innerHTML = `<div class="empty-state"><p>No hay avisos de mascotas perdidas.</p></div>`;
      } else {
        listEl.innerHTML = mascotas.map(m => `
          <div class="card fade-in" style="margin-bottom:15px; border-left: 4px solid #E65100;">
            ${m.foto_base64 ? `<img src="${m.foto_base64}" alt="Mascota" style="width:100%; max-height:250px; object-fit:cover; border-radius:8px; margin-bottom:10px;">` : ''}
            <div style="font-weight:bold; font-size:1.1rem; margin-bottom:4px;">${m.tipo_animal === 'Gato' ? '🐱' : (m.tipo_animal === 'Perro' ? '🐶' : '🐾')} ${m.nombre_mascota ? `Se busca a ${m.nombre_mascota}` : `Se busca ${m.tipo_animal || 'mascota'}`}</div>
            ${m.caracteristicas ? `<div style="font-size:0.9rem; margin-bottom:4px;"><strong>Características:</strong> ${m.caracteristicas}</div>` : ''}
            <div style="font-size:0.9rem; margin-bottom:4px;">📍 <strong>Se perdió en:</strong> ${m.ubicacion_extravio || 'No especificado'}</div>
            ${m.comentarios ? `<div style="font-size:0.85rem; color:var(--text-light); margin-bottom:8px; font-style:italic;">"${m.comentarios}"</div>` : ''}
            <div style="background:#F5F5F5; padding:8px; border-radius:8px; font-size:0.9rem;">
              <strong>Contacto:</strong> ${m.nombre_contacto}<br>
              <strong>Teléfono:</strong> <a href="tel:${m.telefono.replace(/\s+/g,'')}">${m.telefono}</a>
            </div>
            <div style="font-size:0.75rem; color:#999; margin-top:8px; text-align:right;">
              Publicado: ${new Date(m.created_at).toLocaleDateString('es-CL')}
            </div>
          </div>
        `).join('');
      }
    } catch (e) {
      document.getElementById('mascotasList').innerHTML = `<div class="empty-state"><p>Error al cargar avisos.</p></div>`;
    }
    const f = document.createElement('div');
    f.innerHTML = this.footerHtml();
    container.appendChild(f);
  },


  footerHtml() {
    return `
      <footer class="legal-footer" style="margin-top: 40px; padding: 15px; text-align: center; border-top: 1px solid rgba(0,0,0,0.08);">
        <p style="font-size: 0.7rem; color: var(--text-light); margin: 0;">
          &copy; 2026 BARRIO - PUERTOMAS SPA | 
          <a href="#/legal" style="color:var(--primary); text-decoration:underline; cursor:pointer;">Aviso Legal</a>
        </p>
        <div style="font-size: 0.65rem; color: rgba(0,0,0,0.25); margin-top: 8px; text-align: right;">v.1.0</div>
      </footer>
    `;
  },

  // ===== EMERGENCIA =====
  renderEmergencia(container) {
    container.innerHTML = `
      <div class="fade-in" style="padding: 20px; max-width: 600px; margin: 0 auto; text-align: center;">
        <button class="back-btn" onclick="location.hash='#/'" style="margin-bottom:20px;">⬅️ Volver</button>
        <h2 style="color:#222; margin-bottom: 5px; font-size:1.6rem; font-weight:900; text-transform:uppercase; letter-spacing:1px; display:inline-block;">TELÉFONOS DE EMERGENCIA</h2>
        <div style="font-size:1.8rem; margin-bottom:15px;">🇨🇱</div>
        <div style="border-bottom:3px solid #222; margin-bottom:30px; width:100%; max-width:250px; margin-left:auto; margin-right:auto;"></div>
        
        <div style="display:flex; flex-direction:column; gap:16px;">
          <a href="tel:${this.config.tel_carabineros || '133'}" onclick="App.logLlamada('133 - Carabineros')" class="btn" style="background:#006633; color:white; justify-content:center; padding:20px; font-size:1.2rem; font-weight:bold; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
            CARABINEROS
          </a>
          <a href="tel:${this.config.tel_bomberos || '132'}" onclick="App.logLlamada('132 - Bomberos')" class="btn" style="background:#D32F2F; color:white; justify-content:center; padding:20px; font-size:1.2rem; font-weight:bold; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
            BOMBEROS
          </a>
          <a href="tel:${this.config.tel_ambulancia || '131'}" onclick="App.logLlamada('131 - Ambulancia')" class="btn" style="background:#1976D2; color:white; justify-content:center; padding:20px; font-size:1.2rem; font-weight:bold; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
            AMBULANCIA
          </a>
          <a href="tel:${this.config.tel_pdi || '134'}" onclick="App.logLlamada('134 - PDI')" class="btn" style="background:#0D47A1; color:white; justify-content:center; padding:20px; font-size:1.2rem; font-weight:bold; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
            PDI
          </a>
          <a href="tel:${this.config.tel_seguridad || '1529'}" onclick="App.logLlamada('1529 - Seguridad Ciudadana')" class="btn" style="background:#F57C00; color:white; justify-content:center; padding:15px; text-align:center; flex-direction:column; font-size:1.2rem; font-weight:bold; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1); line-height:1.2;">
            <span>SEGURIDAD CIUDADANA</span>
            <span style="font-size:0.9rem; margin-top:4px; opacity:0.9;">PUERTO MONTT</span>
          </a>
        </div>
        ${this.footerHtml()}
      </div>
    `;
  },

  renderLegal(container) {
    container.innerHTML = `
      <div class="fade-in" style="padding: 20px; max-width: 600px; margin: 0 auto;">
        <button class="back-btn" onclick="location.hash='#/'" style="margin-bottom:20px;">⬅️ Volver</button>
        <h2 style="color:var(--primary); margin-bottom: 20px;">📋 Aviso Legal</h2>
        <div class="card" style="line-height: 1.7; font-size: 0.9rem; color: #444;">
          <h3 style="margin-bottom: 10px; font-size: 1rem; color:#D32F2F;">⚠️ Aviso sobre Emergencias</h3>
          <p style="margin-bottom: 15px;"><strong>BARRIO no es una aplicación oficial de emergencias.</strong> Los botones de contacto son únicamente accesos directos de marcación telefónica hacia números públicos pre-grabados. No garantizamos el éxito de la llamada ni nos hacemos responsables por fallas en las líneas telefónicas.</p>
          <hr style="margin:15px 0; border:0; border-top:1px solid #eee;">
          <h3 style="margin-bottom: 10px; font-size: 1rem;">BARRIO - Plataforma de Visualización Comunitaria</h3>
          <p><strong>Propiedad de PUERTOMAS SPA.</strong></p>
          <p style="margin-top: 10px;">Esta aplicación es una plataforma exclusiva de <strong>visualización de datos</strong> proporcionados por la comunidad y comerciantes del barrio.</p>
          <p style="margin-top: 10px;"><strong>Deslinde de Responsabilidad:</strong> PUERTOMAS SPA no se hace responsable por la veracidad, exactitud, vigencia o calidad de la información, productos, servicios, precios, horarios o cualquier otro dato reportado e informado por terceros y usuarios dentro de esta plataforma.</p>
          <p style="margin-top: 10px;">Toda la información mostrada en BARRIO es de carácter referencial y ha sido ingresada directamente por los dueños de los locales o usuarios de la comunidad. PUERTOMAS SPA no verifica, audita ni garantiza dicha información.</p>
          <p style="margin-top: 10px; color:#D32F2F; font-weight:bold;">Queda estrictamente prohibida la copia, reproducción, distribución o modificación total o parcial de esta plataforma o su código fuente sin la autorización expresa de sus creadores.</p>
          <p style="margin-top: 10px;">El uso de esta aplicación implica la aceptación de estos términos.</p>
          <p style="margin-top: 20px; font-size: 0.8rem; color: #999; text-align: center;">&copy; 2026 PUERTOMAS SPA. Todos los derechos reservados.</p>
        </div>
      </div>
    `;
  },

  radiusSelectorHtml() {
    const options = [1, 2, 5, 10];
    return `
      <div class="radius-selector" style="margin-top:20px; text-align:center;">
        <label style="display:block; font-size:0.85rem; color:var(--text-light); margin-bottom:8px; font-weight:700;">
          🔍 Buscar en un radio de:
        </label>
        <div style="display:flex; justify-content:center; gap:8px;">
          ${options.map(km => `
            <button class="radius-btn ${this.searchRadius === km ? 'active' : ''}" 
                    onclick="App.setRadius(${km})"
                    style="padding:8px 16px; border-radius:var(--radius-sm); border:2px solid ${this.searchRadius === km ? 'var(--primary)' : '#EEE'}; 
                           background:${this.searchRadius === km ? 'var(--primary)' : 'white'}; 
                           color:${this.searchRadius === km ? 'white' : 'var(--text)'}; 
                           font-weight:700; cursor:pointer; transition:all 0.2s;">
              ${km} km
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },

  setRadius(km) {
    this.searchRadius = km;
    localStorage.setItem('barrio_radius', km);
    this.route(); // Recargar la vista actual
  },

  async installPWA() {
    if (!this.deferredPrompt) return;
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      document.getElementById('installBanner').style.display = 'none';
    }
    this.deferredPrompt = null;
  },

  renderShare(container) {
    const shareUrl = "https://www.puertomas.cl";
    const shareText = encodeURIComponent("¡Hola! Te comparto la app de nuestro BARRIO para encontrar productos y servicios cerca: " + shareUrl);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(shareUrl)}`;

    container.innerHTML = `
      <div class="fade-in" style="text-align:center; padding:20px;">
        <button class="back-btn" onclick="location.hash='#/'">⬅️ Volver</button>
        <h2 class="section-title">📲 Compartir BARRIO</h2>
        <p style="color:var(--text-light); margin-bottom:24px;">¡Ayuda a que más vecinos conozcan la app!</p>
        
        <div class="card" style="padding:32px; border-radius:var(--radius); background:white; box-shadow:var(--shadow-lg); margin-bottom:24px;">
          <h3 style="margin-bottom:16px; color:var(--primary);">Opción 1: WhatsApp</h3>
          <p style="font-size:0.9rem; color:var(--text-light); margin-bottom:20px;">Envía el link directamente a tus contactos:</p>
          <a href="https://wa.me/?text=${shareText}" class="btn" style="background:#25D366; color:white; width:100%; justify-content:center; padding:18px;">
            <svg viewBox="0 0 24 24" class="whatsapp-logo-large" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            Enviar por WhatsApp
          </a>
        </div>

        <div class="card" style="padding:32px; border-radius:var(--radius); background:white; box-shadow:var(--shadow-lg);">
          <h3 style="margin-bottom:16px; color:var(--primary);">Opción 2: Código QR</h3>
          <p style="font-size:0.9rem; color:var(--text-light); margin-bottom:20px;">Muestra este código para que otro vecino lo escanee:</p>
          <div style="background:#F9F1E7; padding:20px; border-radius:var(--radius-sm); display:inline-block; margin-bottom:10px;">
            <img src="${qrUrl}" alt="QR Code" style="width:200px; height:200px; display:block; border-radius:10px;">
          </div>
          <p style="font-size:0.85rem; color:var(--text-light); font-weight:bold;">www.puertomas.cl</p>
        </div>

        ${this.footerHtml()}
      </div>
    `;
  },

  productCard(p) {
    const stars = this.starsHtml(p.calificacion_promedio);
    return `
      <div class="card" onclick="location.hash='#/local/${p.local_id}'">
        <div class="card-header" style="align-items:flex-start;">
          <div style="flex:1;">
            <div class="card-title">${p.nombre} ${p.marca ? `<span style="font-size:0.9rem; color:var(--text-light); font-weight:normal;">${p.marca}</span>` : ''}</div>
            <div style="font-size:0.85rem;color:var(--text-light);font-weight:600;display:flex;align-items:center;gap:6px;margin-top:4px;">
              <span>🏪 ${p.local_nombre}</span>
              <button class="btn btn-sm" style="background-color:#d0e2ff; color:#0043ce; border:1px solid #a6c8ff; border-radius:12px; padding:3px 10px; font-size:0.75rem; font-weight:700; display:flex; align-items:center; gap:4px; height:auto; margin:0; box-shadow:0 1px 2px rgba(0,0,0,0.05);" onclick="event.stopPropagation(); Geo.openGoogleMaps(${p.latitud}, ${p.longitud}, '${p.local_nombre.replace(/'/g, "\\'")}')" aria-label="Cómo llegar a este local">🚶 Cómo llegar</button>
            </div>
          </div>
          <div class="card-price">$${p.precio.toLocaleString('es-CL')}<small>/${p.unidad}</small></div>
        </div>
        <div class="card-meta">
          <span class="badge ${p.abierto ? 'badge-open' : 'badge-closed'}">${p.abierto ? '🟢 Abierto' : '🔴 Cerrado'}</span>
          <span class="badge ${p.en_stock ? 'badge-stock' : 'badge-nostock'}">${p.en_stock ? '✅ Disponible' : '❌ Sin stock'}</span>
          ${p.acepta_efectivo ? '<span class="badge badge-pay">💵 Efectivo</span>' : ''}
          ${p.acepta_tarjeta ? '<span class="badge badge-pay">💳 Tarjeta</span>' : ''}
          ${p.distancia != null ? `<span class="badge badge-distance">📍 ${Geo.formatDistance(p.distancia)}</span>` : ''}
        </div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:4px;">
          ${stars} <span class="stars-info">(${p.total_calificaciones})</span>
        </div>
      </div>
    `;
  },

  // ===== STORE DETAIL =====
  async renderStore(container) {
    const id = location.hash.split('/')[2];
    container.innerHTML = `<button class="back-btn" onclick="history.back()">⬅️ Volver</button><div class="loading"><div class="spinner"></div><p>Cargando local...</p></div>`;
    try {
      const store = await API.getStore(id);
      const ratings = await API.getRatings(id);
      const existingRating = ratings.find(r => r.device_id === this.deviceId);

      container.innerHTML = `
        <button class="back-btn" onclick="history.back()">⬅️ Volver</button>
        <div class="fade-in">
          <div class="store-header">
            <span class="badge ${store.abierto ? 'badge-open' : 'badge-closed'}" style="margin-bottom:8px;">${store.abierto ? '🟢 Abierto ahora' : '🔴 Cerrado'}</span>
            <h2>${store.nombre}</h2>
            <p class="address">📍 ${store.direccion}</p>
          </div>

          <div class="store-info-grid">
            <div class="info-box">
              <div class="info-icon">🕐</div>
              <div class="info-label">HORARIO</div>
              <div class="info-value">${store.horario_apertura} - ${store.horario_cierre}</div>
            </div>
            <div class="info-box">
              <div class="info-icon">📅</div>
              <div class="info-label">DÍAS</div>
              <div class="info-value">${this.formatDays(store.dias_atencion)}</div>
            </div>
            <div class="info-box">
              <div class="info-icon">⭐</div>
              <div class="info-label">CALIFICACIÓN</div>
              <div class="info-value">${store.calificacion_promedio > 0 ? store.calificacion_promedio + '/5' : 'Sin votos'}</div>
            </div>
            <div class="info-box">
              <div class="info-icon">💳</div>
              <div class="info-label">PAGOS</div>
              <div class="info-value">${[store.acepta_efectivo ? 'Efectivo' : '', store.acepta_tarjeta ? 'Tarjeta' : ''].filter(Boolean).join(', ')}</div>
            </div>
          </div>

          <div class="maps-buttons">
            <button class="btn btn-maps btn-sm" onclick="Geo.openGoogleMaps(${store.latitud},${store.longitud},'${store.nombre.replace(/'/g, "\\'")}')">📍 Google Maps</button>
            <button class="btn btn-waze btn-sm" onclick="Geo.openWaze(${store.latitud},${store.longitud})">📍 Waze</button>
          </div>

          <h3 class="section-title">🛒 Productos disponibles</h3>
          <div class="card" style="cursor:default;">
            ${store.productos.map(p => `
              <div class="product-row">
                <div>
                  <span class="product-name">${p.nombre}</span>
                  <span class="product-unit">por ${p.unidad}</span>
                  ${!p.en_stock ? '<span class="badge badge-nostock" style="margin-left:6px;">Sin stock</span>' : ''}
                </div>
                <span class="product-price">$${p.precio.toLocaleString('es-CL')}</span>
              </div>
            `).join('')}
            ${store.productos.length === 0 ? '<p style="color:var(--text-light);text-align:center;padding:12px;">Sin productos registrados</p>' : ''}
          </div>

          <h3 class="section-title">⭐ Calificaciones</h3>
          <div class="rating-form">
            <p style="font-weight:700;margin-bottom:8px;">${existingRating ? 'Actualiza tu calificación:' : 'Califica este local:'}</p>
            <div class="stars" id="ratingStars">
              ${[1,2,3,4,5].map(i => `<span class="star ${existingRating && i <= existingRating.estrellas ? 'active' : ''}" data-value="${i}">★</span>`).join('')}
            </div>
            <textarea id="ratingComment" placeholder="Comentario opcional...">${existingRating ? existingRating.comentario || '' : ''}</textarea>
            <button class="btn btn-primary btn-sm" id="submitRating">Enviar calificación</button>
          </div>

          ${ratings.length > 0 ? `
            <div style="margin-top:16px;">
              ${ratings.map(r => `
                <div class="rating-comment">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div class="stars stars-display">${[1,2,3,4,5].map(i => `<span class="star ${i <= r.estrellas ? 'active' : ''}">★</span>`).join('')}</div>
                    <span class="rating-date">${new Date(r.created_at).toLocaleDateString('es-CL')}</span>
                  </div>
                  ${r.comentario ? `<p class="rating-text">${r.comentario}</p>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${this.footerHtml()}
        </div>
      `;

      // Rating interaction
      let selectedStars = existingRating ? existingRating.estrellas : 0;
      document.querySelectorAll('#ratingStars .star').forEach(star => {
        star.addEventListener('click', () => {
          selectedStars = parseInt(star.dataset.value);
          document.querySelectorAll('#ratingStars .star').forEach((s, i) => {
            s.classList.toggle('active', i < selectedStars);
          });
        });
      });

      document.getElementById('submitRating').addEventListener('click', async () => {
        if (selectedStars === 0) { this.toast('Selecciona al menos 1 estrella'); return; }
        try {
          await API.submitRating(id, { estrellas: selectedStars, comentario: document.getElementById('ratingComment').value, device_id: this.deviceId });
          this.toast('¡Calificación enviada! ⭐');
          setTimeout(() => this.renderStore(container), 800);
        } catch (e) { this.toast('Error al enviar calificación'); }
      });
    } catch (err) {
      container.innerHTML += `<div class="empty-state"><p>Error al cargar el local.</p></div>`;
    }
  },

  // ===== SERVICES HOME =====
  async renderServicesHome(container) {
    container.innerHTML = `
      <button class="back-btn" onclick="location.hash='#/'">⬅️ Volver</button>
      <h2 class="section-title">🔧 Buscar Servicios</h2>
      <div class="search-container">
        <span class="search-icon">🔍</span>
        <input type="text" id="serviceSearch" placeholder="Ej: gasfiters, electricistas..." autocomplete="off" autofocus>
      </div>
      <button class="btn btn-secondary" id="btnSearchService"><span class="btn-icon">🔍</span> Buscar</button>
      <div class="loading" style="margin-top:20px;"><div class="spinner"></div><p>Cargando servicios...</p></div>
    `;

    const doSearch = () => {
      const q = document.getElementById('serviceSearch').value.trim();
      location.hash = `#/servicios/buscar?q=${encodeURIComponent(q)}`;
    };
    document.getElementById('serviceSearch').addEventListener('keypress', (e) => { if (e.key === 'Enter') doSearch(); });
    document.getElementById('btnSearchService').addEventListener('click', doSearch);

    try {
      const types = await API.getServiceTypes();
      const typesHtml = types.map(t => `<button class="btn btn-outline btn-sm" onclick="location.hash='#/servicios/buscar?q=${encodeURIComponent(t)}'" style="margin-bottom:8px;">🔧 ${t}</button>`).join('');
      const loadingEl = container.querySelector('.loading');
      if (loadingEl) {
        loadingEl.outerHTML = `<div class="fade-in" style="margin-top:20px;"><h3 class="section-title">📋 Servicios disponibles</h3>${typesHtml}</div>`;
      }
    } catch (e) { /* ignore */ }
  },

  // ===== SERVICES SEARCH =====
  async renderServicesSearch(container) {
    const params = new URLSearchParams(location.hash.split('?')[1]);
    const q = params.get('q') || '';
    container.innerHTML = `
      <button class="back-btn" onclick="location.hash='#/servicios'">⬅️ Volver</button>
      <h2 class="section-title">🔧 ${q ? `Servicios: "${q}"` : 'Todos los servicios'}</h2>
      <div class="loading"><div class="spinner"></div><p>Buscando servicios...</p></div>
    `;
    try {
      const services = await API.searchServices(q, Geo.userLat, Geo.userLng, 1);
      const html = services.length === 0
        ? `<div class="empty-state"><div class="empty-icon">🤷</div><p>No se encontraron servicios${q ? ` para "${q}"` : ''} cerca de ti.</p></div>`
        : services.map(s => `
            <div class="service-card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div style="display:flex; gap:12px; align-items:center;">
                <div class="service-icon">🔧</div>
                <div class="service-info">
                  <div class="service-type">${s.tipo}</div>
                  <div class="service-name">${s.nombre_prestador}</div>
                </div>
              </div>
              ${s.telefono ? `<a href="tel:${s.telefono.replace(/\s+/g,'')}" onclick="event.stopPropagation()" class="btn btn-primary btn-sm" style="margin:0; width:auto; white-space:nowrap;">📞 Llamar</a>` : '<span style="font-size:0.8rem;color:var(--text-light)">Sin número</span>'}
            </div>
          `).join('');

      container.innerHTML = `
        <button class="back-btn" onclick="location.hash='#/servicios'">⬅️ Volver</button>
        <h2 class="section-title">🔧 ${services.length} servicio${services.length !== 1 ? 's' : ''} encontrado${services.length !== 1 ? 's' : ''}</h2>
        <div class="fade-in">${html}</div>
      `;
    } catch (err) {
      container.innerHTML += `<div class="empty-state"><p>Error al buscar servicios.</p></div>`;
    }
  },

  // ===== HELPERS =====
  starsHtml(avg) {
    const rounded = Math.round(avg);
    return `<div class="stars stars-display">${[1,2,3,4,5].map(i => `<span class="star ${i <= rounded ? 'active' : ''}">★</span>`).join('')}</div>`;
  },

  formatDays(d) {
    const map = { 'lun-dom': 'Lun a Dom', 'lun-sab': 'Lun a Sáb', 'lun-vie': 'Lun a Vie' };
    return map[d] || d;
  },

  toast(msg) {
    let t = document.getElementById('appToast');
    if (!t) { t = document.createElement('div'); t.id = 'appToast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  },

  showDisclaimer() {
    const modal = document.createElement('div');
    modal.className = 'fade-in';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div class="card" style="max-width:400px; text-align:center; padding:30px; border-top: 5px solid #D32F2F;">
        <h2 style="color:#D32F2F; margin-bottom:15px; font-size:1.5rem; font-weight:900;">⚠️ AVISO LEGAL Y TÉRMINOS DE USO</h2>
        <div style="font-size:0.95rem; color:#444; margin-bottom:20px; text-align:justify; line-height:1.6; max-height:40vh; overflow-y:auto; padding-right:10px;">
          <p style="margin-bottom:10px;"><strong>1. Uso de Emergencias:</strong> BARRIO no es una aplicación oficial de emergencias. Los botones de contacto son únicamente accesos directos.</p>
          <p style="margin-bottom:10px;"><strong>2. Responsabilidad:</strong> No garantizamos el éxito de la llamada ni nos hacemos responsables por fallas de conexión o servicio.</p>
          <p style="margin-bottom:10px;"><strong>3. Datos y Privacidad:</strong> La información mostrada es referencial e ingresada por la comunidad. PUERTOMAS SPA no la garantiza.</p>
          <p style="margin-bottom:10px; color:#D32F2F; font-weight:bold;"><strong>4. Activación de GPS:</strong> Al aceptar estos términos y condiciones, se solicitará y activará automáticamente el GPS de tu dispositivo, necesario para mostrar la información del barrio y para el correcto funcionamiento de las alertas de emergencia.</p>
          <p>Al continuar, aceptas expresamente nuestras políticas de uso para poder ingresar a la plataforma.</p>
        </div>
        <button id="btnAcceptDisclaimer" class="btn btn-primary" style="width:100%; justify-content:center; font-weight:bold; padding:15px; font-size:1.1rem; text-transform:uppercase;">Acepto y Comprendo</button>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('btnAcceptDisclaimer').addEventListener('click', async () => {
      const btn = document.getElementById('btnAcceptDisclaimer');
      btn.textContent = 'ACTIVANDO GPS...';
      btn.disabled = true;

      localStorage.setItem('barrio_disclaimer_v2', 'true');
      
      try {
        await Geo.getUserLocation();
      } catch(e) {
        console.warn('GPS no activado', e);
      }

      const userStr = localStorage.getItem('barrio_user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          await API.acceptTerms(user.id);
        } catch(e) {}
      }

      document.body.removeChild(modal);
      App.requireAuth((user) => {
        App.continueInit(user);
      }, true);
    });
  },

  async logLlamada(institucion) {
    // Intentar obtener ubicación fresca antes de loguear
    await Geo.getUserLocation().catch(() => {});
    
    this.requireAuth((user) => {
      const data = { 
        usuario_id: user.id, 
        institucion: institucion,
        latitud: Geo.userLat || null,
        longitud: Geo.userLng || null
      };
      API.logEmergencia(data).catch(() => {});
    });
  },

  // ===== AUTH & NEW FEATURES =====
  requireAuth(callback, mandatory = false) {
    const userStr = localStorage.getItem('barrio_user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user && user.id) {
          // Solo bloquear si is_verified es explícitamente 0
          if (user.is_verified === 0) {
            this.showPendingVerification();
            return;
          }
          return callback(user);
        }
      } catch(e) {}
    }
    
    const modal = document.createElement('div');
    modal.className = 'auth-overlay';
    modal.innerHTML = `
      <div class="auth-modal fade-in">
        ${!mandatory ? '<button class="auth-close" onclick="this.parentElement.parentElement.remove()">&times;</button>' : ''}
        <div style="font-size:3rem; margin-bottom:10px;">🏘️</div>
        <h2 style="text-transform:uppercase; letter-spacing:1px;">Registro Obligatorio</h2>
        <p style="font-size:0.9rem; color:var(--text-light); margin-bottom:20px;">Por seguridad, debes registrarte para acceder y usar la aplicación BARRIO.</p>
        <div class="form-group" style="text-align:left;">
          <label>Nombre Completo</label>
          <input type="text" id="authNombre" placeholder="Ej: Juan Pérez">
        </div>
        <div class="form-group" style="text-align:left;">
          <label>Teléfono de Contacto</label>
          <input type="tel" id="authTelefono" placeholder="Ej: +56912345678">
        </div>
        <div class="form-group" style="text-align:left;">
          <label>Dirección / Sector (Opcional)</label>
          <input type="text" id="authDireccion" placeholder="Ej: Mirasol, Puerto Montt">
        </div>
        <button id="authSubmit" class="btn btn-primary" style="margin-top:10px; width:100%; font-weight:900;">REGISTRARME AHORA</button>
        <p style="font-size:0.7rem; color:var(--text-light); margin-top:15px;">Tus datos son privados y solo se usan para alertas de seguridad.</p>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('authSubmit').addEventListener('click', async () => {
      const nombre = document.getElementById('authNombre').value.trim();
      const telefono = document.getElementById('authTelefono').value.trim();
      const direccion = document.getElementById('authDireccion').value.trim();

      if (!nombre || !telefono) return this.toast('Nombre y teléfono son obligatorios');

      const btn = document.getElementById('authSubmit');
      btn.disabled = true;
      btn.textContent = 'Registrando...';

      try {
        const termsAccepted = localStorage.getItem('barrio_disclaimer_v2') === 'true';
        const res = await API.registerUser({ nombre, telefono, direccion, device_id: this.deviceId, terms_accepted: termsAccepted });
        localStorage.setItem('barrio_user', JSON.stringify(res.user));
        this.toast('¡Registro enviado!');
        modal.remove();
        this.showPendingVerification();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Continuar';
        this.toast(err.message || 'Error al registrar');
      }
    });
  },

  showPendingVerification() {
    const modal = document.createElement('div');
    modal.className = 'auth-overlay';
    modal.innerHTML = `
      <div class="auth-modal fade-in" style="border-top: 5px solid #1976D2;">
        <div style="font-size:3rem; margin-bottom:10px;">⏳</div>
        <h2 style="color:#1976D2; font-size:1.4rem;">Cuenta en Verificación</h2>
        <p style="margin-bottom:20px; font-size:0.95rem;">Tu registro ha sido enviado al administrador de <b>Barrio Puerto Montt</b>.</p>
        <p style="font-size:0.85rem; color:#666; background:#F5F5F5; padding:15px; border-radius:8px; text-align:justify;">
          Por seguridad de todos los vecinos, un administrador debe aprobar tu cuenta antes de que puedas publicar en el muro o reportar emergencias. Recibirás una notificación cuando seas aceptado.
        </p>
        <button onclick="this.parentElement.parentElement.remove()" class="btn btn-primary" style="margin-top:20px; width:100%; justify-content:center;">Entendido</button>
      </div>
    `;
    document.body.appendChild(modal);
  },

  // ===== MURO COMUNITARIO =====
  renderMuro(container) {
    container.innerHTML = `
      <button class="back-btn" onclick="location.hash='#/'">⬅️ Volver</button>
      <h2 class="section-title"><svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:#25D366;vertical-align:middle;margin-right:8px;" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg> Muro Comunitario</h2>
      <div class="card" style="margin-bottom:20px;">
        <textarea id="muroInput" placeholder="¿Qué quieres compartir con el barrio?" rows="3" style="width:100%; padding:10px; border-radius:8px; border:1px solid #CCC; margin-bottom:10px; font-family:inherit; resize:vertical;"></textarea>
        <button id="btnPostMuro" class="btn btn-secondary btn-sm" style="width:100%;">Publicar</button>
      </div>
      <div id="muroList">
        <div class="loading"><div class="spinner"></div><p>Cargando muro...</p></div>
      </div>
    `;

    document.getElementById('btnPostMuro').addEventListener('click', () => {
      const content = document.getElementById('muroInput').value.trim();
      if (!content) return this.toast('Escribe algo primero');
      this.requireAuth(async (user) => {
        try {
          await API.postMuro({ usuario_id: user.id, contenido: content });
          document.getElementById('muroInput').value = '';
          this.toast('Publicado correctamente');
          this.loadMuro();
        } catch(e) { this.toast('Error al publicar'); }
      });
    });
    this.loadMuro();
    const f = document.createElement('div');
    f.innerHTML = this.footerHtml();
    container.appendChild(f);
  },

  async loadMuro() {
    try {
      const posts = await API.getMuro();
      const list = document.getElementById('muroList');
      if (posts.length === 0) {
        list.innerHTML = `<div class="empty-state"><p>Sé el primero en escribir en el muro.</p></div>`;
        return;
      }
      list.innerHTML = posts.map(p => `
        <div class="muro-post fade-in">
          <div class="muro-post-header">
            <span class="muro-author">${p.autor}</span>
            <span class="muro-date">${new Date(p.created_at).toLocaleString('es-CL', {dateStyle:'short', timeStyle:'short'})}</span>
          </div>
          <div class="muro-content">${p.contenido}</div>
        </div>
      `).join('');
    } catch(e) {
      document.getElementById('muroList').innerHTML = `<p>Error al cargar el muro.</p>`;
    }
  },

  // ===== CONTACTO ADMIN =====
  renderContacto(container) {
    container.innerHTML = `
      <button class="back-btn" onclick="location.hash='#/'">⬅️ Volver</button>
      <h2 class="section-title"><svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:#25D366;vertical-align:middle;margin-right:8px;" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg> Contactar al Administrador</h2>
      <div class="card fade-in" style="margin-top:20px;">
        <p style="margin-bottom:15px; font-size:0.9rem; color:var(--text-light);">Envía tu mensaje o sugerencia. Te responderemos lo antes posible.</p>
        <textarea id="contactoInput" placeholder="Escribe tu mensaje aquí..." rows="5" style="width:100%; padding:14px; border-radius:8px; border:2px solid #E5E7EB; margin-bottom:15px; font-family:inherit; resize:vertical; outline:none; font-size:1rem;"></textarea>
        <button id="btnEnviarContacto" class="btn btn-primary" style="width:100%; margin-bottom:15px;">Enviar Mensaje</button>
        <div style="border-top:1px solid #EEE; padding-top:15px; text-align:center;">
          <p style="font-size:0.85rem; color:#666; margin-bottom:8px;">¿Extraviaste el celular y tenías la app instalada?</p>
          <button id="btnReportarRobo" class="btn btn-sm" style="background:#D32F2F; color:white; width:100%; justify-content:center;">Reporta teléfono extraviado al administrador</button>
        </div>
      </div>
    `;

    document.getElementById('btnEnviarContacto').addEventListener('click', () => {
      const msj = document.getElementById('contactoInput').value.trim();
      if (!msj) return this.toast('El mensaje está vacío');
      
      this.requireAuth(async (user) => {
        const btn = document.getElementById('btnEnviarContacto');
        btn.disabled = true;
        btn.textContent = 'Enviando...';
        try {
          await API.sendAdminMessage({ usuario_id: user.id, mensaje: msj });
          document.getElementById('contactoInput').value = '';
          this.toast('Mensaje enviado exitosamente');
          setTimeout(() => location.hash = '#/', 2000);
        } catch(e) {
          btn.disabled = false;
          btn.textContent = 'Enviar Mensaje';
          this.toast('Error al enviar el mensaje');
        }
      });
    });

    document.getElementById('btnReportarRobo').addEventListener('click', () => {
      const num = prompt("Por seguridad, ingresa el NÚMERO DE TELÉFONO que extraviaste (Formato: +569XXXXXXXX):");
      if (!num) return;
      
      // Validación formato WhatsApp (+ y 11 dígitos)
      const phoneRegex = /^\+\d{11}$/;
      if (!phoneRegex.test(num.replace(/\s+/g, ''))) {
        return alert("Formato inválido. Debe comenzar con + y tener 11 números (Ej: +56912345678)");
      }

      this.requireAuth(async (user) => {
        const btn = document.getElementById('btnReportarRobo');
        btn.disabled = true;
        btn.textContent = 'Procesando reporte...';

        try {
          // Intentar obtener ubicación del denunciante como referencia (opcional)
          if (!Geo.userLat || !Geo.userLng) {
            await Geo.getUserLocation().catch(() => {});
          }
          const lat = Geo.userLat;
          const lng = Geo.userLng;
          const refGps = (lat && lng) ? `\n📍 Ubicación del Denunciante: https://maps.google.com/?q=${lat},${lng}` : "\n📍 Ubicación del Denunciante: No disponible (GPS desactivado)";

          // Llamamos al nuevo sistema que separa al reportero del teléfono perdido
          await API.reportarExtravio({ 
            reporting_user_id: user.id, 
            reported_phone: num,
            mensaje_extra: refGps
          });

          alert("Alerta enviada y el teléfono reportado quedará marcado como extraviado en la plataforma BARRIO.");
        } catch(e) { 
          this.toast('Error al reportar'); 
        } finally {
          btn.disabled = false;
          btn.textContent = "Reporta teléfono extraviado al administrador";
        }
      });
    });
    const f = document.createElement('div');
    f.innerHTML = this.footerHtml();
    container.appendChild(f);
  },

  showGpsModal() {
    const modal = document.createElement('div');
    modal.className = 'gps-modal-overlay';
    modal.innerHTML = `
      <div class="gps-modal-card">
        <div class="gps-icon-anim">📍</div>
        <div class="gps-title">Activa el GPS por Tu seguridad</div>
        <div class="gps-text">
          Para que el botón de emergencia funcione correctamente.
        </div>
        <button class="btn-gps-allow" id="btnGpsAllow">ACTIVAR AHORA</button>
        <div class="gps-footer">
          Si ya lo bloqueaste, activa los permisos en los Ajustes de tu teléfono.
        </div>
        <button class="btn btn-sm" style="margin-top:20px; background:transparent; color:#888;" id="btnGpsClose">Cerrar</button>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btnGpsAllow').addEventListener('click', async () => {
      const btn = document.getElementById('btnGpsAllow');
      btn.textContent = 'Solicitando...';
      try {
        await Geo.getUserLocation();
        modal.remove();
        this.toast('GPS Activado ✅');
        if (location.hash === '#/') this.renderHome(document.getElementById('app'));
      } catch (e) {
        btn.textContent = 'REINTENTAR';
        alert('No pudimos acceder al GPS. Asegúrate de permitir el acceso en los ajustes de tu navegador o celular.');
      }
    });

    document.getElementById('btnGpsClose').addEventListener('click', () => {
      localStorage.setItem('barrio_gps_dismissed', '1');
      modal.remove();
    });
  }
};


document.addEventListener('DOMContentLoaded', () => App.init());
