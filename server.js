const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const rateLimit = require('express-rate-limit');
const multer = require('multer');
const uploadPublic = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // Máx. 10 MB en memoria

// Cargar variables de entorno locales si existe un archivo .env
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3010;

// Habilitar trust proxy para reconocer la IP real del cliente detrás de proxies inversos (Easypanel, Traefik, Nginx)
app.set('trust proxy', 1);

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

// Función auxiliar: validar robustez de contraseñas (mínimo 8 caracteres, mayúscula, número, símbolo)
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') return { valid: false, reason: 'Contraseña requerida.' };
  if (password.length < 8) return { valid: false, reason: 'La contraseña debe contener al menos 8 caracteres.' };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: 'La contraseña debe incluir al menos una letra mayúscula.' };
  if (!/[0-9]/.test(password)) return { valid: false, reason: 'La contraseña debe incluir al menos un número.' };
  if (!/[!@#$%^&*(),.?":{}|<>_\-\+=]/.test(password)) return { valid: false, reason: 'La contraseña debe incluir al menos un símbolo especial (!@#...).' };
  return { valid: true };
}

// Función auxiliar: asegurar que un usuario tenga perfil en mt_profiles
async function ensureMtProfile(user) {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('mt_profiles')
      .select('tenant_id, role, mt_tenants(id, name, slug)')
      .eq('id', user.id)
      .single();

    if (profile) {
      // Auto-promoción para el email del superadministrador principal
      if (user.email === 'jpnvidal@gmail.com' && profile.role !== 'superadmin') {
        const { error: updSuperErr } = await supabaseAdmin
          .from('mt_profiles')
          .update({ role: 'superadmin' })
          .eq('id', user.id);
        if (!updSuperErr) {
          profile.role = 'superadmin';
          console.log(`[Superadmin] Usuario ${user.email} configurado automáticamente como superadmin.`);
        }
      }
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

// Middleware para verificar rol de Manager, Administrador o Superadmin (Carga y gestión de CVs)
async function requireManagerOrAdmin(req, res, next) {
  if (req.user && (req.user.role === 'manager' || req.user.role === 'admin' || req.user.role === 'superadmin')) {
    return next();
  }
  return res.status(403).json({ error: 'Acceso restringido. Se requiere rol de manager o administrador para cargar CVs.' });
}

// Middleware para verificar rol de Superadmin
async function requireSuperAdmin(req, res, next) {
  if (req.user && req.user.role === 'superadmin') {
    return next();
  }
  return res.status(403).json({ error: 'Acceso restringido. Se requiere rol de superadmin.' });
}

// Helper para resolver el tenant activo respetando la jerarquía de roles
function resolveActiveTenantId(req) {
  const isSuperAdmin = req.user && req.user.role === 'superadmin';
  // Solo los Superadministradores pueden alternar de tenant mediante cabecera o query param
  if (isSuperAdmin) {
    return req.headers['x-tenant-id'] || req.query.tenant_id || req.user.tenant_id;
  }
  // Para Admin, Manager y Usuario, el tenant_id está estrictamente fijado a su asignación
  return req.user.tenant_id;
}

// ─── CONFIGURACIÓN DE INTEGRACIÓN Y SEGURIDAD CON N8N ────────────────────────
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || '';
const N8N_URL_CARGA_CV = process.env.N8N_URL_CARGA_CV || process.env.WEBHOOK_CARGA_CV || 'https://prototipos.jpvidaldesign.com/webhook/Carga_CV_Supa_MT';
const N8N_URL_AGENTE_CV = process.env.N8N_URL_AGENTE_CV || process.env.WEBHOOK_AGENTE_CV || 'https://prototipos.jpvidaldesign.com/webhook/Agente_CV_Supa_MT';
const N8N_URL_OBTENER_CV = process.env.N8N_URL_OBTENER_CV || process.env.WEBHOOK_OBTENER_CV || 'https://prototipos.jpvidaldesign.com/webhook/Obtener_CV';

function getN8nHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (N8N_WEBHOOK_SECRET) {
    headers['X-Webhook-Secret'] = N8N_WEBHOOK_SECRET;
  }
  return headers;
}

// ─── ENDPOINT: CONFIGURACIÓN DINÁMICA DE CLIENTE ─────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY
  });
});

// Rate Limiter para postulaciones públicas (máximo 10 postulaciones por IP en 10 min)
const publicCvLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de postulación desde esta conexión. Por favor intentá nuevamente en unos minutos.'
  }
});

// ─── ENDPOINTS PÚBLICOS: POSTULACIÓN DE CANDIDATOS (PORTAL Y CÓDIGO QR) ──────

// 1. Obtener datos básicos de la empresa por su slug identificador
app.get('/api/public/tenant/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase().trim();
  if (!slug) {
    return res.status(400).json({ error: 'Slug de organización requerido.' });
  }

  try {
    const { data: tenant, error } = await supabaseAdmin
      .from('mt_tenants')
      .select('id, name, slug, logo_url, status')
      .eq('slug', slug)
      .single();

    if (error || !tenant || tenant.status !== 'active') {
      return res.status(404).json({ error: 'Organización no disponible o inactiva.' });
    }

    res.json({
      name: tenant.name,
      slug: tenant.slug,
      logo_url: tenant.logo_url
    });
  } catch (err) {
    console.error("[GET /api/public/tenant/:slug] Excepción:", err);
    res.status(500).json({ error: 'Error al consultar la organización.' });
  }
});

// 2. Recepción de CV público para una organización específica
app.post('/api/public/cv/:slug', publicCvLimiter, uploadPublic.single('file'), async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase().trim();
  if (!slug) {
    return res.status(400).json({ error: 'Identificador de organización requerido.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo de currículum.' });
  }

  const fileExt = path.extname(req.file.originalname).toLowerCase();
  const allowedExts = ['.pdf', '.jpeg', '.jpg'];
  if (!allowedExts.includes(fileExt)) {
    return res.status(400).json({ error: 'Formato no admitido. Solo se admiten archivos PDF, JPEG o JPG.' });
  }

  try {
    // 1. Validar existencia y estado activo de la empresa
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from('mt_tenants')
      .select('id, name, slug, status')
      .eq('slug', slug)
      .single();

    if (tErr || !tenant || tenant.status !== 'active') {
      return res.status(404).json({ error: 'Organización no disponible para recibir postulaciones.' });
    }

    // 2. Calcular hash SHA-256 del archivo para coherencia con el flujo de N8N
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    // 3. Reenviar el archivo hacia el Webhook de N8N con todos los campos esperados
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'application/pdf' });
    const forwardForm = new FormData();
    // N8N Carga_CV espera el binario en la propiedad 'file' (igual que el panel principal)
    forwardForm.append('file', blob, req.file.originalname);
    forwardForm.append('filename', req.file.originalname);
    forwardForm.append('mimetype', req.file.mimetype || 'application/pdf');
    forwardForm.append('size', String(req.file.size));
    forwardForm.append('file_hash', fileHash);
    forwardForm.append('submittedAt', new Date().toISOString());
    forwardForm.append('session_id', 'portal_qr_' + Date.now());
    forwardForm.append('email', 'postulante@portal-publico.com');
    forwardForm.append('tenant_id', tenant.id);
    forwardForm.append('tenant_slug', tenant.slug);

    console.log(`[POST /api/public/cv/:slug] Reenviando CV "${req.file.originalname}" (hash: ${fileHash.substring(0, 10)}...) a N8N para tenant: ${tenant.slug} (${tenant.id})`);

    const n8nRes = await fetch(N8N_URL_CARGA_CV, {
      method: 'POST',
      headers: getN8nHeaders(),
      body: forwardForm
    });

    const rawData = await n8nRes.json().catch(() => ({}));
    const data = Array.isArray(rawData) ? rawData[0] : rawData;
    const responseMsg = String(data?.Response || data?.response || data?.error || data?.message || '').trim();

    console.log(`[POST /api/public/cv/:slug] N8N HTTP Status: ${n8nRes.status}. Respuesta raw:`, JSON.stringify(rawData));

    const msgLower = responseMsg.toLowerCase();
    const isDuplicate = msgLower.includes('ya se encuentra en la base') || msgLower.includes('ya se encuentra') || msgLower.includes('duplicado') || msgLower.includes('ya registrado');
    const isExtractionError = msgLower.includes('no se ha podido extraer') || msgLower.includes('no es posible leer') || (msgLower.includes('error') && !msgLower.includes('éxito') && !msgLower.includes('exito'));

    if (!n8nRes.ok || isDuplicate || isExtractionError) {
      console.warn(`[POST /api/public/cv/:slug] N8N reportó incidencia (${n8nRes.status}):`, responseMsg);
      const statusCode = (!n8nRes.ok && n8nRes.status >= 400 && n8nRes.status < 500) ? n8nRes.status : 400;
      return res.status(statusCode).json({
        error: responseMsg || 'Error al procesar el currículum en N8N.',
        isDuplicate: isDuplicate
      });
    }

    console.log(`[POST /api/public/cv/:slug] Éxito al procesar CV público para ${tenant.name}`);
    res.json({
      success: true,
      message: responseMsg || 'Currículum recibido y procesado con éxito.',
      tenant: tenant.name
    });
  } catch (err) {
    console.error("[POST /api/public/cv/:slug] Excepción:", err);
    res.status(500).json({ error: 'Error interno al procesar la postulación.' });
  }
});

// Rate Limiter para mitigar ataques de fuerza bruta en el inicio de sesión
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Ventana de 15 minutos
  max: 5,                   // Máximo 5 intentos fallidos
  skipSuccessfulRequests: true, // Si el inicio de sesión es exitoso, no penaliza
  standardHeaders: true,    // Devuelve cabeceras RateLimit-* estándar
  legacyHeaders: false,     // Desactiva cabeceras X-RateLimit-*
  // 1. Inmunidad para la cuenta de Superadmin (nunca se auto-bloquea)
  skip: (req) => {
    const email = (req.body?.email || '').toLowerCase().trim();
    return email === 'jpnvidal@gmail.com';
  },
  // 2. Segmentación por IP + Email: el bloqueo solo afecta a esa cuenta puntual desde esa IP
  // evitando bloquear a otros usuarios o a otras cuentas desde la misma máquina/red
  keyGenerator: (req) => {
    const email = (req.body?.email || '').toLowerCase().trim();
    return `${req.ip}_${email}`;
  },
  message: {
    error: 'Demasiados intentos fallidos para esta cuenta. Por seguridad, el acceso fue temporalmente pausado por 15 minutos.'
  }
});

// ─── ENDPOINTS: AUTENTICACIÓN MULTITENANT ──────────────────────────────────────
app.post('/api/auth/login', loginLimiter, async (req, res) => {
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

// Endpoint para conmutar de organización (exclusivo para superadmin)
app.post('/api/auth/switch-tenant', requireAuth, requireSuperAdmin, async (req, res) => {
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
    const isSuperAdmin = req.user && req.user.role === 'superadmin';

    let query = supabaseAdmin
      .from('mt_tenants')
      .select('id, name, slug, status, created_at')
      .order('name', { ascending: true });

    // Si no es superadmin, solo puede ver la organización a la que pertenece
    if (!isSuperAdmin) {
      if (!req.user.tenant_id) return res.json([]);
      query = query.eq('id', req.user.tenant_id);
    }

    const { data: tenantsList, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(tenantsList || []);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar organizaciones.' });
  }
});

// Creación de organización (habilitado exclusivamente para Superadmins)
app.post('/api/tenants', requireAuth, requireSuperAdmin, async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) {
    return res.status(400).json({ error: 'Nombre y slug identificador son obligatorios.' });
  }

  const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');

  try {
    const { data, error } = await supabaseAdmin
      .from('mt_tenants')
      .insert([{ name: name.trim(), slug: cleanSlug }])
      .select();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: `El slug identificador "${cleanSlug}" ya está en uso. Por favor elegí otro.` });
      }
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
    const activeTenantId = resolveActiveTenantId(req);
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
    const activeTenantId = resolveActiveTenantId(req);
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
    const activeTenantId = resolveActiveTenantId(req);
    if (!activeTenantId) {
      return res.json([]);
    }

    console.log(`[GET /api/cvs/all] Consultando mt_cvs para tenant_id: ${activeTenantId}`);
    const { data: cvList, error } = await supabaseAdmin
      .from('mt_cvs')
      .select('id, nombre, apellido, profesion, perfil_laboral, email, web_cv_link, created_at')
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

// Helper: Extraer la ruta relativa dentro del bucket 'Curriculums' a partir de web_cv_link o storage path
function extractStoragePath(webCvLink) {
  if (!webCvLink || typeof webCvLink !== 'string') return null;
  let path = webCvLink.trim();

  // Si es una URL completa (ej. https://.../storage/v1/object/Curriculums/tenant_id/archivo.pdf)
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const match = path.match(/\/Curriculums\/(.+)$/i);
    if (match && match[1]) {
      path = decodeURIComponent(match[1]);
    } else {
      const parts = path.split('/Curriculums/');
      if (parts.length > 1) {
        path = decodeURIComponent(parts[1]);
      }
    }
  }

  // Quitar prefijo 'Curriculums/' si viene en la clave relativa
  if (path.toLowerCase().startsWith('curriculums/')) {
    path = path.slice('curriculums/'.length);
  }

  // Quitar parámetros de query (?token=...) si los tuviera
  if (path.includes('?')) {
    path = path.split('?')[0];
  }

  return path.trim() || null;
}

// Eliminación de CVs (Base de Datos mt_cvs y Supabase Storage) para Manager y Administrador
app.delete('/api/cvs/:id', requireAuth, requireManagerOrAdmin, async (req, res) => {
  try {
    const cvId = req.params.id;
    if (!cvId) {
      return res.status(400).json({ error: 'ID de currículum no proporcionado.' });
    }

    const activeTenantId = resolveActiveTenantId(req);
    if (!activeTenantId) {
      return res.status(400).json({ error: 'El usuario no tiene una organización asignada.' });
    }

    // 1. Obtener y verificar que el CV exista y pertenezca a la empresa activa
    const { data: cv, error: fetchError } = await supabaseAdmin
      .from('mt_cvs')
      .select('id, web_cv_link, nombre, apellido, tenant_id')
      .eq('id', cvId)
      .eq('tenant_id', activeTenantId)
      .single();

    if (fetchError || !cv) {
      console.warn(`[DELETE /api/cvs/:id] CV no encontrado o ajeno al tenant: id=${cvId}, tenant=${activeTenantId}`);
      return res.status(404).json({ error: 'Currículum no encontrado o no pertenece a su organización.' });
    }

    // 2. Intentar eliminar el archivo de Supabase Storage
    const storagePath = extractStoragePath(cv.web_cv_link);
    if (storagePath) {
      try {
        console.log(`[DELETE /api/cvs/:id] Eliminando de Storage: bucket='Curriculums', path='${storagePath}'`);
        const { error: storageError } = await supabaseAdmin.storage
          .from('Curriculums')
          .remove([storagePath]);

        if (storageError) {
          console.warn(`[DELETE /api/cvs/:id] Advertencia en Supabase Storage (${storagePath}):`, storageError.message);
        } else {
          console.log(`[DELETE /api/cvs/:id] Archivo eliminado con éxito de Storage: ${storagePath}`);
        }
      } catch (storageEx) {
        console.warn(`[DELETE /api/cvs/:id] Excepción al invocar Supabase Storage:`, storageEx);
      }
    } else {
      console.log(`[DELETE /api/cvs/:id] El CV no contenía una ruta válida de Storage en web_cv_link.`);
    }

    // 3. Eliminar el registro en la tabla mt_cvs
    const { error: deleteError } = await supabaseAdmin
      .from('mt_cvs')
      .delete()
      .eq('id', cv.id)
      .eq('tenant_id', activeTenantId);

    if (deleteError) {
      console.error(`[DELETE /api/cvs/:id] Error al eliminar en mt_cvs:`, deleteError);
      return res.status(400).json({ error: 'Error al eliminar el registro: ' + deleteError.message });
    }

    const fullName = `${cv.nombre || ''} ${cv.apellido || ''}`.trim() || 'Candidato';
    console.log(`[DELETE /api/cvs/:id] Éxito: CV ${cv.id} (${fullName}) eliminado por ${req.user.email}`);
    res.json({ message: `Currículum de ${fullName} y archivo asociado eliminados correctamente.` });
  } catch (err) {
    console.error(`[DELETE /api/cvs/:id] Excepción en endpoint:`, err);
    res.status(500).json({ error: 'Error interno al procesar la eliminación del currículum.' });
  }
});

// Guardado de CVs permitido para Managers y Administradores
app.post('/api/cvs', requireAuth, requireManagerOrAdmin, async (req, res) => {
  const cvData = req.body;
  if (!cvData || !cvData.file_hash) {
    return res.status(400).json({ error: 'Datos de CV e identificador de hash inválidos.' });
  }

  // Validación: el CV debe tener al menos nombre o apellido
  if (!cvData.nombre?.trim() && !cvData.apellido?.trim()) {
    return res.status(400).json({ error: 'No se puede registrar un CV sin nombre ni apellido.' });
  }

  const activeTenantId = resolveActiveTenantId(req);
  if (!activeTenantId) {
    return res.status(400).json({ error: 'El usuario no tiene una organización asignada.' });
  }

  // Asignar el tenant_id resuelto
  cvData.tenant_id = activeTenantId;

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

// ─── ENDPOINTS PROXY SEGUROS HACIA AGENTES Y WEBHOOKS N8N ────────────────────

// 1. Carga de Currículums con IA desde el panel de RRHH
app.post('/api/agent/upload-cv', requireAuth, requireManagerOrAdmin, uploadPublic.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo de currículum.' });
  }

  const fileExt = path.extname(req.file.originalname).toLowerCase();
  const allowedExts = ['.pdf', '.jpeg', '.jpg'];
  if (!allowedExts.includes(fileExt)) {
    return res.status(400).json({ error: 'Formato no admitido. Solo se admiten archivos PDF, JPEG o JPG.' });
  }

  const activeTenantId = resolveActiveTenantId(req);
  if (!activeTenantId) {
    return res.status(400).json({ error: 'El usuario no tiene una organización activa asignada.' });
  }

  try {
    let tenantSlug = req.user.tenant?.slug || '';
    if (!tenantSlug && activeTenantId) {
      const { data: t } = await supabaseAdmin
        .from('mt_tenants')
        .select('slug')
        .eq('id', activeTenantId)
        .single();
      if (t) tenantSlug = t.slug;
    }

    const fileHash = req.body.file_hash || crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'application/pdf' });
    const forwardForm = new FormData();
    forwardForm.append('file', blob, req.file.originalname);
    forwardForm.append('filename', req.file.originalname);
    forwardForm.append('mimetype', req.file.mimetype || 'application/pdf');
    forwardForm.append('size', String(req.file.size));
    forwardForm.append('file_hash', fileHash);
    forwardForm.append('submittedAt', new Date().toISOString());
    forwardForm.append('session_id', req.body.session_id || ('sess_' + Date.now()));
    forwardForm.append('email', req.user.email);
    forwardForm.append('tenant_id', activeTenantId);
    if (tenantSlug) forwardForm.append('tenant_slug', tenantSlug);

    console.log(`[POST /api/agent/upload-cv] Reenviando CV "${req.file.originalname}" a N8N para tenant: ${tenantSlug || activeTenantId} por usuario: ${req.user.email}`);

    const n8nRes = await fetch(N8N_URL_CARGA_CV, {
      method: 'POST',
      headers: getN8nHeaders(),
      body: forwardForm
    });

    const rawData = await n8nRes.json().catch(() => ({}));
    return res.status(n8nRes.status).json(rawData);
  } catch (err) {
    console.error("[POST /api/agent/upload-cv] Excepción al reenviar a N8N:", err);
    res.status(500).json({ error: 'Error interno al procesar el currículum con el agente de IA.' });
  }
});

// 2. Consulta en lenguaje natural al Agente IA
app.post('/api/agent/query', requireAuth, async (req, res) => {
  const query = (req.body.query || req.body['Texto describiendo perfil'] || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'El texto descriptivo de búsqueda es requerido.' });
  }

  const activeTenantId = resolveActiveTenantId(req);
  if (!activeTenantId) {
    return res.status(400).json({ error: 'No se detectó una organización activa asignada.' });
  }

  try {
    let tenantSlug = req.user.tenant?.slug || '';
    if (!tenantSlug && activeTenantId) {
      const { data: t } = await supabaseAdmin
        .from('mt_tenants')
        .select('slug')
        .eq('id', activeTenantId)
        .single();
      if (t) tenantSlug = t.slug;
    }

    const payload = [{
      "Texto describiendo perfil": query,
      "query": query,
      "submittedAt": req.body.submittedAt || new Date().toISOString(),
      "formMode": req.body.formMode || "test",
      "session_id": req.body.session_id || ('sess_' + Date.now()),
      "email": req.user.email,
      "tenant_id": activeTenantId,
      "tenant_slug": tenantSlug
    }];

    console.log(`[POST /api/agent/query] Consulta IA reenviada a N8N por ${req.user.email} (tenant: ${tenantSlug || activeTenantId})`);

    const n8nRes = await fetch(N8N_URL_AGENTE_CV, {
      method: 'POST',
      headers: getN8nHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    const rawText = await n8nRes.text();
    res.status(n8nRes.status).send(rawText);
  } catch (err) {
    console.error("[POST /api/agent/query] Excepción al consultar agente IA en N8N:", err);
    res.status(500).json({ error: 'Error interno al consultar el agente de IA.' });
  }
});

// 3. Firma de Enlace de CV para previsualización segura
app.post('/api/agent/get-cv', requireAuth, async (req, res) => {
  const cvPath = (req.body.path || req.body.web_cv_link || '').trim();
  if (!cvPath) {
    return res.status(400).json({ error: 'La ruta del currículum es requerida.' });
  }

  const activeTenantId = resolveActiveTenantId(req);

  try {
    const payload = {
      path: cvPath,
      session_id: req.body.session_id || ('sess_' + Date.now()),
      email: req.user.email,
      tenant_id: activeTenantId
    };

    console.log(`[POST /api/agent/get-cv] Solicitando firma a N8N para path: ${cvPath} por ${req.user.email}`);

    const n8nRes = await fetch(N8N_URL_OBTENER_CV, {
      method: 'POST',
      headers: getN8nHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    const data = await n8nRes.json().catch(() => ({}));
    res.status(n8nRes.status).json(data);
  } catch (err) {
    console.error("[POST /api/agent/get-cv] Excepción al solicitar enlace firmado a N8N:", err);
    res.status(500).json({ error: 'Error interno al generar enlace seguro del currículum.' });
  }
});

// ─── ENDPOINTS: GESTIÓN DE USUARIOS MULTITENANT ───────────────────────────────
app.get('/api/users', requireAuth, requireManagerOrAdmin, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'superadmin';
    const isAdmin = req.user.role === 'admin';
    const activeTenantId = resolveActiveTenantId(req);

    if (!activeTenantId && !isSuperAdmin) {
      return res.json([]);
    }

    let query = supabaseAdmin
      .from('mt_profiles')
      .select('id, email, role, updated_at, tenant_id, mt_tenants(name)')
      .order('email', { ascending: true });

    // Jerarquía de visualización:
    if (req.user.role === 'manager') {
      // Manager ve usuarios y managers de su empresa
      query = query
        .eq('tenant_id', req.user.tenant_id)
        .in('role', ['manager', 'usuario']);
    } else if (isAdmin) {
      // Admin ve todos los usuarios de su empresa (admin, manager, usuario), pero no superadmins
      query = query
        .eq('tenant_id', req.user.tenant_id)
        .in('role', ['admin', 'manager', 'usuario']);
    } else if (isSuperAdmin) {
      // Superadmin ve según tenant activo o todos si no hay filtro
      if (activeTenantId) {
        query = query.eq('tenant_id', activeTenantId);
      }
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

app.post('/api/users', requireAuth, requireManagerOrAdmin, async (req, res) => {
  const { email, password, role, tenant_id } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: email, password, role.' });
  }

  if (role !== 'admin' && role !== 'usuario' && role !== 'superadmin' && role !== 'manager') {
    return res.status(400).json({ error: 'Rol inválido. Debe ser admin, manager, usuario o superadmin.' });
  }

  // Validación de robustez de contraseña unificada
  const pwdCheck = validatePasswordStrength(password);
  if (!pwdCheck.valid) {
    return res.status(400).json({ error: pwdCheck.reason });
  }

  // Restricciones jerárquicas de creación según rol del creador
  if (req.user.role === 'manager') {
    if (role !== 'usuario') {
      return res.status(403).json({ error: 'Los managers solo tienen autorización para crear roles de Usuario.' });
    }
  } else if (req.user.role === 'admin') {
    if (role === 'admin' || role === 'superadmin') {
      return res.status(403).json({ error: 'Los administradores de empresa solo tienen autorización para crear roles de Manager o Usuario.' });
    }
  }

  // Determinar la organización destino:
  // Si es Superadmin, puede indicar tenant_id; de lo contrario, se fija estrictamente a su propio tenant_id
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

// Eliminar un perfil de usuario (con jerarquía de permisos)
app.delete('/api/users/:id', requireAuth, requireManagerOrAdmin, async (req, res) => {
  const targetId = req.params.id;

  // 1. Evitar autoeliminación
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'No podés eliminar tu propia cuenta de usuario en uso.' });
  }

  try {
    // 2. Consultar perfil del usuario objetivo
    const { data: targetProfile, error: fetchErr } = await supabaseAdmin
      .from('mt_profiles')
      .select('id, email, role, tenant_id')
      .eq('id', targetId)
      .single();

    if (fetchErr || !targetProfile) {
      return res.status(404).json({ error: 'El usuario no fue encontrado en el sistema.' });
    }

    // 3. Validar jerarquía de permisos
    if (req.user.role === 'admin') {
      // El admin debe estar en la misma empresa
      if (targetProfile.tenant_id !== req.user.tenant_id) {
        return res.status(403).json({ error: 'No tenés permisos sobre usuarios de otra organización.' });
      }
      // El admin no puede eliminar otros admins ni superadmins
      if (targetProfile.role === 'admin' || targetProfile.role === 'superadmin') {
        return res.status(403).json({ error: 'Un administrador solo puede eliminar perfiles de Manager o Usuario de su empresa.' });
      }
    } else if (req.user.role === 'manager') {
      // El manager debe estar en la misma empresa
      if (targetProfile.tenant_id !== req.user.tenant_id) {
        return res.status(403).json({ error: 'No tenés permisos sobre usuarios de otra organización.' });
      }
      // El manager solo puede eliminar usuarios con rol 'usuario'
      if (targetProfile.role !== 'usuario') {
        return res.status(403).json({ error: 'Los managers solo pueden eliminar usuarios regulares (no a otros managers ni admins).' });
      }
    }

    // 4. Eliminar de Supabase Auth
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (delErr) {
      console.error("[DELETE /api/users/:id] Error de Supabase Auth:", delErr.message);
      return res.status(400).json({ error: delErr.message });
    }

    // 5. Limpieza explícita de mt_profiles
    await supabaseAdmin.from('mt_profiles').delete().eq('id', targetId);

    console.log(`[DELETE /api/users/:id] Usuario ${targetProfile.email} (${targetProfile.role}) eliminado por ${req.user.email} (${req.user.role})`);
    res.json({ message: `El usuario ${targetProfile.email} ha sido eliminado exitosamente.` });
  } catch (err) {
    console.error("Excepción en eliminación de usuario:", err);
    res.status(500).json({ error: 'Error interno del servidor al eliminar el usuario.' });
  }
});

// Resetear contraseña de un usuario (con jerarquía de permisos)
const resetUserPasswordHandler = async (req, res) => {
  const targetId = req.params.id;
  const { newPassword } = req.body;

  const pwdCheck = validatePasswordStrength(newPassword);
  if (!pwdCheck.valid) {
    return res.status(400).json({ error: pwdCheck.reason });
  }

  try {
    // 1. Consultar perfil del usuario objetivo
    const { data: targetProfile, error: fetchErr } = await supabaseAdmin
      .from('mt_profiles')
      .select('id, email, role, tenant_id')
      .eq('id', targetId)
      .single();

    if (fetchErr || !targetProfile) {
      return res.status(404).json({ error: 'El usuario no fue encontrado en el sistema.' });
    }

    // 2. Validar jerarquía de permisos
    if (req.user.role === 'admin') {
      if (targetProfile.tenant_id !== req.user.tenant_id) {
        return res.status(403).json({ error: 'No tenés permisos sobre usuarios de otra organización.' });
      }
      if (targetProfile.role === 'admin' || targetProfile.role === 'superadmin') {
        return res.status(403).json({ error: 'Un administrador solo puede resetear contraseñas de Manager o Usuario de su empresa.' });
      }
    } else if (req.user.role === 'manager') {
      if (targetProfile.tenant_id !== req.user.tenant_id) {
        return res.status(403).json({ error: 'No tenés permisos sobre usuarios de otra organización.' });
      }
      if (targetProfile.role !== 'usuario') {
        return res.status(403).json({ error: 'Los managers solo pueden resetear la contraseña de usuarios regulares.' });
      }
    }

    // 3. Actualizar contraseña mediante Supabase Auth Admin
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      targetId,
      { password: newPassword }
    );

    if (updErr) {
      console.error("[reset-password] Error de Supabase Auth:", updErr.message);
      return res.status(400).json({ error: updErr.message });
    }

    console.log(`[reset-password] Contraseña de ${targetProfile.email} reseteada por ${req.user.email} (${req.user.role})`);
    res.json({ message: `Contraseña de ${targetProfile.email} actualizada exitosamente.` });
  } catch (err) {
    console.error("Excepción en reseteo de contraseña:", err);
    res.status(500).json({ error: 'Error interno del servidor al resetear la contraseña.' });
  }
};

// Rutas compatibles (PUT / POST con :id en posición estándar o sufijo)
app.put('/api/users/:id/reset-password', requireAuth, requireManagerOrAdmin, resetUserPasswordHandler);
app.post('/api/users/:id/reset-password', requireAuth, requireManagerOrAdmin, resetUserPasswordHandler);
app.put('/api/users/reset-password/:id', requireAuth, requireManagerOrAdmin, resetUserPasswordHandler);
app.post('/api/users/reset-password/:id', requireAuth, requireManagerOrAdmin, resetUserPasswordHandler);

// ─── ENDPOINT: CAMBIO DE CONTRASEÑA DE USUARIO (AUTENTICADO) ─────────────────
app.put('/api/auth/change-password', requireAuth, async (req, res) => {
  const { newPassword } = req.body;
  const pwdCheck = validatePasswordStrength(newPassword);
  if (!pwdCheck.valid) {
    return res.status(400).json({ error: pwdCheck.reason });
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

// Ruta pública amigable para el portal de postulantes
app.get('/postular/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'postular.html'));
});

// Fallback para cualquier ruta no mapeada: enviar index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor Express ejecutándose en el puerto ${PORT} [Modo Multitenant Activo]`);
});
