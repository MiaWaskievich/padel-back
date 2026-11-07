// db.js
// Crea el pool de conexiones a MySQL (mysql2/promise) con los datos del archivo .env.
// Lo importan todos los archivos de routes/ para hacer consultas.
// Funciona con MySQL local (XAMPP) y con TiDB Cloud (que exige SSL: DB_SSL=true).

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,     // DATE y DATETIME vuelven como texto ('2026-11-07'), sin conversión de zona horaria
  decimalNumbers: true,  // DECIMAL vuelve como número (y no como string)
  ssl: process.env.DB_SSL === 'true'
    ? { minVersion: 'TLSv1.2', rejectUnauthorized: true }
    : undefined
});

module.exports = pool;
