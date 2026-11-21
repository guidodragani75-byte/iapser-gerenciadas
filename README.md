# IAPSER ART · Gestión de Visitas Gerenciadas

Plataforma de seguimiento de visitas de Higiene y Seguridad para las empresas gerenciadas de **IAPSER ART**. Tiene dos módulos:

| Módulo | Ubicación | Estado |
| :--- | :--- | :--- |
| **Seguimiento Consultora** (vigente) | [`seguimiento/`](./seguimiento/index.html) | La consultora agenda, carga el resultado y adjunta el PDF; vos hacés el seguimiento. Fuente: planilla `Detalle Visitas con Tareas CS (10-11-26)` |
| **Plataforma original** (V21) | [`index.html`](./index.html) | Se conserva. Última versión funcional guardada en el tag `v21-ultima-version-funcional` y la rama `archivo/v21-funcional` |

## Seguimiento Consultora
Detalle completo en [`seguimiento/README.md`](./seguimiento/README.md). Resumen de reglas:

- **Residual** = fecha máxima (`Fecha Programada`) anterior al 01/10/2026; **Emergente** = desde octubre. Todo lo nuevo se carga como emergente.
- Cada fila es una visita con historial de intentos: Sin agendar → Agendada → Efectiva (con PDF) | Fallida → se reprograma o se cierra con PDF.
- Solo cuenta para el objetivo lo cerrado **con PDF**. Agendar ≥ 400 por mes es un indicador de gestión de la consultora.
- Plazos: Etapa 1 hasta 31/01/2027, Etapa 2 hasta 30/04/2027; las "Urgente" vencen en su fecha máxima.
- Pestañas: Tablero, **Plan anual y residual (KPIs: Universos 1, 2 y 3 del módulo original)**, Todas, Agendadas, Realizadas, Pendientes y A revisar (duplicadas).
- Lo realizado en Sep–Oct se conserva como histórico y suma al objetivo si tiene documento.
- Backend: Apps Script publicado como Web App (código en `seguimiento/backend.gs.js` y `seguimiento/gas/`). Guarda los intentos en la hoja `Seguimiento_Intentos` de la planilla y los PDF en Drive por mes (`IAPSER_Gestion_Visitas / IAPSER_Visitas_AAAA-MM`).

## Estructura del repositorio

| Ruta | Contenido |
| :--- | :--- |
| `seguimiento/` | Módulo vigente: `index.html`, `app.js`, `core.js`, `datos.js` (generado), `build_data.py`, `backend.gs.js`, `gas/`, `test_core.js` |
| `index.html`, `datos_precargados.js`, `codigo_apps_script.js`, `chart.umd.min.js` | Plataforma original (V21) y su backend |
| `update_from_sheets.js`, `actualizar_planilla.bat`, `actualizar_todo_con_github.bat` | Sincronización de la plataforma original; el `.bat` sube a GitHub **solo** los archivos de datos |
| `herramientas/` | Scripts de auditoría/OCR de PDFs (Python) y sus datos de trabajo. No forman parte de la app |
| `MANUAL_ARQUITECTURA_Y_SINCRONIZACION.md` | Arquitectura de la plataforma original |

## Pruebas
```bash
node seguimiento/test_core.js
```

## Actualizar los datos del módulo Seguimiento
Cuando cambia la planilla, exportá las hojas `Detalle…(General)` y `Visitas emergentes mensuales` a CSV y ejecutá:
```bash
python seguimiento/build_data.py --detalle detalle.csv --emergentes emergentes.csv
```
Regenerar `datos.js` no pisa lo cargado por la consultora (se guarda aparte, con una clave por visita).

## Planilla y repositorio
- Planilla vigente: <https://docs.google.com/spreadsheets/d/1x2w2zY5BmxWJ29hh6pNiy1qLXv22RFkOx5DidNOx8_E/edit>
- Planilla de la plataforma original: <https://docs.google.com/spreadsheets/d/1xXEmPqATmcMR0JpO2IuTmf1YZ6fMRxyeAc9avbfDRqI/edit>
- Repositorio: <https://github.com/guidodragani75-byte/iapser-gerenciadas>
