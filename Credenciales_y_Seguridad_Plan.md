# Plan de Implementación: Credenciales & Seguridad
**Proyecto:** Perfiles RRHH — AI Talent Engine (Multitenant)  
**Entorno de Aplicación:** Despliegue en Servidor VPS (Producción / Staging)  
**Fecha de Creación:** 22 de Octubre de 2026  
**Estado:** Planificado para migración a VPS

---

## 1. Objetivo General
Garantizar que todas las operaciones de autenticación, asignación de credenciales, cambio y reseteo de contraseñas cumplan de forma estricta y sincronizada con los **Criterios de Robustez** definidos en la interfaz, eliminando las discrepancias actuales entre el checklist visual y las validaciones de envío tanto en el frontend como en el backend.

---

## 2. Diagnóstico de la Situación Actual

| Componente | Estado Actual | Riesgo / Brecha |
| :--- | :--- | :--- |
| **Checklist visual (`checkStrength`)** | Evalúa en tiempo real: longitud $\ge 6$, mayúscula, número y símbolo. | Solo informativo; no bloquea el envío. |
| **Envío Frontend (`handleChangePasswordSubmit`)** | Solo valida que la longitud sea $\ge 6$ y coincidencia con confirmación. | Permite guardar contraseñas que incumplen 3 de los 4 criterios (ej: `"abcdef"`). |
| **Backend (`PUT /api/auth/change-password`)** | Solo valida `newPassword.length >= 6`. | Vulnerable a bypass de cliente vía llamadas API directas. |
| **Modal Crear Usuario (`POST /api/users`)** | No valida robustez de contraseña antes de enviar. | Creación de cuentas con credenciales débiles. |
| **Modal Resetear Clave (`PUT /api/users/:id/reset-password`)** | Valida únicamente `length >= 6`. | Reseteo con claves no conformes a la política de seguridad. |

---

## 3. Política de Robustez Unificada
Toda contraseña procesada por el sistema deberá satisfacer simultáneamente las siguientes 4 reglas:

1. **Longitud:** Mínimo **8 caracteres** (recomendado para producción VPS; o mínimo 6 si se mantiene la especificación actual).
2. **Mayúsculas:** Al menos una letra mayúscula (`/[A-Z]/`).
3. **Números:** Al menos un dígito numérico (`/[0-9]/`).
4. **Símbolos:** Al menos un carácter especial (`/[!@#$%^&*(),.?":{}|<>_\-\+=]/`).

---

## 4. Fases de Implementación

### Fase 1: Módulo Centralizado de Validación (Backend)
* **Archivo objetivo:** `server.js` (o módulo auxiliar `src/utils/passwordPolicy.js`).
* **Acciones:**
  1. Crear una función reutilizable de validación:
     ```javascript
     function validatePasswordStrength(password) {
       if (!password || typeof password !== 'string') return { valid: false, reason: 'Contraseña requerida.' };
       if (password.length < 8) return { valid: false, reason: 'Debe contener al menos 8 caracteres.' };
       if (!/[A-Z]/.test(password)) return { valid: false, reason: 'Debe incluir al menos una letra mayúscula.' };
       if (!/[0-9]/.test(password)) return { valid: false, reason: 'Debe incluir al menos un número.' };
       if (!/[!@#$%^&*(),.?":{}|<>_\-\+=]/.test(password)) return { valid: false, reason: 'Debe incluir al menos un símbolo especial (!@#...).' };
       return { valid: true };
     }
     ```
  2. Integrar la validación en los 3 endpoints de gestión de credenciales:
     - `PUT /api/auth/change-password` (cambio de clave propia).
     - `POST /api/users` (creación de nuevos usuarios).
     - `PUT /api/users/:id/reset-password` (reseteo administrativo por manager/admin).
  3. Devolver errores HTTP `400 Bad Request` descriptivos si la contraseña no cumple todos los criterios.

---

### Fase 2: Blindaje de la Experiencia en Frontend
* **Archivo objetivo:** `public/index.html` (Módulos JS de autenticación y equipo).
* **Acciones:**
  1. **Validación estricta previa al envío (`handleChangePasswordSubmit`):**
     - Evaluar los 4 criterios antes de disparar el `fetch`.
     - Si alguno no se cumple, abortar la petición y mostrar alerta clara con el requisito faltante.
  2. **Feedback dinámico en botón de acción:**
     - Deshabilitar el botón *"Actualizar Contraseña"* hasta que el formulario cumpla todos los criterios y las contraseñas coincidan.
  3. **Extensión a Modales de Creación y Reseteo:**
     - Replicar el checklist interactivo de robustez en el modal de **Crear Usuario** (`addUserModal`) y en el de **Resetear Contraseña** (`resetPasswordModal`).

---

### Fase 3: Seguridad Adicional para Entorno VPS (Producción)
* **Acciones a ejecutar durante el pase a VPS:**
  1. **Rate Limiting Estricto en Autenticación:**
     - Implementar `express-rate-limit` en `/api/auth/login`, `/api/auth/change-password` y `/api/users/:id/reset-password` (ejemplo: máximo 5 intentos erróneos por IP cada 15 minutos).
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
| **CP-01: Longitud insuficiente** | `Ab1!` (4 car.) | Rechazado: regla de longitud no cumplida. |
| **CP-02: Sin mayúsculas** | `segura123!` | Rechazado: falta letra mayúscula. |
| **CP-03: Sin números** | `SeguraTotal!` | Rechazado: falta dígito numérico. |
| **CP-04: Sin símbolos** | `Segura1234` | Rechazado: falta carácter especial. |
| **CP-05: Contraseña robusta válida** | `Admin2026#Segura` | Aceptado: todos los checks verdes y persistencia exitosa en Supabase Auth. |
| **CP-06: Disparidad de confirmación** | Nueva y Confirmación distintas | Rechazado: "Las contraseñas no coinciden". |
| **CP-07: Inyección API directa** | `curl` enviando `{"newPassword": "123"}` | Rechazado con HTTP 400 y mensaje de error específico. |

---

## 6. Próximos Pasos para la Activación
1. Mantener este documento como referencia técnica de entrega.
2. Al iniciar la etapa de despliegue en VPS, ejecutar secuencialmente la **Fase 1**, **Fase 2** y **Fase 3**.
3. Realizar la batería de pruebas de la **Matriz de Verificación** antes de liberar la versión a usuarios finales.
