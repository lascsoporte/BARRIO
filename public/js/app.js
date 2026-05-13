// BARRIO - Main Application
const App = {
 deviceId: null,
 deferredPrompt: null,

 async init() {
  const hash = location.hash || '#/';
  if (hash.includes('/admin')) {
    if (typeof Admin === 'undefined') {
       console.error('Admin script not loaded yet');
       setTimeout(() => this.init(), 500);
       return;
    }
    const loader = document.querySelector('.loading-screen') || document.getElementById('loadingScreen');
    if (loader) loader.style.display = 'none';
    Admin.route(document.getElementById('app'), hash);
    return;
  }

  console.log('App: Instando init...');

 this.deviceId = localStorage.getItem('barrio_device_id');
 if (!this.deviceId) {
 this.deviceId = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
 localStorage.setItem('barrio_device_id', this.deviceId);
 }

 if (!localStorage.getItem('barrio_disclaimer_v2')) {
  console.log('App: Disclaimer no aceptado, mostrando...');
  this.showDisclaimer();
  return;
 }
 console.log('App: Disclaimer ya aceptado');

 // Sincronizar el estado de verificación con el servidor antes de bloquear
 const userStr = localStorage.getItem('barrio_user');
 if (userStr) {
  try {
    const localUser = JSON.parse(userStr);
    if (localUser && localUser.id) {
      const serverUser = await API.checkUser(localUser.id);
      localStorage.setItem('barrio_user', JSON.stringify(serverUser));
    }
    } catch(e) {
      console.warn('Sesión no verificada:', e.message);
      // Si el usuario fue eliminado por el admin (404), limpiar todo y reiniciar como nuevo
      if (e.message && e.message.includes('404')) {
        App._fullReset();
        return;
      }
    }
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
  let isTrackingStarted = false;
  const checkExtravio = () => {
    API.ping(this.deviceId, Geo.userLat, Geo.userLng).then(res => {
     if (res.status === 'stolen' && !isTrackingStarted) {
       isTrackingStarted = true;
       setInterval(() => {
         Geo.getUserLocation(true).then(() => {
           API.logStolenLocation({ device_id: this.deviceId, latitud: Geo.userLat, longitud: Geo.userLng }).catch(()=>{});
         }).catch(()=>{});
       }, 10000);
     }
   }).catch(() => {});
 };
 checkExtravio();
 setInterval(checkExtravio, 60000);

 } catch(e) { 
 console.warn('Error al verificar usuario o cargar config', e);
 if (e.message && e.message.includes('404')) {
 App._fullReset();
 return;
 }
 }

  window.addEventListener('hashchange', () => this.route());

  if (!window.__barrioRenderKeepAlive) {
    window.__barrioRenderKeepAlive = true;
    setInterval(() => {
      fetch('/api/ping', { method: 'GET' }).catch(() => {});
    }, 8 * 60 * 1000);
  }
  
  setInterval(() => {
    if (Geo.userLat) API.ping(this.deviceId, Geo.userLat, Geo.userLng).catch(()=>{});
  }, 300000);
 
  // Renderizar la pantalla principal PRIMERO
  this.route();

  // Luego mostrar ventanas en secuencia: GPS → Push → Instalar
  this._runOnboardingSequence(user);
 },

 // Muestra las ventanas emergentes post-registro en orden, una a la vez
 _runOnboardingSequence(user) {
  const steps = [];

  // Paso 1: GPS (si no está activado ni descartado)
  if (!Geo.userLat && !localStorage.getItem('barrio_gps_dismissed')) {
    steps.push(() => new Promise(resolve => {
      this._showOnboardingGps(resolve);
    }));
  }

  // Paso 2: Push notifications (si no se ha decidido aún)
  if (!localStorage.getItem('barrio_push_enabled') && ('serviceWorker' in navigator) && ('PushManager' in window)) {
    steps.push(() => new Promise(resolve => {
      this._showOnboardingPush(user, resolve);
    }));
  }

  // Paso 3: Instalar app (si el navegador lo permite y no fue descartado)
  if (!localStorage.getItem('barrio_install_dismissed')) {
    steps.push(() => new Promise(resolve => {
      this._showOnboardingInstall(resolve);
    }));
  }

  // Ejecutar secuencialmente
  steps.reduce((chain, step) => chain.then(step), Promise.resolve());
 },

 _showOnboardingGps(done) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:20000;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:white;border-radius:20px;padding:30px 25px;max-width:360px;width:100%;text-align:center;border-top:6px solid var(--primary);">
      <div style="font-size:3.5rem;margin-bottom:12px;">📍</div>
      <h2 style="color:var(--primary);font-weight:900;margin-bottom:10px;">Activa el GPS</h2>
      <p style="color:#555;font-size:0.9rem;line-height:1.5;margin-bottom:20px;">Para que el botón de EMERGENCIA funcione correctamente y puedas ver alertas cercanas, necesitamos tu ubicación.</p>
      <button id="btnGpsOnboardingAllow" class="btn btn-primary" style="width:100%;margin-bottom:10px;font-weight:900;">ACTIVAR AHORA</button>
      <button id="btnGpsOnboardingSkip" style="background:transparent;border:none;color:#999;font-size:0.85rem;cursor:pointer;width:100%;padding:8px;">Omitir por ahora</button>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btnGpsOnboardingAllow').addEventListener('click', async () => {
    const btn = document.getElementById('btnGpsOnboardingAllow');
    btn.textContent = 'Solicitando...'; btn.disabled = true;
    
    // Timeout de seguridad: si en 8s no responde, continuar
    const safetyTimeout = setTimeout(() => {
      App.toast('No se pudo activar el GPS. Puedes intentarlo desde el menú.');
      localStorage.setItem('barrio_gps_dismissed', '1');
      modal.remove(); done();
    }, 8000);

    try {
      await Geo.getUserLocation();
      clearTimeout(safetyTimeout);
      App.toast('GPS Activado ✅');
      modal.remove(); done();
    } catch(e) {
      clearTimeout(safetyTimeout);
      App.toast('GPS denegado o no disponible');
      localStorage.setItem('barrio_gps_dismissed', '1');
      modal.remove(); done();
    }
  });

  document.getElementById('btnGpsOnboardingSkip').addEventListener('click', () => {
    localStorage.setItem('barrio_gps_dismissed', '1');
    modal.remove(); done();
  });
 },

 _showOnboardingPush(user, done) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:20000;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:white;border-radius:20px;padding:30px 25px;max-width:360px;width:100%;text-align:center;border-top:6px solid var(--primary);">
      <div style="font-size:3.5rem;margin-bottom:12px;">🔔</div>
      <h2 style="color:var(--primary);font-weight:900;margin-bottom:10px;">¡Mantente Alerta!</h2>
      <p style="color:#555;font-size:0.9rem;line-height:1.5;margin-bottom:20px;">¿Deseas recibir avisos de seguridad (robos, incendios, sospechosos) que ocurran a menos de 500m de tu ubicación?</p>
      <button id="btnPushOnboardingAccept" class="btn btn-primary" style="width:100%;margin-bottom:10px;font-weight:900;height:50px;">SÍ, ACTIVAR ALERTAS</button>
      <button id="btnPushOnboardingDeny" style="background:transparent;border:none;color:#999;font-size:0.85rem;cursor:pointer;width:100%;padding:8px;">Ahora no, gracias</button>
      <p style="font-size:0.75rem;color:#AAA;margin-top:10px;">Tu privacidad está protegida. Podrás desactivarlas cuando quieras.</p>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btnPushOnboardingDeny').onclick = () => {
    localStorage.setItem('barrio_push_enabled', 'denied_temp');
    modal.remove(); done();
  };

  document.getElementById('btnPushOnboardingAccept').onclick = async () => {
    const btn = document.getElementById('btnPushOnboardingAccept');
    btn.disabled = true; btn.textContent = 'Activando...';
    
    // Timeout de seguridad: si en 10s no responde, cerrar y continuar
    const safetyTimeout = setTimeout(() => {
      App.toast('No se pudo activar. Puedes intentarlo más tarde.');
      localStorage.setItem('barrio_push_enabled', 'denied_temp');
      modal.remove(); done();
    }, 10000);

    try {
      const permission = await Notification.requestPermission();
      clearTimeout(safetyTimeout);
      if (permission === 'granted') {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: this.urlBase64ToUint8Array('BPfYyug0EiK_oS0FRF8w-k2WpxoDs79-DZjjFI505RsAeUrzi5e88XPgsj8Pp2YV6pZfMtnb-IXiYN8tJ9mgrFc')
          });
          const res = await API.savePushSubscription({ userId: user.id, subscription });
          if (res.ok) {
            localStorage.setItem('barrio_push_enabled', 'true');
            App.toast('✅ Alertas activadas correctamente');
          } else {
            throw new Error('Error al guardar en servidor');
          }
        } catch(e) {
          App.toast('No se pudieron activar las alertas');
          localStorage.setItem('barrio_push_enabled', 'denied_temp');
        }
      } else {
        localStorage.setItem('barrio_push_enabled', 'denied_perm');
        App.toast('Permiso de notificaciones denegado');
      }
    } catch(e) {
      clearTimeout(safetyTimeout);
      App.toast('Error al activar alertas');
      localStorage.setItem('barrio_push_enabled', 'denied_temp');
    }
    modal.remove(); done();
  };
 },

 _showOnboardingInstall(done) {
  // Si ya está instalada como PWA, saltar
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    done(); return;
  }

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:20000;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:white;border-radius:20px;padding:30px 25px;max-width:360px;width:100%;text-align:center;border-top:6px solid #FF6B35;">
      <div style="font-size:3.5rem;margin-bottom:12px;">📲</div>
      <h2 style="color:#FF6B35;font-weight:900;margin-bottom:10px;">¡Instala BARRIO!</h2>
      <p style="color:#555;font-size:0.9rem;line-height:1.5;margin-bottom:8px;">Agrega la app a la pantalla de inicio de tu teléfono para acceder rápidamente sin abrir el navegador.</p>
      <p style="font-size:0.8rem;color:#888;margin-bottom:20px;">Solo toma un segundo y no ocupa casi espacio.</p>
      <button id="btnInstallOnboarding" class="btn btn-primary" style="width:100%;margin-bottom:10px;font-weight:900;background:#FF6B35;height:50px;" ${App.deferredPrompt ? '' : 'style="display:none"'}>INSTALAR EN MI TELÉFONO</button>
      <div id="installManualHint" style="${App.deferredPrompt ? 'display:none' : ''}background:#FFF8F5;border-radius:12px;padding:12px;margin-bottom:15px;font-size:0.82rem;color:#555;text-align:left;">
        <strong>¿Cómo instalar?</strong><br>
        • <b>Android/Chrome:</b> Menú ⋮ → "Añadir a pantalla de inicio"<br>
        • <b>iPhone/Safari:</b> Botón compartir □↑ → "Añadir a inicio"
      </div>
      <button id="btnInstallOnboardingSkip" style="background:transparent;border:none;color:#999;font-size:0.85rem;cursor:pointer;width:100%;padding:8px;">Ahora no</button>
    </div>
  `;
  document.body.appendChild(modal);

  const btnInstall = modal.querySelector('#btnInstallOnboarding');
  const manualHint = modal.querySelector('#installManualHint');

  // Mostrar el botón correcto según si hay prompt disponible
  if (App.deferredPrompt) {
    btnInstall.style.display = 'block';
    manualHint.style.display = 'none';
  } else {
    btnInstall.style.display = 'none';
    manualHint.style.display = 'block';
  }

  btnInstall.addEventListener('click', async () => {
    if (!App.deferredPrompt) return;
    App.deferredPrompt.prompt();
    const { outcome } = await App.deferredPrompt.userChoice;
    App.deferredPrompt = null;
    if (outcome === 'accepted') App.toast('✅ App instalada correctamente');
    localStorage.setItem('barrio_install_dismissed', '1');
    modal.remove(); done();
  });

  document.getElementById('btnInstallOnboardingSkip').addEventListener('click', () => {
    localStorage.setItem('barrio_install_dismissed', '1');
    modal.remove(); done();
  });
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
    lateralBtns.forEach(b => b.style.display = (isHome || hash === '#/emergencia-menu') ? 'flex' : 'none');

    if (isHome || hash === '#/emergencia-menu' || hash === '#/compartir') {
      this.renderHome(app);
      if (hash === '#/emergencia-menu') this.showEmergencyMenu(true);
      if (hash === '#/compartir') this.showShareMenu(true);
    }
    else if (hash.startsWith('#/buscar')) this.renderSearch(app);
    else if (hash.startsWith('#/local/')) this.renderStore(app);
    else if (hash === '#/mascotas' || hash === '#/reportar') this.renderReportar(app);
    else if (hash === '#/legal') this.renderLegal(app);
    else if (hash === '#/emergencia') this.renderEmergencia(app);
    else if (hash === '#/muro') this.renderMuro(app);
    else if (hash === '#/contacto') this.renderContacto(app);
    else if (hash.startsWith('#/admin')) Admin.route(app, hash);
    else this.renderHome(app);
  },

 // ===== HOME =====
  renderHome(container) {
    container.innerHTML = `
    <div class="fade-in">
      <header class="app-header">
        <h1 style="margin:0; letter-spacing:2px;">BARRIO</h1>
        <span class="city-subtitle">PUERTO MONTT</span>
        <div style="font-size:1.2rem; margin-top:5px;">🇨🇱</div>
      </header>

      <div id="homeMap" style="height: 250px; width: 100%; border-radius: 16px; margin: 10px 0; border: 2px solid var(--primary); box-shadow: var(--shadow); z-index:1;"></div>

      <div class="qa-grid" style="margin-top: 15px;">
        <div class="qa-item" style="background: #D32F2F; color:white;" onclick="location.hash='#/emergencia-menu'">
          <div class="qa-icon">📞</div>
          <div class="qa-text" style="font-weight:900;">EMERGENCIA</div>
        </div>
        <div class="qa-item" style="background: #E65100; color:white;" onclick="location.hash='#/reportar'">
          <div class="qa-icon">🚨</div>
          <div class="qa-text" style="font-weight:900;">REPORTAR</div>
        </div>
        <div class="qa-item" style="background: #1976D2; color:white;" onclick="App.showSearchModal()">
          <div class="qa-icon">🛒</div>
          <div class="qa-text" style="font-weight:900;">BUSCAR</div>
        </div>
        <div class="qa-item" style="background: #388E3C; color:white;" onclick="location.hash='#/muro'">
          <div class="qa-icon">💬</div>
          <div class="qa-text" style="font-weight:900;">EL MURO</div>
        </div>
      </div>

      <div style="margin-top:20px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:12px;">
        <p style="font-size:0.8rem; color:var(--text-light); margin-bottom:0;">📍 <b>Georreferencia activa</b> para seguridad ciudadana.</p>
        <button onclick="App.showShareMenu()" style="background:#673AB7; color:white; border:none; padding:10px 25px; border-radius:25px; font-weight:900; font-size:0.9rem; cursor:pointer; width:80%; max-width:250px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">COMPARTIR APP</button>
        <div id="installBanner" style="display:none; width:100%; max-width:400px; background:linear-gradient(135deg,#FF6B35,#E55A25); border-radius:16px; padding:14px 18px; box-shadow:0 4px 15px rgba(255,107,53,0.35); text-align:left;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div>
              <div style="color:white; font-weight:900; font-size:1rem;">📲 ¡Instala BARRIO!</div>
              <div style="color:rgba(255,255,255,0.85); font-size:0.78rem; margin-top:3px;">Agrégala a tu pantalla de inicio para acceso rápido.</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
              <button onclick="App.installPWA()" style="background:white; color:#FF6B35; border:none; padding:8px 16px; border-radius:20px; font-weight:900; font-size:0.85rem; cursor:pointer; white-space:nowrap;">INSTALAR</button>
              <button onclick="document.getElementById('installBanner').style.display='none'; localStorage.setItem('barrio_install_dismissed','1');" style="background:transparent; color:rgba(255,255,255,0.7); border:none; font-size:0.75rem; cursor:pointer; text-align:center;">Ahora no</button>
            </div>
          </div>
        </div>
      </div>

      ${this.footerHtml()}
    </div>
    <div id="emergencyMenu" class="bottom-sheet">
      <div class="sheet-content">
        <div class="sheet-header">
          <div style="text-align:center; width:100%;">
            <h3 style="margin:0; font-weight:900; color:#D32F2F;">TELÉFONOS DE EMERGENCIA</h3>
            <p style="font-size:0.8rem; color:#666; margin:5px 0 15px;">Pulsa el botón de la institución que necesitas contactar</p>
          </div>
          <button onclick="App.hideEmergencyMenu()" style="position:absolute; right:15px; top:15px;">&times;</button>
        </div>
        <div class="emergency-list">
          <a href="tel:133" onclick="App.logLlamada('133 - CARABINEROS')" class="emg-btn" style="background:#006633;">CARABINEROS (133)</a>
          <a href="tel:132" onclick="App.logLlamada('132 - BOMBEROS')" class="emg-btn" style="background:#D32F2F;">BOMBEROS (132)</a>
          <a href="tel:131" onclick="App.logLlamada('131 - SAMU')" class="emg-btn" style="background:#1976D2;">SAMU (131)</a>
          <a href="tel:134" onclick="App.logLlamada('134 - PDI')" class="emg-btn" style="background:#0D47A1;">PDI (134)</a>
          <a href="tel:1529" onclick="App.logLlamada('1529 - SEGURIDAD CIUDADANA PUERTO MONTT')" class="emg-btn" style="background:#F57C00;">SEGURIDAD CIUDADANA PUERTO MONTT (1529)</a>
          <div style="margin-top:15px; border-top:1px solid #EEE; padding-top:15px;">
            <button onclick="App.hideEmergencyMenu(); App.iniciarReporteExtravio();" class="btn btn-sm" style="background:#673AB7; color:white; width:100%; justify-content:center; font-weight:900;">REPORTAR TELÉFONO EXTRAVIADO</button>
          </div>
        </div>
      </div>
    </div>

    <div id="searchModal" class="bottom-sheet">
      <div class="sheet-content" style="padding-bottom:30px;">
        <div class="sheet-header">
          <h3 style="margin:0; font-weight:900; color:var(--primary);">¿QUÉ BUSCAS HOY?</h3>
          <button onclick="App.hideSearchModal()">&times;</button>
        </div>
        <div style="padding:15px;">
          <input type="text" id="searchInputModal" autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" placeholder="Ej: pan, gasfiter, farmacia..." style="width:100%; padding:15px; border-radius:12px; border:2px solid #EEE; font-size:1.1rem; outline:none; font-family:inherit;">
          <button onclick="App.doSearchModal()" class="btn btn-primary" style="margin-top:15px; width:100%; font-weight:900;">BUSCAR AHORA</button>
        </div>
      </div>
    </div>

    <div id="shareModal" class="bottom-sheet">
      <div class="sheet-content" style="padding-bottom:30px; text-align:center;">
        <div class="sheet-header">
          <h3 style="margin:0; font-weight:900; color:#673AB7;">COMPARTIR BARRIO</h3>
          <button onclick="App.hideShareMenu()">&times;</button>
        </div>
        <div style="padding:20px;">
          <p style="margin-bottom:20px; font-size:0.9rem; color:#666;">Invita a tus vecinos a unirse a la comunidad.</p>
          
          <a href="https://wa.me/?text=Hola!%20Te%20invito%20a%20usar%20BARRIO,%20la%20app%20de%20nuestra%20comunidad:%20https://www.puertomas.cl" target="_blank" class="btn" style="background:#25D366; color:white; width:100%; justify-content:center; margin-bottom:20px; font-weight:900;">
            ENVIAR POR WHATSAPP
          </a>

          <div style="background:#F9F9F9; padding:15px; border-radius:12px;">
            <p style="font-weight:bold; margin-bottom:10px; font-size:0.8rem; color:#333;">ESCANEA EL CÓDIGO QR</p>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://www.puertomas.cl" style="width:180px; height:180px; border:5px solid white; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          </div>
        </div>
      </div>
    </div>
    `;

    // Initialize Mini Map
    setTimeout(() => {
      try {
        const map = L.map('homeMap', { zoomControl: false }).setView([-41.4693, -72.9423], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        API.getReportes().then(reports => {
          reports.forEach(r => {
            if (r.latitud && r.longitud) {
              const icons = { 'robo': '🚨', 'incendio': '🔥', 'accidente': '🚗', 'sospechoso': '👤', 'mascota': '🐶', 'otros': '📍' };
              const marker = L.marker([r.latitud, r.longitud], {
                icon: L.divIcon({className: 'map-pin', html: `<div style="font-size:18px; background:white; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.2); border:2px solid var(--primary);">${icons[r.tipo_reporte] || '📍'}</div>`})
              }).addTo(map);
              marker.bindPopup(`
                <div style="font-family:Nunito, sans-serif;">
                  <strong style="color:var(--primary); text-transform:uppercase;">${r.tipo_reporte}</strong><br>
                  <span style="font-size:0.9rem;">${r.detalles || 'Sin detalles'}</span><br>
                  <small style="color:#999;">Reportado por: ${r.autor_nick || 'Vecino'}</small>
                </div>
              `);
            }
          });
        });
      } catch(e) {}
    }, 500);

    // Si ya capturamos beforeinstallprompt, mostrar el banner ahora
    setTimeout(() => {
      if (App.deferredPrompt && !localStorage.getItem('barrio_install_dismissed')) {
        const banner = document.getElementById('installBanner');
        if (banner) banner.style.display = 'block';
      }
    }, 800);
  },

  showEmergencyMenu(fromHash = false) { 
    if (!fromHash) { location.hash = '#/emergencia-menu'; return; }
    document.getElementById('emergencyMenu').classList.add('active'); 
  },
  hideEmergencyMenu() { 
    document.getElementById('emergencyMenu').classList.remove('active');
    if (location.hash === '#/emergencia-menu') history.back();
  },

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  },

  async setupPushNotifications(user) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (localStorage.getItem('barrio_push_enabled')) return;

    setTimeout(() => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content" style="text-align:center; padding:30px; border-radius:20px; background:white;">
          <div style="font-size:3.5rem; margin-bottom:15px;">🔔</div>
          <h2 style="color:var(--primary); margin-bottom:10px; font-weight:900;">¡Mantente Alerta!</h2>
          <p style="color:#666; margin-bottom:20px; font-size:0.95rem; line-height:1.4;">¿Deseas recibir avisos de seguridad (robos, incendios, sospechosos) que ocurran a menos de 500m de tu ubicación?</p>
          <button id="btnAcceptPush" class="btn btn-primary" style="width:100%; margin-bottom:10px; font-weight:900; height:50px;">SÍ, ACTIVAR ALERTAS</button>
          <button id="btnDenyPush" class="btn btn-outline" style="width:100%; border:none; color:#999; font-weight:700;">Ahora no, gracias</button>
          <p style="font-size:0.75rem; color:#AAA; margin-top:15px;">Tu privacidad está protegida. Podrás desactivarlas cuando quieras.</p>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('btnDenyPush').onclick = () => {
        modal.remove();
        localStorage.setItem('barrio_push_enabled', 'denied_temp');
      };

      document.getElementById('btnAcceptPush').onclick = async () => {
        const btn = document.getElementById('btnAcceptPush');
        btn.disabled = true; btn.textContent = 'Activando...';
        try {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: this.urlBase64ToUint8Array('BPfYyug0EiK_oS0FRF8w-k2WpxoDs79-DZjjFI505RsAeUrzi5e88XPgsj8Pp2YV6pZfMtnb-IXiYN8tJ9mgrFc')
            });
            const res = await API.savePushSubscription({ userId: user.id, subscription });
            if (res.ok) {
              localStorage.setItem('barrio_push_enabled', 'true');
              App.toast("✅ Alertas activadas correctamente");
            } else {
              throw new Error("Error en servidor al guardar");
            }
          } else {
            localStorage.setItem('barrio_push_enabled', 'denied_perm');
            App.toast("Permiso de notificaciones denegado");
          }
        } catch (e) {
          console.error('Push Error Detail:', e);
          App.toast("Error: " + (e.message || "No se pudo activar"));
        } finally {
          modal.remove();
        }
      };
    }, 3000);
  },
  showSearchModal() { 
    document.getElementById('searchModal').classList.add('active');
    setTimeout(() => {
      const input = document.getElementById('searchInputModal');
      input.focus();
      input.onkeypress = (e) => { if (e.key === 'Enter') this.doSearchModal(); };
    }, 300);
  },
  hideSearchModal() { document.getElementById('searchModal').classList.remove('active'); },
  doSearchModal() {
    const q = document.getElementById('searchInputModal').value.trim();
    if (q) {
      this.hideSearchModal();
      location.hash = `#/buscar?q=${encodeURIComponent(q)}`;
    }
  },
  showShareMenu(fromHash = false) { 
    if (!fromHash) { location.hash = '#/compartir'; return; }
    document.getElementById('shareModal').classList.add('active'); 
  },
  hideShareMenu() { 
    document.getElementById('shareModal').classList.remove('active');
    if (location.hash === '#/compartir') history.back();
  },

 // ===== PRODUCT SEARCH =====
 async renderSearch(container) {
 const params = new URLSearchParams(location.hash.split('?')[1]);
 const q = params.get('q') || '';
 container.innerHTML = `
 
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
 
 <div class="search-container">
 <span class="search-icon">🔍</span>
 <input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="text" id="searchAgain" value="${q}" placeholder="¿Qué necesitas? Ej: gasfiter, pan" >
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
 async renderReportar(container) {
 container.innerHTML = `
 
  <h2 class="section-title">🚨 Reportar Incidente</h2>
 
  <div id="reportMap" style="height: 250px; width: 100%; border-radius: 12px; margin-bottom: 20px; z-index:1; border:2px solid var(--primary);"></div>

  <div class="card" style="margin-bottom:20px; background: #FFF3E0; border: 1px solid #FFCC80;">
    <p style="font-size:0.85rem; color:#666; margin-bottom:15px;">Fija el punto en el mapa y selecciona el tipo de reporte. <b>Tu identidad pública será protegida con tu Nickname.</b></p>
    
    <div class="report-grid">
      <button class="report-opt" data-tipo="robo">🚨 Robo</button>
      <button class="report-opt" data-tipo="accidente">🚗 Choque</button>
      <button class="report-opt" data-tipo="incendio">🔥 Incendio</button>
      <button class="report-opt" data-tipo="sospechoso">👤 Sospechoso</button>
      <button class="report-opt" data-tipo="mascota">🐶 Mascota</button>
      <button class="report-opt" data-tipo="otros">📍 Otros</button>
    </div>

    <input type="text" id="reportUbicacion" autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" placeholder="📍 Ubicación (Pincha en el mapa)" readonly style="width:100%; padding:10px; margin:10px 0; border-radius:8px; border:1px solid #CCC; background:#EEE;">
    <textarea id="reportDetalles" autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" placeholder="Detalles adicionales (opcional)" rows="3" style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:1px solid #CCC;"></textarea>
    
    <label style="display:block; margin-bottom:5px; font-weight:bold; font-size:0.85rem;">Duración en el mapa:</label>
    <select id="reportDuracion" style="width:100%; padding:10px; margin-bottom:15px; border-radius:8px; border:1px solid #CCC;">
      <option value="1">1 hora</option>
      <option value="4">4 horas</option>
      <option value="12">12 horas</option>
      <option value="24" selected>24 horas</option>
      <option value="168">7 días</option>
      <option value="720">30 días (Mascotas)</option>
    </select>

    <button id="btnSubmitReporte" class="btn btn-primary" style="width:100%;">Publicar Reporte</button>
  </div>
  <div id="reportList"></div>
  `;

    let map = null;
    let selectedLat = null, selectedLng = null;
    let currentMarker = null;

    setTimeout(() => {
      try {
        map = L.map('reportMap').setView([-41.4693, -72.9423], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        
        // Show existing reports on report map too
        API.getReportes().then(reports => {
          reports.forEach(r => {
            if (r.latitud && r.longitud) {
              const icons = { 'robo': '🚨', 'incendio': '🔥', 'accidente': '🚗', 'sospechoso': '👤', 'mascota': '🐶', 'otros': '📍' };
              const m = L.marker([r.latitud, r.longitud], {
                icon: L.divIcon({className: 'map-pin', html: `<div style="font-size:18px; background:white; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.2); border:2px solid #BBB;">${icons[r.tipo_reporte] || '📍'}</div>`})
              }).addTo(map);
              m.bindPopup(`
                <div style="font-family:Nunito, sans-serif;">
                  <strong style="color:var(--primary); text-transform:uppercase;">${r.tipo_reporte}</strong><br>
                  <span style="font-size:0.9rem;">${r.detalles || 'Sin detalles'}</span><br>
                  <small style="color:#999;">Reportado por: ${r.autor_nick || 'Vecino'}</small>
                </div>
              `);
            }
          });
        });

        map.on('click', (e) => {
          selectedLat = e.latlng.lat;
          selectedLng = e.latlng.lng;
          if (currentMarker) map.removeLayer(currentMarker);
          currentMarker = L.marker([selectedLat, selectedLng], {
            icon: L.divIcon({className: 'map-pin', html: `<div style="font-size:18px; background:var(--primary); color:white; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.4); border:2px solid white;">📍</div>`})
          }).addTo(map);
          document.getElementById('reportUbicacion').value = "📍 Punto fijado";
        });
      } catch(e) {}
    }, 500);

    let selectedTipo = 'otros';
    document.querySelectorAll('.report-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.report-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedTipo = btn.dataset.tipo;
      });
    });

    document.getElementById('btnSubmitReporte').addEventListener('click', () => {
      const detalles = document.getElementById('reportDetalles').value.trim();
      const duracion = document.getElementById('reportDuracion').value;
      if (!selectedLat) return App.toast("Pincha el mapa primero");

      this.requireAuth(async (user) => {
        try {
          await API.createReporte({
            usuario_id: user.id,
            nombre_contacto: user.nombre, telefono: user.telefono,
            tipo_reporte: selectedTipo, detalles, latitud: selectedLat, longitud: selectedLng,
            duracion_horas: duracion
          });
          App.toast("Reporte publicado con éxito");
          location.hash = '#/';
        } catch(e) { App.toast("Error al publicar"); }
      });
    });

    // List existing reports
    try {
      const reports = await API.getReportes();
      const listEl = document.getElementById('reportList');
      if (reports.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">No hay reportes activos.</p>';
      } else {
        listEl.innerHTML = reports.map(r => `
          <div class="card fade-in" style="margin-bottom:10px; border-left:4px solid var(--primary);">
            <div style="font-weight:bold; font-size:1.1rem; margin-bottom:5px;">
              ${r.tipo_reporte.toUpperCase()} - ${new Date(r.created_at).toLocaleTimeString('es-CL')}
            </div>
            <p style="font-size:0.9rem; margin:0;">${r.detalles || 'Sin detalles adicionales.'}</p>
            <div style="font-size:0.75rem; color:#999; margin-top:10px; text-align:right;">
              Reportado por: ${r.autor_nick || 'Vecino Verificado'}
            </div>
          </div>
        `).join('');
      }
    } catch(e) {}

    const f = document.createElement('div');
    f.innerHTML = this.footerHtml();
    container.appendChild(f);
  },


 footerHtml() {
 return `
 <footer class="legal-footer" style="margin-top: 15px; padding: 10px; text-align: center; border-top: 1px solid rgba(0,0,0,0.08);">
 <p style="font-size: 0.7rem; color: var(--text-light); margin: 0;">
 &copy; 2026 BARRIO - PUERTOMAS SPA | 
 <a href="#/legal" style="color:var(--primary); text-decoration:underline; cursor:pointer;">Aviso Legal</a>
 </p>
 <div style="font-size: 0.65rem; color: rgba(0,0,0,0.25); margin-top: 5px; text-align: right;">v2.0 Stable</div>
 </footer>
 `;
 },

 // ===== EMERGENCIA =====
 renderEmergencia(container) {
 container.innerHTML = `
 <div class="fade-in" style="padding: 20px; max-width: 600px; margin: 0 auto; text-align: center;">
 
 <h2 style="color:#222; margin-bottom: 5px; font-size:1.6rem; font-weight:900; text-transform:uppercase; letter-spacing:1px; display:inline-block;">TELÉFONOS DE EMERGENCIA</h2>
 <div style="font-size:1.8rem; margin: 5px 0 15px;">🇨🇱</div>

 <div style="border-bottom:3px solid #222; margin-bottom:30px; width:100%; max-width:250px; margin-left:auto; margin-right:auto;"></div>

 
 <div style="display:flex; flex-direction:column; gap:16px;">
 <a href="tel:${this.config.tel_carabineros || '133'}" onclick="App.logLlamada('133 - CARABINEROS')" class="btn" style="background:#006633; color:white; justify-content:center; padding:20px; font-size:1.2rem; font-weight:bold; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
 CARABINEROS ${this.config.tel_carabineros || '133'}
 </a>
 <a href="tel:${this.config.tel_bomberos || '132'}" onclick="App.logLlamada('132 - BOMBEROS')" class="btn" style="background:#D32F2F; color:white; justify-content:center; padding:20px; font-size:1.2rem; font-weight:bold; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
 BOMBEROS ${this.config.tel_bomberos || '132'}
 </a>
 <a href="tel:${this.config.tel_ambulancia || '131'}" onclick="App.logLlamada('131 - SAMU')" class="btn" style="background:#1976D2; color:white; justify-content:center; padding:20px; font-size:1.2rem; font-weight:bold; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
 AMBULANCIA ${this.config.tel_ambulancia || '131'}
 </a>
 <a href="tel:${this.config.tel_pdi || '134'}" onclick="App.logLlamada('134 - PDI')" class="btn" style="background:#0D47A1; color:white; justify-content:center; padding:20px; font-size:1.2rem; font-weight:bold; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
 PDI ${this.config.tel_pdi || '134'}
 </a>
 <a href="tel:${this.config.tel_seguridad || '1529'}" onclick="App.logLlamada('1529 - SEGURIDAD CIUDADANA PUERTO MONTT')" class="btn" style="background:#F57C00; color:white; justify-content:center; padding:15px; text-align:center; flex-direction:column; font-size:1.1rem; font-weight:bold; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1); line-height:1.2;">
 <span>SEGURIDAD CIUDADANA ${this.config.tel_seguridad || '1529'}</span>
 <span style="font-size:0.85rem; font-weight:normal; opacity:0.9;">PUERTO MONTT</span>
 </a>
 </div>
 ${this.footerHtml()}
 </div>
 `;
 },

 renderLegal(container) {
 container.innerHTML = `
 <div class="fade-in" style="padding: 20px; max-width: 600px; margin: 0 auto;">
 
 <h2 style="color:var(--primary); margin-bottom: 20px;">📋 Aviso Legal</h2>
 <div class="card" style="line-height: 1.7; font-size: 0.9rem; color: #444;">
 <h3 style="margin-bottom: 10px; font-size: 1rem; color:#D32F2F;">⚠️ Aviso</h3>
 <p style="margin-bottom: 15px;"><strong>BARRIO no es una aplicación oficial.</strong> Los botones de contacto son únicamente accesos directos de marcación telefónica hacia números públicos pre-grabados. No garantizamos el éxito de la llamada ni nos hacemos responsables por fallas en las líneas telefónicas. <strong style="color:#D32F2F;">SIEMPRE PRIORICE LLAMAR DIRECTAMENTE A LOS NUMEROS DE EMERGENCIA , ESTA APLICACION NO REEMPLAZA EN NINGUN CASO LA FORMA DE LLAMAR TRADICIONALMENTE A INTITUCIONES DE EMERGENCIAS</strong></p>
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
 const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}`;

 container.innerHTML = `
 <div class="fade-in" style="text-align:center; padding:20px;">
 
 <h2 class="section-title">📲 Compartir BARRIO</h2>
 <p style="color:var(--text-light); margin-bottom:12px;">¡Ayuda a que más vecinos conozcan la app!</p>
 
 <div class="card" style="padding:16px; border-radius:12px; background:white; box-shadow:var(--shadow); margin-bottom:12px;">
 <h3 style="margin-bottom:8px; font-size:1.1rem; color:var(--primary);">Opción 1: WhatsApp</h3>
 <p style="font-size:0.9rem; color:var(--text-light); margin-bottom:10px;">Envía el link directamente a tus contactos:</p>
 <a href="https://wa.me/?text=${shareText}" class="btn" style="background:#25D366; color:white; width:100%; justify-content:center; padding:12px;">
 <svg viewBox="0 0 24 24" class="whatsapp-logo-large" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
 Enviar por WhatsApp
 </a>
 </div>

 <div class="card" style="padding:16px; border-radius:12px; background:white; box-shadow:var(--shadow);">
 <h3 style="margin-bottom:8px; font-size:1.1rem; color:var(--primary);">Opción 2: Código QR</h3>
 <p style="font-size:0.9rem; color:var(--text-light); margin-bottom:10px;">Muestra este código para que otro vecino lo escanee:</p>
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
 container.innerHTML = `<div class="loading"><div class="spinner"></div><p>Cargando local...</p></div>`;
 try {
 const store = await API.getStore(id);
 const ratings = await API.getRatings(id);
 const existingRating = ratings.find(r => r.device_id === this.deviceId);

 container.innerHTML = `
 
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
 <textarea autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="ratingComment" placeholder="Comentario opcional...">${existingRating ? existingRating.comentario || '' : ''}</textarea>
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
 
 <h2 class="section-title">🔧 Buscar Servicios</h2>
 <div class="search-container">
 <span class="search-icon">🔍</span>
 <input autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" type="text" id="serviceSearch" placeholder="Ej: gasfiters, electricistas..." >
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
 <div style="font-size:0.95rem; color:#444; margin-bottom:20px; text-align:left; line-height:1.6; max-height:40vh; overflow-y:auto; padding-right:10px;">
 <p style="margin-bottom:10px;"><strong>1. Uso:</strong> BARRIO no es una aplicación oficial. Los botones de contacto son únicamente accesos directos. <strong style="color:#D32F2F;">SIEMPRE PRIORICE LLAMAR DIRECTAMENTE A LOS NUMEROS DE EMERGENCIA , ESTA APLICACION NO REEMPLAZA EN NINGUN CASO LA FORMA DE LLAMAR TRADICIONALMENTE A INTITUCIONES DE EMERGENCIAS</strong></p>
 <p style="margin-bottom:10px;"><strong>2. Responsabilidad:</strong> No garantizamos el éxito de la llamada ni nos hacemos responsables por fallas de conexión o servicio.</p>
 <p style="margin-bottom:10px;"><strong>3. Datos y Privacidad:</strong> La información mostrada es referencial e ingresada por la comunidad. PUERTOMAS SPA no la garantiza.</p>
 <p style="margin-bottom:10px; color:#D32F2F; font-weight:bold;"><strong>4. Activación de GPS:</strong> Al aceptar estos términos y condiciones, se solicitará y activará automáticamente el GPS de tu dispositivo, necesario para mostrar la información del barrio y para el correcto funcionamiento de las alertas.</p>
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

  async iniciarReporteExtravio() {
    const num = prompt('Por seguridad, ingresa el NÚMERO DE TELÉFONO que extraviaste (Formato: +569XXXXXXXX):');
    if (!num) return;
    const phoneRegex = /^\+\d{11}$/;
    if (!phoneRegex.test(num.replace(/\s+/g, ''))) {
      return alert('Formato inválido. Debe comenzar con + y tener 11 números (Ej: +56912345678)');
    }
    this.requireAuth(async (user) => {
      try {
        await Geo.getUserLocation().catch(() => {});
        const lat = Geo.userLat;
        const lng = Geo.userLng;
        if (lat && lng) API.ping(this.deviceId, lat, lng).catch(() => {});
        const refGps = (lat && lng)
          ? `\n📍 Ubicación del Denunciante: https://maps.google.com/?q=${lat},${lng}`
          : '\n📍 Ubicación del Denunciante: No disponible (GPS desactivado)';
        await API.reportarExtravio({
          reporting_user_id: user.id,
          reported_phone: num,
          mensaje_extra: refGps
        });
        alert('✅ Teléfono marcado como EXTRAVIADO. El rastreo se activará al abrir la app en ese equipo y la ubicación se mostrará en el mapa del administrador.');
      } catch(e) {
        this.toast('Error al reportar extravío: ' + (e.message || ''));
      }
    });
  },

 async logLlamada(institucion) {
    // Obtener ubicación fresca antes de loguear
    await Geo.getUserLocation().catch(() => {});
    this.requireAuth((user) => {
      const lat = Geo.userLat || null;
      const lng = Geo.userLng || null;
      // Actualizar last_lat/last_lng para que aparezca en el mapa del admin
      if (lat && lng) API.ping(this.deviceId, lat, lng).catch(() => {});
      API.logEmergencia({ usuario_id: user.id, institucion, latitud: lat, longitud: lng }).catch(() => {});
    });
  },

 // ===== AUTH & NEW FEATURES =====
  requireAuth(callback, mandatory = false) {
    const userStr = localStorage.getItem('barrio_user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user && user.id) {
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
      <h2 style="text-transform:uppercase; letter-spacing:1px;">Registro de Vecino</h2>
      <p style="font-size:0.9rem; color:var(--text-light); margin-bottom:10px;">Únete a la red de seguridad y comercio de tu barrio.</p>
      <div class="form-grid-auth">
        <div class="form-group">
          <label>Nombre Real</label>
          <input type="text" id="authNombre" autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" placeholder="Ej: Juan Pérez">
        </div>
        <div class="form-group">
          <label>Nickname (Público)</label>
          <input type="text" id="authNickname" autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" placeholder="Ej: VecinoMirasol">
        </div>
        <div class="form-group">
          <label>Teléfono</label>
          <input type="tel" id="authTelefono" autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" placeholder="+569...">
        </div>
        <div class="form-group">
          <label>Correo Electrónico</label>
          <input type="email" id="authEmail" autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" placeholder="Para recibir tu PIN">
        </div>
        <div class="form-group">
          <label>PIN Seguridad (4 dígitos)</label>
          <input type="password" id="authPin" autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" maxlength="4" placeholder="****">
        </div>
        <div class="form-group">
          <label>Población/Sector (Referencia)</label>
          <input type="text" id="authDireccion" autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" placeholder="Mirasol, PM">
        </div>
      </div>
      <p style="font-size:0.8rem; color:var(--primary); font-weight:bold; margin:10px 0 5px;">📍 MARCA TU HOGAR EN EL MAPA</p>
      <div id="homeSelectMap" style="height: 180px; width: 100%; border-radius: 12px; margin-bottom: 10px; border: 2px solid var(--primary); z-index:1;"></div>
      <button id="authSubmit" class="btn btn-primary" style="margin-top:10px; width:100%; font-weight:900;">REGISTRARME AHORA</button>
      <p style="font-size:0.7rem; color:var(--text-light); margin-top:15px;">Tus datos reales son privados. El PIN se enviará a tu correo.</p>
    </div>
    `;
    document.body.appendChild(modal);

    // Declarar ANTES del listener para que el click siempre pueda leer los valores
    let homeLat = null, homeLng = null;
    let homeMarker = null;

    document.getElementById('authSubmit').addEventListener('click', async () => {
      const nombre = document.getElementById('authNombre').value.trim();
      const nickname = document.getElementById('authNickname').value.trim();
      const telefono = document.getElementById('authTelefono').value.trim();
      const email = document.getElementById('authEmail').value.trim();
      const pin = document.getElementById('authPin').value.trim();
      const direccion = document.getElementById('authDireccion').value.trim();

      if (!nombre || !telefono || !nickname || !email || !pin) return this.toast('Completa todos los campos');
      if (pin.length !== 4) return this.toast('El PIN debe ser de 4 dígitos');

      const btn = document.getElementById('authSubmit');
      btn.disabled = true;
      btn.textContent = 'Registrando...';

      try {
        const termsAccepted = localStorage.getItem('barrio_disclaimer_v2') === 'true';
        const res = await API.registerUser({ 
          nombre, nickname, telefono, email, pin_seguridad: pin, 
          direccion, device_id: this.deviceId, terms_accepted: termsAccepted,
          home_lat: homeLat, home_lng: homeLng
        });
        // Guardar usuario y acceder directamente (is_verified=1 automático)
        const savedUser = res.user;
        localStorage.setItem('barrio_user', JSON.stringify(savedUser));
        this.toast(`¡Bienvenido/a ${nickname}! Registro completado.`);
        modal.remove();
        // Ingresar a la app directamente sin esperar verificación manual
        this.continueInit(savedUser);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Registrarme AHORA';
        
        // Mostrar mensaje específico de geofencing
        if (err.message && err.message.includes('FUERA_DE_COBERTURA')) {
          alert('⚠️ Ubicación fuera del área de cobertura\n\nPor favor, marca tu casa dentro de Puerto Montt en el mapa. Esta app solo funciona para residentes de Puerto Montt y alrededores.');
        } else {
          this.toast(err.message || 'Error al registrar');
        }
      }
    });

    // Iniciar mapa de hogar
    setTimeout(() => {
      try {
        const hMap = L.map('homeSelectMap').setView([-41.4693, -72.9423], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(hMap);
        hMap.on('click', (e) => {
          homeLat = e.latlng.lat;
          homeLng = e.latlng.lng;
          if (homeMarker) hMap.removeLayer(homeMarker);
          homeMarker = L.marker([homeLat, homeLng], {
            icon: L.divIcon({className: 'map-pin', html: `<div style="font-size:18px; background:var(--primary); color:white; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.4); border:2px solid white;">🏠</div>`})
          }).addTo(hMap);
        });
        if (Geo.userLat) hMap.setView([Geo.userLat, Geo.userLng], 16);
      } catch(e) { console.error("Error al cargar mapa de hogar"); }
    }, 500);
  },

 showPendingVerification() {
 const modal = document.createElement('div');
 modal.className = 'auth-overlay';
 modal.innerHTML = `
 <div class="auth-modal fade-in" style="border-top: 5px solid #1976D2;">
 <div style="font-size:3rem; margin-bottom:10px;">⏳</div>
 <h2 style="color:#1976D2; font-size:1.4rem;">Cuenta en Verificación</h2>
 <p style="margin-bottom:20px; font-size:0.95rem;">Tu registro ha sido enviado al administrador de <b>Barrio Puerto Montt</b>.</p>
 <p style="font-size:0.85rem; color:#666; background:#F5F5F5; padding:15px; border-radius:8px; text-align:center;">
 Por seguridad de todos los Vecinos, un administrador debe aceptar tu cuenta para que utilices la aplicación.
 </p>
 <button onclick="location.reload()" class="btn btn-primary" style="margin-top:20px; width:100%; justify-content:center;">Recargar y Verificar Estado</button>
 </div>
 `;
 document.body.appendChild(modal);
 },

 // ===== MURO COMUNITARIO =====
 renderMuro(container) {
 container.innerHTML = `
 
 <h2 class="section-title"><svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:#25D366;vertical-align:middle;margin-right:8px;" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg> Muro Comunitario</h2>
 <div class="card" style="margin-bottom:10px;">
 <textarea autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="muroInput" placeholder="¿Qué quieres compartir con el barrio?" rows="3" style="width:100%; padding:10px; border-radius:8px; border:1px solid #CCC; margin-bottom:10px; font-family:inherit; resize:vertical;"></textarea>
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
 // Capturar ubicación actual antes de enviar
 await Geo.getUserLocation().catch(() => {});
 await API.postMuro({ 
 usuario_id: user.id, 
 contenido: content,
 latitud: Geo.userLat,
 longitud: Geo.userLng
 });
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

  // ===== LEGAL & EXTRAVIO =====
  renderLegal(container) {
    container.innerHTML = `
    <h2 class="section-title">⚖️ Aviso Legal</h2>
    <div class="card fade-in" style="font-size:0.9rem; line-height:1.6; color:#444;">
      <p><strong>1. Uso de la Aplicación:</strong> BARRIO es una red comunitaria. El usuario es responsable de la veracidad de sus reportes.</p>
      <p><strong>2. Emergencias:</strong> Esta app NO reemplaza a los servicios de emergencia oficiales. Siempre llame al 133 o 132 primero.</p>
      <p><strong>3. Privacidad:</strong> Sus datos personales están protegidos y solo se muestra su Nickname en el muro y mapa.</p>
      <hr style="margin:20px 0; border:0; border-top:1px solid #EEE;">
      <h3 style="color:#673AB7; margin-bottom:10px;">Reporte de Extravío</h3>
      <p>Si extraviaste tu celular y tenías instalada esta aplicación, puedes reportarlo aquí para <strong>saber si se continúa utilizando nuestra aplicación</strong>.</p>
      <button id="btnReportarRobo" class="btn btn-primary" style="background:#673AB7; width:100%; margin-top:10px; font-weight:900;">REPORTAR TELÉFONO EXTRAVIADO</button>
    </div>
    ${this.footerHtml()}
    `;

    document.getElementById('btnReportarRobo').addEventListener('click', () => {
      const num = prompt("Ingresa el NÚMERO que extraviaste (+569XXXXXXXX):");
      if (!num) return;
      const phoneRegex = /^\+\d{11}$/;
      if (!phoneRegex.test(num.replace(/\s+/g, ''))) return alert("Formato inválido (+56912345678)");
      
      this.requireAuth(async (user) => {
        const btn = document.getElementById('btnReportarRobo');
        btn.disabled = true; btn.textContent = 'Procesando...';
        try {
          await Geo.getUserLocation().catch(() => {});
          await API.reportarExtravio({ 
            reporting_user_id: user.id, 
            reported_phone: num,
            mensaje_extra: (Geo.userLat) ? `\n📍 Ubicación reporte: https://maps.google.com/?q=${Geo.userLat},${Geo.userLng}` : ""
          });
          alert("Teléfono marcado como EXTRAVIADO. El rastreo se activará al abrir la app en ese equipo.");
        } catch(e) { this.toast('Error al reportar'); }
        finally { btn.disabled = false; btn.textContent = "Reportar Teléfono Extraviado"; }
      });
    });
  },

 // ===== CONTACTO ADMIN =====
 renderContacto(container) {
 container.innerHTML = `
 
 <h2 class="section-title"><svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:#25D366;vertical-align:middle;margin-right:8px;" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg> Contactar al Administrador</h2>
 <div class="card fade-in" style="margin-top:20px;">
 <p style="margin-bottom:15px; font-size:0.9rem; color:var(--text-light);">Envía tu mensaje o sugerencia. Te responderemos lo antes posible.</p>
 <textarea autocomplete="off" autocorrect="off" spellcheck="false" data-form-type="other" id="contactoInput" placeholder="Escribe tu mensaje aquí..." rows="5" style="width:100%; padding:14px; border-radius:8px; border:2px solid #E5E7EB; margin-bottom:15px; font-family:inherit; resize:vertical; outline:none; font-size:1rem;"></textarea>
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
 // Capturar ubicación actual antes de enviar
 await Geo.getUserLocation().catch(() => {});
 await API.sendAdminMessage({ 
 usuario_id: user.id, 
 mensaje: msj,
 latitud: Geo.userLat,
 longitud: Geo.userLng
 });
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

 // Limpia TODOS los datos del usuario y reinicia como primera instalación
 _fullReset() {
  console.log('App: Usuario eliminado por admin. Reiniciando como nueva instalación...');
  // Preservar solo el device_id para trazabilidad
  const deviceId = localStorage.getItem('barrio_device_id');
  localStorage.clear();
  if (deviceId) localStorage.setItem('barrio_device_id', deviceId);
  // Mostrar aviso antes de reiniciar
  const aviso = document.createElement('div');
  aviso.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
  aviso.innerHTML = `
    <div style="background:white;border-radius:20px;padding:30px 25px;max-width:360px;width:100%;text-align:center;border-top:6px solid #D32F2F;">
      <div style="font-size:3rem;margin-bottom:15px;">⚠️</div>
      <h2 style="color:#D32F2F;font-size:1.3rem;font-weight:900;margin-bottom:12px;">Cuenta no encontrada</h2>
      <p style="color:#555;font-size:0.9rem;line-height:1.5;margin-bottom:20px;">Tu cuenta ha sido eliminada del sistema o esta instalación ya no está registrada.<br><br>Deberás registrarte nuevamente para acceder a BARRIO.</p>
      <button onclick="location.reload()" style="background:#D32F2F;color:white;border:none;padding:14px 30px;border-radius:25px;font-weight:900;font-size:1rem;cursor:pointer;width:100%;">ENTENDIDO, CONTINUAR</button>
    </div>
  `;
  document.body.appendChild(aviso);
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


window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  App.deferredPrompt = e;
  if (!localStorage.getItem('barrio_install_dismissed')) {
    const banner = document.getElementById('installBanner');
    if (banner) banner.style.display = 'block';
  }
});

window.addEventListener('appinstalled', () => {
  const banner = document.getElementById('installBanner');
  if (banner) banner.style.display = 'none';
  App.deferredPrompt = null;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
