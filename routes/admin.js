// routes/admin.js
// Rutas del panel de administración. Se monta en server.js bajo /api/admin.
// Todas piden token y rol 'admin' (middleware/auth.js).
// - GET  /dashboard?fecha= -> resumen de caja del día
// - GET  /reservas?fecha=  -> reservas con turno ese día
// - POST /usuarios         -> crea otro usuario administrador
// - GET    /horarios       -> lista de horarios de los turnos (tabla "horarios")
// - POST   /horarios       -> agrega un horario
// - DELETE /horarios/:id   -> borra un horario (si no tiene reservas activas a futuro)
// Los horarios que se cargan acá los usan routes/clubes.js (grilla) y routes/reservas.js (validación).
// Usa db.js para las consultas y utils/constantes.js para la fecha de hoy.

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { verificarToken, soloRol } = require('../middleware/auth');
const { fechaHoy, fechaHoraAhora, esFechaValida } = require('../utils/constantes');

const router = express.Router();

// Al panel entran el admin y el dueño. Las rutas que son SOLO del admin
// (crear dueños y horarios) vuelven a pedir soloRol('admin') más abajo.
router.use(verificarToken, soloRol('admin', 'dueno'));

// Arma el pedacito de SQL que limita las consultas al club del dueño.
// - Si es dueño: agrega " AND r.cancha_id IN (canchas de su club)".
//   La subconsulta (SELECT id FROM canchas WHERE club_id = ?) devuelve los ids
//   de todas las canchas de ese club, y IN se queda con las reservas de esas canchas.
// - Si es admin: no agrega nada, así ve todos los clubes.
// Las consultas que lo usan llaman "r" a la tabla reservas.
function filtroClub(usuario) {
  if (usuario.rol === 'dueno') {
    return { sql: ' AND r.cancha_id IN (SELECT id FROM canchas WHERE club_id = ?)', valores: [usuario.club_id] };
  }
  return { sql: '', valores: [] };
}

// Lee ?fecha= y si no viene usa la de hoy. Devuelve null si la fecha es inválida.
function leerFecha(req) {
  const fecha = req.query.fecha || fechaHoy();
  return esFechaValida(fecha) ? fecha : null;
}

// GET /api/admin/dashboard?fecha=YYYY-MM-DD
// Admin: números de todos los clubes. Dueño: solo de las canchas de su club.
router.get('/dashboard', async (req, res) => {
  const fecha = leerFecha(req);
  if (!fecha) {
    return res.status(400).json({ error: 'La fecha no es válida (YYYY-MM-DD)' });
  }

  // Filtro por club: vacío para el admin, "AND r.cancha_id IN (...)" para el dueño
  const filtro = filtroClub(req.usuario);

  // Pagos del día agrupados por tipo ('sena', 'total', 'saldo').
  // Se une con reservas (r) para saber de qué cancha es cada pago y poder filtrar.
  const [porTipo] = await pool.query(
    `SELECT p.tipo, COUNT(*) AS cantidad, SUM(p.monto) AS monto
     FROM pagos p
     JOIN reservas r ON r.id = p.reserva_id
     WHERE DATE(p.fecha_pago) = ?${filtro.sql}
     GROUP BY p.tipo`,
    [fecha, ...filtro.valores] // "...": agrega los valores del filtro (ninguno, o el id del club)
  );

  // Arma { cantidad, monto } para un tipo, con 0 si ese día no hubo pagos de ese tipo
  function resumenTipo(tipo) {
    const fila = porTipo.find((f) => f.tipo === tipo);
    return { cantidad: fila ? Number(fila.cantidad) : 0, monto: fila ? Number(fila.monto) : 0 };
  }

  const pagos_totales = resumenTipo('total');
  const senas_cobradas = resumenTipo('sena');
  const saldos_cobrados = resumenTipo('saldo');

  // Pagos del día agrupados por cancha (el dueño ve solo las canchas de su club)
  const [porCancha] = await pool.query(
    `SELECT cl.nombre AS club, ca.nombre AS cancha, SUM(p.monto) AS monto
     FROM pagos p
     JOIN reservas r ON r.id = p.reserva_id
     JOIN canchas ca ON ca.id = r.cancha_id
     JOIN clubes cl ON cl.id = ca.club_id
     WHERE DATE(p.fecha_pago) = ?${filtro.sql}
     GROUP BY ca.id, cl.nombre, ca.nombre
     ORDER BY cl.nombre, ca.nombre`,
    [fecha, ...filtro.valores]
  );

  // Reservas activas con turno ese día que todavía deben plata
  const [[pendientes]] = await pool.query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(r.precio_total - r.monto_pagado), 0) AS monto
     FROM reservas r
     WHERE r.fecha = ? AND r.estado = 'activa' AND r.precio_total - r.monto_pagado > 0${filtro.sql}`,
    [fecha, ...filtro.valores]
  );

  // Reservas canceladas ese día: lo que se había pagado queda retenido
  const [[retenidos]] = await pool.query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(r.monto_pagado), 0) AS monto
     FROM reservas r
     WHERE r.estado = 'cancelada' AND DATE(r.cancelada_en) = ?${filtro.sql}`,
    [fecha, ...filtro.valores]
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
// Admin: reservas de todos los clubes. Dueño: solo las de las canchas de su club.
router.get('/reservas', async (req, res) => {
  const fecha = leerFecha(req);
  if (!fecha) {
    return res.status(400).json({ error: 'La fecha no es válida (YYYY-MM-DD)' });
  }

  const filtro = filtroClub(req.usuario);

  const [reservas] = await pool.query(
    `SELECT r.id, u.nombre AS cliente, u.email, cl.nombre AS club, ca.nombre AS cancha,
            TIME_FORMAT(r.hora, '%H:%i') AS hora, r.precio_total, r.monto_pagado,
            (r.precio_total - r.monto_pagado) AS saldo, r.estado
     FROM reservas r
     JOIN usuarios u ON u.id = r.usuario_id
     JOIN canchas ca ON ca.id = r.cancha_id
     JOIN clubes cl ON cl.id = ca.club_id
     WHERE r.fecha = ?${filtro.sql}
     ORDER BY r.hora, cl.nombre, ca.nombre`,
    [fecha, ...filtro.valores]
  );
  res.json({ fecha, reservas });
});

// ---------- Horarios de los turnos ----------
// No se valida que los turnos de 90 minutos no se superpongan (por ejemplo 08:00 y 08:30):
// elegir horarios que tengan sentido es responsabilidad del admin.

// GET /api/admin/horarios
router.get('/horarios', soloRol('admin'), async (req, res) => {
  const [horarios] = await pool.query(
    "SELECT id, TIME_FORMAT(hora, '%H:%i') AS hora FROM horarios ORDER BY hora"
  );
  res.json(horarios);
});

// POST /api/admin/horarios { hora: 'HH:MM' }
router.post('/horarios', soloRol('admin'), async (req, res) => {
  const { hora } = req.body || {};

  // De 00:00 a 23:59: horas 00-19 o 20-23, minutos 00-59
  if (typeof hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    return res.status(400).json({ error: 'La hora tiene que tener el formato HH:MM (de 00:00 a 23:59)' });
  }

  const [existentes] = await pool.query('SELECT id FROM horarios WHERE hora = ?', [hora]);
  if (existentes.length > 0) {
    return res.status(409).json({ error: `El horario ${hora} ya existe` });
  }

  const [resultado] = await pool.query('INSERT INTO horarios (hora) VALUES (?)', [hora]);
  res.status(201).json({ id: resultado.insertId, hora });
});

// DELETE /api/admin/horarios/:id
router.delete('/horarios/:id', soloRol('admin'), async (req, res) => {
  const [filas] = await pool.query(
    "SELECT id, TIME_FORMAT(hora, '%H:%i') AS hora FROM horarios WHERE id = ?",
    [req.params.id]
  );
  const horario = filas[0];
  if (!horario) {
    return res.status(404).json({ error: 'El horario no existe' });
  }

  // No se puede borrar si hay reservas activas de hoy en adelante en esa hora
  // (las reservas pasadas o canceladas no importan: quedan guardadas igual)
  const [[{ cantidad }]] = await pool.query(
    "SELECT COUNT(*) AS cantidad FROM reservas WHERE hora = ? AND estado = 'activa' AND fecha >= ?",
    [horario.hora, fechaHoy()]
  );
  if (cantidad > 0) {
    return res.status(409).json({ error: `Hay ${cantidad} reservas activas en ese horario. Cancelalas antes de borrarlo` });
  }

  await pool.query('DELETE FROM horarios WHERE id = ?', [horario.id]);
  res.json({ mensaje: `Horario ${horario.hora} eliminado` });
});

// POST /api/admin/usuarios -> el admin da de alta un DUEÑO y le asigna un club
router.post('/usuarios', soloRol('admin'), async (req, res) => {
  const { nombre, email, password, club_id } = req.body || {};

  if (!nombre || !email || !password || !club_id) {
    return res.status(400).json({ error: 'Nombre, email, contraseña y club son obligatorios' });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'El email no es válido' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  // El club elegido tiene que existir
  const [clubes] = await pool.query('SELECT id FROM clubes WHERE id = ?', [club_id]);
  if (clubes.length === 0) {
    return res.status(404).json({ error: 'El club no existe' });
  }

  const [existentes] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
  if (existentes.length > 0) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
  }

  const hash = await bcrypt.hash(String(password), 10); // nunca se guarda la contraseña real
  const [resultado] = await pool.query(
    'INSERT INTO usuarios (nombre, email, password, rol, club_id, creado_en) VALUES (?, ?, ?, ?, ?, ?)',
    [nombre, email, hash, 'dueno', club_id, fechaHoraAhora()]
  );

  res.status(201).json({ id: resultado.insertId, nombre, email, rol: 'dueno', club_id });
});
// ---------- Dueños de club (solo admin) ----------

// GET /api/admin/duenos -> lista de todos los dueños con el nombre de su club
router.get('/duenos', soloRol('admin'), async (req, res) => {
  const [duenos] = await pool.query(
    `SELECT u.id, u.nombre, u.email, cl.nombre AS club
     FROM usuarios u
     LEFT JOIN clubes cl ON cl.id = u.club_id   -- LEFT JOIN: si un dueño no tuviera club, igual aparece
     WHERE u.rol = 'dueno'                        -- solo dueños: nunca lista admins ni clientes
     ORDER BY cl.nombre, u.nombre`
  );
  res.json(duenos);
});

// DELETE /api/admin/duenos/:id -> elimina un dueño
router.delete('/duenos/:id', soloRol('admin'), async (req, res) => {
  // "AND rol = 'dueno'" es una protección: aunque alguien mande el id de un admin
  // o de un cliente, esta consulta no lo borra (solo borra usuarios que sean dueños).
  const [resultado] = await pool.query(
    "DELETE FROM usuarios WHERE id = ? AND rol = 'dueno'",
    [req.params.id]
  );

  // affectedRows = cuántas filas se borraron. 0 = ese id no existe o no es un dueño
  if (resultado.affectedRows === 0) {
    return res.status(404).json({ error: 'El dueño no existe' });
  }

  res.json({ mensaje: 'Dueño eliminado' });
});


// ---------- Clubes y canchas (solo admin) ----------
// La lista de clubes con sus canchas se lee con la ruta pública GET /api/clubes (routes/clubes.js).

// POST /api/admin/clubes -> crea un club nuevo
router.post('/clubes', soloRol('admin'), async (req, res) => {
  // trim() saca los espacios de más al principio y al final
  const nombre = String(req.body?.nombre || '').trim();
  const direccion = String(req.body?.direccion || '').trim();

  if (!nombre || !direccion) {
    return res.status(400).json({ error: 'El nombre y la dirección del club son obligatorios' });
  }
  // Los límites son los mismos que tienen las columnas en schema.sql
  if (nombre.length > 100 || direccion.length > 200) {
    return res.status(400).json({ error: 'El nombre o la dirección son demasiado largos' });
  }

  // No se permiten dos clubes con el mismo nombre
  const [existentes] = await pool.query('SELECT id FROM clubes WHERE nombre = ?', [nombre]);
  if (existentes.length > 0) {
    return res.status(409).json({ error: 'Ya existe un club con ese nombre' });
  }

  const [resultado] = await pool.query(
    'INSERT INTO clubes (nombre, direccion) VALUES (?, ?)',
    [nombre, direccion]
  );
  res.status(201).json({ id: resultado.insertId, nombre, direccion });
});

// POST /api/admin/canchas -> agrega una cancha a un club
router.post('/canchas', soloRol('admin'), async (req, res) => {
  const club_id = Number(req.body?.club_id);
  const nombre = String(req.body?.nombre || '').trim();
  const precio_turno = Number(req.body?.precio_turno);

  if (!club_id || !nombre) {
    return res.status(400).json({ error: 'El club y el nombre de la cancha son obligatorios' });
  }
  if (nombre.length > 100) {
    return res.status(400).json({ error: 'El nombre de la cancha es demasiado largo' });
  }
  // El precio tiene que ser un número mayor que 0 (la columna admite hasta 99.999.999,99)
  if (!Number.isFinite(precio_turno) || precio_turno <= 0 || precio_turno >= 100000000) {
    return res.status(400).json({ error: 'El precio del turno no es válido' });
  }

  // El club tiene que existir
  const [clubes] = await pool.query('SELECT id FROM clubes WHERE id = ?', [club_id]);
  if (clubes.length === 0) {
    return res.status(404).json({ error: 'El club no existe' });
  }

  // Dentro de un mismo club no puede haber dos canchas con el mismo nombre
  const [repetidas] = await pool.query(
    'SELECT id FROM canchas WHERE club_id = ? AND nombre = ?', [club_id, nombre]);
  if (repetidas.length > 0) {
    return res.status(409).json({ error: 'Ese club ya tiene una cancha con ese nombre' });
  }

  const [resultado] = await pool.query(
    'INSERT INTO canchas (club_id, nombre, precio_turno) VALUES (?, ?, ?)',
    [club_id, nombre, precio_turno]
  );
  res.status(201).json({ id: resultado.insertId, club_id, nombre, precio_turno });
});

module.exports = router;
