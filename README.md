# IAPSER ART · Plataforma de Control y Gestión de Visitas Gerenciadas

Plataforma unificada de gestión, seguimiento de vencimientos, registro de visitas, carga documental y **Tablero Ejecutivo de KPIs** para preventores y el equipo de gestión de **IAPSER ART Gerenciadas**.

Diseñada bajo el estándar visual institucional de Higiene y Seguridad (`IBM Plex Sans / Mono`, `#17202A` / `#0F4C5C` / `#A8470A`), con integración a **Google Sheets** como base de datos centralizada y **Google Drive** para el resguardo mensual estructurado de actas y constancias.

---

## 🚀 Estructura de Archivos

| Archivo | Descripción |
| :--- | :--- |
| **`index.html`** | Aplicación web principal interactiva. Incluye visualización de tabla con **encabezado fijo (sticky header)**, accesos directos al alta de tareas en Sheets, modal de nueva tarea, semáforos, ficha lateral de carga, dropzone de archivos, detector OCR, modal de alta masiva y el **Tablero Ejecutivo de KPIs y Métricas** (iniciando en **Septiembre 2026 = Mes 0**). |
| **`chart.umd.min.js`** | Librería Chart.js incluida localmente para que todos los gráficos interactivos funcionen 100% offline. |
| **`datos_precargados.js`** | Base de datos real con los **925 registros** de la planilla de Google Sheets de IAPSER Gerenciadas, con las nuevas columnas operativas (`Fecha Desde`, `Fecha Hasta`, `Fecha Realizada`) en estado inicial limpio (**0 realizadas**, listas para la carga). |
| **`codigo_apps_script.js`** | Código backend para **Google Apps Script**. Incluye endpoint `createTask` para el alta de nuevas tareas, inicializa las nuevas columnas (`Fecha Desde`, `Fecha Hasta`, `Fecha Realizada`, etc.), procesa subidas a Google Drive en subcarpetas mensuales, renombra los archivos bajo la norma estándar, y actualiza o inserta filas en Google Sheets. |
| **`planilla_iapser_raw.csv`** | Copia de respaldo en formato CSV de la planilla original de Google Sheets. |

---

## 📌 Estado Inicial Limpio de Columnas Nuevas

* **0 Visitas Realizadas al Inicio:** Las columnas `Fecha Desde`, `Fecha Hasta`, `Fecha Realizada`, `Resultado Visita` y `Documento Adjunto` son **columnas nuevas** que se agregaron al modelo. Ninguna tarea tiene visitas realizadas precargadas de forma ficticia.
* **Cómputo en Tiempo Real:** El contador de visitas realizadas inicia en **0 / 1.200** y se va incrementando dinámicamente a medida que el preventor o el equipo de gestión registra visitas efectivas, fallidas o adjunta actas.
* **`Fecha Realizada` es la Fecha que Cuenta:** Se eliminó por completo `Fecha Visita`. Toda la imputación operativa y de KPIs se rige por la fecha real de ejecución.

---

## 📌 Accesos Directos al Alta de Tareas en Google Sheets

1. **Acceso Directo en Encabezado Principal:**
   Botón institucional `+ Alta de Tareas en Sheets ↗` en la barra superior junto al sincronizador, que abre la planilla de Google Sheets en una pestaña nueva para agregar filas.
2. **Acceso Directo en el Menú Lateral (Rail):**
   Opción destacada en celeste institucional `+ Alta en Sheets ↗` bajo la sección *Planilla & Tareas*.
3. **Acceso Directo y Botón en la Barra de Filtros:**
   Junto al buscador y los filtros de la tabla, botones `+ Nueva Tarea` y `+ Alta en Sheets ↗`.
4. **Modal Integrado de Alta de Tarea:**
   Permite dar de alta una nueva tarea sin salir de la app (Razón Social, CUIT, Establecimiento, Tarea, N° Siniestro si corresponde, Fecha Desde y Fecha Hasta), guardándola en la lista activa y enviándola a Google Sheets a través de Google Apps Script.

---

## 📊 Tablero Ejecutivo de KPIs y Métricas ("Plan y Métricas")

Accediendo desde el menú lateral a **Plan y Métricas (KPIs)**, se despliega el panel de control analítico con:

1. **Línea Temporal de 1 Año (Septiembre 2026 = Mes 0 a Septiembre 2027 = Mes 12):**
   * Presupuesto fijo: **100 visitas efectivas mensuales** (1.200 anuales).
   * Seguimiento mensual de visitas realizadas frente a la meta de 100/mes.
   * Curva de cumplimiento acumulado (S-Curve) vs meta lineal de 1.200.
2. **Evolución de Vencidas en Barras Acumuladas:** Seguimiento del stock de deuda operativa acumulado mes a mes.
3. **Participación y Evolución Fallidas vs Efectivas:** Gráfico donut de ratio global y barras apiladas mensuales.
4. **Resumen Mensual Consolidado (Tabla):** Detalle período a período con semáforos institucionales y totales acumulados.

---

## ☁️ Instrucciones de Despliegue en Google Sheets & Drive

1. **Abrir la Planilla de Google Sheets:**
   [Prioridad mes vencido IAPSER Gerenciadas](https://docs.google.com/spreadsheets/d/1xXEmPqATmcMR0JpO2IuTmf1YZ6fMRxyeAc9avbfDRqI/edit?usp=drive_link)
2. **Abrir el editor de Apps Script:**
   Ir a **Extensiones** $\rightarrow$ **Apps Script**.
3. **Pegar el Backend:**
   Copiar todo el contenido de [`codigo_apps_script.js`](file:///c:/Users/cript/OneDrive/Escritorio/Antigravity/IAPSER%20Gerenciadas/codigo_apps_script.js) y pegarlo en el editor.
4. **Inicializar Columnas:**
   Ejecutar la función `inicializarColumnas`. Esto agregará automáticamente las columnas nuevas (`Fecha Desde`, `Fecha Hasta`, `Fecha Realizada`, `Resultado Visita`, `Nro Siniestro`, `Observaciones`, `Documento Adjunto`, `Estado Tarea`, `Gestion Fallida`) al final de la planilla.
5. **Implementar como Web App:**
   * **Implementar** $\rightarrow$ **Nueva implementación** $\rightarrow$ Tipo: **Aplicación web**.
   * Ejecutar como: **Yo**; Quién tiene acceso: **Cualquier usuario**.
   * Copiar la URL y pegarla en **Configurar Sheets & Drive** en `index.html`.
