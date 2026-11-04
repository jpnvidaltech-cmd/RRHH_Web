# Especificación de Roles, Permisos y Gestión Multitenant

## 1. Resumen Ejecutivo

Este documento define la arquitectura de control de acceso basada en roles (RBAC), la jerarquía de permisos y la gestión del ciclo de vida de usuarios del sistema **Perfiles RRHH Web** en su modalidad **Multitenant**.

El sistema establece cuatro niveles operativos diseñados para garantizar el aislamiento estricto de los datos entre diferentes organizaciones (tenants), permitiendo a la vez la administración centralizada del SaaS a través del **Superadmin**, la autonomía institucional de cada empresa a través del **Admin de Empresa**, la operación ágil de reclutamiento mediante los **Managers** y el acceso protegido para los **Usuarios** consultores.

---

## 2. Matriz de Permisos por Rol

| Capacidad / Funcionalidad | Superadmin | Admin (Empresa) | Manager | Usuario |
| :--- | :---: | :---: | :---: | :---: |
| **Alcance Operativo** | **Global (Multitenant)** | **Estrictamente su Tenant** | **Estrictamente su Tenant** | **Estrictamente su Tenant** |
| **Búsqueda Inteligente de CVs con IA** | Sí | Sí | Sí | Sí |
| **Listado y Filtro de Candidatos** | Sí | Sí | Sí | Sí |
| **Visualización y Descarga de CVs** | Sí | Sí | Sí | Sí |
| **Carga e Indexación de Nuevos CVs (Drag & Drop)** | Sí | Sí | Sí | ❌ No |
| **Eliminar Currículums (BD y Supabase Storage)** | Sí (Cualquier tenant) | Sí (Solo su empresa) | Sí (Solo su empresa) | ❌ No |
| **Cambiar de Empresa Activa (Tenant Switcher)** | **Sí** | ❌ No | ❌ No | ❌ No |
| **Crear Nuevas Empresas / Tenants** | **Sí** | ❌ No | ❌ No | ❌ No |
| **Crear Nuevos Usuarios** | Sí (Superadmin, Admin, Manager, Usuario) | Sí (Manager y Usuario) | Sí (Solo Usuario) | ❌ No |
| **Eliminar Perfiles de Usuario** | Sí (Cualquier usuario salvo sí mismo) | Sí (Managers y Usuarios de su empresa) | Sí (Solo Usuarios de su empresa) | ❌ No |
| **Resetear Contraseñas de Terceros** | Sí (Cualquier usuario) | Sí (Managers y Usuarios de su empresa) | Sí (Solo Usuarios de su empresa) | ❌ No |
| **Cambiar su Propia Contraseña** | Sí | Sí | Sí | Sí |

---

## 3. Descripción Detallada de los Roles

### 3.1. Rol: Superadmin (Nivel 1 - Operador Global del SaaS)
- **Propósito**: Gestión global de la plataforma, alta de organizaciones y administración transversal de cuentas.
- **Capacidades**:
  - **Creación de Tenants**: Puede crear nuevas empresas cliente definiendo *Nombre* y *Slug identificador*.
  - **Conmutación Dinámica (Tenant Switcher)**: Puede alternar libremente entre organizaciones desde la barra superior.
  - **Gestión Total de Usuarios**:
    - Puede crear usuarios con roles `superadmin`, `admin`, `manager` o `usuario` asignándolos a cualquier tenant.
    - Puede **eliminar perfiles** y **resetear contraseñas** de cualquier usuario de la plataforma.
  - **Carga y Gestión Documental**: Habilitado para subir, consultar y **eliminar CVs** en cualquier organización, purgando tanto el registro en `mt_cvs` como el archivo en Supabase Storage.

### 3.2. Rol: Admin de Empresa (Nivel 2 - Administrador Institucional)
- **Propósito**: Máxima autoridad y responsable administrativo dentro de su propia organización.
- **Capacidades**:
  - **Aislamiento Total**: No puede cambiar de organización ni crear nuevos tenants; su operación está estrictamente fijada a su `tenant_id`.
  - **Administración del Equipo de su Empresa**:
    - Puede crear nuevos colaboradores con roles `manager` y `usuario` para su empresa.
    - Puede **eliminar perfiles** y **resetear contraseñas** de `manager` y `usuario` de su empresa.
    - No puede eliminar ni resetear a otros administradores ni a superadmins.
  - **Carga y Gestión de CVs**: Acceso completo a carga, búsqueda y eliminación definitiva de candidatos de su empresa.

### 3.3. Rol: Manager (Nivel 3 - Líder Operativo de Reclutamiento)
- **Propósito**: Responsable operativo de selección y gestión de talento humano en su empresa.
- **Capacidades**:
  - **Carga y Gestión de CVs**: Carga masiva de CVs con extracción de IA y eliminación de CVs obsoletos de su empresa.
  - **Gestión Delegada de Usuarios**:
    - Puede dar de alta nuevos colaboradores con rol `usuario`.
    - Puede **eliminar** y **resetear contraseñas** de colaboradores con rol `usuario` de su empresa.
    - No puede gestionar ni alterar cuentas de administradores ni de otros managers.
  - **Aislamiento Estricto**: Confinado exclusivamente a su `tenant_id`.

### 3.4. Rol: Usuario (Nivel 4 - Consultor / Visualizador)
- **Propósito**: Miembro del equipo o evaluador que requiere consultar candidatos sin permisos de modificación documental ni gestión de accesos.
- **Capacidades**:
  - **Modo Consulta**: Busca con lenguaje natural, filtra por habilidades y descarga CVs de su organización.
  - **Carga y Edición Bloqueada**: Las zonas de carga drag-and-drop y las acciones de borrado se encuentran deshabilitadas.
  - **Autogestión de Seguridad**: Puede cambiar su propia contraseña en cualquier momento cumpliendo la política de seguridad unificada.

---

## 4. Visualización y Asistencia de Contraseñas (Password Toggle)

Todos los campos de contraseña en la plataforma incorporan un botón con icono interactivo de **ojo visible / oculto**:
- Conmuta entre `type="password"` y `type="text"`.
- Disponible en: Login, Modal de Cambio de Contraseña, Modal de Creación de Usuarios y Modal de Reseteo Administrativo.

---

## 5. Política Unificada de Seguridad y Contraseñas

Se exige una política estricta y sincronizada tanto en backend (`server.js`) como en frontend (`public/index.html`):
- Longitud mínima de **8 caracteres**.
- Al menos una letra **mayúscula** (`A-Z`).
- Al menos un **número** (`0-9`).
- Al menos un **símbolo especial** (`[!@#$%^&*(),.?":{}|<>_\-\+=]`).

---

## 6. Arquitectura Técnica y Mecanismos de Seguridad

### 6.1. Base de Datos (Supabase / PostgreSQL)
- **Restricción de Integridad en `mt_profiles`**:
  ```sql
  ALTER TABLE public.mt_profiles 
    ADD CONSTRAINT mt_profiles_role_check 
    CHECK (role IN ('superadmin', 'admin', 'manager', 'usuario'));
  ```
- **Integridad Referencial en Cascada**: `mt_profiles` referencia a `auth.users(id) ON DELETE CASCADE`.

### 6.2. Capa Backend (Node.js / Express)
- **`resolveActiveTenantId(req)`**: Únicamente el usuario con rol `superadmin` puede alternar de organización mediante cabeceras `x-tenant-id` o query params. Para `admin`, `manager` y `usuario`, el tenant está bloqueado de forma inmutable a su `req.user.tenant_id`.
- **`POST /api/tenants` y `POST /api/auth/switch-tenant`**: Protegidos con `requireSuperAdmin`.
- **`POST /api/users`**: Validación jerárquica estricta impidiendo escalada de privilegios.
- **`DELETE /api/users/:id` y Reseteo de Contraseñas**: Validación de pertenencia al mismo tenant y de jerarquía de roles antes de ejecutar cualquier acción destructiva o de reseteo.
