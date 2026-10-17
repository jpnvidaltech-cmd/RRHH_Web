-- ==============================================================================
-- MIGRACIÓN: Incorporar rol 'manager' en mt_profiles
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. Eliminar restricción de roles anterior
ALTER TABLE public.mt_profiles 
  DROP CONSTRAINT IF EXISTS mt_profiles_role_check;

-- 2. Aplicar nueva restricción que incluye 'manager'
ALTER TABLE public.mt_profiles 
  ADD CONSTRAINT mt_profiles_role_check 
  CHECK (role IN ('superadmin', 'admin', 'manager', 'usuario'));

-- 3. Confirmar que las políticas RLS existentes admitan el nuevo rol
-- (Las políticas actuales se basan en tenant_id, por lo que 'manager' opera
-- automáticamente de forma aislada y segura en su organización).
