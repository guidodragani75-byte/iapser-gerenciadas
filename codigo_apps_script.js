/**
 * =========================================================================
 * IAPSER ART - GESTIÓN Y SEGUIMIENTO DE VISITAS GERENCIADAS
 * Backend en Google Apps Script + Google Drive + Google Sheets
 * =========================================================================
 * 
 * INSTRUCCIONES DE INSTALACIÓN Y DESPLIEGUE:
 * 1. Abrir la planilla de Google Sheets:
 *    https://docs.google.com/spreadsheets/d/1xXEmPqATmcMR0JpO2IuTmf1YZ6fMRxyeAc9avbfDRqI/edit
 * 2. Ir al menú superior: Extensiones -> Apps Script.
 * 3. Borrar el código que haya y pegar este archivo completo.
 * 4. Ejecutar la función "inicializarColumnas()" una sola vez para verificar y
 *    agregar automáticamente las columnas nuevas en la planilla y precargar
 *    las fechas 2026 para Visitas Técnicas (01/01/2026 al 31/12/2026) y la marca "Residual 2026".
 * 5. Hacer clic en "Implementar" (Deploy) -> "Nueva implementación".
 * 6. Tipo: "Aplicación web".
 *    - Ejecutar como: "Yo" (tu cuenta de Google).
 *    - Quién tiene acceso: "Cualquier usuario" (Anyone).
 * 7. Copiar la URL generada (Web App URL) y pegarla en la interfaz web para sincronización en vivo.
 */

// CONFIGURACIÓN PRINCIPAL
var CONFIG = {
  NOMBRE_HOJA: "Hoja 1",
  CARPETA_DRIVE_PRINCIPAL_ID: "", // Opcional: ID de carpeta en Drive. Si se deja vacío, crea automáticamente "IAPSER_Gestion_Visitas"
  PREFIJO_SUB_CARPETAS_MES: "IAPSER_Visitas_",
  DIAS_ALERTA_PROXIMA_A_VENCER: 7,
  
  COLUMNAS_NUEVAS: [
    "Origen Plan",
    "Fecha Desde",
    "Fecha Hasta",
    "Fecha Realizada",
    "Resultado Visita",
    "Nro Siniestro",
    "Observaciones",
    "Documento Adjunto",
    "Estado Tarea",
    "Gestion Fallida"
  ]
};

// LISTA DE TAREAS AUTORIZADAS EN EL MÓDULO (VALIDACIÓN COLUMNA X)
var LISTA_TAREAS_VALIDAS = [
  "Visita tecnica",
  "Investigacion AT",
  "Investigacion EP",
  "Seguimiento AT",
  "Seguimiento EP",
  "Visita obra",
  "Visita Agro",
  "Verosimilitud",
  "Visita inicial",
  "Seguimiento Verosimilitud",
  "Pese",
  "RGRL/ Verosimilitud",
  "Siniestro"
];

/**
 * Agrega automáticamente las columnas nuevas a la planilla sin afectar datos previos
 * y precarga las fechas para las 736 visitas técnicas y la marca "Residual 2026"
 */
function inicializarColumnas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.NOMBRE_HOJA) || ss.getSheets()[0];
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  var agregadas = [];
  CONFIG.COLUMNAS_NUEVAS.forEach(function(colNombre) {
    if (headers.indexOf(colNombre) === -1) {
      lastCol++;
      sheet.getRange(1, lastCol).setValue(colNombre);
      sheet.getRange(1, lastCol).setBackground("#0F4C5C").setFontColor("#FFFFFF").setFontWeight("bold");
      agregadas.push(colNombre);
    }
  });

  // Re-mapear columnas tras agregar las nuevas
  var colMap = obtenerMapaColumnas(sheet);
  
  // Precargar datos en las filas existentes si aún no están completas
  if (lastRow >= 2) {
    for (var r = 2; r <= lastRow; r++) {
      // 1. Origen Plan: Marcar como Residual 2026 si está vacío
      if (colMap["Origen Plan"]) {
        var valOrigen = sheet.getRange(r, colMap["Origen Plan"]).getValue();
        if (!valOrigen) {
          sheet.getRange(r, colMap["Origen Plan"]).setValue("Residual 2026");
        }
      }

      // 2. Si la tarea es 'Visita tecnica', precargar 01/01/2026 y 31/12/2026
      var tareaVal = colMap["Tarea"] ? (sheet.getRange(r, colMap["Tarea"]).getValue() || "").toString().trim() : "";
      var esVisitaTecnica = tareaVal.toLowerCase().indexOf("visita tecnica") !== -1;

      if (esVisitaTecnica) {
        if (colMap["Fecha Desde"] && !sheet.getRange(r, colMap["Fecha Desde"]).getValue()) {
          sheet.getRange(r, colMap["Fecha Desde"]).setValue("01/01/2026");
        }
        if (colMap["Fecha Hasta"] && !sheet.getRange(r, colMap["Fecha Hasta"]).getValue()) {
          sheet.getRange(r, colMap["Fecha Hasta"]).setValue("31/12/2026");
        }
        if (colMap["Estado Tarea"] && !sheet.getRange(r, colMap["Estado Tarea"]).getValue()) {
          sheet.getRange(r, colMap["Estado Tarea"]).setValue("En término");
        }
      } else {
        // Tareas especiales (RGRL, Siniestro) sin fecha asignada
        if (colMap["Estado Tarea"] && !sheet.getRange(r, colMap["Estado Tarea"]).getValue()) {
          var fHasta = colMap["Fecha Hasta"] ? sheet.getRange(r, colMap["Fecha Hasta"]).getValue() : "";
          sheet.getRange(r, colMap["Estado Tarea"]).setValue(fHasta ? "En término" : "Pendiente plazo");
        }
      }
    }
  }
  
  // 3. Aplicar Validación de Datos estricta a la Columna X (Tarea) para que solo permita tareas autorizadas
  if (colMap["Tarea"]) {
    var maxFilas = Math.max(1000, lastRow);
    var rangoTarea = sheet.getRange(2, colMap["Tarea"], maxFilas - 1, 1);
    var reglaValidacion = SpreadsheetApp.newDataValidation()
      .requireValueInList(LISTA_TAREAS_VALIDAS, true)
      .setAllowInvalid(false)
      .setHelpText("Solo se permiten tareas autorizadas en el módulo: " + LISTA_TAREAS_VALIDAS.join(", "))
      .build();
    rangoTarea.setDataValidation(reglaValidacion);
    Logger.log("Validación de datos agregada a la columna Tarea.");
  }
  
  Logger.log("Columnas agregadas: " + (agregadas.length > 0 ? agregadas.join(", ") : "Ninguna, ya estaban creadas."));
  Logger.log("Filas inicializadas con fechas y marca de cohorte.");
}

/**
 * Helper para obtener el índice 1-based de cada columna por su nombre de cabecera
 */
function obtenerMapaColumnas(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var h = (headers[i] || "").toString().trim();
    if (h) map[h] = i + 1;
  }
  return map;
}

/**
 * GET Handler: Permite consumir los datos en formato JSON o servir la app web
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "getData";
  
  if (action === "getData") {
    var datos = obtenerTodosLosDatos();
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      count: datos.length,
      data: datos
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "ping") {
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "API IAPSER Visitas Activa",
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // Por defecto, si existe plantilla HTML se renderiza
  return HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setTitle("IAPSER ART - Gestión de Visitas")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * POST Handler: Recibe acciones para guardar visitas, subir docs, gestionar fallidas y crear tareas
 */
function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : "";
    var payload = JSON.parse(contents);
    var action = payload.action;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.NOMBRE_HOJA) || ss.getSheets()[0];
    var colMap = obtenerMapaColumnas(sheet);

    if (action === "saveVisit") {
      return ContentService.createTextOutput(JSON.stringify(
        procesarGuardarVisita(sheet, colMap, payload)
      )).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "gestionarFallida") {
      return ContentService.createTextOutput(JSON.stringify(
        procesarGestionFallida(sheet, colMap, payload)
      )).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "batchUpload") {
      return ContentService.createTextOutput(JSON.stringify(
        procesarCargaLote(sheet, colMap, payload)
      )).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "createTask") {
      return ContentService.createTextOutput(JSON.stringify(
        procesarCrearTarea(sheet, colMap, payload)
      )).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Acción no reconocida: " + action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString(),
      stack: err.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Registra o actualiza la ejecución de una visita técnica o especial
 */
function procesarGuardarVisita(sheet, colMap, payload) {
  var rowId = parseInt(payload.rowId, 10);
  if (!rowId || rowId < 2 || rowId > sheet.getLastRow()) {
    throw new Error("Fila inválida: " + payload.rowId);
  }

  var fechaRealizada = (payload.fechaRealizada !== undefined && payload.fechaRealizada !== null) ? payload.fechaRealizada : (colMap["Fecha Realizada"] ? sheet.getRange(rowId, colMap["Fecha Realizada"]).getValue() : "");
  var resultadoVisita = "";
  if (payload.resultadoVisita !== undefined && payload.resultadoVisita !== null) {
    resultadoVisita = payload.resultadoVisita;
  } else if (colMap["Resultado Visita"]) {
    resultadoVisita = sheet.getRange(rowId, colMap["Resultado Visita"]).getValue() || "";
  }
  // Si la visita tiene fecha realizada pero no tiene resultado, asignarle Efectiva por defecto
  if (fechaRealizada && !resultadoVisita) {
    resultadoVisita = "Efectiva";
  }
  var nroSiniestro = payload.nroSiniestro || (colMap["Nro Siniestro"] ? sheet.getRange(rowId, colMap["Nro Siniestro"]).getValue() : "");
  var observaciones = payload.observaciones || (colMap["Observaciones"] ? sheet.getRange(rowId, colMap["Observaciones"]).getValue() : "");
  var archivoSubidoUrl = payload.documentoAdjuntoUrl || "";

  // 1. Si viene un archivo en Base64, guardarlo en Google Drive (Doble guardado: Por Empresa y Por Mes)
  if (payload.fileBase64 && payload.fileName) {
    var cuit = (payload.cuit || (colMap["Cuit"] ? sheet.getRange(rowId, colMap["Cuit"]).getValue() : "00000000000")).toString().trim();
    var estab = (payload.nroEstab || (colMap["Nro Estab IAPART"] ? sheet.getRange(rowId, colMap["Nro Estab IAPART"]).getValue() : "1")).toString().trim();
    var tarea = (payload.tarea || (colMap["Tarea"] ? sheet.getRange(rowId, colMap["Tarea"]).getValue() : "Visita")).toString().trim();
    var emp = (payload.empleador || (colMap["Empleador"] ? sheet.getRange(rowId, colMap["Empleador"]).getValue() : "")).toString().trim();
    
    archivoSubidoUrl = guardarArchivoEnDrive(
      payload.fileBase64,
      payload.fileName,
      payload.mimeType || "application/pdf",
      cuit,
      estab,
      tarea,
      fechaRealizada,
      emp
    );
  }

  // 2. Determinar Estado de la Tarea y de la Gestión de Fallida
  var fechaHasta = payload.fechaHasta || (colMap["Fecha Hasta"] ? sheet.getRange(rowId, colMap["Fecha Hasta"]).getValue() : "");
  var estadoTarea = calcularEstadoTarea(fechaHasta, fechaRealizada, archivoSubidoUrl, resultadoVisita);
  var gestionFallida = "";

  if (resultadoVisita === "Fallida") {
    gestionFallida = payload.gestionFallida || "Pendiente evaluacion";
  }

  // 3. Escribir valores en la hoja
  if (colMap["Origen Plan"] && payload.origenPlan) sheet.getRange(rowId, colMap["Origen Plan"]).setValue(payload.origenPlan);
  if (colMap["Fecha Desde"] && payload.fechaDesde) sheet.getRange(rowId, colMap["Fecha Desde"]).setValue(payload.fechaDesde);
  if (colMap["Fecha Hasta"] && payload.fechaHasta) sheet.getRange(rowId, colMap["Fecha Hasta"]).setValue(payload.fechaHasta);
  if (colMap["Fecha Realizada"] && payload.fechaRealizada !== undefined) sheet.getRange(rowId, colMap["Fecha Realizada"]).setValue(fechaRealizada);
  if (colMap["Resultado Visita"]) sheet.getRange(rowId, colMap["Resultado Visita"]).setValue(resultadoVisita);
  if (colMap["Nro Siniestro"]) sheet.getRange(rowId, colMap["Nro Siniestro"]).setValue(nroSiniestro);
  if (colMap["Observaciones"]) sheet.getRange(rowId, colMap["Observaciones"]).setValue(observaciones);
  if (colMap["Documento Adjunto"] && archivoSubidoUrl) sheet.getRange(rowId, colMap["Documento Adjunto"]).setValue(archivoSubidoUrl);
  if (colMap["Estado Tarea"]) sheet.getRange(rowId, colMap["Estado Tarea"]).setValue(estadoTarea);
  if (colMap["Gestion Fallida"]) sheet.getRange(rowId, colMap["Gestion Fallida"]).setValue(gestionFallida);

  return {
    status: "success",
    rowId: rowId,
    fechaRealizada: fechaRealizada,
    resultadoVisita: resultadoVisita,
    documentoAdjunto: archivoSubidoUrl,
    estadoTarea: estadoTarea,
    gestionFallida: gestionFallida
  };
}

/**
 * Resuelve la gestión de una visita fallida: cerrada definitiva o reprogramada en nueva tarea
 */
function procesarGestionFallida(sheet, colMap, payload) {
  var rowId = parseInt(payload.rowId, 10);
  if (!rowId || rowId < 2 || rowId > sheet.getLastRow()) {
    throw new Error("Fila inválida: " + payload.rowId);
  }

  var resolucion = payload.resolucion; // "Cerrada" o "Reprogramar"
  var observacionCierre = payload.observaciones || "";

  if (resolucion === "Cerrada") {
    if (colMap["Gestion Fallida"]) sheet.getRange(rowId, colMap["Gestion Fallida"]).setValue("Cerrada sin nueva visita");
    if (colMap["Observaciones"] && observacionCierre) {
      var prevObs = colMap["Observaciones"] ? sheet.getRange(rowId, colMap["Observaciones"]).getValue() : "";
      sheet.getRange(rowId, colMap["Observaciones"]).setValue((prevObs ? prevObs + " | " : "") + "Resolución Fallida: " + observacionCierre);
    }
    return { status: "success", rowId: rowId, gestionFallida: "Cerrada sin nueva visita" };
  } 
  
  if (resolucion === "Reprogramar") {
    if (colMap["Gestion Fallida"]) sheet.getRange(rowId, colMap["Gestion Fallida"]).setValue("Reprogramada - Nueva tarea generada");

    // Copiar datos de la fila original para generar la nueva tarea
    var lastCol = sheet.getLastColumn();
    var origValues = sheet.getRange(rowId, 1, 1, lastCol).getValues()[0];
    var newRow = origValues.slice();

    // Resetear columnas de ejecución en la nueva fila
    if (colMap["Origen Plan"]) newRow[colMap["Origen Plan"] - 1] = "Alta Sep 2026";
    if (colMap["Fecha Desde"]) newRow[colMap["Fecha Desde"] - 1] = payload.nuevaFechaDesde || "";
    if (colMap["Fecha Hasta"]) newRow[colMap["Fecha Hasta"] - 1] = payload.nuevaFechaHasta || "";
    if (colMap["Fecha Realizada"]) newRow[colMap["Fecha Realizada"] - 1] = "";
    if (colMap["Resultado Visita"]) newRow[colMap["Resultado Visita"] - 1] = "";
    if (colMap["Documento Adjunto"]) newRow[colMap["Documento Adjunto"] - 1] = "";
    if (colMap["Estado Tarea"]) newRow[colMap["Estado Tarea"] - 1] = "En término";
    if (colMap["Gestion Fallida"]) newRow[colMap["Gestion Fallida"] - 1] = "";
    if (colMap["Observaciones"]) newRow[colMap["Observaciones"] - 1] = "Reintento de visita fallida previa (Fila " + rowId + "). " + (payload.motivo || "");

    sheet.appendRow(newRow);
    var newRowId = sheet.getLastRow();

    return {
      status: "success",
      rowId: rowId,
      gestionFallida: "Reprogramada - Nueva tarea generada",
      nuevaFilaId: newRowId
    };
  }

  throw new Error("Resolución de fallida desconocida: " + resolucion);
}

/**
 * Carga masiva de múltiples archivos para asociar a tareas
 */
function procesarCargaLote(sheet, colMap, payload) {
  var items = payload.items || [];
  var results = [];
  var lastRow = sheet.getLastRow();

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    try {
      var rowId = parseInt(item.rowId, 10);
      
      // Si no viene rowId específico, buscar fila por Cuit + NroEstab + Tarea
      if (!rowId || rowId < 2) {
        var cuitBuscado = (item.cuit || "").toString().replace(/\D/g, "");
        var estabBuscado = (item.nroEstab || "1").toString().trim();
        var tareaBuscada = (item.tarea || "Visita tecnica").toString().trim();

        if (cuitBuscado && colMap["Cuit"] && colMap["Nro Estab IAPART"]) {
          var dataCuit = sheet.getRange(2, colMap["Cuit"], Math.max(1, lastRow - 1), 1).getValues();
          var dataEstab = sheet.getRange(2, colMap["Nro Estab IAPART"], Math.max(1, lastRow - 1), 1).getValues();
          var dataTarea = colMap["Tarea"] ? sheet.getRange(2, colMap["Tarea"], Math.max(1, lastRow - 1), 1).getValues() : null;

          for (var r = 0; r < dataCuit.length; r++) {
            var cVal = (dataCuit[r][0] || "").toString().replace(/\D/g, "");
            var eVal = (dataEstab[r][0] || "").toString().trim();
            var tVal = dataTarea ? (dataTarea[r][0] || "").toString().trim() : "";

            if (cVal === cuitBuscado && eVal === estabBuscado && (!tVal || tVal.toLowerCase() === tareaBuscada.toLowerCase())) {
              rowId = r + 2;
              break;
            }
          }
        }
      }

      if (rowId && rowId >= 2) {
        item.rowId = rowId;
        var res = procesarGuardarVisita(sheet, colMap, item);
        results.push({ itemIndex: i, success: true, rowId: rowId, res: res });
      } else {
        // Si no existe fila previa, crear la nueva tarea y registrar la visita
        var newTRes = procesarCrearTarea(sheet, colMap, item);
        item.rowId = newTRes.newRowId;
        var resSave = procesarGuardarVisita(sheet, colMap, item);
        results.push({ itemIndex: i, success: true, rowId: newTRes.newRowId, res: resSave });
      }
    } catch (e) {
      results.push({ itemIndex: i, success: false, error: e.toString() });
    }
  }

  return { status: "success", results: results };
}

/**
 * Da de alta una nueva tarea directamente en la planilla de Google Sheets
 */
function procesarCrearTarea(sheet, colMap, payload) {
  var lastCol = sheet.getLastColumn();
  var newRow = new Array(lastCol).fill("");

  var tareaSeleccionada = payload.tarea || "Visita tecnica";
  if (LISTA_TAREAS_VALIDAS.indexOf(tareaSeleccionada) === -1) {
    throw new Error("Tarea no válida: '" + tareaSeleccionada + "'. Solo se permiten las tareas autorizadas del módulo: " + LISTA_TAREAS_VALIDAS.join(", "));
  }

  if (colMap["Cuit"]) newRow[colMap["Cuit"] - 1] = payload.cuit || "";
  if (colMap["Empleador"]) newRow[colMap["Empleador"] - 1] = payload.empleador || "";
  if (colMap["Establecimiento"]) newRow[colMap["Establecimiento"] - 1] = payload.establecimiento || "";
  if (colMap["Localidad"]) newRow[colMap["Localidad"] - 1] = payload.localidad || "";
  if (colMap["Tarea"]) newRow[colMap["Tarea"] - 1] = tareaSeleccionada;
  if (colMap["Nro Estab IAPART"]) newRow[colMap["Nro Estab IAPART"] - 1] = payload.nroEstab || "1";
  if (colMap["Origen Plan"]) newRow[colMap["Origen Plan"] - 1] = payload.origenPlan || "Alta Sep 2026";
  if (colMap["Fecha Desde"]) newRow[colMap["Fecha Desde"] - 1] = payload.fechaDesde || "";
  if (colMap["Fecha Hasta"]) newRow[colMap["Fecha Hasta"] - 1] = payload.fechaHasta || "";
  if (colMap["Nro Siniestro"]) newRow[colMap["Nro Siniestro"] - 1] = payload.nroSiniestro || "";
  if (colMap["Observaciones"]) newRow[colMap["Observaciones"] - 1] = payload.observaciones || "";
  if (colMap["Estado Tarea"]) newRow[colMap["Estado Tarea"] - 1] = payload.fechaHasta ? "En término" : "Pendiente plazo";

  sheet.appendRow(newRow);
  var newRowId = sheet.getLastRow();

  return {
    status: "success",
    newRowId: newRowId,
    message: "Tarea agregada exitosamente a la fila " + newRowId
  };
}

/**
 * Guarda el archivo en Google Drive en DOBLE ESTRUCTURA:
 * 1. Por Empresa: IAPSER_Visitas_Por_Empresa / {CUIT - RazonSocial} / Estab_{NroEstab} /
 * 2. Por Mes: IAPSER_Visitas_Por_Mes / IAPSER_Visitas_YYYY-MM /
 * con la nomenclatura estandarizada: CUIT_Estab_Tarea_YYYYMMDD.ext
 */
function guardarArchivoEnDrive(base64Data, originalFileName, mimeType, cuit, nroEstab, tarea, fechaRealizadaStr, empleador) {
  var cleanBase64 = base64Data;
  if (cleanBase64.indexOf("base64,") !== -1) {
    cleanBase64 = cleanBase64.split("base64,")[1];
  }

  var extMatch = originalFileName.match(/\.([a-zA-Z0-9]+)$/);
  var ext = extMatch ? extMatch[1].toLowerCase() : "pdf";

  // Fecha para nombre de archivo y carpeta
  var f = parsearFecha(fechaRealizadaStr) || new Date();
  var yyyy = f.getFullYear();
  var mm = ("0" + (f.getMonth() + 1)).slice(-2);
  var dd = ("0" + f.getDate()).slice(-2);
  var fechaYMD = yyyy + mm + dd;
  var anioMes = yyyy + "-" + mm;

  // Normalizar nombres
  var tareaNorm = (tarea || "Visita").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20);
  var cuitNorm = (cuit || "00000000000").toString().replace(/\D/g, "");
  var estabNorm = (nroEstab || "1").toString().replace(/\D/g, "") || "1";
  var empNorm = (empleador || "").toString().replace(/[/\\:*?"<>|]/g, " ").slice(0, 30).trim();

  var standardFileName = cuitNorm + "_" + estabNorm + "_" + tareaNorm + "_" + fechaYMD + "." + ext;

  var decodedBytes = Utilities.base64Decode(cleanBase64);
  var blob = Utilities.newBlob(decodedBytes, mimeType, standardFileName);

  var raiz = obtenerCarpetaRaizDrive();

  // 1. Estructura Por Empresa: IAPSER_Visitas_Por_Empresa / {CUIT - RazonSocial} / Estab_{N}
  var carpPorEmpresa = obtenerOCrearSubcarpeta(raiz, "IAPSER_Visitas_Por_Empresa");
  var nombreEmpCarpeta = cuitNorm + (empNorm ? " - " + empNorm : "");
  var carpEmpresa = obtenerOCrearSubcarpeta(carpPorEmpresa, nombreEmpCarpeta);
  var carpEstab = obtenerOCrearSubcarpeta(carpEmpresa, "Estab_" + estabNorm);
  var file = carpEstab.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // 2. Estructura Por Mes: IAPSER_Visitas_Por_Mes / IAPSER_Visitas_YYYY-MM
  var carpPorMes = obtenerOCrearSubcarpeta(raiz, "IAPSER_Visitas_Por_Mes");
  var carpMes = obtenerOCrearSubcarpeta(carpPorMes, CONFIG.PREFIJO_SUB_CARPETAS_MES + anioMes);
  try {
    carpMes.addFile(file);
  } catch(e) {
    Logger.log("Nota en addFile a carpeta mensual: " + e.toString());
  }

  return file.getUrl();
}

/**
 * Obtiene o crea la carpeta raíz principal en Google Drive
 */
function obtenerCarpetaRaizDrive() {
  if (CONFIG.CARPETA_DRIVE_PRINCIPAL_ID) {
    return DriveApp.getFolderById(CONFIG.CARPETA_DRIVE_PRINCIPAL_ID);
  }
  var folders = DriveApp.getFoldersByName("IAPSER_Gestion_Visitas");
  if (folders.hasNext()) {
    return folders.next();
  }
  var f = DriveApp.createFolder("IAPSER_Gestion_Visitas");
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return f;
}

/**
 * Obtiene o crea una subcarpeta dentro de un folder padre
 */
function obtenerOCrearSubcarpeta(parent, nombre) {
  var it = parent.getFoldersByName(nombre);
  if (it.hasNext()) return it.next();
  var sub = parent.createFolder(nombre);
  sub.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return sub;
}

/**
 * Lógica de negocio para calcular el estado del semáforo
 */
function calcularEstadoTarea(fechaHastaStr, fechaRealizadaStr, docAdjuntoUrl, resultadoVisita) {
  var tieneFechaRealizada = !!(fechaRealizadaStr && fechaRealizadaStr.toString().trim());

  // 1. Si se realizó la visita (efectiva o fallida) -> Realizada
  if (tieneFechaRealizada) {
    return "Realizada";
  }

  // 2. Si no se realizó -> En término o Vencida según fecha límite
  if (!fechaHastaStr || !fechaHastaStr.toString().trim()) {
    return "En término";
  }

  var dHasta = parsearFecha(fechaHastaStr);
  if (!dHasta) return "En término";

  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  dHasta.setHours(0, 0, 0, 0);

  var diffMs = dHasta.getTime() - hoy.getTime();
  var diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    return "Vencida";
  } else {
    return "En término";
  }
}

/**
 * Convierte strings como "DD/MM/YYYY", "YYYY-MM-DD" o formato Date a objeto Date nativo
 */
function parsearFecha(str) {
  if (!str) return null;
  if (str instanceof Date) return str;
  var s = str.toString().trim();
  var parts = s.split("/");
  if (parts.length === 3) {
    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Obtiene todos los registros de la planilla como array de objetos JSON para la app web
 */
function obtenerTodosLosDatos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.NOMBRE_HOJA) || ss.getSheets()[0];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2) return [];

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  var result = [];
  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    var obj = { rowId: r + 2 };
    for (var c = 0; c < headers.length; c++) {
      var headerKey = (headers[c] || "").toString().trim();
      if (!headerKey) continue;
      var val = row[c];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, "GMT-3", "dd/MM/yyyy");
      }
      obj[headerKey] = val !== undefined && val !== null ? val.toString().trim() : "";
    }

    // Mapeo normalizado a minúsculas / camelCase para compatibilidad total con la plataforma web
    obj.cuit = (obj["Cuit"] || obj.cuit || "").toString();
    obj.empleador = (obj["Empleador"] || obj.empleador || "").toString();
    obj.contrato = (obj["Contrato IAPART"] || obj["Contrato"] || obj.contrato || "").toString();
    obj.establecimiento = (obj["Establecimiento"] || obj.establecimiento || "").toString();
    obj.nroEstab = (obj["Nro Estab IAPART"] || obj["Nro Estab"] || obj.nroEstab || "1").toString();
    obj.localidad = (obj["Localidad"] || obj.localidad || "").toString();
    obj.preventor = (obj["Preventor Asignado"] || obj["Preventor"] || obj.preventor || "").toString();
    obj.capitas = (obj["Capitas"] || obj.capitas || "").toString();
    obj.tarea = (obj["Tarea"] || obj.tarea || "Visita tecnica").toString();
    obj.origenPlan = (obj["Origen Plan"] || obj.origenPlan || "Residual 2026").toString();
    obj.fechaDesde = (obj["Fecha Desde"] || obj.fechaDesde || "").toString();
    obj.fechaHasta = (obj["Fecha Hasta"] || obj.fechaHasta || "").toString();
    obj.fechaRealizada = (obj["Fecha Realizada"] || obj.fechaRealizada || "").toString();
    obj.resultadoVisita = (obj["Resultado Visita"] || obj.resultadoVisita || "").toString();
    obj.nroSiniestro = (obj["Nro Siniestro"] || obj.nroSiniestro || "").toString();
    obj.observaciones = (obj["Observaciones"] || obj.observaciones || "").toString();
    obj.documentoAdjunto = (obj["Documento Adjunto"] || obj.documentoAdjunto || "").toString();
    obj.estadoTarea = (obj["Estado Tarea"] || obj.estadoTarea || "").toString();
    obj.gestionFallida = (obj["Gestion Fallida"] || obj.gestionFallida || "").toString();

    result.push(obj);
  }
  return result;
}
