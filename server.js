const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Cargar variables de entorno locales si existe un archivo .env
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3010;

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

// Función auxiliar: asegurar que un usuario tenga perfil en mt_profiles
async function ensureMtProfile(user) {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('mt_profiles')
      .select('tenant_id, role, mt_tenants(id, name, slug)')
      .eq('id', user.id)
      .single();

    if (profile) {
      return profile;
    }

    // Si aún no existe en mt_profiles (por ejemplo usuarios existentes de main):
    // Buscar la primera organización disponible para asociarlo automáticamente
    const { data: defaultTenants } = await supabaseAdmin
      .from('mt_tenants')
      .select('id, name, slug')
      .order('created_at', { ascending: true })
      .limit(1);

    if (defaultTenants && defaultTenants.length > 0) {
      const defaultTenant = defaultTenants[0];

      // Verificamos si en la tabla legacy 'profiles' tenía rol admin
      const { data: legacyProfile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const userRole = legacyProfile?.role === 'admin' ? 'admin' : 'usuario';

      const { data: newProfile, error: insertErr } = await supabaseAdmin
        .from('mt_profiles')
        .insert({
          id: user.id,
          tenant_id: defaultTenant.id,
          email: user.email,
          role: userRole
        })
        .select('tenant_id, role, mt_tenants(id, name, slug)')
        .single();

      if (!insertErr && newProfile) {
        console.log(`[Auto-Onboard MT] Usuario ${user.email} asociado a ${defaultTenant.name} como ${userRole}`);
        return newProfile;
      }
    }
  } catch (err) {
    console.error("[ensureMtProfile] Error asegurando perfil:", err);
  }
  return null;
}

// Middleware para verificar autenticación y cargar contexto de Tenant
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado. Falta token.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Sesión inválida o expirada.' });
    }

    req.user = user;

    // Cargar perfil multitenant
    const profile = await ensureMtProfile(user);
    if (profile) {
      req.user.tenant_id = profile.tenant_id;
      req.user.role = profile.role || 'usuario';
      req.user.tenant = profile.mt_tenants;
    } else {
      req.user.tenant_id = null;
      req.user.role = 'usuario';
      req.user.tenant = null;
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Error al verificar sesión.' });
  }
}

// Middleware para verificar rol de Administrador o Superadmin
async function requireAdmin(req, res, next) {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
    return next();
  }
  return res.status(403).json({ error: 'Acceso restringido. Se requiere rol de administrador o superadmin.' });
}

// Middleware para verificar rol de Superadmin
async function requireSuperAdmin(req, res, next) {
  if (req.user && req.user.role === 'superadmin') {
    return next();
  }
  return res.status(403).json({ error: 'Acceso restringido. Se requiere rol de superadmin.' });
}

// ─── ENDPOINT: CONFIGURACIÓN DINÁMICA DE WEBHOOKS ─────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    webhookCargaCv: process.env.WEBHOOK_CARGA_CV || 'https://prototipos.jpvidaldesign.com/webhook/Carga_CV_Supa',
    webhookAgenteCv: process.env.WEBHOOK_AGENTE_CV || 'https://prototipos.jpvidaldesign.com/webhook/Agente_CV_Supa',
    webhookObtenerCv: process.env.WEBHOOK_OBTENER_CV || 'https://prototipos.jpvidaldesign.com/webhook/Obtener_CV'
  });
});

// ─── ENDPOINTS: AUTENTICACIÓN MULTITENANT ──────────────────────────────────────
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

    // Obtener o inicializar perfil multitenant
    const profile = await ensureMtProfile(data.user);

    const role = profile?.role || 'usuario';
    const tenantId = profile?.tenant_id || null;
    const tenant = profile?.mt_tenants || null;

    res.json({
      session: data.session,
      user: data.user,
      role,
      tenantId,
      tenant
    });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ error: 'Error en el inicio de sesión.' });
  }
});

app.get('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    res.json({
      user: req.user,
      role: req.user.role,
      tenantId: req.user.tenant_id,
      tenant: req.user.tenant
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener perfil.' });
  }
});

// Endpoint para conmutar de organización (utilizado en pruebas o por superadmin)
app.post('/api/auth/switch-tenant', requireAuth, async (req, res) => {
  const { tenant_id } = req.body;
  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id es requerido.' });
  }

  try {
    const { data: tenant, error } = await supabaseAdmin
      .from('mt_tenants')
      .select('id, name, slug')
      .eq('id', tenant_id)
      .single();

    if (error || !tenant) {
      return res.status(404).json({ error: 'Organización no encontrada.' });
    }

    // Actualizar el tenant activo del usuario en mt_profiles
    const { error: updErr } = await supabaseAdmin
      .from('mt_profiles')
      .update({ tenant_id })
      .eq('id', req.user.id);

    if (updErr) {
      return res.status(400).json({ error: updErr.message });
    }

    res.json({ message: 'Organización cambiada exitosamente.', tenant });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar organización.' });
  }
});

// ─── ENDPOINTS: GESTIÓN DE ORGANIZACIONES (TENANTS) ───────────────────────────
app.get('/api/tenants', requireAuth, async (req, res) => {
  try {
    // Si es superadmin o modo prueba devuelve todas las empresas disponibles
    const { data: tenantsList, error } = await supabaseAdmin
      .from('mt_tenants')
      .select('id, name, slug, status, created_at')
      .order('name', { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(tenantsList || []);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar organizaciones.' });
  }
});

app.post('/api/tenants', requireAuth, requireSuperAdmin, async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) {
    return res.status(400).json({ error: 'Nombre y slug son obligatorios.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('mt_tenants')
      .insert([{ name, slug: slug.toLowerCase().trim() }])
      .select();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear la organización.' });
  }
});

// ─── ENDPOINTS: GESTIÓN DE CVS PARALELA (mt_cvs) ──────────────────────────────
app.get('/api/cvs', requireAuth, async (req, res) => {
  try {
    const activeTenantId = req.headers['x-tenant-id'] || req.query.tenant_id || req.user.tenant_id;
    if (!activeTenantId) {
      return res.json([]);
    }

    const { data: cvList, error } = await supabaseAdmin
      .from('mt_cvs')
      .select('nombre, apellido, created_at, web_cv_link')
      .eq('tenant_id', activeTenantId)
      .order('created_at', { ascending: false })
      .limit(4);

    if (error) {
      console.error("[GET /api/cvs] Error de Supabase:", error);
      return res.status(400).json({ error: error.message });
    }

    console.log(`[GET /api/cvs] Éxito: devolviendo ${cvList?.length || 0} recientes para tenant_id: ${activeTenantId}`);
    res.json(cvList || []);
  } catch (err) {
    console.error("[GET /api/cvs] Excepción:", err);
    res.status(500).json({ error: 'Error al obtener currículums.' });
  }
});

app.get('/api/cvs/count', requireAuth, async (req, res) => {
  try {
    const activeTenantId = req.headers['x-tenant-id'] || req.query.tenant_id || req.user.tenant_id;
    if (!activeTenantId) {
      return res.json({ count: 0 });
    }

    const { count, error } = await supabaseAdmin
      .from('mt_cvs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', activeTenantId);

    if (error) {
      console.error("[GET /api/cvs/count] Error de Supabase:", error);
      return res.status(400).json({ error: error.message });
    }

    console.log(`[GET /api/cvs/count] Éxito: devolviendo conteo ${count || 0} para tenant_id: ${activeTenantId}`);
    res.json({ count: count || 0 });
  } catch (err) {
    console.error("[GET /api/cvs/count] Excepción:", err);
    res.status(500).json({ error: 'Error al obtener la cantidad de currículums.' });
  }
});

app.get('/api/cvs/all', requireAuth, async (req, res) => {
  try {
    const activeTenantId = req.headers['x-tenant-id'] || req.query.tenant_id || req.user.tenant_id;
    if (!activeTenantId) {
      return res.json([]);
    }

    console.log(`[GET /api/cvs/all] Consultando mt_cvs para tenant_id: ${activeTenantId}`);
    const { data: cvList, error } = await supabaseAdmin
      .from('mt_cvs')
      .select('nombre, apellido, profesion, perfil_laboral, email, web_cv_link, created_at')
      .eq('tenant_id', activeTenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("[GET /api/cvs/all] Error de Supabase:", error);
      return res.status(400).json({ error: error.message });
    }

    console.log(`[GET /api/cvs/all] Éxito: devolviendo ${cvList?.length || 0} filas para tenant_id: ${activeTenantId}`);
    res.json(cvList || []);
  } catch (err) {
    console.error("[GET /api/cvs/all] Excepción:", err);
    res.status(500).json({ error: 'Error al obtener la lista de currículums.' });
  }
});

app.post('/api/cvs', requireAuth, requireAdmin, async (req, res) => {
  const cvData = req.body;
  if (!cvData || !cvData.file_hash) {
    return res.status(400).json({ error: 'Datos de CV e identificador de hash inválidos.' });
  }

  // Validación: el CV debe tener al menos nombre o apellido
  if (!cvData.nombre?.trim() && !cvData.apellido?.trim()) {
    return res.status(400).json({ error: 'No se puede registrar un CV sin nombre ni apellido.' });
  }

  if (!req.user.tenant_id) {
    return res.status(400).json({ error: 'El usuario no tiene una organización asignada.' });
  }

  // Asignar el tenant_id del usuario conectado
  cvData.tenant_id = req.user.tenant_id;

  try {
    const { data, error } = await supabaseAdmin
      .from('mt_cvs')
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

// ─── ENDPOINTS: GESTIÓN DE USUARIOS MULTITENANT ───────────────────────────────
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!req.user.tenant_id) {
      return res.json([]);
    }

    let query = supabaseAdmin
      .from('mt_profiles')
      .select('email, role, updated_at, tenant_id, mt_tenants(name)')
      .order('email', { ascending: true });

    // Si no es superadmin, solo consulta usuarios de su misma organización
    if (req.user.role !== 'superadmin') {
      query = query.eq('tenant_id', req.user.tenant_id);
    }

    const { data: profilesList, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(profilesList || []);
  } catch (err) {
    console.error("Excepción en listado de usuarios:", err);
    res.status(500).json({ error: 'Error interno al obtener usuarios del sistema.' });
  }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  const { email, password, role, tenant_id } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: email, password, role.' });
  }

  if (role !== 'admin' && role !== 'usuario' && role !== 'superadmin') {
    return res.status(400).json({ error: 'Rol inválido. Debe ser admin, usuario o superadmin.' });
  }

  // Determinar la organización destino
  const targetTenantId = (req.user.role === 'superadmin' && tenant_id)
    ? tenant_id
    : req.user.tenant_id;

  if (!targetTenantId) {
    return res.status(400).json({ error: 'Debe especificarse una organización para el usuario.' });
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

    // 2. Insertar o actualizar en mt_profiles
    const { error: profileError } = await supabaseAdmin
      .from('mt_profiles')
      .upsert({
        id: userData.user.id,
        tenant_id: targetTenantId,
        email: userData.user.email,
        role: role,
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      console.error("[POST /api/users] Error completo al guardar perfil mt:", profileError);
      const profileErrMsg = profileError.message || (typeof profileError === 'object' ? JSON.stringify(profileError) : String(profileError)) || 'Error desconocido de perfil';
      return res.status(400).json({ error: `Usuario creado, pero error en perfil: ${profileErrMsg}` });
    }

    res.status(201).json({
      message: 'Usuario creado exitosamente.',
      user: {
        id: userData.user.id,
        email: userData.user.email,
        role: role,
        tenant_id: targetTenantId
      }
    });
  } catch (err) {
    console.error("Excepción en creación de usuario:", err);
    res.status(500).json({ error: 'Error interno del servidor al crear usuario.' });
  }
});

// ─── ENDPOINT: CAMBIO DE CONTRASEÑA DE USUARIO (AUTENTICADO) ─────────────────
app.put('/api/auth/change-password', requireAuth, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) {
    return res.status(400).json({ error: 'Falta la nueva contraseña.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      req.user.id,
      { password: newPassword }
    );

    if (error) {
      console.error("[PUT /api/auth/change-password] Error de Supabase Auth:", error.message);
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Contraseña actualizada exitosamente.' });
  } catch (err) {
    console.error("Excepción en cambio de contraseña:", err);
    res.status(500).json({ error: 'Error interno del servidor al cambiar contraseña.' });
  }
});

// Servir la carpeta estática del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Fallback para cualquier ruta no mapeada: enviar index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor Express ejecutándose en el puerto ${PORT} [Modo Multitenant Activo]`);
});
