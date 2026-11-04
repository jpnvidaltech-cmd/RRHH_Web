A continuación presento el informe de la **Revisión de Seguridad** realizada sobre la arquitectura, base de datos y código de la plataforma, respondiendo a cada uno de tus puntos:

---

### 1. Cifrado y Gestión de Contraseñas

* **¿Están cifradas las claves en la base de datos?**
  * **Sí.** La aplicación delega la gestión de credenciales en **Supabase Auth** (`auth.users`). Supabase utiliza internamente el motor **GoTrue** de PostgreSQL, el cual almacena las contraseñas utilizando un hash criptográfico robusto (**bcrypt** con salting y factor de costo adaptativo).
  * En las tablas propias de la aplicación (`mt_profiles`, `profiles`, `mt_cvs`), **nunca se guardan contraseñas en texto plano**.
* **Políticas de robustez recién incorporadas:**
  * Se implementó la validación estricta tanto en el frontend como en el backend (`validatePasswordStrength`): mínimo **8 caracteres**, al menos 1 **mayúscula**, 1 **número** y 1 **símbolo especial**.
* **Punto de atención (Tránsito):**
  * Las contraseñas viajan en texto claro dentro del cuerpo de la petición HTTP (`/api/auth/login`, `/api/users`, `/api/auth/change-password`). Por este motivo, **en el entorno de producción es imprescindible exigir HTTPS/TLS** (mediante proxy inverso como Nginx, Traefik o Cloudflare) para evitar intercepciones en red (*man-in-the-middle*).

---

### 2. Uso y Alcance de Row Level Security (RLS)

* **¿Se encuentra RLS configurado en la base de datos?**
  * **Sí, a nivel de esquema SQL:** En [`schema_multitenant.sql`](file:///Users/juampi/Library/CloudStorage/OneDrive-Personal/Documentos/Servicios%20Profesionales/Antigravity%20McBook%20Projects/Asistente%20RRHH%20Web/schema_multitenant.sql#L50-L53) se ejecuta:
    ```sql
    ALTER TABLE public.mt_tenants ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.mt_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.mt_cvs ENABLE ROW LEVEL SECURITY;
    ```
    Y existen políticas de aislamiento multitenant para consultas `SELECT` e `INSERT`.

* **Hallazgo Arquitectónico Crítico:**
  * En [`server.js`](file:///Users/juampi/Library/CloudStorage/OneDrive-Personal/Documentos/Servicios%20Profesionales/Antigravity%20McBook%20Projects/Asistente%20RRHH%20Web/server.js#L33-L41), el servidor se inicializa con `SUPABASE_SERVICE_ROLE_KEY`:
    ```javascript
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ...);
    ```
  * En Supabase / PostgreSQL, la clave `service_role` posee el privilegio especial `BYPASSRLS`. Esto significa que **todas las consultas que realiza el servidor Express se saltan (bypassean) las políticas RLS**.
  * **Consecuencia:** La seguridad y el aislamiento entre organizaciones (tenants) **no están siendo controlados por RLS**, sino exclusivamente por la lógica de Express (los filtros `.eq('tenant_id', ...)` y los middlewares `requireAuth`, `requireManagerOrAdmin`, etc.).
  * Si un usuario se conectase directamente a Supabase con la clave pública `anon` y su token JWT, allí sí aplicaría RLS, pero dentro del servidor el control es puramente a nivel de software/código.
* **Cobertura de políticas RLS incompleta:**
  * En `schema_multitenant.sql` **no existen políticas para `UPDATE` ni `DELETE`** sobre `mt_cvs` ni `mt_profiles`. Con la clave `anon` ningún usuario autenticado podría actualizar o borrar registros en Supabase directamente (denegado por omisión).

---

### 3. Aislamiento Multitenant y Jerarquía de Roles (Riesgo de Autorización)

* **Riesgo en `resolveActiveTenantId`:**
  * En [`server.js` (líneas 170-178)](file:///Users/juampi/Library/CloudStorage/OneDrive-Personal/Documentos/Servicios%20Profesionales/Antigravity%20McBook%20Projects/Asistente%20RRHH%20Web/server.js#L170-L178):
    ```javascript
    function resolveActiveTenantId(req) {
      const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'superadmin');
      if (isAdmin) {
        return req.headers['x-tenant-id'] || req.query.tenant_id || req.user.tenant_id;
      }
      return req.user.tenant_id;
    }
    ```
  * Si un usuario tiene el rol `admin` (administrador de su propia empresa, no de toda la plataforma), actualmente puede enviar una cabecera `x-tenant-id: <id_otra_empresa>` o el query param `?tenant_id=...` y el servidor le devolverá los CVs de esa otra empresa (`/api/cvs`, `/api/cvs/all`).
  * **Recomendación:** El cambio arbitrario de `tenant_id` debería ser potestad **exclusiva del rol `superadmin`**. Si es `admin`, debe estar restringido a su propio `req.user.tenant_id`.

* **Riesgo en `/api/auth/switch-tenant`:**
  * Cualquier usuario con rol `admin` puede invocar este endpoint pasando cualquier `tenant_id` y el servidor modificará su asignación en `mt_profiles` a esa otra empresa sin comprobar si está autorizado en ella. Debería limitarse solo a `superadmin`.

---

### 4. Seguridad en la Integración con Webhooks (n8n)

* **Llamadas directas desde el navegador del cliente:**
  * En el frontend (`public/index.html`), las acciones con la IA (`CONFIG.webhookCargaCv`, `CONFIG.webhookAgenteCv`, `CONFIG.webhookObtenerCv`) se realizan haciendo `fetch()` directamente desde el navegador del usuario hacia los endpoints públicos de n8n.
  * En estas llamadas se envían en el cuerpo valores como `tenant_id`, `tenant_slug` y `email`.
* **Vulnerabilidad / Exposición:**
  * Las URLs de los webhooks de n8n están expuestas públicamente.
  * Si los workflows en n8n no validan una firma criptográfica o un token secreto en las cabeceras, cualquier atacante que inspeccione la consola de red podría enviar peticiones a n8n simulando ser cualquier empresa o usuario.
  * **Recomendación futura:** Que el frontend llame a endpoints del servidor Express (`/api/agent/consultar`, `/api/agent/cargar`), y sea el servidor Express (tras verificar autenticación y tenant) quien invoque a n8n con una cabecera de autenticación segura (`X-Webhook-Secret`).

---

### 5. Exposición de Secretos en el Repositorio

* **Claves en archivos de documentación rastreados por Git:**
  * En [`DataBase.md` (líneas 24-25)](file:///Users/juampi/Library/CloudStorage/OneDrive-Personal/Documentos/Servicios%20Profesionales/Antigravity%20McBook%20Projects/Asistente%20RRHH%20Web/DataBase.md#L24-L25), figuran URLs y un token JWT anon real:
    ```markdown
    NEXT_PUBLIC_SUPABASE_URL=https://supabase-supabase.5tx6ny.easypanel.host
    NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1Ni...
    ```
  * Aunque es la clave anon, mantener URLs y tokens productivos en archivos Markdown dentro del repositorio git representa un riesgo si el repositorio llega a compartirse.
* **Aspecto positivo:**
  * El archivo `.env` está correctamente listado en [`.gitignore`](file:///Users/juampi/Library/CloudStorage/OneDrive-Personal/Documentos/Servicios%20Profesionales/Antigravity%20McBook%20Projects/Asistente%20RRHH%20Web/.gitignore#L2) y no ha sido subido a Git.

---

### 6. Controles de Red y Protección General (Hardening)

| Aspecto | Estado Actual | Riesgo / Observación |
| :--- | :--- | :--- |
| **Protección contra Fuerza Bruta** | No implementada | El endpoint `/api/auth/login` no posee límite de tasa (*rate limiting*). Un atacante podría realizar ataques de diccionario continuos. Se recomienda `express-rate-limit`. |
| **Cabeceras de Seguridad HTTP** | No implementadas | Express no utiliza `helmet` (faltan `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options: nosniff`). |
| **Almacenamiento de Tokens (SPA)** | `sessionStorage` (`rrhh_auth_token`) | Se destruye al cerrar la pestaña (mejor que `localStorage`), pero sigue siendo accesible ante ataques XSS en el navegador. (Ideal: cookies `HttpOnly; Secure; SameSite=Strict`). |
| **Sanitización XSS** | **Correcta** | El frontend cuenta con la función `escHtml()` y la utiliza sistemáticamente al renderizar nombres, perfiles, emails y datos de candidatos. |

---

### Resumen y Próximos Pasos Recomendados

1. **Aislamiento Multitenant (Prioridad Alta):** Restringir la alternancia de `tenant_id` en `resolveActiveTenantId` y `/api/auth/switch-tenant` para que aplique únicamente a `superadmin`, evitando que un `admin` de una empresa consulte datos de otra.
2. **Protección Brute-Force (Prioridad Media):** Agregar `express-rate-limit` al endpoint de login (`POST /api/auth/login`).
3. **Limpieza de Secretos (Prioridad Media):** Reemplazar los datos reales de conexión en `DataBase.md` por marcadores de posición (`https://tu-dominio.supabase.co`, etc.).
4. **Proxy de Webhooks (Prioridad Media/Baja):** Canalizar las llamadas a n8n a través del backend Express para evitar exponer las URLs directas y validar la autenticidad del tenant.