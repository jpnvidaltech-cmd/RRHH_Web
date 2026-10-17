# Especificación de Roles, Permisos y Gestión Multitenant

## 1. Resumen Ejecutivo

Este documento define la arquitectura de control de acceso basada en roles (RBAC), la jerarquía de permisos y la gestión del ciclo de vida de usuarios del sistema **Perfiles RRHH Web** en su modalidad **Multitenant**.

El sistema establece tres niveles operativos diseñados para garantizar el aislamiento estricto de los datos entre diferentes organizaciones (tenants), permitiendo a la vez la administración centralizada de la plataforma, la creación dinámica de organizaciones y la delegación segura de tareas de administración a los gerentes (managers) de cada empresa.

---

## 2. Matriz de Permisos por Rol

| Capacidad / Funcionalidad | Admin / Superadmin | Manager | Usuario |
| :--- | :---: | :---: | :---: |
| **Alcance Operativo** | Global (Multitenant) | Estrictamente su Tenant | Estrictamente su Tenant |
| **Búsqueda Inteligente de CVs** | Sí | Sí | Sí |
| **Listado y Filtro de Candidatos** | Sí | Sí | Sí |
| **Visualización y Descarga de CVs** | Sí | Sí | Sí |
| **Carga e Indexación de Nuevos CVs (Drag & Drop)** | Sí | Sí | ❌ No |
| **Eliminar Currículums (BD y Supabase Storage)** | Sí | Sí (Solo de su empresa) | ❌ No |
| **Cambiar de Empresa Activa (Tenant Switcher)** | Sí | ❌ No | ❌ No |
| **Crear Nuevas Empresas / Tenants** | Sí | ❌ No | ❌ No |
| **Crear Nuevos Usuarios** | Sí (Admin, Manager, Usuario) | Sí (Solo Manager y Usuario) | ❌ No |
| **Eliminar Perfiles de Usuario** | Sí (Managers y Usuarios) | Sí (Solo Usuarios de su empresa) | ❌ No |
| **Resetear Contraseñas de Terceros** | Sí (Managers y Usuarios) | Sí (Solo Usuarios de su empresa) | ❌ No |
| **Cambiar su Propia Contraseña** | Sí | Sí | Sí |

---

## 3. Descripción Detallada de los Roles

### 3.1. Rol: Admin / Superadmin (Nivel 1)
- **Propósito**: Gestión global de la plataforma, alta de organizaciones y administración transversal de cuentas.
- **Capacidades**:
  - **Creación de Tenants**: Puede crear nuevas empresas definiendo *Nombre* y *Slug identificador*.
  - **Conmutación Dinámica (Tenant Switcher)**: Puede alternar libremente entre empresas activas.
  - **Gestión Total de Usuarios**:
    - Puede crear usuarios con roles `admin`, `manager` o `usuario`.
    - Puede **eliminar perfiles** de `manager` y `usuario`.
    - Puede **resetear la contraseña** de perfiles de `manager` y `usuario`, asignando una nueva clave si la han olvidado.
  - **Carga y Gestión de CVs**: Habilitado para subir, consultar y **eliminar CVs** en cualquier organización activa, purgando tanto el registro de base de datos (`mt_cvs`) como el archivo en Supabase Storage.

### 3.2. Rol: Manager (Nivel 2)
- **Propósito**: Responsable operativo de Recursos Humanos dentro de su respectiva empresa u organización.
- **Capacidades**:
  - **Carga y Gestión de CVs**: Acceso completo a la zona de drag-and-drop para cargar CVs (PDF, JPG, PNG) para su procesamiento e indexación con IA, y **eliminación de CVs** de su empresa (purgando base de datos y Supabase Storage) cuando un candidato ya no esté disponible.
  - **Gestión y Consulta de Candidatos**: Búsqueda semántica, filtros y descarga de CVs.
  - **Gestión Delegada de Usuarios (Dentro de su Empresa)**:
    - Puede ver la lista de miembros de su propia organización.
    - Puede **crear nuevos perfiles de `manager` y `usuario`** para su empresa (no puede crear administradores globales).
    - Puede **eliminar perfiles de `usuario`** de su empresa (no puede eliminar otros managers ni administradores).
    - Puede **resetear la contraseña de perfiles de `usuario`** de su empresa si olvidan su acceso.
  - **Aislamiento Estricto**: Su sesión está vinculada de manera inmutable a su `tenant_id`. No puede ver ni alterar datos de otras empresas.

### 3.3. Rol: Usuario (Nivel 3)
- **Propósito**: Miembro del equipo o consultor que requiere consultar candidatos sin capacidad de modificar la base documental ni la configuración de usuarios.
- **Capacidades**:
  - **Modo Consulta**: Puede buscar, filtrar, visualizar y descargar currículums existentes dentro de su empresa.
  - **Zona de Carga Bloqueada**: La sección de subida de archivos se reemplaza por un aviso informativo de permisos restringidos.
  - **Sin Gestión de Cuentas**: No puede crear, eliminar ni resetear contraseñas de otros usuarios.
  - **Autogestión de Seguridad**: Puede cambiar su propia contraseña personal en cualquier momento.

---

## 4. Visualización y Asistencia de Contraseñas (Password Toggle)

Para mejorar la experiencia de usuario y evitar bloqueos por errores de tipeo involuntarios (mayúsculas activadas, símbolos o espacios):
- Todos los campos de contraseña en la plataforma incorporan un botón con icono interactivo de **ojo abierto (`👁️`) / ojo tachado o cerrado (`🙈`)**.
- Al hacer clic, conmuta el atributo del input entre `type="password"` y `type="text"`.
- Disponible en:
  1. Pantalla de Inicio de Sesión (Login).
  2. Modal de Cambio de Contraseña Personal.
  3. Modal de Creación de Nuevos Usuarios.
  4. Modal de Reseteo de Contraseña Administrativo.

---

## 5. Arquitectura Técnica y Mecanismos de Seguridad

### 5.1. Base de Datos (Supabase / PostgreSQL)
- **Restricción de Integridad en `mt_profiles`**:
  ```sql
  ALTER TABLE public.mt_profiles DROP CONSTRAINT IF EXISTS mt_profiles_role_check;
  ALTER TABLE public.mt_profiles ADD CONSTRAINT mt_profiles_role_check 
    CHECK (role IN ('superadmin', 'admin', 'manager', 'usuario'));
  ```
- **Integridad Referencial en Cascada**:
  - La tabla `mt_profiles` referencia a `auth.users(id) ON DELETE CASCADE`.
  - Al eliminar un usuario mediante la API de administración de Supabase Auth, su registro en `mt_profiles` se depura de forma atómica e inmediata.

### 5.2. Capa Backend (Node.js / Express)
- **Middleware `requireManagerOrAdmin`**:
  - Protege los endpoints de gestión de usuarios (`GET /api/users`, `POST /api/users`, `DELETE /api/users/:id`, `PUT /api/users/:id/reset-password`).
- **Reglas de Seguridad y Validación en Eliminación (`DELETE /api/users/:id`)**:
  - **Anti-Autoeliminación**: Ningún usuario puede eliminar su propia cuenta activa.
  - **Admin**: Puede eliminar cuentas con rol `manager` o `usuario`.
  - **Manager**: 
    - Se valida que `targetProfile.tenant_id === req.user.tenant_id`.
    - Se valida que `targetProfile.role === 'usuario'`.
    - Bloqueo con `403 Forbidden` si intenta eliminar otro `manager`, `admin` o usuario de otra empresa.
- **Reglas de Seguridad en Reseteo de Claves (`PUT /api/users/:id/reset-password`)**:
  - Requiere contraseña con longitud mínima de 6 caracteres.
  - **Admin**: Puede resetear contraseñas de `manager` y `usuario`.
  - **Manager**: Solo puede resetear contraseñas de `usuario` pertenecientes a su misma empresa.
  - Ejecución mediante `supabaseAdmin.auth.admin.updateUserById(targetId, { password: newPassword })`.
- **Reglas de Creación (`POST /api/users`)**:
  - Si el creador es `manager`, solo se admiten roles `manager` y `usuario`, forzando el `tenant_id` del creador.
  - Si el creador es `admin`, puede crear en el tenant activo y asignar cualquier rol excepto superadmin.

### 5.3. Capa Frontend (Vanilla JS + CSS)
- **Panel de Gestión de Usuarios para Admin y Manager**:
  - El botón de usuarios del Topbar (`topbarAdminUsers`) se activa tanto para `Admin` como para `Manager`.
  - El selector de roles en `addUserModal`:
    - Para `Admin`: Muestra opciones `Usuario`, `Manager`, `Admin`.
    - Para `Manager`: Muestra únicamente `Usuario` y `Manager`.
- **Acciones en la Tabla de Usuarios (`openViewUsersModal`)**:
  - Cada fila muestra botones de acción según el rol del usuario conectado:
    - Botón **🔑 Resetear Contraseña**: Abre un modal modal interactivo para ingresar/generar la nueva contraseña.
    - Botón **🗑️ Eliminar Usuario**: Muestra confirmación de seguridad y elimina la cuenta de forma permanente.
    - Se ocultan las acciones sobre la propia cuenta del usuario conectado y sobre usuarios de mayor o igual jerarquía no permitidos.

### 5.4. Eliminación de Currículums (Base de Datos y Supabase Storage)
- **Endpoint**: `DELETE /api/cvs/:id` protegido por `requireAuth` y `requireManagerOrAdmin`.
- **Aislamiento Multitenant**:
  - Se resuelve `activeTenantId` para el solicitante. Un `Manager` sólo puede eliminar CVs con `tenant_id === req.user.tenant_id`.
  - Un `Admin` puede eliminar CVs de la empresa activa seleccionada.
- **Doble Depuración Atómica**:
  1. **Supabase Storage**: A partir del enlace `web_cv_link` registrado, el backend extrae la ruta interna dentro del bucket `Curriculums` e invoca `supabaseAdmin.storage.from('Curriculums').remove([storagePath])`, evitando archivos huérfanos.
  2. **PostgreSQL**: Se elimina la fila correspondiente en la tabla `mt_cvs` (`.delete().eq('id', cvId).eq('tenant_id', activeTenantId)`).
- **Interfaz de Usuario**:
  - En la **Base de Candidatos** (`#listContainer`), la columna *Acción* muestra el botón `🗑️` (Eliminar) exclusivamente a usuarios con rol `Manager` o `Admin`.
  - Solicita confirmación explícita con el nombre del candidato antes de ejecutar la acción.
  - Tras la eliminación, actualiza en tiempo real los contadores (KPIs) y la lista de CVs recientes sin requerir recargar la página.

