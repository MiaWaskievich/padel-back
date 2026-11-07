// routes/clubes.js
// Rutas públicas (no piden token). Se monta en server.js bajo /api.
// - GET /api/clubes: lista de clubes con sus canchas.
// - GET /api/disponibilidad: grilla de turnos libres/ocupados de un club en una fecha.
// Usa db.js para consultar y utils/constantes.js para los horarios y las fechas.

const express = require('express');
const pool = require('../db');
const { HORARIOS, esFechaValida, turnoPasado } = require('../utils/constantes');

const router = express.Router();

// GET /api/clubes
router.get('/clubes', async (req, res) => {
  const [clubes] = await pool.query('SELECT id, nombre, direccion FROM clubes ORDER BY id');
  const [canchas] = await pool.query('SELECT id, club_id, nombre, precio_turno FROM canchas ORDER BY id');

  // A cada club le agregamos el array con sus canchas
  const resultado = clubes.map((club) => ({
    ...club,
    canchas: canchas
      .filter((cancha) => cancha.club_id === club.id)
      .map(({ id, nombre, precio_turno }) => ({ id, nombre, precio_turno }))
  }));

  res.json(resultado);
});

// GET /api/disponibilidad?club_id=1&fecha=2026-11-08
router.get('/disponibilidad', async (req, res) => {
  const { club_id, fecha } = req.query;

  if (!club_id || !esFechaValida(fecha)) {
    return res.status(400).json({ error: 'Hay que indicar club_id y una fecha válida (YYYY-MM-DD)' });
  }

  const [clubes] = await pool.query('SELECT id FROM clubes WHERE id = ?', [club_id]);
  if (clubes.length === 0) {
    return res.status(404).json({ error: 'El club no existe' });
  }

  const [canchas] = await pool.query(
    'SELECT id, nombre, precio_turno FROM canchas WHERE club_id = ? ORDER BY id',
    [club_id]
  );

  // Reservas activas de las canchas de este club en esa fecha
  const [reservas] = await pool.query(
    `SELECT r.cancha_id, TIME_FORMAT(r.hora, '%H:%i') AS hora
     FROM reservas r
     JOIN canchas c ON c.id = r.cancha_id
     WHERE c.club_id = ? AND r.fecha = ? AND r.estado = 'activa'`,
    [club_id, fecha]
  );

  // Conjunto con claves "cancha|hora" para saber rápido si un turno está reservado
  const ocupados = new Set(reservas.map((r) => `${r.cancha_id}|${r.hora}`));

  res.json({
    fecha,
    horarios: HORARIOS,
    canchas: canchas.map((cancha) => ({
      ...cancha,
      turnos: HORARIOS.map((hora) => ({
        hora,
        // Ocupado si ya está reservado o si el horario ya pasó
        ocupado: ocupados.has(`${cancha.id}|${hora}`) || turnoPasado(fecha, hora)
      }))
    }))
  });
});

module.exports = router;
