# Seguimiento Consultora (módulo vigente)

Fuente: planilla `Detalle Visitas con Tareas CS (10-11-26)(General)` (`1x2w2zY5BmxWJ29hh6pNiy1qLXv22RFkOx5DidNOx8_E`).
Todo se indexa **por nombre de columna**; las columnas A–W no pueden cambiar de nombre (el script falla si falta alguna).

| Archivo | Rol |
| :--- | :--- |
| `index.html` / `app.js` | App de la consultora: Tablero unificado (Consolidado / Emergentes / Residuales), tablas operativas con carga individual y Subida Masiva |
| `core.js` | Reglas de negocio, metas 100 / 400 / 500, cruce PDF octubre vs emergentes y cálculos del tablero (sin DOM, testeado) |
| `ocr.js` | Motor híbrido de detección de PDFs: Gemini IA (vía Apps Script) con respaldo local PDF.js + Tesseract.js |
| `datos.js` | Base generada desde la planilla + histórico Sep–Oct (generado, no editar) |
| `build_data.py` | Regenera `datos.js` desde la planilla |
| `backend.gs.js` / `gas/` | Apps Script desplegado (hoja `Seguimiento_Intentos`, subida PDF a Drive y endpoint `analyzePdf` con Gemini Flash) |
| `test_core.js` | `node seguimiento/test_core.js` |

## Reglas y Metas
- **Tablero unificado** con 3 vistas:
  - **Consolidado (Meta 500/mes desde Nov-26; 100/mes en Sep–Oct)** = suma de Emergentes + Residuales.
  - **Emergentes Mensuales (Meta 100/mes · 1.200/año · Sep-26 a Ago-27)** = histórico Sep–Oct + emergentes con fecha máxima ≥ 01/10/2026. Incluye cortes trimestrales Q1–Q4 y el **cruce de 52 filas emergentes** que coinciden por `CUIT + Estab (col. M)` con PDFs de octubre (marcadas como `PDF Oct: Efectiva` / `Fallida`, sin doble conteo).
  - **Stock Residual (Meta 400/mes desde Nov-26 · 1.341 tareas)** = fecha máxima anterior al 01/10/2026. Etapa 1 fin `31/01/2027`, Etapa 2 fin `30/04/2027`, Urgente = su fecha máxima. Incluye curva burn-down.
- Cada fila es una visita con historial de intentos: Sin agendar → Agendada → Efectiva (PDF) | Fallida → reprograma (nuevo intento) o se cierra con PDF.
- **Solo cierra y cuenta para el objetivo lo que tiene documento PDF asociado** (efectivas y fallidas cerradas). Las agendas se muestran al lado como indicador de gestión del mes.

## Subida de archivos y activación de Gemini IA
- **Individual:** botón `📄 Cargar / PDF` en cada fila de las tablas (o clic en la fila). Al elegir un PDF, detecta fecha y resultado automáticamente.
- **Masiva:** botón **`⬆ Subida Masiva (OCR / IA)`** en la barra superior. Permite arrastrar varios PDFs, detecta CUIT, N° Estab (col. M), fecha real y resultado, asocia a la visita pendiente y sube todo el lote a Drive.
- **Activar Gemini IA (opcional):** en el proyecto de Apps Script (`1DqZ0YJvO2KRhbHvnSOjV-CbsfDBk8X_7LA8VhkKY91g4en-SmsBz8dUk`) → **Configuración del proyecto → Propiedades de la secuencia de comandos** → agregar `GEMINI_API_KEY` con tu clave. Sin la clave, la app usa automáticamente PDF.js + Tesseract local.

## Actualizar datos base
Exportá las hojas a CSV y ejecutá `python seguimiento/build_data.py --detalle detalle.csv --emergentes emergentes.csv`.
El estado cargado por la consultora se guarda aparte (clave = `ID` de visita), por lo que regenerar `datos.js` no pisa nada.
