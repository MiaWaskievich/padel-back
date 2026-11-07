-- database/seed.sql
-- Datos iniciales: 3 clubes con sus canchas y un usuario administrador.
-- Se corre DESPUÉS de database/schema.sql.
-- Admin: admin@padel.com / admin123 (la contraseña está guardada como hash bcrypt).

USE padel;

INSERT INTO clubes (id, nombre, direccion) VALUES
  (1, 'Pádel Norte', 'Av. Cabildo 2450, CABA'),
  (2, 'Club La Red', 'Av. Rivadavia 6100, CABA'),
  (3, 'Punto de Oro', 'Av. San Martín 1820, Vicente López');

INSERT INTO canchas (club_id, nombre, precio_turno) VALUES
  (1, 'Cancha 1 (cristal)', 24000.00),
  (1, 'Cancha 2 (cemento)', 18000.00),
  (2, 'Cancha Central', 26000.00),
  (2, 'Cancha 2', 20000.00),
  (2, 'Cancha 3 (techada)', 28000.00),
  (3, 'Cancha A', 22000.00),
  (3, 'Cancha B', 19000.00);

INSERT INTO usuarios (nombre, email, password, rol, creado_en) VALUES
  ('Administrador', 'admin@padel.com', '$2b$10$rOPG.NpBsJ2rxQ6I9vIN6O9FzME1Blkh/UJs8RvM/7xS6DTpDeBhO', 'admin', '2026-01-01 00:00:00');
