// routes/admin.js
// Rutas del panel de administración. Se monta en server.js bajo /api/admin.
// Todas piden token y rol 'admin' (middleware/auth.js).
// - GET  /dashboard?fecha= -> resumen de caja del día
// - GET  /reservas?fecha=  -> reservas con turno ese día
// - POST /usuarios         -> crea otro usuario administrador
// Usa db.js para las consultas y utils/constantes.js para la fecha de hoy.

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { verificarToken, soloRol } = require('../middleware/auth');
const { fechaHoy, fechaHoraAhora, esFechaValida } = require('../utils/constantes');

const router = express.Router();

router.use(verificarToken, soloRol('admin'));

// Lee ?fecha= y si no viene usa la de hoy. Devuelve null si la fecha es inválida.
function leerFecha(req) {
  const fecha = req.query.fecha || fechaHoy();
  return esFechaValida(fecha) ? fecha : null;
}

// GET /api/admin/dashboard?fecha=YYYY-MM-DD
router.get('/dashboard', async (req, res) => {
  const fecha = leerFecha(req);
  if (!fecha) {
    return res.status(400).json({ error: 'La fecha no es válida (YYYY-MM-DD)' });
  }

  // Pagos del día agrupados por tipo ('sena', 'total', 'saldo')
  const [porTipo] = await pool.query(
    `SELECT tipo, COUNT(*) AS cantidad, SUM(monto) AS monto
     FROM pagos
     WHERE DATE(fecha_pago) = ?
     GROUP BY tipo`,
    [fecha]
  );

  // Arma { cantidad, monto } para un tipo, con 0 si ese día no hubo pagos de ese tipo
  function resumenTipo(tipo) {
    const fila = porTipo.find((f) => f.tipo === tipo);
    return { cantidad: fila ? Number(fila.cantidad) : 0, monto: fila ? Number(fila.monto) : 0 };
  }

  const pagos_totales = resumenTipo('total');
  const senas_cobradas = resumenTipo('sena');
  const saldos_cobrados = resumenTipo('saldo');

  // Pagos del día agrupados por cancha
  const [porCancha] = await pool.query(
    `SELECT cl.nombre AS club, ca.nombre AS cancha, SUM(p.monto) AS monto
     FROM pagos p
     JOIN reservas r ON r.id = p.reserva_id
     JOIN canchas ca ON ca.id = r.cancha_id
     JOIN clubes cl ON cl.id = ca.club_id
     WHERE DATE(p.fecha_pago) = ?
     GROUP BY ca.id, cl.nombre, ca.nombre
     ORDER BY cl.nombre, ca.nombre`,
    [fecha]
  );

  // Reservas activas con turno ese día que todavía deben plata
  const [[pendientes]] = await pool.query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(precio_total - monto_pagado), 0) AS monto
     FROM reservas
     WHERE fecha = ? AND estado = 'activa' AND precio_total - monto_pagado > 0`,
    [fecha]
  );

  // Reservas canceladas ese día: lo que se había pagado queda retenido
  const [[retenidos]] = await pool.query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto_pagado), 0) AS monto
     FROM reservas
     WHERE estado = 'cancelada' AND DATE(cancelada_en) = ?`,
    [fecha]
  );

  res.json({
    fecha,
    total_recaudado: pagos_totales.monto + senas_cobradas.monto + saldos_cobrados.monto,
    ingresos_por_cancha: porCancha.map((f) => ({ club: f.club, cancha: f.cancha, monto: Number(f.monto) })),
    pagos_totales,
    senas_cobradas,
    saldos_cobrados,
    pendientes: { cantidad: Number(pendientes.cantidad), monto: Number(pendientes.monto) },
    retenidos: { cantidad: Number(retenidos.cantidad), monto: Number(retenidos.monto) }
  });
});

// GET /api/admin/reservas?fecha=YYYY-MM-DD
router.get('/reservas', async (req, res) => {
  const fecha = leerFecha(req);
  if (!fecha) {
    return res.status(400).json({ error: 'La fecha no es válida (YYYY-MM-DD)' });
  }

  const [reservas] = await pool.query(
    `SELECT r.id, u.nombre AS cliente, u.email, cl.nombre AS club, ca.nombre AS cancha,
            TIME_FORMAT(r.hora, '%H:%i') AS hora, r.precio_total, r.monto_pagado,
            (r.precio_total - r.monto_pagado) AS saldo, r.estado
     FROM reservas r
     JOIN usuarios u ON u.id = r.usuario_id
     JOIN canchas ca ON ca.id = r.cancha_id
     JOIN clubes cl ON cl.id = ca.club_id
     WHERE r.fecha = ?
     ORDER BY r.hora, cl.nombre, ca.nombre`,
    [fecha]
  );
  res.json({ fecha, reservas });
});

// POST /api/admin/usuarios -> crea un usuario con rol 'admin'
router.post('/usuarios', async (req, res) => {
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

  const hash = await bcrypt.hash(String(password), 10);
  const [resultado] = await pool.query(
    'INSERT INTO usuarios (nombre, email, password, rol, creado_en) VALUES (?, ?, ?, ?, ?)',
    [nombre, email, hash, 'admin', fechaHoraAhora()]
  );

  res.status(201).json({ id: resultado.insertId, nombre, email, rol: 'admin' });
});

module.exports = router;
