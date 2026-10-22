# Plan de Implementación: Rediseño Visual "Talent Intelligence Warm Minimal"

**Proyecto:** Asistente RRHH Web  
**Rama:** `Design`  
**Referencia de Diseño:** Carpeta `public/Design` (Diseños Stitch)  
**Fecha:** 21 de Octubre de 2026  
**Estado:** Pendiente de Aprobación

---

## 1. Resumen Ejecutivo y Objetivos

El objetivo de esta intervención es **transformar completamente la apariencia visual, colores, tipografía y experiencia de usuario (UX/UI)** de la plataforma web actual, adoptando el sistema editorial ejecutivo **"Talent Intelligence Warm Minimal"** diseñado en Stitch (`public/Design`), sin comprometer ni alterar ninguna de las funcionalidades operativas ya construidas.

### Principios Fundamentales:
1. **Fidelidad al Nuevo Diseño:** Aplicar la paleta de colores cálida (Warm Alabaster `#FAF9F6`, Slate Navy `#091426` / `#1E293B`, Warm Terracotta `#E06D53`, Mint Emerald `#10B981` y Ámbar `#D97706`), la tipografía **Plus Jakarta Sans**, íconos **Material Symbols Outlined** y el nuevo logotipo corporativo (`public/Design/Logo/Gemini_Generated_Image_v2.png`).
2. **Cero Regresión Funcional:** Mantener intacta la lógica existente de autenticación (Express + Supabase Auth), permisos por roles RBAC (Admin, Manager, Usuario), webhooks de n8n para carga y búsqueda semántica de CVs, firma de URLs de Supabase Storage para previsualización, filtros en tiempo real y paginación.
3. **Discriminación de Elementos Fuera de Alcance:** Conforme a lo instruido, todos los elementos puramente decorativos o que correspondan a funciones no existentes en el backend (ej. métricas ficticias de dispositivos, auditorías complejas o tuning de prompts sin endpoints) no serán incluidos.

---

## 2. Análisis del Sistema de Diseño (`public/Design`)

### 2.1. Tokens y Fundamentos Visuales
- **Tipografía Principal:** `Plus Jakarta Sans` (pesos 400, 500, 600, 700) cargada vía Google Fonts. Reemplaza a las familias anteriores (`Syne` y `DM Sans`).
- **Iconografía:** `Material Symbols Outlined` (Google) para una interfaz técnica y consistente.
- **Paleta Cromática (Warm Minimal):**
  - **Lienzo / Fondo:** Alabastro cálido `#FAF9F6` / `#F8F7F4` (reemplaza al fondo azul oscuro `--navy` `#0F1A2E`).
  - **Tarjetas y Superficies:** Blanco puro `#FFFFFF` con micro-bordes `1px solid rgba(30, 41, 59, 0.08)` y sombras difusas cálidas (`0 1px 3px rgba(30,41,59,0.04), 0 4px 12px rgba(30,41,59,0.03)`).
  - **Primario (Texto & Jerarquía):** Slate Navy `#091426` / `#1E293B` para encabezados, botones oscuros y navegación activa.
  - **Secundario (Acción Principal & Acentos):** Terracota `#E06D53` / `#A13E28` para botones destacados (ej. "Buscar con IA"), botones de acción rápida y pips activos.
  - **Éxito / High Match:** Menta Esmeralda `#10B981` con contenedor `#ECFDF5` para puntuaciones altas (9.0+) y estados de éxito.
  - **Scoring & Destacados:** Ámbar `#D97706` con contenedor `#FEF3C7` para badges de puntuación ponderada.
  - **Alerta / Descarte:** Rojo suave `#BA1A1A` con contenedor `#FFDAD6` para alertas de baja afinidad y borrado.
- **Identidad de Marca:**
  - Logotipo: `Design/Logo/Gemini_Generated_Image_v2.png`.
  - Nombre: **Perfiles RRHH** · Subtítulo: *AI Talent Engine*.

### 2.2. Vistas Prototipadas en Stitch
El directorio `public/Design` contiene tres prototipos desktop completos:
1. `b_squeda_ia_alternativa_b_centro_de_equipo_con_licencias_y_cta_prominente`: Búsqueda semántica, prompt interactivo, cuadrícula de candidatos evaluados y cuadros de calificación comparativa y notas.
2. `base_de_talento_e_ingesta_de_cvs_desktop`: Ingesta/Dropzone de CVs con barra de progreso, KPIs de la base y tabla avanzada de candidatos con búsqueda y acciones.
3. `equipo_seguridad_y_configuraci_n_desktop`: Perfil del administrador, actualización de contraseña con checklist de robustez y administración de usuarios/roles del equipo.

---

## 3. Arquitectura del Nuevo Layout y Navegación

En el diseño actual, la carga de CVs estaba confinada a la barra lateral izquierda y se alternaba entre búsqueda y tabla mediante un botón de conmutación. En el nuevo diseño de Stitch se adopta una **arquitectura fluida de 3 secciones principales con navegación fija lateral (Sidebar w-72)**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOPBAR GLOBAL (Logo, Badge IA/CVs, Fecha/Hora local, Empresa Activa, Perfil, Salir)    │
├───────────────┬────────────────────────────────────────────────────────────────────────┤
│ SIDEBAR (280px)│ MAIN VIEWPORT DINÁMICO                                                 │
│               │                                                                        │
│ [🧠 Búsqueda]  │  [VISTA 1: Búsqueda Semántica & Comparativa IA]                       │
│ [📁 Base CVs] │  [VISTA 2: Base de Talento & Ingesta Inteligente de CVs]               │
│ [⚙️ Equipo]   │  [VISTA 3: Equipo, Roles & Configuración de Seguridad]                 │
│               │                                                                        │
└───────────────┴────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Topbar Global Superior
- **Izquierda:** Nuevo logotipo institucional, texto "Perfiles RRHH / AI Talent Engine", badge dinámico con contador real de CVs (`Total CVs indexados`) y reloj en tiempo real con fecha y huso horario (`America/Buenos_Aires`).
- **Centro:** Selector / Badge de la Empresa u Organización actual (Multitenant).
- **Derecha:**
  - Píldora de usuario activo con avatar, email y badge de rol jerárquico (`ADMIN`, `MANAGER`, `USUARIO`).
  - Botón de acceso directo a cambio de contraseña (`vpn_key`).
  - Botón estilizado de "Cerrar Sesión" (`logout`).

### 3.2. Sidebar de Navegación Lateral (w-72 / 280px)
Tres accesos directos principales con estado activo estilizado en Slate Navy (`#091426`):
1. **Búsqueda & Comparativa IA** (`psychology`)
2. **Base de Talento & CVs** (`folder_shared`)
3. **Equipo & Configuración** (`tune`)

---

## 4. Mapeo Funcional: Qué se Integra y Qué se Descarta

| Módulo / Vista | Funcionalidad Existente que SE MANTIENE | Elemento del Diseño Stitch que SE APLICA | Elemento que SE DESCARTA (Sin backend / Decorativo) |
| :--- | :--- | :--- | :--- |
| **Topbar** | Reloj en vivo, sesión activa, rol RBAC, logout, cambio de clave. | Diseño limpio Warm Minimal, avatar, badge de rol con estilo pill, selector de tenant. | Menú hover desplegable con datos estáticos de licencias ficticias. |
| **Vista 1: Búsqueda IA** | Textarea de búsqueda en lenguaje natural, llamada a `/webhook/Agente_CV_Supa`, spinner de carga, tarjetas de candidatos, links de descarga a Supabase Storage con URL firmada, cuadros de calificación comparativa, impresión PDF, botón limpiar. | Consola de prompt con halo terracota, cuadrícula de tarjetas de candidatos (4 columnas desktop) con initials avatar, badges de scoring (`9.0 / 10`), chips de skills, cuadros comparativos modernos. | Chips estáticos de filtros prefijados irrelevantes; botones de mockups sin webhook asociado. |
| **Vista 2: Base de CVs** | Ingesta de CVs (PDF, JPG, PNG) hacia webhook y Supabase Storage, barra de progreso real, tabla interactiva de CVs con filtrado instantáneo por Nombre y Profesión, ordenamiento por columnas, paginación real, visualización y eliminación de CV (roles Admin/Manager). | Zona de dropzone amplia y amigable, tarjeta de estado de indexación, tabla aireada con avatares de iniciales y badges de categoría, barra de búsqueda horizontal integrada. | Gráfico SVG de sparklines estático ficticio; KPIs con números simulados de "tiempos OCR". Se mostrarán estadísticas reales del total de CVs y formatos. |
| **Vista 3: Equipo y Seguridad** | Listado de usuarios de la organización (`/api/users`), alta de nuevos usuarios con rol (Admin/Manager/Usuario), borrado de usuario, reseteo de clave, cambio de contraseña propia (`/api/auth/change-password`). | Tarjeta de perfil del usuario conectado, formulario moderno de cambio de clave con checklist visual interactivo de robustez (8+ caracteres, mayúsculas, números, símbolos) y toggles para ver contraseña; listado de colaboradores con roles y botón "+ Invitar / Agregar Usuario". | Sliders de afinación semántica de IA (temperatura, sensibilidad, idioma de resúmenes) y auditoría de sesiones/dispositivos (sin endpoint en backend). |
| **Login Overlay** | Formulario de autenticación vía `/api/auth/login`, control de errores, toggle de visualización de contraseña. | Reestilización con la paleta Warm Minimal, tarjeta blanca elevada, botón de ingreso Terracota y tipografía Plus Jakarta Sans. | N/A (Se conserva todo el flujo). |

---

## 5. Plan de Ejecución Paso a Paso

### Fase 1: Fundaciones Visuales y Recursos
- [ ] Incorporar en `public/index.html` las fuentes oficiales `Plus Jakarta Sans` y los íconos `Material Symbols Outlined`.
- [ ] Configurar el sistema de variables CSS y tokens de Tailwind con la paleta de colores y radios del `DESIGN.md`.
- [ ] Enlazar el nuevo logotipo corporativo desde `Design/Logo/Gemini_Generated_Image_v2.png`.

### Fase 2: Reestructuración del Shell y Navegación
- [ ] Construir el nuevo `header` superior con la disposición editorial de 3 zonas (Brand/Reloj, Selector Tenant, Píldora de Perfil/Logout).
- [ ] Implementar el nuevo `aside` de navegación lateral con las 3 secciones:
  - `Búsqueda & Comparativa IA`
  - `Base de Talento & CVs`
  - `Equipo & Configuración`
- [ ] Crear el controlador JavaScript de navegación (`switchView(viewName)`) para alternar limpiamente la visibilidad de los tres contenedores principales (`#viewSearch`, `#viewTalent`, `#viewTeam`).

### Fase 3: Integración de la Vista 1 (Búsqueda & Comparativa IA)
- [ ] Trasladar el buscador existente a la consola de prompt estilizada en Warm Minimal con atajo `Enter` / botón `Buscar con IA`.
- [ ] Adaptar el motor de renderizado de tarjetas (`candidatesGrid`) para generar el formato de Stitch:
  - Avatar con iniciales coloreadas.
  - Puntuación ponderada en badge ámbar/esmeralda (`9.0 / 10`).
  - Síntesis semántica destacada.
  - Chips de habilidades técnicas.
  - Botón funcional "Ver CV" que solicita la URL firmada de Supabase Storage.
- [ ] Adaptar la renderización de cuadros comparativos (`extraBlocks`): gráfico de barras de calificación comparativa y notas cualitativas de la IA.
- [ ] Conectar las acciones de "Limpiar" y "Imprimir Reporte (PDF)".

### Fase 4: Integración de la Vista 2 (Base de Talento & Ingesta de CVs)
- [ ] Integrar el panel de métricas reales (Total de CVs en base conectado a `updateCVCount()`).
- [ ] Implementar la zona de Ingesta Inteligente (Drag-and-Drop) con el nuevo diseño, vinculada al `input[type=file]` y la barra de progreso existente de subida a n8n/Supabase.
- [ ] Integrar la barra interactiva de filtros de búsqueda (Nombre y Profesión) con ancho completo y contador dinámico.
- [ ] Rediseñar la tabla de candidatos registrados respetando las columnas sortables, paginación funcional y los botones de acción ("Ver CV" y "Eliminar CV" con modal de confirmación RBAC).

### Fase 5: Integración de la Vista 3 (Equipo, Roles & Configuración)
- [ ] Ensamblar la tarjeta de perfil del usuario conectado mostrando sus datos reales (`currentUser.email`, `currentUserProfile.role`).
- [ ] Conectar el formulario de cambio de contraseña a la función `handleChangePasswordSubmit`, añadiendo el validador interactivo de robustez (longitud, mayúsculas, números, símbolos) y toggles de ojo para revelar caracteres.
- [ ] Incrustar la lista de usuarios del sistema (`loadSystemUsers`) directamente en el panel de equipo, permitiendo ver roles y gestionar accesos según la jerarquía RBAC.
- [ ] Integrar el modal / formulario de creación de nuevo usuario ("+ Invitar Nuevo Usuario").

### Fase 6: Login Overlay & Modales
- [ ] Rediseñar el `loginOverlay` aplicando el estilo Warm Minimal, logo corporativo y feedback visual de carga.
- [ ] Actualizar los estilos de los modales y del contenedor de notificaciones toast (`showAlert`).

### Fase 7: Validación de Calidad y Cero Regresión
- [ ] Verificar funcionamiento con los 3 roles: `admin`, `manager`, `usuario`.
- [ ] Probar subida de CV (PDF y JPG) y verificación de respuesta.
- [ ] Probar búsqueda de perfiles con IA y renderizado de tarjetas y cuadros.
- [ ] Probar apertura de CVs con URLs firmadas en pestañas nuevas.
- [ ] Probar filtro instantáneo por nombre/profesión en la tabla y ordenamiento.
- [ ] Probar cambio de contraseña y creación de usuarios.

---

## 6. Validación y Próximo Paso

Este plan asegura la adopción íntegra del nuevo lenguaje de diseño sin romper ningún flujo existente.  
**No se realizarán modificaciones sobre el código de la aplicación hasta que este plan sea revisado y formalmente aprobado.**
