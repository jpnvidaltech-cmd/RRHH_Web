-- ==============================================================================
-- MIGRACIÓN: Promoción a Superadmin y Consolidación de Jerarquía Multitenant
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. Promover al usuario principal a superadmin
UPDATE public.mt_profiles 
SET role = 'superadmin', updated_at = now() 
WHERE email = 'jpnvidal@gmail.com';

-- 2. Confirmación de verificación
SELECT id, email, role, tenant_id, updated_at 
FROM public.mt_profiles 
WHERE email = 'jpnvidal@gmail.com';
