// middleware/auth.js
// Middlewares de seguridad que usan routes/reservas.js y routes/admin.js.
// - verificarToken: lee el JWT del header "Authorization: Bearer <token>" (lo genera routes/auth.js en el login)
//   y deja los datos del usuario en req.usuario.
// - soloRol(...roles): deja pasar solo si el rol del usuario está en la lista.

const jwt = require('jsonwebtoken');

function verificarToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Falta el token de autenticación' });
  }

  try {
    // Si el token fue modificado o ya venció, jwt.verify lanza un error
    req.usuario = jwt.verify(token, process.env.JWT_SECRET); // { id, nombre, email, rol }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o vencido' });
  }
}

// Se usa después de verificarToken, por ejemplo: soloRol('admin')
function soloRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tenés permiso para realizar esta acción' });
    }
    next();
  };
}

module.exports = { verificarToken, soloRol };
