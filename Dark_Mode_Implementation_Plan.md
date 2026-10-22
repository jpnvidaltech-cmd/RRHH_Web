# Plan de Implementación: Sistema de Tema Oscuro (Dark Mode)
**Proyecto:** Perfiles RRHH — AI Talent Engine  
**Rama:** `Design`  
**Fecha:** 22 de Octubre de 2026  
**Objetivo:** Permitir al usuario alternar entre el tema actual (**Light / Warm Minimal**) y un **Dark Mode** sofisticado con fondos oscuros profundos y colores suaves basados en la paleta original de la plataforma (`#0F1A2E`, `#162035`, `#1E2D4A`).

---

## 1. Análisis de la Paleta y Filosofía de Diseño

### Paleta Original de la Versión Anterior
La versión anterior de Perfiles RRHH utilizaba una armonía nocturna ejecutiva de alto confort visual:
* **Fondo Base (`--navy`):** `#0F1A2E` (Azul medianoche profundo, descansa la vista).
* **Superficie de Tarjetas (`--navy-mid`):** `#162035` (Gris azulado intermedio con sutil elevación).
* **Contenedores y Estados Hover (`--navy-light`):** `#1E2D4A` (Azul pizarra suave para botones secundarios y inputs).
* **Acentos Primarios:** `#2563EB` / `#3B82F6` (Azul cobalto tecnológico suave) y toques de `#10B981` (Esmeralda para badges de éxito) y `#F59E0B` (Ámbar suave para advertencias y métricas).
* **Textos:** `#F8FAFC` (Blanco suave, no blanco puro chillón) y `#94A3B8` / `#64748B` (Pizarra atenuado para etiquetas secundarias).
* **Bordes:** `rgba(255, 255, 255, 0.08)` (Micro-bordes etéreos).

### Estrategia de Adaptación al Nuevo Diseño
En lugar de reescribir cada clase de Tailwind o generar código duplicado, aprovechamos la arquitectura de tokens de Tailwind CSS ya configurada en `index.html`:
```javascript
tailwind.config = {
  darkMode: "class",
  // tokens mapeados mediante CSS Custom Properties
}
```
Al definir los tokens de color como variables CSS dinámicas que conmutan cuando la etiqueta `<html>` tiene la clase `.dark`, **todas las pantallas, tarjetas, inputs, tablas y modales adoptarán instantáneamente el nuevo tema oscuro sin romper ninguna pantalla ni función multitenant**.

---

## 2. Mapeo de Tokens de Color (Light vs. Dark)

| Token Semántico | Tema Actual (Light Warm) | Nuevo Tema Dark (Suave Ejecutivo) |
| :--- | :--- | :--- |
| **`background`** / `surface` | `#FAF9F6` (Alabastro cálido) | **`#0F1A2E`** (Medianoche profundo) |
| **`surface-container-lowest`** | `#FFFFFF` (Blanco puro tarjetas) | **`#162035`** (Azul marino tarjetas) |
| **`surface-container-low`** | `#F4F3F0` (Superficie inputs/dropzone) | **`#121D32`** (Superficie inputs oscura) |
| **`surface-container`** | `#EFEEEB` (Contenedores neutros) | **`#1A2740`** (Contenedor interactivo) |
| **`surface-container-high`** | `#E9E8E5` (Hover suave) | **`#203152`** (Hover destacado) |
| **`on-surface`** (Texto principal) | `#1A1C1A` (Gris oscuro) | **`#F8FAFC`** (Blanco suave) |
| **`on-surface-variant`** (Subtítulos) | `#45474c` (Gris medio) | **`#94A3B8`** (Pizarra suave legible) |
| **`outline`** / `outline-variant` | `#75777D` / `#C5C6CD` | **`#334155`** / `rgba(255,255,255,0.08)` |
| **`primary`** (Botones / Brand) | `#091426` (Navy oscuro) | **`#3B82F6`** o **`#1E293B`** con texto blanco |
| **`border-surface-container`** | `#EFEEEB` (Bordes claros) | **`rgba(255, 255, 255, 0.08)`** |

---

## 3. Arquitectura del Selector de Tema (Switch / Toggle)

### Ubicación del Control en la Interfaz
Se integrará un botón switch de tema elegante en el **Topbar Superior**, inmediatamente a la izquierda del perfil de usuario y botón de cerrar sesión:
* **Iconografía:** 
  - En modo Claro: ícono `dark_mode` (luna estilizada).
  - En modo Oscuro: ícono `light_mode` (sol cálido).
* **Interacción:** Transición suave con tooltip explicativo *"Cambiar a modo oscuro / modo claro"*.
* **Persistencia:** Almacenamiento de la preferencia en `localStorage.getItem('rrhh_theme')` para que el tema persista al recargar la página o volver a iniciar sesión.

---

## 4. Fases del Plan de Implementación

### Fase 1: Abstracción de Variables CSS en `:root` y `.dark`
* Modificar el bloque `<style>` en `public/index.html` para enlazar las clases de Tailwind a variables CSS:
  ```css
  :root {
    --bg-main: #faf9f6;
    --surface-card: #ffffff;
    --surface-low: #f4f3f0;
    --surface-mid: #efeeeb;
    --surface-high: #e9e8e5;
    --text-primary: #1a1c1a;
    --text-muted: #45474c;
    --border-color: #efeeeb;
  }
  html.dark {
    --bg-main: #0f1a2e;
    --surface-card: #162035;
    --surface-low: #121d32;
    --surface-mid: #1a2740;
    --surface-high: #203152;
    --text-primary: #f8fafc;
    --text-muted: #94a3b8;
    --border-color: rgba(255, 255, 255, 0.08);
  }
  ```

### Fase 2: Configuración de Tailwind CSS
* Ajustar `tailwind.config` para que las propiedades `colors` consuman `var(--...)` con soporte de opacidades.
* Garantizar que la clase `dark:` funcione de forma transparente en elementos específicos que requieran un contraste particular (por ejemplo, el botón de Cerrar Sesión y las pastillas de los filtros).

### Fase 3: Componente del Switch y Script de Inicialización
* Insertar el botón `#btnThemeToggle` en el header global.
* Agregar el script de inicialización inmediata en el `<head>` para evitar parpadeos visuales (FOUC):
  ```javascript
  if (localStorage.getItem('rrhh_theme') === 'dark' || (!('rrhh_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  ```
* Implementar la función `toggleTheme()` que intercambia la clase y actualiza el icono.

### Fase 4: Adaptación de Componentes Clave
1. **Header & Sidebar:** Fondos `#0F1A2E` con blur suave y micro-bordes de separación.
2. **Hero de Ingesta & KPI:** El dropzone pasa a fondo `#121D32` con borde punteado suave; el sparkline SVG utiliza `#38BDF8` (azul cian brillante) para destacar con elegancia.
3. **Tabla de Candidatos:** Filas con fondo alternado sutil `#162035` y hover `#1E2D4A`; texto del perfil laboral expandible en `#94A3B8`.
4. **Modales (Login, Switch Tenant, Reset Clave):** Fondo de tarjeta en `#162035` con sombra profunda `rgba(0,0,0,0.5)`.

### Fase 5: Testing Visual y Verificación
* Validar con subagente de navegador ambas modalidades (Light y Dark).
* Verificar legibilidad de tipografías, contrastes WCAG AA, y comportamiento de las acciones (descargas, vistas previas, botones de filtro y paginación).

---

## 5. Beneficios para el Usuario
1. **Continuidad Estética:** Recupera la sensación tecnológica y moderna de la versión original que tanto gustaba, pero con la nueva distribución de información y herramientas avanzadas.
2. **Libertad de Elección:** Usuarios en entornos de poca luz o jornadas extensas pueden trabajar cómodamente en Dark Mode, mientras que quienes prefieran el estilo editorial ejecutivo pueden permanecer en Light Mode.
3. **Cero Impacto Funcional:** No altera ninguna consulta de Supabase, roles RBAC, multitenancy ni llamadas a los webhooks de IA.
