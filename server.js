const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Cargar variables de entorno locales si existe un archivo .env
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar Express para parsear JSON y urlencoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializar clientes de Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("CRÍTICO: SUPABASE_URL y SUPABASE_ANON_KEY son requeridos en las variables de entorno.");
  process.exit(1);
}

// Cliente estándar de Supabase para operaciones de autenticación pública
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Cliente administrador de Supabase (bypassa RLS) para consultas internas del servidor
const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : supabaseAuth;

console.log("[Supabase Config] URL:", SUPABASE_URL);
console.log("[Supabase Config] Service Role Key configurada:", SUPABASE_SERVICE_ROLE_KEY ? `SÍ (largo: ${SUPABASE_SERVICE_ROLE_KEY.length})` : "NO");

// Middleware para verificar autenticación mediante el token de Supabase
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  console.log(`[requireAuth] Ruta: ${req.path}, Método: ${req.method}, Authorization:`, authHeader ? 'Presente' : 'Ausente');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn(`[requireAuth] Falta token o no empieza con Bearer en ${req.path}`);
    return res.status(401).json({ error: 'Acceso no autorizado. Falta token.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Sesión inválida o expirada.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Error al verificar sesión.' });
  }
}

// Middleware para verificar rol de Administrador
async function requireAdmin(req, res, next) {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (error || !profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso restringido. Se requiere rol de administrador.' });
    }
    req.userRole = profile.role;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Error al verificar rol de usuario.' });
  }
}

// ─── ENDPOINT: CONFIGURACIÓN DINÁMICA DE WEBHOOKS ─────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    webhookCargaCv: process.env.WEBHOOK_CARGA_CV || 'https://prototipos.jpvidaldesign.com/webhook/Carga_CV_Supa',
    webhookAgenteCv: process.env.WEBHOOK_AGENTE_CV || 'https://prototipos.jpvidaldesign.com/webhook/Agente_CV_Supa',
    webhookObtenerCv: process.env.WEBHOOK_OBTENER_CV || 'https://prototipos.jpvidaldesign.com/webhook/Obtener_CV'
  });
});

// ─── ENDPOINTS: AUTENTICACIÓN ────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos.' });
  }

  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Obtener rol del perfil
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    const role = (profileError || !profile) ? 'usuario' : profile.role;

    res.json({
      session: data.session,
      user: data.user,
      role
    });
  } catch (err) {
    res.status(500).json({ error: 'Error en el inicio de sesión.' });
  }
});

app.get('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    const role = (error || !profile) ? 'usuario' : profile.role;
    res.json({ user: req.user, role });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener perfil.' });
  }
});

// ─── ENDPOINTS: GESTIÓN DE CVS ────────────────────────────────────────────────
app.get('/api/cvs', requireAuth, async (req, res) => {
  try {
    const { data: cvList, error } = await supabaseAdmin
      .from('cvs')
      .select('nombre, apellido, created_at, web_cv_link')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(cvList || []);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener currículums.' });
  }
});

app.get('/api/cvs/count', requireAuth, async (req, res) => {
  try {
    const { count, error } = await supabaseAdmin
      .from('cvs')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ count: count || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la cantidad de currículums.' });
  }
});

app.get('/api/cvs/all', requireAuth, async (req, res) => {
  try {
    const { data: cvList, error } = await supabaseAdmin
      .from('cvs')
      .select('nombre, apellido, profesion, perfil_laboral, email, web_cv_link, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(cvList || []);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la lista de currículums.' });
  }
});

app.post('/api/cvs', requireAuth, requireAdmin, async (req, res) => {
  const cvData = req.body;
  if (!cvData || !cvData.file_hash) {
    return res.status(400).json({ error: 'Datos de CV e identificador de hash inválidos.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('cvs')
      .insert([cvData])
      .select();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar el currículum.' });
  }
});

// ─── ENDPOINTS: GESTIÓN DE USUARIOS (ADMIN-ONLY) ──────────────────────────────
app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: email, password, role.' });
  }

  if (role !== 'admin' && role !== 'usuario') {
    return res.status(400).json({ error: 'Rol inválido. Debe ser admin o usuario.' });
  }

  try {
    // 1. Crear el usuario en auth.users de Supabase
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createError) {
      console.error("[POST /api/users] Error completo al crear usuario:", createError);
      const errMsg = createError.message || createError.error_description || (typeof createError === 'object' ? JSON.stringify(createError) : String(createError)) || 'Error desconocido de Supabase Auth';
      return res.status(400).json({ error: errMsg });
    }

    // 2. Modificar el rol en la tabla de perfiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ role })
      .eq('id', userData.user.id);

    if (profileError) {
      console.error("[POST /api/users] Error completo al actualizar rol:", profileError);
      const profileErrMsg = profileError.message || (typeof profileError === 'object' ? JSON.stringify(profileError) : String(profileError)) || 'Error desconocido de perfil';
      return res.status(400).json({ error: `Usuario creado, pero no se pudo asignar el rol: ${profileErrMsg}` });
    }

    res.status(201).json({
      message: 'Usuario creado exitosamente.',
      user: {
        id: userData.user.id,
        email: userData.user.email,
        role: role
      }
    });
  } catch (err) {
    console.error("Excepción en creación de usuario:", err);
    res.status(500).json({ error: 'Error interno del servidor al crear usuario.' });
  }
});

app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data: profilesList, error } = await supabaseAdmin
      .from('profiles')
      .select('email, role, updated_at')
      .order('email', { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(profilesList || []);
  } catch (err) {
    console.error("Excepción en listado de usuarios:", err);
    res.status(500).json({ error: 'Error interno al obtener usuarios del sistema.' });
  }
});

// Servir la carpeta estática del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Fallback para cualquier ruta no mapeada: enviar index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor Express ejecutándose en el puerto ${PORT}`);
});
