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

Las rutas protegidas necesitan el header `Authorization: Bearer <token>`.
Los errores siempre se responden como `{ "error": "mensaje" }`.
