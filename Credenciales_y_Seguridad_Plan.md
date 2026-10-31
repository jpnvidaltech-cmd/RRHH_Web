# Plan de Implementación: Credenciales & Seguridad
**Proyecto:** Perfiles RRHH — AI Talent Engine (Multitenant)  
**Entorno de Aplicación:** Despliegue en Servidor VPS (Producción / Staging)  
**Fecha de Actualización:** 31 de Octubre de 2026  
**Estado:** Actualizado y consolidado para implementación en VPS

---

## 1. Objetivo General
Garantizar que todas las operaciones de autenticación, asignación de credenciales, cambio y reseteo de contraseñas cumplan de forma estricta y sincronizada con los **Criterios de Robustez** definidos en la interfaz, estableciendo una política unificada de **mínimo 8 caracteres**, mayúscula, número y símbolo, tanto en el frontend como en el backend.

---

## 2. Diagnóstico de la Situación Actual

| Componente | Estado Actual | Ajuste Requerido |
| :--- | :--- | :--- |
| **Checklist visual (`checkStrength`)** | Muestra y evalúa longitud $\ge 6$, mayúscula, número y símbolo. | Migrar a **longitud $\ge 8$** en el texto HTML (`8+ caracteres`) y en la condición JS (`val.length >= 8`). |
| **Envío Frontend (`handleChangePasswordSubmit`)** | Solo valida `newPassword.length >= 6` y coincidencia de confirmación. | Validar que se cumplan simultáneamente las 4 reglas (8+ car., mayúscula, número, símbolo) antes del `fetch`. |
| **Backend (`PUT /api/auth/change-password`)** | Solo valida `newPassword.length >= 6`. | Integrar `validatePasswordStrength()` centralizado para rechazar con HTTP 400 contraseñas no conformes. |
| **Modal Crear Usuario (`POST /api/users`)** | Backend valida `password.length < 6`; frontend no valida robustez. | Sincronizar frontend (`handleAddUserSubmit`) y backend con la política de 8 caracteres y actualizar placeholder. |
| **Modal Resetear Clave (`resetUserPasswordHandler`)** | Backend valida `newPassword.length < 6`; frontend valida `< 6`. | Aplicar la política de 8 caracteres en `handleResetPasswordSubmit` y en el controlador backend unificado. |

---

## 3. Política de Robustez Unificada
Toda contraseña procesada por el sistema (alta de usuario, reseteo por administrador y cambio voluntario de clave) deberá satisfacer **obligatoria y simultáneamente** las siguientes 4 reglas:

1. **Longitud:** Mínimo **8 caracteres** obligatorios.
2. **Mayúsculas:** Al menos una letra mayúscula (`/[A-Z]/`).
3. **Números:** Al menos un dígito numérico (`/[0-9]/`).
4. **Símbolos:** Al menos un carácter especial (`/[!@#$%^&*(),.?":{}|<>_\-\+=]/`).

---

## 4. Fases de Implementación

### Fase 1: Módulo Centralizado de Validación (Backend)
* **Archivo objetivo:** `server.js`
* **Acciones:**
  1. Crear la función centralizada de validación:
     ```javascript
     function validatePasswordStrength(password) {
       if (!password || typeof password !== 'string') return { valid: false, reason: 'Contraseña requerida.' };
       if (password.length < 8) return { valid: false, reason: 'La contraseña debe contener al menos 8 caracteres.' };
       if (!/[A-Z]/.test(password)) return { valid: false, reason: 'La contraseña debe incluir al menos una letra mayúscula.' };
       if (!/[0-9]/.test(password)) return { valid: false, reason: 'La contraseña debe incluir al menos un número.' };
       if (!/[!@#$%^&*(),.?":{}|<>_\-\+=]/.test(password)) return { valid: false, reason: 'La contraseña debe incluir al menos un símbolo especial (!@#...).' };
       return { valid: true };
     }
     ```
  2. Integrar la validación en los 3 flujos de credenciales del backend:
     - **Cambio de clave propia:** `PUT /api/auth/change-password`.
     - **Creación de colaboradores:** `POST /api/users`.
     - **Reseteo administrativo:** `resetUserPasswordHandler` (asociado a `PUT /api/users/:id/reset-password`, `POST /api/users/:id/reset-password` y alias defensivos).
  3. Devolver respuesta HTTP `400 Bad Request` con el mensaje descriptivo exacto (`reason`) si la contraseña no cumple la política.

---

### Fase 2: Blindaje de la Experiencia en Frontend
* **Archivo objetivo:** `public/index.html`
* **Acciones:**
  1. **Actualización del Checklist Visual (`viewTeam`):**
     - Cambiar el texto HTML del criterio a `<span>8+ caracteres</span>`.
     - Actualizar `checkStrength(val)` para evaluar `val.length >= 8`.
  2. **Validación estricta previa al envío (`handleChangePasswordSubmit`):**
     - Evaluar los 4 criterios antes de disparar el `fetch`.
     - Si alguno no se cumple, mostrar alerta (`showAlert('error', ...)`) y abortar el envío.
     - Verificar coincidencia exacta entre la nueva contraseña y su confirmación.
  3. **Extensión a Modales de Alta y Reseteo:**
     - **Modal Crear Usuario (`addUserModal`):**
       - Actualizar placeholder: `placeholder="Mínimo 8 caracteres (A-Z, 0-9, !@#...)"`.
       - En `handleAddUserSubmit()`, validar los 4 criterios antes de enviar la petición.
     - **Modal Resetear Clave (`resetPasswordModal`):**
       - Actualizar placeholder: `placeholder="Mínimo 8 caracteres (A-Z, 0-9, !@#...)"`.
       - En `handleResetPasswordSubmit()`, validar los 4 criterios antes de enviar la petición.

---

### Fase 3: Seguridad Adicional para Entorno VPS (Producción)
* **Acciones a ejecutar durante el pase a VPS:**
  1. **Rate Limiting Estricto en Autenticación:**
     - Implementar `express-rate-limit` en `/api/auth/login`, `/api/auth/change-password` y `/api/users/:id/reset-password` (máximo 5 intentos erróneos por IP cada 15 minutos).
  2. **Protección de Cabeceras HTTP:**
     - Configurar `helmet` para mitigación de XSS, Clickjacking y Sniffing de tipos MIME.
  3. **Gestión Segura de Variables de Entorno en VPS:**
     - Asegurar que `SUPABASE_SERVICE_ROLE_KEY` y `JWT_SECRET` residan exclusivamente en el archivo `.env` del servidor con permisos `600` (`chmod 600 .env`).
  4. **Configuración de Cookies Seguras:**
     - Si se migra el almacenamiento de tokens de `sessionStorage` a cookies, utilizar flags obligatorios: `HttpOnly`, `Secure` (HTTPS vía Nginx / Let's Encrypt) y `SameSite=Strict`.

---

## 5. Matriz de Verificación y Testing (QA en VPS)

| Caso de Prueba | Entrada | Resultado Esperado |
| :--- | :--- | :--- |
| **CP-01: Longitud insuficiente** | `Ab1!xyz` (7 car.) | Rechazado: regla de longitud no cumplida (mínimo 8 caracteres). |
| **CP-02: Sin mayúsculas** | `segura123!` | Rechazado: falta letra mayúscula. |
| **CP-03: Sin números** | `SeguraTotal!` | Rechazado: falta dígito numérico. |
| **CP-04: Sin símbolos** | `Segura1234` | Rechazado: falta carácter especial. |
| **CP-05: Contraseña robusta válida** | `Admin2026#Segura` | Aceptado: todos los checks verdes y persistencia exitosa en Supabase Auth. |
| **CP-06: Disparidad de confirmación** | Nueva y Confirmación distintas | Rechazado: "Las contraseñas no coinciden". |
| **CP-07: Inyección API directa** | `curl` enviando `{"newPassword": "123"}` | Rechazado con HTTP 400 y mensaje de error específico. |

---

## 6. Próximos Pasos para la Activación
1. Mantener este documento como referencia técnica acordada.
2. Al autorizar la fase de desarrollo, implementar secuencialmente la **Fase 1 (Backend)** y la **Fase 2 (Frontend)**.
3. Ejecutar la batería de pruebas de la **Matriz de Verificación** para validar la integridad completa del sistema de credenciales.
