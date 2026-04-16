const authService = require('../services/auth.service');

const AuthController = {
  // Registro público
  async register(req, res) {
    try {
      const { nombre, email, password, confirmPassword } = req.body;
      
      if (!nombre || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Nombre, email y contraseña son requeridos'
        });
      }
      
      if (password !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Las contraseñas no coinciden'
        });
      }

      const result = await authService.register({ 
        nombre, 
        email, 
        password, 
        rol_id: 3
      });
      
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Registro para admin
  async registerByAdmin(req, res) {
    try {
      const { nombre, email, password, rol_id } = req.body;
      
      if (!nombre || !email || !password || !rol_id) {
        return res.status(400).json({
          success: false,
          message: 'Todos los campos son requeridos'
        });
      }

      const result = await authService.register({ 
        nombre, 
        email, 
        password, 
        rol_id 
      });
      
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  async login(req, res) {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email y contraseña son requeridos'
        });
      }

      const result = await authService.login(email, password);
      
      if (result.success) {
        return res.status(200).json({
          success: true,
          token: result.token,
          user: result.user
        });
      } else {
        return res.status(401).json(result);
      }
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }
  },

  async getProfile(req, res) {
    try {
      const userProfile = await authService.getProfile(req.user.id);
      
      return res.status(200).json({
        success: true,
        data: userProfile
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }
};

module.exports = AuthController;