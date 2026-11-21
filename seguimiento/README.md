# Seguimiento Consultora (módulo nuevo)

Fuente: planilla `Detalle Visitas con Tareas CS (10-11-26)(General)` (`1x2w2zY5BmxWJ29hh6pNiy1qLXv22RFkOx5DidNOx8_E`).
Todo se indexa **por nombre de columna**; las columnas A–W no pueden cambiar de nombre (el script falla si falta alguna).

| Archivo | Rol |
| :--- | :--- |
| `index.html` / `app.js` | App de la consultora (agenda, resultado, PDF) y tablero de seguimiento |
| `core.js` | Reglas: estados, plazos, validaciones, KPIs (sin DOM, testeado) |
| `datos.js` | Base generada desde la planilla + histórico Sep–Oct (generado, no editar) |
| `build_data.py` | Regenera `datos.js` desde la planilla (`python build_data.py`) |
| `backend.gs.js` | Apps Script de la planilla nueva (guarda intentos en la hoja `Seguimiento_Intentos` y PDFs en Drive) |
| `test_core.js` | `node seguimiento/test_core.js` |

## Reglas
- **Residual** = fecha máxima (`Fecha Programada`) anterior al 01/10/2026; **Emergente** = desde octubre.
- Cada fila es una visita con historial de intentos: Sin agendar → Agendada → Efectiva (PDF) | Fallida → reprograma (nuevo intento) o se cierra con PDF.
- Plazos: Etapa 1 hasta 31/01/2027, Etapa 2 hasta 30/04/2027, Urgente = su fecha máxima.
- Agendar ≥ 400/mes es indicador de gestión; **solo cuenta para el objetivo lo cerrado con PDF**. El histórico Sep–Oct cuenta si tiene documento.
- Adjunto: solo PDF (se valida extensión en la app y firma `%PDF` en el backend).

## Puesta en marcha del backend (una vez)
**Ya está hecho** (script `1DqZ0YJv…`, desplegado; la URL está en `app.js`). Para rehacerlo: pegar `backend.gs.js` en Apps Script o `clasp push` desde `seguimiento/gas`.
2. Implementar → Aplicación web → Ejecutar como *Yo*, acceso *Cualquier usuario*.
3. Copiar la URL `/exec` y pegarla en la app (botón **Configurar**) junto con el nombre de quien carga.

## Actualizar datos base
Exportá las hojas a CSV y ejecutá `python seguimiento/build_data.py --detalle detalle.csv --emergentes emergentes.csv` (la descarga directa solo funciona si la planilla está compartida por enlace).
El estado cargado por la consultora se guarda aparte (clave = `ID` de visita), por lo que regenerar `datos.js` no pisa nada.

## Indicadores del m�dulo original
La pesta�a **Plan anual y residual (KPIs)** mantiene los 3 universos: U1 altas (meta 1.200/a�o, 100/mes, cortes Q1�Q4, tasa de efectividad, desv�o), U2 stock residual (avance, ritmo requerido, burn-down) y U3 consolidado. Par�metros en `CONFIG.ORIGINAL` de `core.js`. Ultima version de la plataforma original: tag `v21-ultima-version-funcional` / rama `archivo/v21-funcional`.
