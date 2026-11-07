// utils/constantes.js
// Constantes del negocio (porcentaje de seña), funciones de fecha y la lectura de los horarios de turnos.
// Lo usan routes/clubes.js, routes/reservas.js y routes/admin.js.
// Los horarios ya no son una constante: están en la tabla "horarios" (database/schema.sql)
// y el admin los administra desde routes/admin.js.
// Las fechas de "ahora" se calculan acá (en Node) y no con NOW()/CURDATE() de MySQL,
// porque la zona horaria se fija en server.js (process.env.TZ) y la base puede estar en UTC.

// Devuelve los horarios de la tabla como array de strings 'HH:MM', ordenados.
// Recibe el pool o una connection (cualquiera de los dos tiene .query).
async function obtenerHorarios(conexion) {
  const [filas] = await conexion.query("SELECT TIME_FORMAT(hora, '%H:%i') AS hora FROM horarios ORDER BY hora");
  return filas.map((fila) => fila.hora);
}

// Porcentaje del precio que se cobra como seña
const PORCENTAJE_SENA = 30;

// Agrega un 0 adelante a los números de un dígito (5 -> '05')
function dosDigitos(numero) {
  return String(numero).padStart(2, '0');
}

// Fecha de hoy en formato 'YYYY-MM-DD'
function fechaHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

// Fecha y hora actual en formato 'YYYY-MM-DD HH:MM:SS' (para guardar en columnas DATETIME)
function fechaHoraAhora() {
  const d = new Date();
  return `${fechaHoy()} ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}:${dosDigitos(d.getSeconds())}`;
}

// Devuelve true si el texto es una fecha real con formato 'YYYY-MM-DD'
function esFechaValida(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const d = new Date(anio, mes - 1, dia);
  // Si la fecha no existe (ej: 2026-02-30) el Date se "corre" al mes siguiente
  return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia;
}

// Devuelve true si el turno (fecha + hora 'HH:MM') ya empezó o es de un día anterior
function turnoPasado(fecha, hora) {
  const ahora = fechaHoraAhora().slice(0, 16); // 'YYYY-MM-DD HH:MM'
  return `${fecha} ${hora}` <= ahora; // las comparaciones de texto sirven porque el formato es fijo
}

module.exports = { obtenerHorarios, PORCENTAJE_SENA, fechaHoy, fechaHoraAhora, esFechaValida, turnoPasado };
