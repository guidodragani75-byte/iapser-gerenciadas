# Manual de Usuario, Arquitectura y Sincronización — IAPSER Gerenciadas

Este documento describe cómo están vinculados todos los componentes del sistema **IAPSER — Seguimiento Operativo de Empresas Gerenciadas**, cómo operan las funciones clave (Sincronización en vivo, Vista Previa de Documentos, Alta Masiva OCR y Tablero de KPIs) y **el protocolo obligatorio de actualización** cada vez que se modifique código o se sincronicen datos.

---

## 1. Mapa General de Vinculación de Archivos

El repositorio consta de **3 archivos centrales** que trabajan de forma acoplada:

| Archivo | Rol en el Sistema | Con qué se vincula |
| :--- | :--- | :--- |
| [`index.html`](./index.html) | Aplicación web principal (Frontend SPA): Tabla operativa, Filtros, Ficha lateral (Aside), Visor Ampliado, Alta Masiva OCR y Tablero Analítico de KPIs (3 Universos). | Lee [`datos_precargados.js`](./datos_precargados.js) como base offline, consulta Google Sheets en vivo vía `gviz/tq` (JSONP) al abrirse y envía escrituras/archivos a [`codigo_apps_script.js`](./codigo_apps_script.js). |
| [`datos_precargados.js`](./datos_precargados.js) | Base inicial precargada (`window.DATOS_INICIALES_IAPSER`, actualmente **1.203 registros**: `925` Residual 2026 + `123` Alta Sep 2026 + `155` Alta Oct 2026). | Respaldo inmediato al abrir la app sin conexión o antes de que termine el fetch en vivo a Google Sheets. |
| [`codigo_apps_script.js`](./codigo_apps_script.js) | Backend en Google Apps Script (`doGet` / `doPost`) conectado a la planilla Google Sheets (`1RV3891125-cN13hL5422sG8G4JwN4e0bF6g_vT0mU5c`) y a Google Drive. | Recibe acciones `saveVisit`, `createTask`, `batchUpload` y `gestionarFallida`; organiza archivos en Drive en doble ruta (**Por Empresa/Establecimiento** y **Por Mes**) y devuelve el link real de Drive. |

---

## 2. Flujo de Datos y Sincronización Automática

1. **Carga Inicial (`DOMContentLoaded`)**:
   - Ejecuta `inicializarDatos()`: carga `localStorage` (`LS_CACHE_KEY`), fusiona las ediciones locales pendientes (`LS_PENDING_EDITS_KEY` vía `fusionarEdicionesLocalesEnTareas()`) y recalcula los estados operativos (`calcularEstadosAutomaticos()`).
   - Pobla filtros (`llenarFiltroLocalidades()`, `actualizarOpcionesDesplegableCohortes()`).
   - Actualiza inmediatamente los contadores superiores (`actualizarKpis()`), el **Tablero Analítico completo** (`renderizarTableroKPIs()`) y la tabla principal (`filtrarYRenderizar()`).
   - Dispara automáticamente `sincronizarConBackend(false)` a los `400 ms` de abrir la página.

2. **Sincronización en Vivo (`sincronizarConBackend`)**:
   - **Paso 1**: Si hay URL de Web App configurada (`LS_CONFIG_URL`), consulta `?action=getData`.
   - **Paso 2 (Fallback directo)**: Si no hay Web App configurada o falla CORS, consulta directamente la planilla Google Sheets mediante `cargarDesdeGoogleSheetsJSONP()` y transforma las filas con `mapearTablaGvizATareas(table)`.
   - **Paso 3 (Protección contra pérdida de datos)**: Antes de reemplazar `TASKS`, ejecuta `fusionarEdicionesLocalesEnTareas(datosSincronizados)` para conservar cualquier visita, reprogramación o alta guardada localmente que aún no haya sido confirmada por el backend.
   - **Paso 4 (Refresco Integral)**: Guarda en caché local y **obligatoriamente** ejecuta:
     - `llenarFiltroLocalidades()`
     - `actualizarOpcionesDesplegableCohortes()`
     - `actualizarKpis()`
     - `renderizarTableroKPIs()`
     - `filtrarYRenderizar()`

---

## 3. Checklist Obligatorio al Leer o Modificar Código (Protocolo Anti-Desfasaje)

> **IMPORTANTE**: Nunca hardcodear números de visitas, porcentajes, fechas (`2026-10`, `20261022`), orígenes (`Alta Sep 2026`), ni topes de meses (`idx <= 0` o `m > 0`) en el HTML ni en las funciones de gráficos. Todo debe calcularse en tiempo de ejecución a partir del array `TASKS`.

Cada vez que se modifique la lógica de datos, filtros, estados o sincronización en [`index.html`](./index.html), **verificar y actualizar estos 6 puntos vinculados**:

### A. Normalización de Datos (`normalizarTarea`, `normalizarFecha`, `parsearFechaHasta`)
- **Fechas**: Toda fecha proveniente de Apps Script o Sheets puede venir como `DD/MM/YYYY`, `YYYY-MM-DD` o ISO 8601 (`2026-10-05T03:00:00.000Z`). Siempre pasar por `normalizarFecha(str)` antes de mostrarla o evaluarla en `parsearFechaHasta(str)`.
- **Tipología "Visita tecnica"**: El valor canónico interno es **`Visita tecnica` (sin tilde)** en `LISTA_TAREAS_VALIDAS`, en `normalizarTarea()`, en los `<select>` HTML (`#filtroTarea`, `#newTareaTipo`) y en el OCR. Para comparar nombres de tareas entre sí, usar siempre `mismaTarea(a, b)` (que aplica `quitarTildes()`).
- **Nombres de archivo estandarizados**: Pasar siempre por `quitarTildes()` antes de `.replace(/[^A-Z0-9]+/g, '_')` para generar `VISITA_TECNICA` y nunca `VISITA_T_CNICA`.

### B. Selector de Cohorte / Origen del Plan (`#filtroCohorteContainer` y `#selMesAltaFiltro`)
- El filtro de cohorte consta de 3 botones (`Todas`, `Residual 2026`, `Altas Nuevas`) y el desplegable dinámico `#selMesAltaFiltro`.
- `actualizarOpcionesDesplegableCohortes()` recorre `TASKS` y agrega automáticamente cualquier nuevo mes de alta (ej. `Alta Sep 2026`, `Alta Oct 2026`, `Alta Nov 2026`).
- `actualizarKpis()` actualiza los badges `#badgeCountAll`, `#badgeCountResidual`, `#badgeCountAltas` y el texto de cada `<option>` del desplegable con sus conteos reales.
- Al dar de alta una tarea o lote nuevo, el `origenPlan` se calcula dinámicamente con `generarOrigenPlanDesdeFecha(fechaStr)` (ej. `'Alta Oct 2026'`), nunca fijo en `'Alta Sep 2026'`.

### C. Contadores Superiores de la Vista Operativa (`actualizarKpis`)
Actualiza en cada cambio de filtro o carga de datos:
- `#kpiTotal`, `#kpiRealizadas`, `#kpiEfectivas`, `#kpiFallidas`, `#kpiEnTermino`, `#kpiVencidas`, `#kpiFallidasPendientes`.

### D. Tablero Analítico de KPIs (`renderizarTableroKPIs`) — Los 3 Universos
Todo cambio en `TASKS` debe invocar `renderizarTableroKPIs()`, el cual actualiza dinámicamente:
1. **Universo 1 — Altas Mensuales (Meta 1.200/año · 100/mes)**:
   - Detecta dinámicamente el último mes con actividad (`ultimoMesActivoIdx`) sin cortar en `M0`.
   - Hero y tarjetas: `#kpiDashEfectivasTotal`, `#kpiDashPctTotal`, `#kpiDashResidualProv`, `#kpiDashStatEf`, `#kpiDashStatFa`, `#dashQ1Val`..`#dashQ4Val`, `#lblCompensacionTrimestral`.
   - Indicadores de ritmo y efectividad: `#kpiDashRitmoEfectivas`, `#kpiDashRitmoSub`, `#kpiDashMetaAcumLabel`, `#kpiDashTasaEfSmall`, `#kpiDashDesvioBadge`, `#kpiDashEfFaBadge`, `#kpiDashCard4Ef`, `#kpiDashCard4Fa`, `#kpiDashCard4Callout`, `#kpiDashCard4MetaFa`, `#lblMejorMes`, `#lblPromedioMensual`, `#lblDesvioMensual`, `#lblVencM0`, `#lblVencM1`.
   - Gráficos y tablas de Universo 1:
     - `renderChartPresupuesto(efectivasAltasPorMes, fallidasAltasPorMes, ultimoMesActivoIdx)`
     - `renderChartVencidas(vencidasAltasPorMes, ultimoMesActivoIdx)`
     - `renderChartFallidasMotivos()` (con selector `#btnFallidasAll`, `#btnFallidasM0`, `#btnFallidasM1`)
     - `renderizarTablaResumenMensual(efectivasAltasPorMes, fallidasAltasPorMes, vencidasAltasPorMes, ultimoMesActivoIdx)`
2. **Universo 2 — Stock Residual (925 visitas en 2 meses)**:
   - Tarjetas: `#kpiUniv2Realizadas`, `#kpiUniv2MetaTotal`, `#kpiUniv2PctBadge`, `#kpiUniv2RestantesBadge`, `#kpiUniv2RitmoMes`, `#kpiUniv2Pendientes`, `#kpiUniv2Tecnicas`, `#kpiUniv2Especiales`, `#kpiUniv2Vencidas`.
   - Gráficos de Universo 2:
     - `renderChartResidualAvance(residualPorMes, totalResidual, realizadasResidual)`
     - `renderChartResidualTipologia(tecnicasResidual, especialesResidual)`
3. **Universo 3 — Vista Consolidada Multi-Serie (`2.125` tareas totales)**:
   - Tarjetas: `#kpiUniv3TotalRealizadas`, `#kpiUniv3TotalPlan`, `#kpiUniv3PctGlobal`, `#kpiUniv3DesgloseBadge`, `#kpiUniv3EfAltas`, `#kpiUniv3FaAltas`, `#kpiUniv3RealResidual`, `#kpiUniv3PendientesTotal`.
   - Gráfico y tabla consolidada:
     - `renderChartConsolidado(efectivasAltasPorMes, fallidasAltasPorMes, residualPorMes, ultimoMesActivoIdx)`
     - `renderizarTablaConsolidada(efectivasAltasPorMes, fallidasAltasPorMes, residualPorMes, vencidasAltasPorMes, ultimoMesActivoIdx)`
4. **Modal de Criterios (`#modalCriteriosUniversos`)**:
   - `#modalCritUniv1Status`, `#modalCritUniv2Status`, `#modalCritUniv3Total`.

---

## 4. Guía de Uso de las Nuevas Funciones de Archivos, Vista Previa y OCR

### 4.1. Vista Previa en el Panel de la Ficha (Aside)
- Al seleccionar o arrastrar un archivo en la ficha derecha (`#dropzoneAside`), la función `validarYGenerarPreviewArchivo(file)` valida que el formato sea **PDF** o **Imagen (`JPG`, `PNG`, `WEBP`, `GIF`, `BMP`)**.
- **Si es Imagen**: muestra la foto en miniatura (`56×72 px`) con el indicador `IMG`.
- **Si es PDF**: renderiza la **primera página real** usando `PDF.js` sobre un `<canvas>` y muestra la cantidad total de páginas (`1 pág`, `X págs`).
- **Validación**:
  - Si se sube un formato no soportado (ej. `.docx`, `.xlsx`, `.zip`), se rechaza inmediatamente con un aviso claro en `#boxErrorArchivoAside`.
  - Si un PDF está dañado o protegido con contraseña, muestra un mensaje de error claro sin romper la aplicación.
- **Límite de documentos ya subidos a Google Drive**: Los registros históricos que ya fueron subidos a Drive solo almacenan el link (`documentoAdjunto`) por razones de peso y permisos CORS de Drive; se abren directamente con el botón **"Abrir documento en Google Drive ↗"**.

### 4.2. Miniaturas en Alta Masiva y Detección OCR
- En el modal **Alta Masiva y OCR por CUIT**, cada documento cargado muestra una miniatura de **`56×72 px`** tanto para imágenes como para la primera página de cada PDF, junto con su etiqueta de cantidad de páginas (`1 pág`, `3 págs`, `IMG`).
- **Detección de Establecimiento (`asignarEstablecimientoAItem`)**:
  - Exige explícitamente el prefijo `ESTAB`, `ESTABLECIMIENTO`, `PLANTA`, `SEDE`, `SUCURSAL` u `OBRA` antes del número (ej. `ESTAB 3`), evitando falsos positivos con fechas (`01/10/2026`), `"PAGINA 1"` o el prefijo del CUIT.
- **Detección de Tarea (`analizarDocumentoOCR`)**:
  - Evalúa límites de palabra (`\b`) y prioriza `\bSEGUIMIENTO\b` antes que `ACCIDENTE`, de modo que `"Seguimiento deposito"` se clasifica como `Visita tecnica` (nunca como `Seguimiento EP` por contener `"EP"` dentro de `"DEPOSITO"`) y `"Seguimiento de accidente"` se clasifica como `Seguimiento AT`.
- **Confirmación de Lote Segura (`confirmarSubidaLote`)**:
  - Busca **únicamente tareas pendientes** (`!tieneVisitaRealizada(t)`) que coincidan en `CUIT + NroEstab + Tarea`. Si no queda ninguna pendiente, crea una nueva fila de alta en lugar de pisar una visita ya realizada.

### 4.3. Visor Ampliado en Pantalla Grande (`#modalVisorDocumento`)
- Al hacer click sobre cualquier miniatura (tanto en la Ficha lateral como en la Alta Masiva) o en el botón **"🔍 Ampliar"**, se abre el visor a pantalla completa con:
  - **Paginación de PDFs**: botones `← Anterior` y `Siguiente →` con indicador `Página X de Y`.
  - **Controles de Zoom**: botones `−`, indicador de porcentaje (`100%`, clickeable para restablecer) y `+` (desde `50%` hasta `300%`).
  - **Nueva pestaña ↗**: abre el documento completo en una nueva pestaña del navegador mediante `Blob URL`.
  - **Cierre rápido**: tecla `Esc`, click en el fondo oscuro o botón `✕ Cerrar (Esc)`.
