// routes/auth.js
// Registro y login de usuarios. Se monta en server.js bajo /api/auth.
// Usa db.js para consultar la tabla usuarios, bcryptjs para las contraseñas
// y jsonwebtoken para generar el token que después valida middleware/auth.js.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { fechaHoraAhora } = require('../utils/constantes');

const router = express.Router();

// POST /api/auth/registro -> crea un usuario SIEMPRE con rol 'cliente'
router.post('/registro', async (req, res) => {
  const { nombre, email, password } = req.body || {};

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios' });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'El email no es válido' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const [existentes] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
  if (existentes.length > 0) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
  }

  // Nunca se guarda la contraseña en texto plano: se guarda el hash
  const hash = await bcrypt.hash(String(password), 10);
  const [resultado] = await pool.query(
    'INSERT INTO usuarios (nombre, email, password, rol, creado_en) VALUES (?, ?, ?, ?, ?)',
    [nombre, email, hash, 'cliente', fechaHoraAhora()]
  );

  res.status(201).json({ id: resultado.insertId, nombre, email, rol: 'cliente' });
});

// POST /api/auth/login -> devuelve el token JWT y los datos del usuario
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  const [filas] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
  const usuario = filas[0];

  // Mismo mensaje si no existe el email o si la contraseña es incorrecta
  if (!usuario || !(await bcrypt.compare(String(password), usuario.password))) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }

  const datos = { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol };
  const token = jwt.sign(datos, process.env.JWT_SECRET, { expiresIn: '8h' });

  res.json({ token, usuario: datos });
});

module.exports = router;
