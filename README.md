# Pádel Reservas – Backend

API REST del Sistema de Reservas de Canchas de Pádel (Node + Express + MySQL).

## Requisitos

- Node.js 18 o superior
- XAMPP con MySQL encendido (o cualquier MySQL / TiDB Cloud)

## Base de datos (XAMPP)

Con MySQL encendido desde el panel de XAMPP, en una terminal dentro de `padel-back`:

```
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < database/schema.sql
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < database/seed.sql
```

> En PowerShell el `<` no funciona; usar `cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < database\schema.sql"` (y lo mismo con seed.sql).
> También se pueden importar los dos archivos desde phpMyAdmin (pestaña Importar), primero schema.sql y después seed.sql.

`schema.sql` borra y vuelve a crear las tablas, así que sirve para dejar la base limpia.

Usuario administrador del seed: **admin@padel.com / admin123**

## Instalación y ejecución

```
copy .env.example .env
npm install
npm run dev
```

La API queda en `http://localhost:3000` (GET `/` responde `{ "mensaje": "API Pádel funcionando" }`).

## Mails

Al confirmar una reserva se manda un mail con el detalle usando [Brevo](https://www.brevo.com),
un servicio de envío de mails con plan gratis. Se usa su **API HTTP** (HTTPS) y no SMTP, porque
Render (plan gratis) bloquea los puertos SMTP.

Variables del `.env`:

- `BREVO_API_KEY`: la API key de Brevo (SMTP & API → API Keys).
- `MAIL_FROM`: el email remitente, verificado en Brevo (Senders).
- `MAIL_FROM_NAME`: el nombre que ve quien recibe el mail.

Si falta la API key o el remitente, la reserva funciona igual y solo se muestra un aviso en la consola.

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

Los horarios de los turnos se guardan en la tabla `horarios` (el seed carga 10 turnos de 90 minutos,
de 08:00 a 21:30) y los administra el admin desde su panel.

Las rutas protegidas necesitan el header `Authorization: Bearer <token>`.
Los errores siempre se responden como `{ "error": "mensaje" }`.
