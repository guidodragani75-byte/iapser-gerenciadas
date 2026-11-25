/**
 * Backend del módulo Seguimiento Consultora (Google Apps Script).
 * Planilla: "Detalle Visitas con Tareas CS" (1x2w2zY5BmxWJ29hh6pNiy1qLXv22RFkOx5DidNOx8_E).
 * NO toca las hojas de datos ni las columnas A..W: solo crea/usa la hoja "Seguimiento_Intentos".
 *
 * Acciones:
 *   doGet:  ?action=getState | ping
 *   doPost: saveIntento | getState | analyzePdf (usa Gemini Flash si GEMINI_API_KEY está en Script Properties)
 *
 * Para activar detección por Gemini:
 *   Apps Script -> Configuración del proyecto -> Propiedades de la secuencia de comandos ->
 *   Agregar propiedad: GEMINI_API_KEY = <tu clave>
 */
var CFG = {
  SPREADSHEET_ID: '1x2w2zY5BmxWJ29hh6pNiy1qLXv22RFkOx5DidNOx8_E',
  HOJA: 'Seguimiento_Intentos',
  HOJA_GENERAL: 'Detalle Visitas con Tareas CS (10-11-26)(General)',
  HOJA_EMERGENTES: 'Visitas emergentes mensuales',
  HOJA_BAJAS: 'Bajas_Historico',
  HOJA_ABM: 'Historial_ABM',
  CORTE_RESIDUAL: '2026-10-01',
  CARPETA_PRINCIPAL_ID: '1RDkZA4EIjPxdvBZqPCcgu5k6vnz6eAUq',
  PREFIJO_MES: 'IAPSER_Visitas_',
  MAX_PDF_BYTES: 15 * 1024 * 1024,
  GEMINI_MODEL: 'gemini-2.5-flash',
  ENCABEZADOS: ['ID Visita', 'Nro Intento', 'Fecha Agendada', 'Fecha Real', 'Resultado', 'Motivo',
                'Reprograma', 'Adjunto Drive', 'Cargado por', 'Timestamp'],
  ENCABEZADOS_ABM: [
    'ID Lote', 'Fecha ABM', 'Usuario', 'Archivo', 'Tipo', 'CUIT', 'Empleador', 'Estab (M)',
    'Ambito', 'Localidad', 'Tareas Antes', 'Tareas Despues', 'Tareas Agregadas', 'Tareas Quitadas',
    'Fecha Max Antes', 'Fecha Max Despues', 'Tenia Gestion', 'Detalle'
  ],
  COLUMNAS_PADRON: [
    'Cuit', 'Empleador', 'Contrato IAPART', 'Establecimiento', 'Localidad', 'Provincia', 'CP',
    'Domicilio estab.', 'Responsable', 'Telefono', 'E-mail', 'Nro Estab IAPART', 'Nro Estab Intercambio',
    'Programa', 'CantidadTrabajadoresCUIT', 'Preventor Asignado', 'Tareas', 'Fecha Programada',
    'Fecha Vencimiento', 'Tarea Cargada', 'Fecha Carga', 'Observaciones CS', 'Observaciones IAPSER'
  ]
};

function getGeminiKey_() {
  try {
    return (PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '').trim();
  } catch (e) {
    return '';
  }
}

function hoja_() {
  var ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(CFG.HOJA);
  if (!sh) {
    sh = ss.insertSheet(CFG.HOJA);
    sh.getRange(1, 1, 1, CFG.ENCABEZADOS.length).setValues([CFG.ENCABEZADOS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function colMap_(sh) {
  var enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var m = {};
  enc.forEach(function (h, i) { if (!(h in m)) m[String(h).trim()] = i; });
  CFG.ENCABEZADOS.forEach(function (h) { if (!(h in m)) throw new Error('Falta la columna "' + h + '" en ' + CFG.HOJA); });
  return m;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function iso_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}

function getPadronUpdatedAt_() {
  try {
    return (PropertiesService.getScriptProperties().getProperty('PADRON_UPDATED_AT') || '').trim();
  } catch (e) {
    return '';
  }
}

function getAbmUpdatedAt_() {
  try {
    return (PropertiesService.getScriptProperties().getProperty('ABM_UPDATED_AT') || '').trim();
  } catch (e) {
    return '';
  }
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getState';
  if (action === 'ping') return json_({ ok: true, ts: new Date().toISOString(), geminiConfigured: !!getGeminiKey_(), padronUpdatedAt: getPadronUpdatedAt_(), abmUpdatedAt: getAbmUpdatedAt_() });
  if (action === 'getState') return json_({ ok: true, intentos: leerIntentos_(), geminiConfigured: !!getGeminiKey_(), padronUpdatedAt: getPadronUpdatedAt_(), abmUpdatedAt: getAbmUpdatedAt_() });
  if (action === 'getPadron') return json_(leerPadron_());
  if (action === 'getHistorialABM') return json_(leerHistorialABM_());
  return json_({ ok: false, error: 'Acción no reconocida: ' + action });
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    if (p.action === 'getState') return json_({ ok: true, intentos: leerIntentos_(), geminiConfigured: !!getGeminiKey_(), padronUpdatedAt: getPadronUpdatedAt_(), abmUpdatedAt: getAbmUpdatedAt_() });
    if (p.action === 'getPadron') return json_(leerPadron_());
    if (p.action === 'getHistorialABM') return json_(leerHistorialABM_());
    if (p.action === 'saveIntento') return json_(guardarIntento_(p));
    if (p.action === 'analyzePdf') return json_(analizarPdfGemini_(p));
    if (p.action === 'syncPadron') return json_(sincronizarPadron_(p));
    return json_({ ok: false, error: 'Acción no reconocida: ' + p.action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function analizarPdfGemini_(p) {
  var key = getGeminiKey_();
  if (!key) return { ok: false, fallback: true, reason: 'no_api_key' };
  if (!p.pdfBase64) return { ok: false, error: 'Falta pdfBase64' };
  var bytes = Utilities.base64Decode(p.pdfBase64);
  if (bytes.length > CFG.MAX_PDF_BYTES) return { ok: false, error: 'El PDF supera 15 MB' };
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    return { ok: false, error: 'El adjunto debe ser un PDF válido' };
  }

  var prompt = [
    'Analizá este documento PDF de visita de Higiene y Seguridad (ART IAPSER, Argentina).',
    'Devolvé SOLO un JSON válido con las claves exactas:',
    '{"cuit":"","nroEstab":"","fechaReal":"","resultado":"","motivoFallida":""}',
    'Reglas:',
    '- cuit: solo 11 dígitos sin guiones (ej: 30545756710), o "" si no figura.',
    '- nroEstab: número de establecimiento / intercambio / sucursal como entero (ej: "1", "15", "0"), o "" si no figura.',
    '- fechaReal: fecha en que se realizó la visita en formato YYYY-MM-DD, o "" si no figura.',
    '- resultado: "Efectiva" si se realizó la visita con recepción/firma, "Fallida" si el establecimiento estaba cerrado/ausente/no atendió/sin acceso/rechazó, o "" si es dudoso.',
    '- motivoFallida: si resultado es "Fallida", breve motivo (ej: "Establecimiento cerrado", "No atiende nadie / sin responsable", "Domicilio inexistente o incorrecto", "Empleador sin personal", "Rechazo de la visita"), si no "".'
  ].join('\n');

  var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + CFG.GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(key);
  var body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'application/pdf', data: p.pdfBase64 } }
      ]
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 }
  };

  var res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    return { ok: false, fallback: true, reason: 'gemini_http_' + code };
  }
  var parsed = JSON.parse(res.getContentText());
  var txt = parsed && parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content &&
            parsed.candidates[0].content.parts && parsed.candidates[0].content.parts[0] &&
            parsed.candidates[0].content.parts[0].text;
  if (!txt) return { ok: false, fallback: true, reason: 'empty_response' };
  var data = JSON.parse(txt.replace(/```json|```/g, '').trim());
  var cuit = String(data.cuit || '').replace(/\D/g, '');
  if (cuit.length !== 11) cuit = '';
  var nroEstab = String(data.nroEstab == null ? '' : data.nroEstab).replace(/\D/g, '');
  var fechaReal = /^\d{4}-\d{2}-\d{2}$/.test(String(data.fechaReal || '')) ? String(data.fechaReal) : '';
  var resultado = (data.resultado === 'Efectiva' || data.resultado === 'Fallida') ? data.resultado : '';
  var motivoFallida = resultado === 'Fallida' ? String(data.motivoFallida || '').slice(0, 120) : '';
  return { ok: true, source: 'gemini', data: { cuit: cuit, nroEstab: nroEstab, fechaReal: fechaReal, resultado: resultado, motivoFallida: motivoFallida } };
}

function leerIntentos_() {
  var sh = hoja_();
  var last = sh.getLastRow();
  if (last < 2) return {};
  var m = colMap_(sh);
  var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var out = {};
  vals.forEach(function (r) {
    var id = String(r[m['ID Visita']] || '');
    if (!id) return;
    (out[id] = out[id] || []).push({
      n: Number(r[m['Nro Intento']]) || 1,
      fechaAgendada: iso_(r[m['Fecha Agendada']]),
      fechaReal: iso_(r[m['Fecha Real']]),
      resultado: String(r[m['Resultado']] || ''),
      motivo: String(r[m['Motivo']] || ''),
      reprograma: String(r[m['Reprograma']] || ''),
      adjunto: String(r[m['Adjunto Drive']] || ''),
      cargadoPor: String(r[m['Cargado por']] || ''),
      ts: String(r[m['Timestamp']] || '')
    });
  });
  Object.keys(out).forEach(function (k) { out[k].sort(function (a, b) { return a.n - b.n; }); });
  return out;
}

function carpetaMes_(fechaISO) {
  var raiz = DriveApp.getFolderById(CFG.CARPETA_PRINCIPAL_ID);
  var nombre = CFG.PREFIJO_MES + (fechaISO || iso_(new Date())).slice(0, 7);
  var it = raiz.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : raiz.createFolder(nombre);
}

function subirPDF_(p) {
  var bytes = Utilities.base64Decode(p.pdfBase64);
  if (bytes.length > CFG.MAX_PDF_BYTES) throw new Error('El PDF supera 15 MB');
  // firma "%PDF" => rechaza cualquier otro formato aunque tenga extensión .pdf
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    throw new Error('El adjunto debe ser un PDF válido');
  }
  var nombre = String(p.nombreArchivo || 'visita.pdf').replace(/[^A-Za-z0-9_.-]+/g, '_');
  if (!/\.pdf$/i.test(nombre)) nombre += '.pdf';
  var blob = Utilities.newBlob(bytes, 'application/pdf', nombre);
  var f = carpetaMes_(p.intento.fechaReal || p.intento.fechaAgendada).createFile(blob);
  return f.getUrl();
}

function guardarIntento_(p) {
  var it = p.intento || {};
  if (!p.id || !it.n) throw new Error('Faltan id o nro de intento');
  if (it.resultado) {
    if (!it.fechaReal) throw new Error('Falta la fecha real');
    if (it.fechaReal > iso_(new Date())) throw new Error('La fecha real no puede ser futura');
    if (it.resultado === 'Fallida' && (!it.motivo || (it.reprograma !== 'Si' && it.reprograma !== 'No'))) {
      throw new Error('Fallida: faltan motivo o si se vuelve a ir');
    }
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = hoja_();
    var m = colMap_(sh);
    var adjunto = it.adjunto || '';
    if (p.pdfBase64) adjunto = subirPDF_(p);
    var exige = it.resultado === 'Efectiva' || (it.resultado === 'Fallida' && it.reprograma === 'No');
    if (exige && !adjunto) throw new Error('Para cerrar la visita se requiere el PDF');

    var fila = new Array(sh.getLastColumn()).fill('');
    fila[m['ID Visita']] = p.id;
    fila[m['Nro Intento']] = it.n;
    fila[m['Fecha Agendada']] = it.fechaAgendada || '';
    fila[m['Fecha Real']] = it.fechaReal || '';
    fila[m['Resultado']] = it.resultado || '';
    fila[m['Motivo']] = it.motivo || '';
    fila[m['Reprograma']] = it.reprograma || '';
    fila[m['Adjunto Drive']] = adjunto;
    fila[m['Cargado por']] = it.cargadoPor || '';
    fila[m['Timestamp']] = new Date().toISOString();

    var last = sh.getLastRow(), destino = last + 1;
    if (last >= 2) {
      var ids = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][m['ID Visita']]) === p.id && Number(ids[i][m['Nro Intento']]) === Number(it.n)) { destino = i + 2; break; }
      }
    }
    sh.getRange(destino, 1, 1, fila.length).setValues([fila]);
    return { ok: true, adjunto: adjunto };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- SINCRONIZACIÓN Y LECTURA DE PADRÓN (HOJA GENERAL) ---------- */
function sinTildes_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function fechaISO_(v, tz) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz || 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}

function isoADate_(isoStr) {
  var m = String(isoStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12, 0, 0);
}

function ajustarFormulaFila_(formula, oldRow, newRow) {
  if (!formula || String(formula).charAt(0) !== '=') return formula;
  var re = new RegExp('(\\$?[A-Z]+)' + oldRow + '(?!\\d)', 'g');
  return String(formula).replace(re, '$1' + newRow);
}

function esValorReal_(v) {
  var s = String(v == null ? '' : v).trim();
  return !!s && s.toUpperCase() !== 'NULL';
}

function leerPadron_() {
  var ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  var tz = ss.getSpreadsheetTimeZone() || 'America/Argentina/Buenos_Aires';
  var sh = ss.getSheetByName(CFG.HOJA_GENERAL);
  if (!sh) return { ok: false, error: 'No se encontró la hoja ' + CFG.HOJA_GENERAL };
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2) return { ok: true, generado: iso_(new Date()), ts: getPadronUpdatedAt_(), visitas: [] };

  var data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var hdr = data[0].map(function (h) { return String(h || '').trim(); });
  var idx = {};
  hdr.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
  function cel(r, col) {
    var i = idx[col];
    return (i != null && i < r.length && r[i] != null) ? String(r[i]).trim() : '';
  }

  // Cruce opcional con hoja de emergentes mensuales
  var emergMap = {};
  var shE = ss.getSheetByName(CFG.HOJA_EMERGENTES);
  if (shE && shE.getLastRow() >= 2) {
    var eData = shE.getRange(1, 1, shE.getLastRow(), shE.getLastColumn()).getValues();
    var eIdx = {};
    eData[0].forEach(function (h, i) { h = String(h || '').trim(); if (h && !(h in eIdx)) eIdx[h] = i; });
    if ('Mes' in eIdx && 'Contrato IAPART' in eIdx && 'Nro Estab Intercambio' in eIdx && 'Tareas' in eIdx && 'Fecha Programada' in eIdx) {
      for (var ei = 1; ei < eData.length; ei++) {
        var er = eData[ei];
        var ek = [String(er[eIdx['Contrato IAPART']] || '').trim(), String(er[eIdx['Nro Estab Intercambio']] || '').trim(),
          sinTildes_(er[eIdx['Tareas']]).toLowerCase().trim(), fechaISO_(er[eIdx['Fecha Programada']])].join('|');
        if (!(ek in emergMap)) emergMap[ek] = String(er[eIdx['Mes']] || '').trim();
      }
    }
  }

  var visitas = [], vistos = {};
  for (var ri = 1; ri < data.length; ri++) {
    var r = data[ri];
    var cuit = cel(r, 'Cuit').replace(/[^\d]/g, '');
    if (!cuit) continue;
    var fecha = fechaISO_(idx['Fecha Programada'] != null ? r[idx['Fecha Programada']] : '', tz);
    var nroEstab = cel(r, 'Nro Estab Intercambio');
    var tareas = cel(r, 'Tareas');
    var base = [cuit, nroEstab, sinTildes_(tareas).toLowerCase(), fecha].join('|');
    var n = (vistos[base] || 0) + 1;
    vistos[base] = n;
    var esObra = /obra/i.test(sinTildes_(tareas));
    if (n > 1 && !esObra) continue;
    var vid = base + (n > 1 ? ('#' + n) : '');
    var ek2 = [cel(r, 'Contrato IAPART'), nroEstab, sinTildes_(tareas).toLowerCase(), fecha].join('|');
    visitas.push({
      id: vid,
      cuit: cuit,
      empleador: cel(r, 'Empleador'),
      contrato: cel(r, 'Contrato IAPART'),
      establecimiento: cel(r, 'Establecimiento'),
      localidad: cel(r, 'Localidad'),
      provincia: cel(r, 'Provincia'),
      domicilio: cel(r, 'Domicilio estab.'),
      nroEstabIAPART: cel(r, 'Nro Estab IAPART'),
      nroEstab: nroEstab,
      programa: cel(r, 'Programa'),
      trabajadores: cel(r, 'CantidadTrabajadoresCUIT'),
      preventor: cel(r, 'Preventor Asignado'),
      tareas: tareas,
      esObra: esObra,
      fechaMax: fecha,
      planificacion: cel(r, 'Planificacion'),
      ambito: cel(r, 'Ambito') || cel(r, 'Provincia'),
      departamento: cel(r, 'Departamento'),
      obsCS: cel(r, 'Observaciones CS'),
      obsIAPSER: cel(r, 'Observaciones IAPSER'),
      obs: cel(r, 'Observaciones'),
      cohorte: (fecha && fecha < CFG.CORTE_RESIDUAL) ? 'Residual' : 'Emergente',
      mesEmergente: emergMap[ek2] || '',
      revisarDuplicada: false
    });
  }
  var gen = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH:mm');
  return { ok: true, generado: gen, ts: getPadronUpdatedAt_() || new Date().toISOString(), visitas: visitas };
}

function mesEmergentePorDefecto_() {
  var meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var iso = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
  return meses[parseInt(iso.slice(5, 7), 10) - 1] + iso.slice(2, 4);
}

function agregarAltasAEmergentes_(ss, altasItems, mesEtiqueta, contactoPorCE, tz) {
  if (!altasItems || !altasItems.length) return 0;
  var shE = ss.getSheetByName(CFG.HOJA_EMERGENTES);
  if (!shE) return 0;
  var lastRow = shE.getLastRow();
  var lastCol = shE.getLastColumn();
  if (lastRow < 1 || lastCol < 2) return 0;
  var hdrE = shE.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var eIdx = {};
  hdrE.forEach(function (h, i) { if (h && !(h in eIdx)) eIdx[h] = i; });
  if (!('Mes' in eIdx) || !('Contrato IAPART' in eIdx) || !('Nro Estab Intercambio' in eIdx) || !('Tareas' in eIdx) || !('Fecha Programada' in eIdx)) {
    return 0;
  }

  // Deduplicar contra filas ya presentes en Visitas emergentes mensuales
  var existentes = {};
  if (lastRow >= 2) {
    var valsE = shE.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var i = 0; i < valsE.length; i++) {
      var r = valsE[i];
      var k = [
        String(r[eIdx['Contrato IAPART']] || '').trim(),
        String(r[eIdx['Nro Estab Intercambio']] || '').trim(),
        sinTildes_(r[eIdx['Tareas']]).toLowerCase().trim(),
        fechaISO_(r[eIdx['Fecha Programada']], tz)
      ].join('|');
      existentes[k] = true;
    }
  }

  var mesVal = String(mesEtiqueta || mesEmergentePorDefecto_()).trim();
  var nuevasFilas = [];
  for (var j = 0; j < altasItems.length; j++) {
    var aw = altasItems[j].colsAW || [];
    var fIso = fechaISO_(aw[17]);
    var kNew = [
      String(aw[2] || '').trim(),
      String(aw[12] || '').trim(),
      sinTildes_(aw[16]).toLowerCase().trim(),
      fIso
    ].join('|');
    if (existentes[kNew]) continue;
    existentes[kNew] = true;

    var ce = String(aw[0] || '').replace(/[^\d]/g, '') + '|' + String(aw[12] || '').trim();
    var ct = contactoPorCE[ce] || null;
    var row = new Array(lastCol).fill('');
    row[eIdx['Mes']] = mesVal;
    for (var c = 1; c < CFG.COLUMNAS_PADRON.length; c++) {
      var colName = CFG.COLUMNAS_PADRON[c];
      var targetIdx = eIdx[colName];
      if (targetIdx == null) continue;
      if (colName === 'Fecha Programada') {
        row[targetIdx] = fIso ? isoADate_(fIso) : '';
      } else if (colName === 'Responsable' && ct && esValorReal_(ct.ag)) {
        row[targetIdx] = ct.ag;
      } else if (colName === 'Telefono' && ct && esValorReal_(ct.ah)) {
        row[targetIdx] = ct.ah;
      } else if (colName === 'E-mail' && ct && esValorReal_(ct.ai)) {
        row[targetIdx] = ct.ai;
      } else {
        row[targetIdx] = aw[c] != null ? aw[c] : '';
      }
    }
    nuevasFilas.push(row);
  }

  if (nuevasFilas.length) {
    var startR = lastRow + 1;
    // Formatear columna Mes como texto plano para evitar que 'nov26' se convierta en fecha 26/11/2026
    shE.getRange(startR, eIdx['Mes'] + 1, nuevasFilas.length, 1).setNumberFormat('@');
    shE.getRange(startR, 1, nuevasFilas.length, lastCol).setValues(nuevasFilas);
  }
  return nuevasFilas.length;
}

function sincronizarPadron_(p) {
  var filas = p && p.filas;
  if (!Array.isArray(filas) || !filas.length) throw new Error('No se recibieron filas para sincronizar');
  var aplicarBajas = p.aplicarBajas !== false;
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
    var sh = ss.getSheetByName(CFG.HOJA_GENERAL);
    if (!sh) throw new Error('No se encontró la hoja ' + CFG.HOJA_GENERAL);

    var lastRow = sh.getLastRow();
    var lastCol = Math.max(sh.getLastColumn(), CFG.COLUMNAS_PADRON.length);
    var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
    var idx = {};
    hdr.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
    CFG.COLUMNAS_PADRON.forEach(function (c) {
      if (!(c in idx)) throw new Error('Falta la columna "' + c + '" en ' + CFG.HOJA_GENERAL);
    });

    var tieneAG = lastCol >= 35 && hdr[32] === 'Responsable' && hdr[33] === 'Telefono' && hdr[34] === 'E-mail';
    var colClave = (lastCol >= 32 && hdr[31] === 'Clave') ? 31 : -1;
    var colAmbito = ('Ambito' in idx) ? idx['Ambito'] : -1;

    var existVals = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    var existForms = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, lastCol).getFormulas() : [];

    var existList = [];
    var porId = {};
    var porCET = {};
    var porCE = {};
    var contactoPorCE = {};
    var vistosEx = {};

    for (var i = 0; i < existVals.length; i++) {
      var v = existVals[i], f = existForms[i];
      var cuit = String(v[idx['Cuit']] || '').replace(/[^\d]/g, '');
      if (!cuit) continue;
      var estab = String(v[idx['Nro Estab Intercambio']] || '').trim();
      var tareas = String(v[idx['Tareas']] || '').trim();
      var fecha = fechaISO_(v[idx['Fecha Programada']], ss.getSpreadsheetTimeZone());
      var base = [cuit, estab, sinTildes_(tareas).toLowerCase(), fecha].join('|');
      var n = (vistosEx[base] || 0) + 1;
      vistosEx[base] = n;
      var vid = base + (n > 1 ? ('#' + n) : '');
      var cet = [cuit, estab, sinTildes_(tareas).toLowerCase()].join('|');
      var ceKey = cuit + '|' + estab;
      var esObraEx = /obra/i.test(sinTildes_(tareas));
      var rec = { rowNum: i + 2, id: vid, cet: cet, ce: ceKey, esObra: esObraEx, vals: v, forms: f, matched: false };
      existList.push(rec);
      if (!(vid in porId)) porId[vid] = rec;
      (porCET[cet] = porCET[cet] || []).push(rec);
      if (!esObraEx) (porCE[ceKey] = porCE[ceKey] || []).push(rec);

      // Guardar contactos enriquecidos AG..AJ por CUIT+Estab para reutilizar en altas nuevas
      if (tieneAG) {
        if (!(ceKey in contactoPorCE) && (esValorReal_(v[32]) || esValorReal_(v[33]) || esValorReal_(v[34]))) {
          contactoPorCE[ceKey] = { ag: v[32], ah: v[33], ai: v[34], aj: lastCol > 35 ? v[35] : '' };
        }
      }
    }

    var outRows = [];
    var altasItems = [];
    var altas = 0, modificadas = 0;

    function buildRow(item, prev, newRowNum) {
      var row = new Array(lastCol).fill('');
      if (prev) {
        for (var c = 0; c < lastCol; c++) {
          row[c] = prev.forms[c] ? ajustarFormulaFila_(prev.forms[c], prev.rowNum, newRowNum) : prev.vals[c];
        }
      }
      var aw = item.colsAW || [];
      for (var k = 0; k < CFG.COLUMNAS_PADRON.length; k++) {
        var colName = CFG.COLUMNAS_PADRON[k];
        var ci = idx[colName];
        if (ci == null || ci >= lastCol) continue;
        // Preservar fórmulas =AG/=AH/=AI en Responsable/Telefono/E-mail si la hoja tiene AG..AI
        if (tieneAG && (colName === 'Responsable' || colName === 'Telefono' || colName === 'E-mail')) {
          var agIdx = colName === 'Responsable' ? 32 : (colName === 'Telefono' ? 33 : 34);
          var agLetra = colName === 'Responsable' ? 'AG' : (colName === 'Telefono' ? 'AH' : 'AI');
          row[ci] = '=' + agLetra + newRowNum;
          if (!esValorReal_(row[agIdx]) && esValorReal_(aw[k])) {
            row[agIdx] = aw[k];
          }
        } else if (colName === 'Fecha Programada') {
          var fIso = fechaISO_(aw[k]);
          row[ci] = fIso ? isoADate_(fIso) : '';
        } else {
          row[ci] = aw[k] != null ? aw[k] : '';
        }
      }
      if (!prev) {
        if (colAmbito >= 0 && !row[colAmbito]) row[colAmbito] = aw[5] || '';
        if (colClave >= 0) row[colClave] = '=A' + newRowNum + '&M' + newRowNum;
        if (tieneAG) {
          var ce = String(aw[0] || '').replace(/[^\d]/g, '') + '|' + String(aw[12] || '').trim();
          var ct = contactoPorCE[ce];
          if (ct) {
            if (!esValorReal_(row[32])) row[32] = ct.ag;
            if (!esValorReal_(row[33])) row[33] = ct.ah;
            if (!esValorReal_(row[34])) row[34] = ct.ai;
            if (lastCol > 35 && !esValorReal_(row[35])) row[35] = ct.aj;
          }
        }
      } else if (colClave >= 0) {
        row[colClave] = '=A' + newRowNum + '&M' + newRowNum;
      }
      return row;
    }

    function cambioAW_(prev, aw) {
      for (var k = 0; k < CFG.COLUMNAS_PADRON.length; k++) {
        var colName = CFG.COLUMNAS_PADRON[k];
        if (colName === 'Responsable' || colName === 'Telefono' || colName === 'E-mail') continue;
        var ci = idx[colName];
        var oldVal = (colName === 'Fecha Programada') ? fechaISO_(prev.vals[ci], ss.getSpreadsheetTimeZone()) : String(prev.vals[ci] == null ? '' : prev.vals[ci]).trim();
        var newVal = (colName === 'Fecha Programada') ? fechaISO_(aw[k]) : String(aw[k] == null ? '' : aw[k]).trim();
        if (oldVal !== newVal) return true;
      }
      return false;
    }

    // 1. Emparejar por ID exacto primero, luego por CUIT|Estab|Tareas y luego por CUIT|Estab (no obras)
    var pendientes = [];
    var cambiosTareas = 0;
    for (var j = 0; j < filas.length; j++) {
      var it = filas[j];
      var match = porId[it.id];
      if (match && !match.matched) {
        match.matched = true;
        if (cambioAW_(match, it.colsAW)) modificadas++;
        outRows.push(buildRow(it, match, outRows.length + 2));
      } else {
        pendientes.push(it);
      }
    }
    var pendientesCE = [];
    for (var q = 0; q < pendientes.length; q++) {
      var it2 = pendientes[q];
      var lista = porCET[it2.cet] || [];
      var match2 = null;
      for (var m = 0; m < lista.length; m++) {
        if (!lista[m].matched) { match2 = lista[m]; break; }
      }
      if (match2) {
        match2.matched = true;
        modificadas++;
        outRows.push(buildRow(it2, match2, outRows.length + 2));
      } else {
        pendientesCE.push(it2);
      }
    }
    for (var r2 = 0; r2 < pendientesCE.length; r2++) {
      var it3 = pendientesCE[r2];
      var aw3 = it3.colsAW || [];
      var ce3 = it3.ce || (String(aw3[0] || '').replace(/[^\d]/g, '') + '|' + String(aw3[12] || '').trim());
      var esOb3 = it3.esObra != null ? !!it3.esObra : /obra/i.test(sinTildes_(aw3[16] || ''));
      var listaCE = !esOb3 ? (porCE[ce3] || []) : [];
      var match3 = null;
      for (var m3 = 0; m3 < listaCE.length; m3++) {
        if (!listaCE[m3].matched) { match3 = listaCE[m3]; break; }
      }
      if (match3) {
        match3.matched = true;
        modificadas++;
        cambiosTareas++;
        outRows.push(buildRow(it3, match3, outRows.length + 2));
      } else {
        altas++;
        altasItems.push(it3);
        outRows.push(buildRow(it3, null, outRows.length + 2));
      }
    }

    // 2. Bajas (filas existentes que ya no están en el Excel nuevo)
    var bajasRows = [];
    for (var bi = 0; bi < existList.length; bi++) {
      if (existList[bi].matched) continue;
      if (!aplicarBajas) {
        var keep = new Array(lastCol).fill('');
        var newR = outRows.length + 2;
        for (var kc = 0; kc < lastCol; kc++) {
          keep[kc] = existList[bi].forms[kc] ? ajustarFormulaFila_(existList[bi].forms[kc], existList[bi].rowNum, newR) : existList[bi].vals[kc];
        }
        outRows.push(keep);
      } else {
        bajasRows.push(existList[bi].vals);
      }
    }

    // Respaldar bajas en Bajas_Historico antes de quitarlas de General
    if (aplicarBajas && bajasRows.length) {
      var shB = ss.getSheetByName(CFG.HOJA_BAJAS);
      if (!shB) {
        shB = ss.insertSheet(CFG.HOJA_BAJAS);
        var hdrB = ['Fecha Baja', 'Usuario', 'Archivo'].concat(hdr);
        shB.getRange(1, 1, 1, hdrB.length).setValues([hdrB]).setFontWeight('bold');
        shB.setFrozenRows(1);
      }
      var tsStr = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH:mm');
      var usr = String(p.usuario || '');
      var arch = String(p.archivo || '');
      var toAppend = bajasRows.map(function (r) { return [tsStr, usr, arch].concat(r); });
      shB.getRange(shB.getLastRow() + 1, 1, toAppend.length, toAppend[0].length).setValues(toAppend);
    }

    // Escribir filas actualizadas en la hoja General y limpiar sobrantes al final
    if (outRows.length) {
      sh.getRange(2, 1, outRows.length, lastCol).setValues(outRows);
    }
    var sobrantes = lastRow - (outRows.length + 1);
    if (sobrantes > 0) {
      sh.getRange(outRows.length + 2, 1, sobrantes, lastCol).clearContent();
    }

    // Alimentar "Visitas emergentes mensuales" con las altas de General para el mes en curso
    var mesEmergente = String((p && p.mesEmergente) || mesEmergentePorDefecto_()).trim();
    var emergentesAgregadas = 0;
    if (p.registrarEmergentes !== false && altasItems.length) {
      emergentesAgregadas = agregarAltasAEmergentes_(ss, altasItems, mesEmergente, contactoPorCE, ss.getSpreadsheetTimeZone());
    }

    // Migrar IDs en Seguimiento_Intentos si cambió Fecha Programada o Tareas
    var intentosMigrados = migrarIntentosIds_(ss, p.migracionesId);

    // Guardar movimientos en Historial_ABM con Fecha de ABM
    var abmGuardados = guardarMovimientosABM_(ss, p.movimientosABM);

    var nowIso = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty('PADRON_UPDATED_AT', nowIso);
    if (abmGuardados > 0) {
      PropertiesService.getScriptProperties().setProperty('ABM_UPDATED_AT', nowIso);
    }
    return {
      ok: true,
      totalFinal: outRows.length,
      altas: altas,
      modificadas: modificadas,
      cambiosTareas: cambiosTareas,
      bajas: bajasRows.length,
      emergentesAgregadas: emergentesAgregadas,
      intentosMigrados: intentosMigrados,
      abmGuardados: abmGuardados,
      mesEmergente: mesEmergente,
      ts: nowIso
    };
  } finally {
    lock.releaseLock();
  }
}

function migrarIntentosIds_(ss, migracionesId) {
  if (!Array.isArray(migracionesId) || !migracionesId.length) return 0;
  var shI = ss.getSheetByName(CFG.HOJA);
  if (!shI || shI.getLastRow() < 2) return 0;
  var mapa = {};
  migracionesId.forEach(function (m) {
    if (m && m.idAnterior && m.idNuevo && m.idAnterior !== m.idNuevo) {
      mapa[String(m.idAnterior)] = String(m.idNuevo);
    }
  });
  if (!Object.keys(mapa).length) return 0;
  var cm = colMap_(shI);
  var colId = cm['ID Visita'] + 1;
  var nRows = shI.getLastRow() - 1;
  var rng = shI.getRange(2, colId, nRows, 1);
  var vals = rng.getValues();
  var cambiados = 0;
  for (var i = 0; i < vals.length; i++) {
    var cur = String(vals[i][0] || '');
    if (mapa[cur]) {
      vals[i][0] = mapa[cur];
      cambiados++;
    }
  }
  if (cambiados > 0) rng.setValues(vals);
  return cambiados;
}

function hojaABM_(ss) {
  ss = ss || SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(CFG.HOJA_ABM);
  if (!sh) {
    sh = ss.insertSheet(CFG.HOJA_ABM);
    sh.getRange(1, 1, 1, CFG.ENCABEZADOS_ABM.length).setValues([CFG.ENCABEZADOS_ABM]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function guardarMovimientosABM_(ss, movimientos) {
  if (!Array.isArray(movimientos) || !movimientos.length) return 0;
  var sh = hojaABM_(ss);
  var rows = movimientos.map(function (m) {
    return [
      String(m.loteId || ''),
      String(m.fechaABM || ''),
      String(m.usuario || ''),
      String(m.archivo || ''),
      String(m.tipo || ''),
      String(m.cuit || ''),
      String(m.empleador || ''),
      String(m.nroEstab || ''),
      String(m.ambito || ''),
      String(m.localidad || ''),
      String(m.tareasAntes || ''),
      String(m.tareasDespues || ''),
      String(m.tareasAgregadas || ''),
      String(m.tareasQuitadas || ''),
      String(m.fechaMaxAntes || ''),
      String(m.fechaMaxDespues || ''),
      String(m.teniaGestion || 'No'),
      String(m.detalle || '')
    ];
  });
  var startR = sh.getLastRow() + 1;
  sh.getRange(startR, 2, rows.length, 1).setNumberFormat('@'); // Fecha ABM literal (evita desfase horario de la hoja)
  sh.getRange(startR, 6, rows.length, 3).setNumberFormat('@'); // CUIT, Empleador, Estab (M) como texto
  sh.getRange(startR, 15, rows.length, 2).setNumberFormat('@'); // Fecha Max Antes / Despues como texto ISO
  sh.getRange(startR, 1, rows.length, CFG.ENCABEZADOS_ABM.length).setValues(rows);
  return rows.length;
}

function leerHistorialABM_() {
  var ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(CFG.HOJA_ABM);
  if (!sh || sh.getLastRow() < 2) {
    return { ok: true, abmUpdatedAt: getAbmUpdatedAt_(), movimientos: [] };
  }
  var tzSheet = ss.getSpreadsheetTimeZone();
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var hdr = data[0].map(function (h) { return String(h || '').trim(); });
  var idx = {};
  hdr.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
  function cel(r, col) {
    var i = idx[col];
    return (i != null && i < r.length && r[i] != null) ? String(r[i]).trim() : '';
  }
  var out = [];
  for (var rIdx = 1; rIdx < data.length; rIdx++) {
    var r = data[rIdx];
    var cuit = cel(r, 'CUIT');
    var tipo = cel(r, 'Tipo');
    if (!cuit && !tipo) continue;
    var fAbmRaw = idx['Fecha ABM'] != null ? r[idx['Fecha ABM']] : '';
    var fAbm = fAbmRaw instanceof Date
      ? Utilities.formatDate(fAbmRaw, tzSheet, 'yyyy-MM-dd HH:mm')
      : String(fAbmRaw || '').trim();
    out.push({
      loteId: cel(r, 'ID Lote'),
      fechaABM: fAbm,
      usuario: cel(r, 'Usuario'),
      archivo: cel(r, 'Archivo'),
      tipo: tipo,
      cuit: cuit,
      empleador: cel(r, 'Empleador'),
      nroEstab: cel(r, 'Estab (M)'),
      ambito: cel(r, 'Ambito'),
      localidad: cel(r, 'Localidad'),
      tareasAntes: cel(r, 'Tareas Antes'),
      tareasDespues: cel(r, 'Tareas Despues'),
      tareasAgregadas: cel(r, 'Tareas Agregadas'),
      tareasQuitadas: cel(r, 'Tareas Quitadas'),
      fechaMaxAntes: fechaISO_(idx['Fecha Max Antes'] != null ? r[idx['Fecha Max Antes']] : '', ss.getSpreadsheetTimeZone()),
      fechaMaxDespues: fechaISO_(idx['Fecha Max Despues'] != null ? r[idx['Fecha Max Despues']] : '', ss.getSpreadsheetTimeZone()),
      teniaGestion: cel(r, 'Tenia Gestion') || 'No',
      detalle: cel(r, 'Detalle')
    });
  }
  return { ok: true, abmUpdatedAt: getAbmUpdatedAt_(), movimientos: out };
}
