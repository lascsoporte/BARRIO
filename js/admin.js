<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="BARRIO - Encuentra productos y servicios en tu barrio. Puerto Montt, Chile.">
    <meta name="theme-color" content="#FF6B35">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏘️</text></svg>">
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #FF6B35;
            --secondary: #2EC4B6;
            --bg: #F9F1E7;
            --text: #1A1A2E;
        }
        body {
            font-family: 'Nunito', sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            overflow: hidden;
            padding: 10px;
        }
        .portal-container {
            text-align: center;
            padding: 20px;
            max-width: 450px;
            width: 95%;
            background: white;
            border-radius: 25px;
            box-shadow: 0 15px 40px rgba(0,0,0,0.1);
            animation: fadeIn 0.6s ease-out;
            display: flex;
            flex-direction: column;
            gap: 15px;
            position: relative;
            z-index: 10;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        h1 {
            font-size: 3rem;
            font-weight: 900;
            background: linear-gradient(135deg, var(--primary), #FF2E00);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin: 0;
        }
        p.subtitle {
            font-size: 0.95rem;
            color: #666;
            margin: 0;
        }
        .city-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
        }
        .city-btn {
            padding: 15px;
            border-radius: 15px;
            border: 2px solid #EEE;
            background: white;
            text-decoration: none;
            color: var(--text);
            font-weight: 800;
            font-size: 1.1rem;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
        }
        .city-btn:hover {
            border-color: var(--primary);
            background: #FFF3E0;
        }
        .wa-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 20px;
            background: #25D366;
            color: white;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 700;
            font-size: 0.9rem;
        }
        .footer-inline {
            margin-top: 5px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.7rem;
            color: #AAA;
            border-top: 1px solid #F5F5F5;
            padding-top: 10px;
        }
        #root:not(:empty) + #portalView {
            display: none !important;
        }
    </style>
</head>
<body>
    <div id="root"></div>

    <div class="portal-container" id="portalView">
        <h1>BARRIO</h1>
        <p class="subtitle">Selecciona tu ciudad para entrar a la red comunitaria.</p>
        
        <div class="city-grid">
            <div class="city-btn" id="btnApp">
                <span>📍 PUERTO MONTT</span>
                <span>🇨🇱</span>
            </div>
        </div>

        <div style="border-top: 1px solid #EEE; padding-top: 15px;">
            <p style="font-size: 0.8rem; margin-bottom: 10px; color: #555; line-height: 1.3;">
                ¿Eres Cliente Delivery o comerciante, quieres figurar en la app? <br>
                <b>Contáctanos con el botón verde...</b>
            </p>
            <a href="https://wa.me/56987606517" class="wa-btn">
                <span>PUERTOMAS DELIVERY</span>
            </a>
        </div>

        <div class="footer-inline">
            <div>&copy; 2026 PUERTOMAS SPA</div>
            <div style="font-weight: bold; cursor: pointer; padding: 5px;" id="versionInfo">
                v2.0 Stable
            </div>
        </div>
    </div>

    <script type="module" src="/src/main.tsx"></script>

    <script>
        // Función para activar la App
        function startApp(admin = false) {
            const portal = document.getElementById('portalView');
            if (portal) portal.style.display = 'none';
            if (admin) {
                window.location.hash = '#/admin';
            }
        }

        // AUTO-PING (Render Anti-Sleep)
        function keepAlive() {
            fetch(window.location.origin + '/').catch(() => {});
            console.log("Ping enviado.");
        }
        setInterval(keepAlive, 780000); // 13 minutos
        keepAlive();

        // Control de clics secretos
        let count = 0;
        document.getElementById('versionInfo').addEventListener('click', () => {
            count++;
            if (count === 5) startApp(true);
            setTimeout(() => count = 0, 3000);
        });

        document.getElementById('btnApp').addEventListener('click', () => startApp(false));

        // Detectar si el usuario entra directo por URL con el hash de admin
        if(window.location.hash.includes('admin')) {
            setTimeout(() => startApp(true), 100);
        }
    </script>
</body>
</html>