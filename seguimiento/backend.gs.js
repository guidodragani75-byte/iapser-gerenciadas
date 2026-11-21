/**
 * Backend del módulo Seguimiento Consultora (Google Apps Script).
 * Se vincula a la planilla "Detalle Visitas con Tareas CS" (1x2w2zY5BmxWJ29hh6pNiy1qLXv22RFkOx5DidNOx8_E).
 * NO toca las hojas de datos ni las columnas A..W: solo crea/usa la hoja "Seguimiento_Intentos".
 *
 * Acciones (doPost JSON, text/plain): saveIntento | getState ; (doGet): ?action=getState | ping
 * Adjuntos: SOLO PDF, se guardan en Drive por mes: IAPSER_Gestion_Visitas / IAPSER_Visitas_AAAA-MM
 */
var CFG = {
  HOJA: 'Seguimiento_Intentos',
  CARPETA_PRINCIPAL_ID: '1RDkZA4EIjPxdvBZqPCcgu5k6vnz6eAUq',
  PREFIJO_MES: 'IAPSER_Visitas_',
  MAX_PDF_BYTES: 15 * 1024 * 1024,
  ENCABEZADOS: ['ID Visita', 'Nro Intento', 'Fecha Agendada', 'Fecha Real', 'Resultado', 'Motivo',
                'Reprograma', 'Adjunto Drive', 'Cargado por', 'Timestamp']
};

function hoja_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getState';
  if (action === 'ping') return json_({ ok: true, ts: new Date().toISOString() });
  if (action === 'getState') return json_({ ok: true, intentos: leerIntentos_() });
  return json_({ ok: false, error: 'Acción no reconocida: ' + action });
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    if (p.action === 'getState') return json_({ ok: true, intentos: leerIntentos_() });
    if (p.action === 'saveIntento') return json_(guardarIntento_(p));
    return json_({ ok: false, error: 'Acción no reconocida: ' + p.action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
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
