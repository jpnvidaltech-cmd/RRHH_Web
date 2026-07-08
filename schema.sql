-- 1. Crear tipo de datos para roles
CREATE TYPE user_role AS ENUM ('admin', 'usuario');

-- 2. Crear tabla de perfiles de usuario
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  updated_at TIMESTAMPTZ,
  email TEXT,
  role user_role DEFAULT 'usuario'::user_role NOT NULL
);

-- Habilitar RLS en perfiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas previas si existen
DROP POLICY IF EXISTS "Permitir lectura de perfiles a usuarios autenticados" ON public.profiles;

CREATE POLICY "Permitir lectura de perfiles a usuarios autenticados" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (true);

-- 3. Crear tabla de currículums (CVS)
CREATE TABLE IF NOT EXISTS public.cvs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
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
  file_hash TEXT UNIQUE,
  web_cv_link TEXT,
  recurso TEXT
);

-- Habilitar RLS en CVS
ALTER TABLE public.cvs ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas previas si existen
DROP POLICY IF EXISTS "Permitir lectura de CVs a usuarios autenticados" ON public.cvs;
DROP POLICY IF EXISTS "Permitir inserción de CVs solo a administradores" ON public.cvs;

-- Políticas para CVS
CREATE POLICY "Permitir lectura de CVs a usuarios autenticados"
ON public.cvs FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Permitir inserción de CVs solo a administradores"
ON public.cvs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role
  )
);

-- 4. Trigger para creación automática de perfiles al registrarse un usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'usuario'::public.user_role)
  ON CONFLICT (id) DO UPDATE
  SET email = excluded.email;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
