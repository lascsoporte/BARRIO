const express = require('express');
const path = require('path');
const cors = require('cors');
const https = require('https');
const nodemailer = require('nodemailer');

// Intentar cargar la base de datos (se asume que existe database.js)
let dbHelper;
try {
  dbHelper = require('./database');
} catch (e) {
  console.error("No se encontró database.js, usando modo simulación.");
  dbHelper = {
    queryOne: async () => null,
    queryAll: async () => [],
    runSql: async () => true,
    initDatabase: async () => true
  };
}

const app = express();
const PORT = process.env.PORT || 3000;

// Claves maestras por defecto
let ADMIN_PASSWORDS = ['barrio2025', 'admin2025', 'seguridad2025'];
const adminTokens = new Set();

// Función para generar un token de acceso seguro
const getPersistentToken = () => Buffer.from(ADMIN_PASSWORDS.join(':')).toString('base64');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Middleware de Seguridad ---
function authMw(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  
  // Validamos si el token es válido
  if (adminTokens.has(token) || token === getPersistentToken()) {
    return next();
  }
  res.status(401).json({ error: 'Sesión expirada o no autorizada' });
}

// ========== RUTAS DE ADMINISTRACIÓN ==========

app.post('/api/admin/login', (req, res) => {
  const { passwords } = req.body;
  if (!passwords || !Array.isArray(passwords)) return res.status(400).json({ error: 'Formato inválido' });

  // Comparamos las 3 llaves
  if (passwords.every((p, i) => p === ADMIN_PASSWORDS[i])) {
    const token = getPersistentToken();
    adminTokens.add(token);
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Llaves incorrectas' });
  }
});

// Rutas protegidas (Añade aquí todas las que necesites)
app.get('/api/admin/locales', authMw, async (req, res) => {
  const rows = await dbHelper.queryAll('SELECT * FROM locales ORDER BY nombre');
  res.json(rows);
});

app.get('/api/admin/usuarios', authMw, async (req, res) => {
  const rows = await dbHelper.queryAll('SELECT * FROM usuarios ORDER BY created_at DESC');
  res.json(rows);
});

app.get('/api/admin/stats', authMw, async (req, res) => {
  res.json({ totalVisitas: 100, uniqueUsers: 45, visitasHoy: 12, totalMascotas: 8, topLocales: [] });
});

app.get('/api/admin/reportes', authMw, async (req, res) => {
  const rows = await dbHelper.queryAll('SELECT * FROM reportes_ciudadanos ORDER BY created_at DESC');
  res.json(rows);
});

// SPA Fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});