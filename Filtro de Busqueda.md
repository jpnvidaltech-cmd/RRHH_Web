# Especificación y Plan de Implementación: Filtro de Búsqueda en Lista de CVs

## 1. Resumen Ejecutivo

El presente documento detalla la arquitectura, el diseño de interfaz (UI/UX) y la lógica técnica para la incorporación del **Filtro de Búsqueda Interactivo** en la sección **Base de Candidatos / Lista de CVs** de la aplicación **Perfiles RRHH Web**.

Este componente se ubica estratégicamente entre el encabezado principal de la vista y la tabla de datos, proporcionando a los reclutadores y administradores herramientas de filtrado instantáneo en memoria para localizar perfiles por **Nombre de candidato**, **Profesión** y **Palabras clave** sin fricción, con actualización en tiempo real y soporte completo para paginación y ordenamiento.

---

## 2. Requerimientos Funcionales

1. **Ubicación Visual:**
   - La barra de filtros debe situarse en `#listContainer`, inmediatamente debajo del título institucional (*"Currículums en la Base"*) y por encima de la tarjeta que contiene la tabla (`.list-card`).

2. **Criterios de Filtrado:**
   - **Búsqueda por Nombre y Palabras Clave:**
     - Campo de entrada de texto interactivo con icono de lupa `🔍`.
     - Coincidencia en tiempo real (insensible a mayúsculas/minúsculas y tildes básicas) sobre:
       - Nombre y Apellido del candidato (`nombre`, `apellido`).
       - Correo electrónico (`email`).
       - Perfil laboral o resumen profesional (`perfil_laboral`).
   - **Filtro Desplegable por Profesión:**
     - Selector `<select>` poblado dinámicamente con las profesiones únicas registradas en los currículums del tenant activo.
     - Opción por defecto: *"Todas las profesiones"*.
     - Orden alfabético de las profesiones disponibles.

3. **Experiencia de Usuario en Vivo (Live Search):**
   - El filtrado debe ejecutarse instantáneamente en memoria sobre el conjunto de datos cargado (`allCVs`), sin latencia de peticiones de red adicionales ni recargas de página.
   - Restablecimiento automático de la paginación a la **Página 1** tras cada cambio en los filtros.

4. **Indicador de Conteo Dinámico:**
   - Un badge o etiqueta visual que muestre en tiempo real el estado de los resultados:
     - Ejemplo: *"Mostrando 4 de 12 candidatos"*.
     - Si no hay coincidencias: *"Sin coincidencias para los filtros aplicados"*.

5. **Acción de Limpieza Rápida:**
   - Botón interactivo `✕ Limpiar` que restablece el campo de texto a vacío, el selector de profesión a *"Todas las profesiones"* y restituye la tabla a su estado completo.

6. **Integración con Ordenamiento y CRUD:**
   - El ordenamiento por columnas (Candidato, Profesión, Fecha de Registro) debe operar sobre el subconjunto de resultados filtrados.
   - Si se elimina un CV mediante la acción `🗑️ Eliminar`, la lista base y los filtros activos deben sincronizarse de inmediato.

---

## 3. Recomendaciones de Experiencia de Usuario (UX / UI)

Para brindar una experiencia sumamente ágil y profesional acorde a los estándares de la plataforma:

1. **Sin Botón "Buscar" para el Filtrado:**
   - El evento `input` en el campo de texto filtra de forma continua y fluida a medida que el usuario escribe, eliminando clics innecesarios.
2. **Auto-poblado Inteligente de Profesiones:**
   - Al cambiar de empresa en el *Tenant Switcher* o al indexar un nuevo CV, el selector de profesiones extrae automáticamente los valores vigentes en la base de datos de esa organización.
3. **Estética Glassmorphism Coherente:**
   - Integración visual con la paleta Navy oscura (`#0F1A2E`, `#162035`), bordes sutiles en `rgba(255, 255, 255, 0.08)`, efectos de foco con resplandor neón azul (`#2563EB`) y tipografía Inter/Outfit.
4. **Diseño Responsivo (Mobile & Desktop):**
   - En pantallas amplias, los controles se despliegan en una sola línea horizontal equilibrada. En pantallas móviles o tablets, los elementos se reorganizan en bloques apilados con espaciado uniforme.

---

## 4. Diseño de la Interfaz de Usuario (Mockup Estructural)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Currículums en la Base                                             [ 🔍 Búsqueda IA ] │
│  Listado completo de candidatos indexados en el sistema.                               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  BARRA DE FILTROS:                                                                     │
│  ┌──────────────────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │ 🔍 Buscar por nombre, email o palabra clave.. │  │ 💼 Todas las profesiones    ▼ │  │
│  └──────────────────────────────────────────────┘  └────────────────────────────────┘  │
│  [ 🏷️ Mostrando 4 de 12 candidatos ]                                    [ ✕ Limpiar ] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  TABLA DE CANDIDATOS (Paginada y Ordenable)                                            │
│  ┌──────────────┬───────────────┬──────────────────────┬─────────────┬──────────────┐  │
│  │ Candidato ▲  │ Profesión     │ Perfil Laboral       │ Fecha Reg.  │ Acciones     │  │
│  ├──────────────┼───────────────┼──────────────────────┼─────────────┼──────────────┤  │
│  │ ...          │ ...           │ ...                  │ ...         │ 📄  🗑️       │  │
│  └──────────────┴───────────────┴──────────────────────┴─────────────┴──────────────┘  │
│  [ Página 1 de 1 (Total: 4 registros) ]                                     [ ◀ ] [ ▶ ]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Especificación de Implementación Técnica

### 5.1. Maquetación HTML (`public/index.html`)

Se inserta el bloque `#cvFilterBar` dentro de `#listContainer`:

```html
<div id="cvFilterBar" class="cv-filter-bar">
  <div class="cv-filter-inputs">
    <div class="filter-input-wrapper">
      <span class="filter-icon">🔍</span>
      <input type="text" id="filterSearchText" class="filter-control" 
             placeholder="Buscar por nombre, email o palabra clave..." 
             oninput="applyCVFilters()" autocomplete="off">
    </div>
    
    <div class="filter-input-wrapper">
      <span class="filter-icon">💼</span>
      <select id="filterProfessionSelect" class="filter-control select-control" 
              onchange="applyCVFilters()">
        <option value="">Todas las profesiones</option>
      </select>
    </div>
  </div>

  <div class="cv-filter-meta">
    <span class="filter-badge" id="filterResultBadge">Cargando candidatos…</span>
    <button type="button" class="btn-clear-filter" id="btnClearFilters" 
            onclick="clearCVFilters()" title="Limpiar todos los filtros">
      ✕ Limpiar
    </button>
  </div>
</div>
```

### 5.2. Estilos CSS (`public/index.html`)

- `.cv-filter-bar`: fondo translúcido (`rgba(17, 24, 39, 0.7)` con `backdrop-filter: blur(12px)`), borde en `var(--border)`, `border-radius: 12px`, padding compacto.
- `.cv-filter-inputs`: disposición flex con `gap: 12px` y `flex: 1`.
- `.filter-input-wrapper`: contenedor relativo para alojar el icono a la izquierda y el input con padding izquierdo adecuado.
- `.filter-control`: altura `38px`, color de texto claro, borde sutil, transición suave de focus.
- `.filter-badge`: estilo cápsula en tonos azules/grises con tipografía compacta (`0.8rem`).
- `.btn-clear-filter`: botón discreto con efecto hover en tono de advertencia/peligro suave.

### 5.3. Funciones JavaScript (`public/index.html`)

1. **`filteredCVs` (Variable de estado):**
   - Arreglo que contiene los elementos filtrados a partir de `allCVs`.
2. **`populateProfessionFilter()`:**
   - Extrae los valores de `cv.profesion` de `allCVs`.
   - Normaliza cadenas, elimina duplicados con `Set`, filtra vacíos y ordena alfabéticamente.
   - Reconstruye dinámicamente las opciones de `#filterProfessionSelect`.
3. **`applyCVFilters()`:**
   - Obtiene el término de búsqueda y la profesión seleccionada.
   - Aplica el predicado sobre `allCVs`:
     - Coincidencia de texto en: `${cv.nombre || ''} ${cv.apellido || ''} ${cv.email || ''} ${cv.perfil_laboral || ''}`.
     - Coincidencia de profesión: igualdad estricta o normalizada.
   - Almacena el resultado en `filteredCVs`.
   - Reinicia `currentPage = 1`.
   - Actualiza el texto de `#filterResultBadge` (*"Mostrando X de Y candidatos"*).
   - Invoca `sortAndRenderTable()`.
4. **`clearCVFilters()`:**
   - Resetea los valores de los controles:
     - `filterSearchText.value = ''`
     - `filterProfessionSelect.value = ''`
   - Invoca `applyCVFilters()`.
5. **Actualización de `sortAndRenderTable()`:**
   - La función ordena y pagina sobre el arreglo activo `filteredCVs` (en lugar de directamente sobre `allCVs`).
   - Muestra mensaje personalizado si la búsqueda no arroja coincidencias: *"No se encontraron currículums que coincidan con los filtros aplicados."* con un botón directo para limpiar filtros.

---

## 6. Plan de Verificación y Pruebas

1. **Prueba de Carga Inicial:**
   - Al ingresar a la vista *"Lista de CVs"*, el dropdown debe contener todas las profesiones existentes en la organización activa.
   - El badge debe mostrar el total exacto de currículums disponibles.
2. **Prueba de Búsqueda por Nombre:**
   - Escribir *"Rafael"* debe filtrar inmediatamente mostrando únicamente a Rafael Sosa Reyes.
3. **Prueba de Búsqueda por Profesión:**
   - Seleccionar *"Programador"* o *"Desarrollador"* debe aislar a los candidatos correspondientes.
4. **Prueba Combinada:**
   - Filtrar por profesión *"Programador"* y escribir *"Barcelona"* debe reducir el listado exclusivamente al perfil coincidente.
5. **Prueba de Limpieza:**
   - Hacer clic en `✕ Limpiar` debe reestablecer los filtros y mostrar todos los candidatos.
6. **Prueba de Cambio de Organización:**
   - Al cambiar de empresa en el conmutador de tenants, el selector de profesiones debe re-poblarse automáticamente con las profesiones de la nueva empresa.
