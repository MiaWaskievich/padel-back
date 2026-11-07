# Pádel Reservas – Backend

API REST del Sistema de Reservas de Canchas de Pádel (Node + Express + MySQL).

📄 **Documentación completa (arquitectura, base de datos, flujos, concurrencia y preguntas de la defensa):
[ARQUITECTURA.md](ARQUITECTURA.md)**

Frontend: [github.com/MiaWaskievich/padel-front](https://github.com/MiaWaskievich/padel-front)

## Requisitos

- Node.js 18 o superior
- XAMPP con MySQL encendido (o cualquier MySQL / TiDB Cloud)

## Instalación

1. Crear la base (con MySQL de XAMPP encendido, desde esta carpeta, en `cmd`):
   ```
   C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < database\schema.sql
   C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < database\seed.sql
   ```
   En PowerShell el `<` no funciona: usar `cmd /c "..."` o importar los archivos desde phpMyAdmin / HeidiSQL.
   ⚠️ `schema.sql` borra y vuelve a crear las tablas.
2. `npm install`
3. `copy .env.example .env` y completar los valores (para los mails: `BREVO_API_KEY` y `MAIL_FROM`).

Usuario administrador del seed: **admin@padel.com / admin123**

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la API en `http://localhost:3000` y la reinicia al guardar cambios (nodemon) |
| `npm start` | Levanta la API sin nodemon (es el que usa Render) |
| `iniciar_proyecto.bat` | Doble clic: levanta el back, el front (`../padel-front` en `http://localhost:5500`) y abre el navegador |

## Endpoints

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/api/auth/registro` | Público | Crea un usuario cliente `{ nombre, email, password }` |
| POST | `/api/auth/login` | Público | `{ email, password }` → `{ token, usuario }` (token de 8 h) |
| GET | `/api/clubes` | Público | Clubes con sus canchas |
| GET | `/api/disponibilidad?club_id=&fecha=` | Público | Turnos libres/ocupados de cada cancha del club |
| POST | `/api/reservas` | Cliente | Reserva el carrito `{ items: [{ cancha_id, fecha, hora }], tipo_pago: 'sena' \| 'total' }` |
| GET | `/api/reservas/mias` | Logueado | Reservas del usuario logueado |
| PUT | `/api/reservas/:id/pagar-saldo` | Dueño o admin | Paga el saldo pendiente de una reserva |
| PUT | `/api/reservas/:id/cancelar` | Dueño o admin | Cancela la reserva (sin devolución) |
| GET | `/api/admin/dashboard?fecha=` | Admin | Resumen de caja del día (por defecto hoy) |
| GET | `/api/admin/reservas?fecha=` | Admin | Reservas con turno ese día (por defecto hoy) |
| POST | `/api/admin/usuarios` | Admin | Crea un usuario administrador `{ nombre, email, password }` |
| GET | `/api/admin/horarios` | Admin | Horarios de los turnos `[ { id, hora } ]` |
| POST | `/api/admin/horarios` | Admin | Agrega un horario `{ hora: 'HH:MM' }` |
| DELETE | `/api/admin/horarios/:id` | Admin | Borra un horario (409 si tiene reservas activas de hoy en adelante) |

Las rutas protegidas necesitan el header `Authorization: Bearer <token>`.
Los errores siempre se responden como `{ "error": "mensaje" }`.
