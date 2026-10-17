# Especificación de Roles, Permisos y Gestión Multitenant

## 1. Resumen Ejecutivo

Este documento define la arquitectura de control de acceso basada en roles (RBAC) y la jerarquía de permisos del sistema **Perfiles RRHH Web** en su modalidad **Multitenant**.

El sistema establece tres niveles operativos diseñados para garantizar el aislamiento estricto de los datos entre diferentes organizaciones (tenants), permitiendo a la vez la administración centralizada de la plataforma y la creación dinámica de nuevas organizaciones.

---

## 2. Matriz de Permisos por Rol

| Capacidad / Funcionalidad | Admin / Superadmin | Manager | Usuario |
| :--- | :---: | :---: | :---: |
| **Alcance Operativo** | Global (Multitenant) | Estrictamente su Tenant | Estrictamente su Tenant |
| **Búsqueda Inteligente de CVs** | Sí | Sí | Sí |
| **Listado y Filtro de Candidatos** | Sí | Sí | Sí |
| **Visualización y Descarga de CVs** | Sí | Sí | Sí |
| **Carga e Indexación de Nuevos CVs (Drag & Drop)** | Sí | Sí | ❌ No |
| **Cambiar de Empresa Activa (Tenant Switcher)** | Sí | ❌ No | ❌ No |
| **Crear Nuevas Empresas / Tenants** | Sí | ❌ No | ❌ No |
| **Administración y Alta de Usuarios** | Sí | ❌ No | ❌ No |

---

## 3. Descripción Detallada de los Roles

### 3.1. Rol: Admin / Superadmin (Nivel 1)
- **Propósito**: Gestión global de la plataforma, alta de clientes/organizaciones y supervisión transversal.
- **Capacidades**:
  - **Creación de Tenants**: Puede dar de alta nuevas empresas directamente desde la interfaz, definiendo el *Nombre* y el *Slug identificador*.
  - **Conmutación Dinámica (Tenant Switcher)**: Puede cambiar en caliente entre cualquier empresa del sistema mediante la cápsula superior o el modal de selección.
  - **Gestión de Usuarios**: Puede crear usuarios y asignar cualquiera de los roles (`admin`, `manager`, `usuario`) a cualquier organización.
  - **Carga de CVs**: Habilitado para subir y procesar currículums en cualquier organización activa.
  - **Consulta Completa**: Acceso total a listados, estadísticas y búsquedas de candidatos.

### 3.2. Rol: Manager (Nivel 2)
- **Propósito**: Responsable operativo de Recursos Humanos dentro de su respectiva empresa u organización.
- **Capacidades**:
  - **Carga de CVs Activa**: Acceso completo a la zona de drag-and-drop para cargar CVs (PDF, JPG, PNG) para su procesamiento e indexación con IA.
  - **Gestión y Consulta de Candidatos**: Búsqueda semántica, filtros por perfil laboral, descarga y visualización de CVs.
  - **Aislamiento Estricto**: Su sesión está vinculada de manera inmutable a su `tenant_id`. No puede ver ni conmutar a otras organizaciones.
  - **Sin Gestión Global**: No puede crear nuevas empresas ni administrar usuarios globales del sistema.

### 3.3. Rol: Usuario (Nivel 3)
- **Propósito**: Miembro del equipo o consultor que requiere consultar candidatos sin capacidad de modificar la base documental.
- **Capacidades**:
  - **Modo Solo Lectura**: Puede buscar, visualizar y descargar currículums existentes dentro de su empresa.
  - **Zona de Carga Bloqueada**: La sección de subida de archivos se reemplaza por un aviso informativo de permisos restringidos.
  - **Aislamiento Estricto**: Solo puede consultar la información correspondiente a su empresa asignada.

---

## 4. Nueva Funcionalidad: Creación de Tenants por Administradores

El usuario con rol **Admin** dispone de una herramienta integrada para incorporar nuevas empresas al ecosistema:

1. **Ubicación en UI**:
   - En el modal de organizaciones (`switchTenantModal`) se incorpora el acceso colapsable o botón directo **"+ Nueva Empresa"**.
2. **Campos requeridos**:
   - **Nombre de la Empresa**: Nombre visible (ejemplo: *Globant*, *Mercado Libre*, *Antártida Labs*).
   - **Slug identificador**: Código único alfanumérico en minúsculas (ejemplo: `globant`, `mercado-libre`), con generación automática sugerida a partir del nombre.
3. **Flujo de Ejecución**:
   - Validación de unicidad del `slug` en la tabla `mt_tenants`.
   - Llamada a la API (`POST /api/tenants`).
   - Tras la creación exitosa:
     - La nueva empresa se incorpora automáticamente al selector de organizaciones.
     - El sistema conmuta la sesión activa del Administrador a la empresa recién creada.
     - Se refrescan contadores (KPIs a 0), tabla de CVs y listado de recientes.

---

## 5. Arquitectura Técnica y Mecanismos de Seguridad

### 5.1. Base de Datos (Supabase / PostgreSQL)
- **Restricción de Integridad en `mt_profiles`**:
  ```sql
  ALTER TABLE public.mt_profiles DROP CONSTRAINT IF EXISTS mt_profiles_role_check;
  ALTER TABLE public.mt_profiles ADD CONSTRAINT mt_profiles_role_check 
    CHECK (role IN ('superadmin', 'admin', 'manager', 'usuario'));
  ```
- **Políticas RLS**: Las consultas y mutaciones en `mt_cvs` validan que el usuario solo opere en registros donde `tenant_id` coincide con el perfil autenticado (a menos que actúe el rol administrador con token de servicio).

### 5.2. Capa Backend (Node.js / Express)
- **Middlewares de Acceso**:
  - `requireAuth`: Extrae token JWT, valida sesión e inyecta `req.user` con su `tenant_id` y `role`.
  - `requireAdmin`: Restringe la ruta exclusivamente a `admin` y `superadmin`.
  - `requireManagerOrAdmin`: Permite el acceso a `manager`, `admin` y `superadmin` (utilizado para subida y registro de CVs).
- **Protección contra Inyección de Tenant**:
  - En los endpoints `/api/cvs`, `/api/cvs/count` y `/api/cvs/all`, solo se respeta la cabecera `x-tenant-id` si `req.user.role === 'admin' || req.user.role === 'superadmin'`.
  - Si el usuario es `manager` o `usuario`, se descarta cualquier cabecera externa y se fuerza estrictamente `req.user.tenant_id`.
- **Ruta de Cambio de Empresa (`POST /api/auth/switch-tenant`)**:
  - Valida que el rol sea `admin` o `superadmin`. En caso contrario retorna `403 Forbidden`.
- **Ruta de Creación de Empresa (`POST /api/tenants`)**:
  - Actualizada de `requireSuperAdmin` a `requireAdmin`.

### 5.3. Capa Frontend (Vanilla JS + CSS)
- **Visualización Condicional por Rol (`applyUserRole`)**:
  - Habilitación o bloqueo visual de `uploadZone` y `restrictedUploadMessage`.
  - Visibilidad de opciones administrativas en el Topbar.
- **Cápsula de Organización**:
  - Si es `admin` / `superadmin`: muestra cursor interactivo y flecha selectora `▾` que activa el modal.
  - Si es `manager` / `usuario`: se muestra como badge estático institucional sin interacción de cambio.
- **Badges de Identificación**:
  - `SuperAdmin` / `Admin`: Badge violeta / púrpura.
  - `Manager`: Badge verde esmeralda distintivo (`role-manager`).
  - `Usuario`: Badge neutro / gris (`role-usuario`).
