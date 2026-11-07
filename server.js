process.env.TZ = 'America/Argentina/Buenos_Aires';
// server.js
// Punto de entrada de la API. Arma la app de Express, configura CORS y JSON, y monta las rutas:
//   routes/auth.js     -> /api/auth
//   routes/clubes.js   -> /api/clubes y /api/disponibilidad
//   routes/reservas.js -> /api/reservas
//   routes/admin.js    -> /api/admin
// La primera línea fija la zona horaria de Argentina, porque Render y TiDB trabajan en UTC
// y las fechas de "ahora" se calculan en Node (ver utils/constantes.js).

require('dotenv').config({ quiet: true }); // carga las variables del archivo .env

const express = require('express');
const cors = require('cors');

const app = express();

// CORS: solo se aceptan los orígenes listados en FRONT_URL (separados por coma).
// Las requests sin origin (curl, Postman) también se aceptan.
const origenesPermitidos = (process.env.FRONT_URL || '')
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || origenesPermitidos.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false); // sin headers CORS: el navegador bloquea la respuesta
    }
  }
}));

// Permite leer el body en formato JSON (req.body)
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensaje: 'API Pádel funcionando' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/clubes'));
app.use('/api/reservas', require('./routes/reservas'));
app.use('/api/admin', require('./routes/admin'));

// Ruta inexistente
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejo de errores: cualquier error no controlado termina acá y se responde en JSON
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El body no es un JSON válido' });
  }
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
// En Express 5, si el servidor no puede arrancar, el error llega como parámetro del callback
app.listen(PORT, (error) => {
  if (error) {
    // EADDRINUSE = el puerto ya lo está usando otro programa (por ejemplo, otro server abierto)
    console.error(error.code === 'EADDRINUSE' ? `El puerto ${PORT} ya está en uso` : error);
    process.exit(1); // terminamos con código de error para que no parezca que arrancó bien
  }
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
