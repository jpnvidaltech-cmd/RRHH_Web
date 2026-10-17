# Plan de Implementación Multitenant (Tablas Paralelas)
## Aplicación: Perfiles RRHH — Plataforma de Recursos Humanos con Inteligencia Artificial

---

### Resumen del Enfoque Arquitectónico
Para elevar la aplicación a una arquitectura **Multitenant (multi-organización / multi-empresa)** sin arriesgar la versión activa en producción (`main`) y compartiendo la misma instancia de Supabase en EasyPanel, se utiliza la **Estrategia de Tablas Paralelas (`mt_*`)**.

- **Riesgo Cero:** Las tablas actuales (`public.profiles` y `public.cvs`) permanecen intactas y operativas para la rama `main`.
- **Aislamiento Total:** Las nuevas tablas (`mt_tenants`, `mt_profiles` y `mt_cvs`) implementan Row Level Security (RLS) estricto por `tenant_id`.
- **Compatibilidad con Storage y n8n:** Estructuración de carpetas por `tenant_id` en el bucket de Supabase Storage.

---

```
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 0: PROTOCOLO DE BACKUP PREVIO (Punto de Restauración)             │
│ - Crear tablas snapshot de respaldo en Supabase                        │
│ - Exportar datos actuales a archivos locales (.csv) en BackUp/         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ FASE 1: BASE DE DATOS PARALELA (Supabase SQL)                          │
│ - Crear tablas mt_tenants, mt_profiles y mt_cvs                        │
│ - Definir RLS estricto por tenant_id y constraint único compuesto      │
│ - Crear tenants y usuarios semilla de prueba (Empresa A y Empresa B)  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ FASE 2: BACKEND EXPRESS (server.js en rama multitenant)                │
│ - Inyectar tenant_id en middleware requireAuth                         │
│ - Redirigir consultas a mt_cvs y mt_profiles con filtro de tenant      │
│ - Agregar endpoints de gestión de organizaciones y usuarios por tenant │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ FASE 3: WEBHOOKS Y STORAGE (n8n & Supabase Storage)                    │
│ - Enviar tenant_id en FormData de carga (organización por carpetas)    │
│ - Validar pertenencia de tenant en descarga/firma segura               │
│ - Filtrar agente de IA semántica por tenant_id                         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ FASE 4: FRONTEND MULTI-EMPRESA (public/index.html)                     │
│ - Badge/indicador de la organización activa en el topbar               │
│ - Selector o vista de administración de Tenants (Superadmin)           │
│ - Restringir visibilidad de candidatos y usuarios a la empresa activa  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ FASE 5: PRUEBAS CRUZADAS Y BLINDAJE DE RAMA MAIN                       │
│ - Validar aislamiento estricto (Tenant A vs Tenant B)                  │
│ - Verificar que rama main sigue funcionando al 100% sin alteraciones   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🛡️ FASE 0: Protocolo de BackUp de Supabase

Antes de ejecutar cualquier sentencia o cambio, se establece un punto de restauración garantizado.

### Paso 0.1: Snapshot interno en Supabase (Respaldo en caliente)
Ejecutar el siguiente script en el **SQL Editor** de Supabase para respaldar las tablas productivas actuales:

```sql
-- 1. Snapshot de perfiles actuales
CREATE TABLE IF NOT EXISTS public.backup_profiles_legacy AS 
SELECT * FROM public.profiles;

-- 2. Snapshot de currículums actuales
CREATE TABLE IF NOT EXISTS public.backup_cvs_legacy AS 
SELECT * FROM public.cvs;

-- 3. Verificación de conteo de filas
SELECT 'profiles' AS tabla, count(*) FROM public.profiles
UNION ALL
SELECT 'backup_profiles', count(*) FROM public.backup_profiles_legacy
UNION ALL
SELECT 'cvs', count(*) FROM public.cvs
UNION ALL
SELECT 'backup_cvs', count(*) FROM public.backup_cvs_legacy;
```

> **Procedimiento de Restauración (Rollback):**
> En caso de requerir volver atrás:
> ```sql
> TRUNCATE public.profiles;
> INSERT INTO public.profiles SELECT * FROM public.backup_profiles_legacy;
> TRUNCATE public.cvs;
> INSERT INTO public.cvs SELECT * FROM public.backup_cvs_legacy;
> ```

### Paso 0.2: Exportación de respaldo a archivos locales
1. Desde el panel web de Supabase:
   - Ir a **Table Editor** ➡️ Seleccionar tabla `cvs` ➡️ Clic en **Export to CSV**.
   - Ir a **Table Editor** ➡️ Seleccionar tabla `profiles` ➡️ Clic en **Export to CSV**.
2. Guardar las exportaciones en el directorio del proyecto:
   `BackUp/cvs_backup.csv` y `BackUp/profiles_backup.csv`.
3. Mantener `schema.sql` intacto como el contrato de base de datos de la rama `main`.

---

## 🗄️ FASE 1: Estructura de Datos Paralela (`mt_*`)

Crear el script `schema_multitenant.sql` y ejecutarlo en Supabase:

### 1.1. Tabla `mt_tenants` (Empresas / Organizaciones)
```sql
CREATE TABLE IF NOT EXISTS public.mt_tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial'))
);
```

### 1.2. Tabla `mt_profiles` (Usuarios por Empresa)
```sql
CREATE TABLE IF NOT EXISTS public.mt_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.mt_tenants(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT DEFAULT 'usuario' CHECK (role IN ('superadmin', 'admin', 'usuario')),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 1.3. Tabla `mt_cvs` (Currículums particionados)
```sql
CREATE TABLE IF NOT EXISTS public.mt_cvs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  tenant_id UUID REFERENCES public.mt_tenants(id) ON DELETE CASCADE NOT NULL,
  nombre TEXT,
  apellido TEXT,
  profesion TEXT,
  ciudad TEXT,
  pais TEXT,
  fecha_nacimiento DATE,
  perfil_laboral TEXT,
  experiencia TEXT,
  habilidades TEXT,
  idiomas TEXT,
  educacion TEXT,
  email TEXT,
  file_hash TEXT NOT NULL,
  web_cv_link TEXT,
  recurso TEXT,
  CONSTRAINT mt_cvs_tenant_hash_unique UNIQUE (tenant_id, file_hash)
);
```

### 1.4. Políticas Row Level Security (RLS) en tablas `mt_*`
- Habilitar RLS en `mt_tenants`, `mt_profiles` y `mt_cvs`.
- Política de lectura: usuarios solo leen filas donde `tenant_id` sea igual al `tenant_id` de su registro en `mt_profiles`.
- Política de inserción de CVs: restringida a perfiles con rol `admin` o `superadmin`.

### 1.5. Datos iniciales de prueba (Seeds)
- Crear dos organizaciones iniciales (ej. "Empresa Demo Alpha" y "Empresa Demo Beta") para realizar pruebas cruzadas inmediatas.

---

## ⚙️ FASE 2: Adaptación del Backend Express (`server.js`)

Modificaciones en la rama `multitenant`:

1. **Middleware `requireAuth`:**
   - Al recibir el Bearer Token de Supabase, consultar `mt_profiles` en lugar de `profiles`.
   - Inyectar en `req.user`:
     - `req.user.tenant_id`: Identificador de la empresa a la que pertenece.
     - `req.user.role`: Rol del usuario (`superadmin`, `admin`, `usuario`).

2. **Endpoints de Currículums:**
   - `GET /api/cvs`: Filtrar por `.eq('tenant_id', req.user.tenant_id)` en `mt_cvs` (límite 4 recientes).
   - `GET /api/cvs/count`: Contar solo CVs de `mt_cvs` con `.eq('tenant_id', req.user.tenant_id)`.
   - `GET /api/cvs/all`: Listar candidatos de `mt_cvs` con `.eq('tenant_id', req.user.tenant_id)`.
   - `POST /api/cvs`: Inyectar automáticamente `tenant_id = req.user.tenant_id` al insertar en `mt_cvs`.

3. **Endpoints de Usuarios:**
   - `GET /api/users`: Listar usuarios de `mt_profiles` filtrando por `.eq('tenant_id', req.user.tenant_id)`.
   - `POST /api/users`: Crear usuario en `auth.admin.createUser` e insertar su perfil en `mt_profiles` con el `tenant_id` correspondiente.

4. **Nuevos Endpoints para `superadmin`:**
   - `POST /api/tenants`: Creación de nuevas organizaciones.
   - `GET /api/tenants`: Listado de organizaciones registradas.

---

## ☁️ FASE 3: Webhooks y Supabase Storage

1. **Subida de Archivos (`Carga_CV_Supa`):**
   - El cliente web adjunta el campo `tenant_id` al objeto `FormData`.
   - En n8n, el nodo de Supabase Storage guarda el archivo con la ruta:
     `${tenant_id}/${file_hash}.pdf`
   - La tabla `mt_cvs` registra `web_cv_link = '${tenant_id}/${file_hash}.pdf'`.

2. **Descarga y Firma Segura (`Obtener_CV`):**
   - La función `openCV(cvPath)` envía `{ path, tenant_id, email }`.
   - n8n / Backend valida que la ruta empiece con el `tenant_id` del usuario autenticado antes de generar la `signedURL`.

3. **Búsqueda Semántica con Agente IA (`Agente_CV_Supa`):**
   - La petición de búsqueda envía `{ query, tenant_id, session_id }`.
   - El agente de IA restringe la consulta o indexación exclusivamente al subconjunto de candidatos del `tenant_id`.

---

## 🖥️ FASE 4: Frontend (`public/index.html`)

1. **Identidad Visual del Tenant:**
   - Incorporar en el topbar una cápsula visual que indique la organización activa (ej. `[Empresa Alpha]`).
2. **Selector de Contexto para Superadmin:**
   - Si `role === 'superadmin'`, desplegar selector de empresas para conmutar entre organizaciones durante pruebas.
3. **Persistencia de Estado:**
   - Guardar `rrhh_tenant_id` en `sessionStorage` para mantener la coherencia en todas las llamadas API.

---

## 🧪 FASE 5: Matriz de Pruebas y Aprobación

| Prueba | Descripción | Criterio de Éxito |
| :--- | :--- | :--- |
| **P1: BackUp** | Verificar snapshot en Supabase | Conteo de filas idéntico entre tablas reales y backups. |
| **P2: Aislamiento CVs** | Subir CV en Empresa A y consultar en Empresa B | Empresa B tiene contador en 0 y tabla vacía. |
| **P3: Mismo Archivo** | Subir mismo CV (mismo SHA-256) en Empresa A y B | Ambas subidas son exitosas gracias a `UNIQUE(tenant_id, file_hash)`. |
| **P4: Descarga Segura** | Usuario de Empresa B intenta abrir CV de Empresa A | Acceso denegado / URL firmada bloqueada. |
| **P5: Blindaje Main** | Probar la versión `main` en producción | Operaciones normales sobre `profiles` y `cvs` sin fallas. |
