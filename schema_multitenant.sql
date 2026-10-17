-- ==============================================================================
-- FASE 1: ESTRUCTURA MULTITENANT PARALELA (Tablas mt_*)
-- ==============================================================================

-- 1. Crear tabla de Organizaciones / Empresas (Tenants)
CREATE TABLE IF NOT EXISTS public.mt_tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial'))
);

-- 2. Crear tabla de Perfiles de Usuario asociados a un Tenant
CREATE TABLE IF NOT EXISTS public.mt_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.mt_tenants(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'usuario' CHECK (role IN ('superadmin', 'admin', 'usuario')),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Crear tabla de Currículums particionada por Tenant
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

-- ==============================================================================
-- 4. HABILITACIÓN DE ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.mt_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mt_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mt_cvs ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas anteriores si existieran
DROP POLICY IF EXISTS "Lectura de tenants a usuarios autenticados" ON public.mt_tenants;
DROP POLICY IF EXISTS "Lectura de perfiles de su propio tenant" ON public.mt_profiles;
DROP POLICY IF EXISTS "Lectura de CVs de su propio tenant" ON public.mt_cvs;
DROP POLICY IF EXISTS "Insercion de CVs solo admins de su tenant" ON public.mt_cvs;

-- 4.1. Políticas para mt_tenants
CREATE POLICY "Lectura de tenants a usuarios autenticados"
ON public.mt_tenants FOR SELECT
TO authenticated
USING (true);

-- 4.2. Políticas para mt_profiles: Un usuario solo ve perfiles de su misma empresa
CREATE POLICY "Lectura de perfiles de su propio tenant"
ON public.mt_profiles FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT p.tenant_id FROM public.mt_profiles p WHERE p.id = auth.uid())
);

-- 4.3. Políticas para mt_cvs: Un usuario solo lee CVs de su propia empresa
CREATE POLICY "Lectura de CVs de su propio tenant"
ON public.mt_cvs FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT p.tenant_id FROM public.mt_profiles p WHERE p.id = auth.uid())
);

-- 4.4. Políticas para mt_cvs: Solo admins/superadmins pueden insertar CVs en su empresa
CREATE POLICY "Insercion de CVs solo admins de su tenant"
ON public.mt_cvs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.mt_profiles p
    WHERE p.id = auth.uid() 
      AND p.tenant_id = mt_cvs.tenant_id 
      AND p.role IN ('admin', 'superadmin')
  )
);

-- ==============================================================================
-- 5. SEMILLAS DE PRUEBA (Empresas Iniciales)
-- ==============================================================================
INSERT INTO public.mt_tenants (name, slug, status)
VALUES 
  ('Empresa Demo Alpha', 'alpha-corp', 'active'),
  ('Empresa Demo Beta', 'beta-solutions', 'active')
ON CONFLICT (slug) DO NOTHING;
