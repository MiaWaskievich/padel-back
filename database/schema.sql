-- database/schema.sql
-- Crea la base "padel" y sus tablas. Después de este archivo se corre database/seed.sql.
-- La usa db.js (los datos de conexión están en .env). Funciona en MySQL (XAMPP) y en TiDB Cloud.
-- OJO: borra las tablas si ya existían (sirve para dejar la base limpia).

CREATE DATABASE IF NOT EXISTS padel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE padel;

DROP TABLE IF EXISTS pagos;
DROP TABLE IF EXISTS reservas;
DROP TABLE IF EXISTS horarios;
DROP TABLE IF EXISTS canchas;
DROP TABLE IF EXISTS clubes;
DROP TABLE IF EXISTS usuarios;

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,             -- hash bcrypt, nunca la contraseña real
  rol ENUM('cliente', 'admin', 'dueno') NOT NULL DEFAULT 'cliente',
  club_id INT NULL,                           -- solo para dueños: el club que administran
  creado_en DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE clubes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  direccion VARCHAR(200) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE canchas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  club_id INT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  precio_turno DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (club_id) REFERENCES clubes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Horarios de inicio de los turnos (los administra el admin desde su panel).
-- NO tiene FK con reservas: reservas.hora es un TIME común. Así, si se borra un horario,
-- las reservas viejas de esa hora no se rompen ni se borran.
CREATE TABLE horarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hora TIME NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- El saldo NO se guarda: se calcula como precio_total - monto_pagado
CREATE TABLE reservas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  cancha_id INT NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  precio_total DECIMAL(10,2) NOT NULL,
  monto_pagado DECIMAL(10,2) NOT NULL,
  estado ENUM('activa', 'cancelada') NOT NULL DEFAULT 'activa',
  cancelada_en DATETIME NULL,
  creado_en DATETIME NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (cancha_id) REFERENCES canchas(id),
  INDEX idx_cancha_fecha_hora (cancha_id, fecha, hora)  -- acelera la búsqueda de turnos ocupados
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pagos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reserva_id INT NOT NULL,
  tipo ENUM('sena', 'total', 'saldo') NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  fecha_pago DATETIME NOT NULL,
  FOREIGN KEY (reserva_id) REFERENCES reservas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
