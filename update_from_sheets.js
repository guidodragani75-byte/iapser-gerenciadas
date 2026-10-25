/**
 * Script de sincronización directa desde Google Sheets
 * Descarga las filas en vivo de la planilla compartida y regenera datos_precargados.js
 */
const fs = require('fs');
const https = require('https');

const SHEET_ID = '1xXEmPqATmcMR0JpO2IuTmf1YZ6fMRxyeAc9avbfDRqI';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return resolve(fetchUrl(res.headers.location));
      }
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = [];
  for (let line of lines) {
    let row = [''];
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      let c = line[i];
      if (c === '"') {
        if (inQuote && line[i+1] === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (c === ',' && !inQuote) {
        row.push('');
      } else {
        row[row.length - 1] += c;
      }
    }
    rows.push(row.map(v => v.trim()));
  }
  return rows;
}

function normalizarFecha(str) {
  if (!str) return '';
  str = String(str).trim();
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return str;
  let d = m[1].padStart(2, '0');
  let mes = m[2].padStart(2, '0');
  let y = m[3];
  if (y.length === 2) y = '20' + y;
  return `${d}/${mes}/${y}`;
}

async function run() {
  console.log('Conectando a Google Sheets...');
  const csv = await fetchUrl(CSV_URL);
  const rows = parseCSV(csv);
  const headers = rows[0];
  console.log(`Descargadas ${rows.length - 1} filas.`);

  const colIdx = {};
  headers.forEach((h, i) => {
    if (h && colIdx[h] === undefined) colIdx[h] = i;
  });

  const tasks = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const cuit = row[colIdx['Cuit']] || '';
    const empleador = row[colIdx['Empleador']] || '';
    if (!cuit && !empleador) continue;

    // Columna F: Fecha Realizada. Si viene vacía y tiene algo en Fecha Visita (Col E), usar esa.
    let rawFechaReal = row[colIdx['Fecha Realizada']] || '';
    if (!rawFechaReal && row[colIdx['Fecha Visita']]) {
      rawFechaReal = row[colIdx['Fecha Visita']];
    }
    const fechaReal = normalizarFecha(rawFechaReal);

    const tarea = row[colIdx['Tarea']] || 'Visita tecnica';
    const origenPlan = row[colIdx['Origen Plan']] || 'Residual 2026';
    
    let rawDesde = row[colIdx['Fecha Desde']] || '';
    if (!rawDesde && tarea.toLowerCase().includes('visita tecnica')) rawDesde = '01/01/2026';
    const fechaDesde = normalizarFecha(rawDesde);

    let rawHasta = row[colIdx['Fecha Hasta']] || '';
    if (!rawHasta && tarea.toLowerCase().includes('visita tecnica')) rawHasta = '31/12/2026';
    const fechaHasta = normalizarFecha(rawHasta);

    let resultadoVisita = row[colIdx['Resultado Visita']] || '';
    if (!resultadoVisita && fechaReal) {
      resultadoVisita = 'Efectiva';
    }

    const documentoAdjunto = row[colIdx['Documento Adjunto']] || '';
    let estadoTarea = row[colIdx['Estado Tarea']] || '';
    if (!estadoTarea) {
      if (fechaReal && documentoAdjunto) {
        estadoTarea = (resultadoVisita.toLowerCase() === 'fallida') ? 'Terminada (Fallida)' : 'Terminada';
      } else if (fechaReal) {
        estadoTarea = (resultadoVisita.toLowerCase() === 'fallida') ? 'Fallida sin documento' : 'Realizada sin documento';
      } else if (!fechaHasta) {
        estadoTarea = 'Pendiente plazo';
      } else {
        estadoTarea = 'En término';
      }
    }

    // Nombre de establecimiento: si está en blanco, asignar "Obra en construcción" o nombre de empleador
    let estabNombre = row[colIdx['Establecimiento']] || '';
    if (!estabNombre) {
      estabNombre = tarea.toLowerCase().includes('obra') ? 'Obra en construcción' : (empleador || 'Sede Principal');
    }

    tasks.push({
      rowId: r + 1,
      cuit: cuit,
      empleador: empleador,
      contrato: row[colIdx['Contrato IAPART']] || '',
      establecimiento: estabNombre,
      nroEstab: row[colIdx['Nro Estab IAPART']] || '1',
      localidad: row[colIdx['Localidad']] || '',
      preventor: row[colIdx['Preventor Asignado']] || '',
      capitas: row[colIdx['Capitas']] || '',
      tarea: tarea,
      fechaDesde: fechaDesde,
      fechaHasta: fechaHasta,
      fechaRealizada: fechaReal,
      resultadoVisita: resultadoVisita,
      nroSiniestro: row[colIdx['Nro Siniestro']] || '',
      observaciones: row[colIdx['Observaciones']] || '',
      documentoAdjunto: documentoAdjunto,
      estadoTarea: estadoTarea,
      gestionFallida: row[colIdx['Gestion Fallida']] || '',
      origenPlan: origenPlan
    });
  }

  fs.writeFileSync('datos_precargados.js', '// Datos sincronizados en vivo desde Google Sheets\nwindow.DATOS_INICIALES_IAPSER = ' + JSON.stringify(tasks, null, 2) + ';\n');
  console.log(`¡Éxito! Se actualizaron ${tasks.length} tareas en datos_precargados.js`);
}

run().catch(err => {
  console.error('Error al sincronizar:', err);
  process.exit(1);
});
