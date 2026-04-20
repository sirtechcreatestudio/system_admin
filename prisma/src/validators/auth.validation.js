// Validación simple sin Joi (para que funcione inmediatamente)
const validateLogin = (data) => {
  if (!data.email || !data.password) {
    return { error: { details: [{ message: 'Email y contraseña son requeridos' }] } };
  }
  if (!data.email.includes('@')) {
    return { error: { details: [{ message: 'Email inválido' }] } };
  }
  if (data.password.length < 6) {
    return { error: { details: [{ message: 'La contraseña debe tener al menos 6 caracteres' }] } };
  }
  return { error: null };
};

const validateRegister = (data) => {
  if (!data.nombre || !data.email || !data.password) {
    return { error: { details: [{ message: 'Todos los campos son requeridos' }] } };
  }
  if (!data.email.includes('@')) {
    return { error: { details: [{ message: 'Email inválido' }] } };
  }
  if (data.password.length < 6) {
    return { error: { details: [{ message: 'La contraseña debe tener al menos 6 caracteres' }] } };
  }
  if (data.password !== data.confirmPassword) {
    return { error: { details: [{ message: 'Las contraseñas no coinciden' }] } };
  }
  return { error: null };
};

const validateChangePassword = (data) => {
  if (!data.oldPassword || !data.newPassword) {
    return { error: { details: [{ message: 'Todas las contraseñas son requeridas' }] } };
  }
  if (data.newPassword.length < 6) {
    return { error: { details: [{ message: 'La nueva contraseña debe tener al menos 6 caracteres' }] } };
  }
  if (data.newPassword !== data.confirmNewPassword) {
    return { error: { details: [{ message: 'Las contraseñas nuevas no coinciden' }] } };
  }
  return { error: null };
};

module.exports = {
  validateLogin,
  validateRegister,
  validateChangePassword
};