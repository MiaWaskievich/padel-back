// routes/reservas.js
// Rutas de reservas (todas piden token). Se monta en server.js bajo /api/reservas.
// - POST /                 -> reserva el "carrito" de turnos en UNA transacción (solo clientes)
// - GET  /mias             -> reservas del usuario logueado
// - PUT  /:id/pagar-saldo  -> paga lo que falta de una reserva con seña
// - PUT  /:id/cancelar     -> cancela una reserva (sin devolución)
// Usa db.js (pool y transacciones), middleware/auth.js (token y rol) y utils/constantes.js
// (seña, fechas y obtenerHorarios, que lee los horarios válidos de la tabla "horarios").

const express = require('express');
const pool = require('../db');
const { verificarToken, soloRol } = require('../middleware/auth');
const { obtenerHorarios, PORCENTAJE_SENA, esFechaValida, turnoPasado, fechaHoraAhora } = require('../utils/constantes');

const router = express.Router();

// Todas las rutas de este archivo requieren estar logueado
router.use(verificarToken);

// POST /api/reservas
// Body: { items: [ { cancha_id, fecha, hora } ], tipo_pago: 'sena' | 'total' }
router.post('/', soloRol('cliente'), async (req, res) => {
  const { items, tipo_pago } = req.body || {};

  // PASO 1: validar el body antes de tocar la base
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El carrito está vacío' });
  }
  if (tipo_pago !== 'sena' && tipo_pago !== 'total') {
    return res.status(400).json({ error: "tipo_pago tiene que ser 'sena' o 'total'" });
  }

  // Horarios válidos: se consultan UNA sola vez, antes de recorrer los items
  const horarios = await obtenerHorarios(pool);

  const claves = new Set();
  for (const item of items) {
    const { cancha_id, fecha, hora } = item || {};
    if (!Number.isInteger(Number(cancha_id)) || !esFechaValida(fecha) || !horarios.includes(hora)) {
      return res.status(400).json({ error: 'Cada turno necesita cancha_id, fecha (YYYY-MM-DD) y una hora válida' });
    }
    if (turnoPasado(fecha, hora)) {
      return res.status(400).json({ error: `El turno del ${fecha} a las ${hora} ya pasó` });
    }
    const clave = `${cancha_id}|${fecha}|${hora}`;
    if (claves.has(clave)) {
      return res.status(400).json({ error: 'Hay turnos repetidos en el carrito' });
    }
    claves.add(clave);
  }

  // Ordenamos por cancha para que dos carritos siempre bloqueen las canchas en el mismo orden
  // (así se evita que uno espere al otro en círculo, lo que se llama "deadlock")
  const itemsOrdenados = [...items].sort((a, b) => Number(a.cancha_id) - Number(b.cancha_id));

  // PASO 2: pedimos una conexión propia del pool y empezamos la transacción.
  // Desde acá, todo lo que hagamos con "connection" se confirma junto (commit) o se deshace junto (rollback).
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const creadas = [];
    const ahora = fechaHoraAhora();

    for (const item of itemsOrdenados) {
      // PASO 3a: leemos la cancha con FOR UPDATE, que BLOQUEA esa fila hasta el commit/rollback.
      // Si otro usuario está reservando la misma cancha al mismo tiempo, su consulta se queda
      // esperando acá hasta que nosotros terminemos. Así nunca se reserva dos veces el mismo turno.
      const [canchas] = await connection.query(
        'SELECT id, nombre, club_id, precio_turno FROM canchas WHERE id = ? FOR UPDATE',
        [item.cancha_id]
      );
      const cancha = canchas[0];
      if (!cancha) {
        await connection.rollback();
        return res.status(404).json({ error: `La cancha ${item.cancha_id} no existe` });
      }

      // PASO 3b: con la cancha bloqueada, verificamos que el turno siga libre.
      // Este SELECT también lleva FOR UPDATE: un SELECT común dentro de una transacción lee una "foto"
      // de la base sacada antes, y podría no ver una reserva que otro usuario confirmó recién.
      // Una lectura con FOR UPDATE siempre lee el dato más reciente ya confirmado, por eso
      // todas las lecturas que deciden si se puede reservar son con bloqueo.
      const [existentes] = await connection.query(
        "SELECT id FROM reservas WHERE cancha_id = ? AND fecha = ? AND hora = ? AND estado = 'activa' FOR UPDATE",
        [cancha.id, item.fecha, item.hora]
      );
      if (existentes.length > 0) {
        // Deshacemos TODO el carrito (también los turnos que ya habíamos insertado)
        await connection.rollback();
        return res.status(409).json({
          error: `El turno de ${cancha.nombre} el ${item.fecha} a las ${item.hora} ya fue reservado`
        });
      }

      // PASO 4: el precio sale SIEMPRE de la base, nunca del front
      const precio = cancha.precio_turno;
      const monto = tipo_pago === 'total' ? precio : Math.round(precio * PORCENTAJE_SENA / 100);

      const [resultado] = await connection.query(
        `INSERT INTO reservas (usuario_id, cancha_id, fecha, hora, precio_total, monto_pagado, estado, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, 'activa', ?)`,
        [req.usuario.id, cancha.id, item.fecha, item.hora, precio, monto, ahora]
      );

      // Registramos el pago (seña o total) asociado a la reserva
      await connection.query(
        'INSERT INTO pagos (reserva_id, tipo, monto, fecha_pago) VALUES (?, ?, ?, ?)',
        [resultado.insertId, tipo_pago, monto, ahora]
      );

      const [clubes] = await connection.query('SELECT nombre FROM clubes WHERE id = ?', [cancha.club_id]);

      creadas.push({
        id: resultado.insertId,
        club: clubes[0].nombre,
        cancha: cancha.nombre,
        fecha: item.fecha,
        hora: item.hora,
        precio_total: precio,
        monto_pagado: monto,
        saldo: precio - monto
      });
    }

    // PASO 5: todo salió bien -> confirmamos los cambios y se liberan los bloqueos
    await connection.commit();

    // ETAPA 3: acá se envía el mail de confirmación

    const total = creadas.reduce((suma, r) => suma + r.precio_total, 0);
    const abonado = creadas.reduce((suma, r) => suma + r.monto_pagado, 0);

    res.status(201).json({
      reservas: creadas,
      totales: { total, abonado, saldo_pendiente: total - abonado }
    });
  } catch (error) {
    // Ante cualquier error deshacemos todo
    await connection.rollback();

    // Deadlock: dos transacciones quedaron esperando cada una un bloqueo que tiene la otra.
    // Como ninguna podría avanzar nunca, la base cancela una de las dos y la deshace entera
    // (no queda nada a medias). Al cliente le avisamos que vuelva a intentar.
    if (error.code === 'ER_LOCK_DEADLOCK') {
      return res.status(409).json({ error: 'Otro usuario está reservando esos turnos al mismo tiempo, intentá de nuevo' });
    }

    // Cualquier otro error inesperado termina en el manejador de server.js (500)
    throw error;
  } finally {
    // Siempre devolvemos la conexión al pool, haya salido bien o mal
    connection.release();
  }
});

// GET /api/reservas/mias
router.get('/mias', async (req, res) => {
  const [reservas] = await pool.query(
    `SELECT r.id, cl.nombre AS club, ca.nombre AS cancha, r.fecha, TIME_FORMAT(r.hora, '%H:%i') AS hora,
            r.precio_total, r.monto_pagado, (r.precio_total - r.monto_pagado) AS saldo, r.estado
     FROM reservas r
     JOIN canchas ca ON ca.id = r.cancha_id
     JOIN clubes cl ON cl.id = ca.club_id
     WHERE r.usuario_id = ?
     ORDER BY r.fecha DESC, r.hora DESC`,
    [req.usuario.id]
  );
  res.json(reservas);
});

// Devuelve true si el usuario logueado es el dueño de la reserva o es admin
function puedeModificar(usuario, reserva) {
  return usuario.rol === 'admin' || reserva.usuario_id === usuario.id;
}

// PUT /api/reservas/:id/pagar-saldo
router.put('/:id/pagar-saldo', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Bloqueamos la reserva para que no se pague dos veces al mismo tiempo
    const [filas] = await connection.query('SELECT * FROM reservas WHERE id = ? FOR UPDATE', [req.params.id]);
    const reserva = filas[0];

    if (!reserva) {
      await connection.rollback();
      return res.status(404).json({ error: 'La reserva no existe' });
    }
    if (!puedeModificar(req.usuario, reserva)) {
      await connection.rollback();
      return res.status(403).json({ error: 'No podés modificar una reserva de otro usuario' });
    }
    if (reserva.estado !== 'activa') {
      await connection.rollback();
      return res.status(400).json({ error: 'La reserva no está activa' });
    }

    const saldo = reserva.precio_total - reserva.monto_pagado;
    if (saldo <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'La reserva no tiene saldo pendiente' });
    }

    // Registramos el pago del saldo y dejamos la reserva totalmente paga
    await connection.query(
      "INSERT INTO pagos (reserva_id, tipo, monto, fecha_pago) VALUES (?, 'saldo', ?, ?)",
      [reserva.id, saldo, fechaHoraAhora()]
    );
    await connection.query('UPDATE reservas SET monto_pagado = precio_total WHERE id = ?', [reserva.id]);

    await connection.commit();

    res.json({ mensaje: 'Saldo pagado', reserva_id: reserva.id, monto: saldo });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

// PUT /api/reservas/:id/cancelar
// No hay devolución: monto_pagado queda igual (es el "monto retenido") y el horario se libera.
router.put('/:id/cancelar', async (req, res) => {
  const [filas] = await pool.query('SELECT * FROM reservas WHERE id = ?', [req.params.id]);
  const reserva = filas[0];

  if (!reserva) {
    return res.status(404).json({ error: 'La reserva no existe' });
  }
  if (!puedeModificar(req.usuario, reserva)) {
    return res.status(403).json({ error: 'No podés modificar una reserva de otro usuario' });
  }

  // La condición estado = 'activa' en el UPDATE evita cancelar dos veces la misma reserva
  const [resultado] = await pool.query(
    "UPDATE reservas SET estado = 'cancelada', cancelada_en = ? WHERE id = ? AND estado = 'activa'",
    [fechaHoraAhora(), reserva.id]
  );
  if (resultado.affectedRows === 0) {
    return res.status(400).json({ error: 'La reserva no está activa' });
  }

  res.json({ mensaje: 'Reserva cancelada', reserva_id: reserva.id, monto_retenido: reserva.monto_pagado });
});

module.exports = router;
