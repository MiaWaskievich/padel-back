// utils/mailer.js
// Envía el mail de confirmación de reserva. Lo usa routes/reservas.js después de confirmar el carrito.
// Usa la API HTTP de Brevo (https://api.brevo.com) con fetch, sin librerías: Render (plan gratis)
// bloquea los puertos SMTP (25, 465, 587), así que no se puede usar nodemailer por SMTP. La API de
// Brevo funciona por HTTPS (puerto 443), que nunca está bloqueado.
// Variables del .env: BREVO_API_KEY, MAIL_FROM (remitente verificado en Brevo) y MAIL_FROM_NAME.

const formatoPlata = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

function formatearPlata(n) {
  return formatoPlata.format(Number(n) || 0);
}

// 'YYYY-MM-DD' -> 'DD/MM/AAAA'
function formatearFecha(fecha) {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

// Reemplaza los caracteres especiales para que un texto (ej: el nombre del usuario) no pueda meter HTML en el mail
function escaparHTML(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Arma el HTML del mail (con estilos inline, porque muchos clientes de mail ignoran los <style>)
function armarHTML({ nombre, reservas, totales, tipo_pago }) {
  const celda = 'padding:8px;border:1px solid #dde3e9;';

  const filas = reservas.map((r) => `
    <tr>
      <td style="${celda}">${escaparHTML(r.club)}</td>
      <td style="${celda}">${escaparHTML(r.cancha)}</td>
      <td style="${celda}">${formatearFecha(r.fecha)}</td>
      <td style="${celda}">${escaparHTML(r.hora)}</td>
      <td style="${celda}">${formatearPlata(r.precio_total)}</td>
      <td style="${celda}">${formatearPlata(r.monto_pagado)}</td>
      <td style="${celda}">${formatearPlata(r.saldo)}</td>
    </tr>`).join('');

  return `
  <div style="font-family:Arial,sans-serif;color:#1f2933;max-width:640px;">
    <h2 style="color:#1e4e9c;">🎾 ¡Reserva confirmada!</h2>
    <p>Hola ${escaparHTML(nombre)}, estos son los turnos que reservaste:</p>

    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead>
        <tr style="background:#e6eefb;color:#163a75;">
          <th style="${celda}">Club</th><th style="${celda}">Cancha</th><th style="${celda}">Fecha</th>
          <th style="${celda}">Hora</th><th style="${celda}">Precio</th><th style="${celda}">Abonado</th>
          <th style="${celda}">Saldo</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>

    <p style="margin-top:16px;">
      <strong>Total:</strong> ${formatearPlata(totales.total)}<br>
      <strong>Abonado:</strong> ${formatearPlata(totales.abonado)}<br>
      <strong>Saldo pendiente:</strong> ${formatearPlata(totales.saldo_pendiente)}<br>
      <strong>Tipo de pago:</strong> ${tipo_pago === 'total' ? 'Pago total' : 'Seña 30%'}
    </p>

    <p style="background:#fff7d6;color:#7a5b00;padding:10px;border-radius:6px;">
      El saldo pendiente debe abonarse antes de usar la cancha. Las cancelaciones no tienen devolución.
    </p>
  </div>`;
}

async function enviarConfirmacion({ email, nombre, reservas, totales, tipo_pago }) {
  // Sin configuración de Brevo no se manda nada, pero el sistema sigue funcionando igual
  if (!process.env.BREVO_API_KEY || !process.env.MAIL_FROM) {
    console.warn('Mail no enviado: falta configurar Brevo');
    return;
  }

  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { name: process.env.MAIL_FROM_NAME, email: process.env.MAIL_FROM },
      to: [{ email, name: nombre }],
      subject: 'Confirmación de reserva - Pádel Reservas',
      htmlContent: armarHTML({ nombre, reservas, totales, tipo_pago })
    }),
    signal: AbortSignal.timeout(10000) // si Brevo no contesta en 10 segundos, se corta
  });

  if (!respuesta.ok) {
    throw new Error(`Brevo respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
}

module.exports = { enviarConfirmacion };
