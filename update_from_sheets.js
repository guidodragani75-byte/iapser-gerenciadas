/**
 * Script de sincronización directa desde Google Sheets
 * Descarga las filas en vivo de la planilla compartida y regenera datos_precargados.js
 * Incluye extracción automática de hipervínculos reales a Google Drive
 */
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

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

function obtenerEnlacesDriveDesdeXLSX(sheetId) {
  try {
    const xlsxUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    execSync(`powershell -Command "Invoke-WebRequest -Uri '${xlsxUrl}' -OutFile '_tmp_sheet.zip'; Expand-Archive -Path '_tmp_sheet.zip' -DestinationPath '_tmp_extracted' -Force"`, { stdio: 'ignore' });
    
    const relsPath = '_tmp_extracted/xl/worksheets/_rels/sheet1.xml.rels';
    const sheetPath = '_tmp_extracted/xl/worksheets/sheet1.xml';
    const rowLinks = {};

    if (fs.existsSync(relsPath) && fs.existsSync(sheetPath)) {
      const relsXml = fs.readFileSync(relsPath, 'utf8');
      const relMap = {};
      const relRegex = /<Relationship\s+[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
      let rm;
      while ((rm = relRegex.exec(relsXml)) !== null) {
        relMap[rm[1]] = rm[2];
      }

      const sheetXml = fs.readFileSync(sheetPath, 'utf8');
      const hlRegex = /<hyperlink\b([^>]+)\/?>/g;
      let hm;
      while ((hm = hlRegex.exec(sheetXml)) !== null) {
        const attrs = hm[1];
        const idMatch = attrs.match(/r:id="([^"]+)"/);
        const refMatch = attrs.match(/ref="([^"]+)"/);
        if (idMatch && refMatch) {
          const rId = idMatch[1];
          const cellRef = refMatch[1];
          const rowNum = parseInt(cellRef.replace(/\D/g, ''), 10);
          rowLinks[rowNum] = relMap[rId] || '';
        }
      }
    }

    execSync(`powershell -Command "Remove-Item -Force '_tmp_sheet.zip' -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force '_tmp_extracted' -ErrorAction SilentlyContinue"`, { stdio: 'ignore' });
    return rowLinks;
  } catch(e) {
    console.warn("Extracción de hipervínculos omitida:", e.message);
    return {};
  }
}

async function run() {
  console.log('Conectando a Google Sheets...');
  const csv = await fetchUrl(CSV_URL);
  const rows = parseCSV(csv);
  const headers = rows[0];
  console.log(`Descargadas ${rows.length - 1} filas.`);

  console.log('Extrayendo enlaces de Google Drive...');
  const driveLinks = obtenerEnlacesDriveDesdeXLSX(SHEET_ID);
  console.log(`Detectados ${Object.keys(driveLinks).length} enlaces reales a Drive.`);

  const colIdx = {};
  headers.forEach((h, i) => {
    if (h && colIdx[h] === undefined) colIdx[h] = i;
  });

  const tasks = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowId = r + 1;
    const cuit = row[colIdx['Cuit']] || '';
    const empleador = row[colIdx['Empleador']] || '';
    if (!cuit && !empleador) continue;

    // Columna F: Solo Columna F es Fecha Realizada (la visita efectivamente realizada)
    const fechaReal = normalizarFecha(row[colIdx['Fecha Realizada']] || '');

    const tarea = row[colIdx['Tarea']] || 'Visita tecnica';
    const origenPlan = row[colIdx['Origen Plan']] || 'Residual 2026';
    
    let rawDesde = row[colIdx['Fecha Desde']] || '';
    if (!rawDesde && tarea.toLowerCase().includes('visita tecnica')) rawDesde = '01/01/2026';
    const fechaDesde = normalizarFecha(rawDesde);

    let rawHasta = row[colIdx['Fecha Hasta']] || '';
    if (!rawHasta) {
      rawHasta = row[colIdx['Fecha Visita']] || (tarea.toLowerCase().includes('visita tecnica') ? '31/12/2026' : '');
    }
    const fechaHasta = normalizarFecha(rawHasta);

    let resultadoVisita = row[colIdx['Resultado Visita']] || '';
    if (!resultadoVisita && fechaReal) {
      resultadoVisita = 'Efectiva';
    }

    // Priorizar el enlace real de Google Drive extraído del hipervínculo
    let documentoAdjunto = driveLinks[rowId] || row[colIdx['Documento Adjunto']] || '';
    if (documentoAdjunto === 'Ver Archivo' && driveLinks[rowId]) {
      documentoAdjunto = driveLinks[rowId];
    }

    // ESTADO TAREA:
    // 1. Si se realizó la visita (efectiva o fallida) -> Realizada
    // 2. Si no se realizó -> En término o Vencida según fecha límite
    let estadoTarea = '';
    if (fechaReal) {
      estadoTarea = 'Realizada';
    } else {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      if (fechaHasta) {
        const p = fechaHasta.split('/');
        if (p.length === 3) {
          const dHasta = new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
          estadoTarea = (dHasta < hoy) ? 'Vencida' : 'En término';
        } else {
          estadoTarea = 'En término';
        }
      } else {
        estadoTarea = 'En término';
      }
    }

    let estabNombre = row[colIdx['Establecimiento']] || '';
    if (!estabNombre) {
      estabNombre = tarea.toLowerCase().includes('obra') ? 'Obra en construcción' : (empleador || 'Sede Principal');
    }

    tasks.push({
      rowId: rowId,
      cuit: cuit,
      empleador: empleador,
      contrato: row[colIdx['Contrato IAPART']] || '',
      establecimiento: estabNombre,
      nroEstab: row[colIdx['Nro Estab IAPART']] || '1',
      nroEstabIntercambio: row[colIdx['Nro Estab Intercambio']] || row[colIdx['Nro Estab IAPART']] || '1',
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

  fs.writeFileSync('datos_precargados.js', '// Datos sincronizados en vivo desde Google Sheets con enlaces reales de Google Drive\nwindow.DATOS_INICIALES_IAPSER = ' + JSON.stringify(tasks, null, 2) + ';\n');
  console.log(`¡Éxito! Se actualizaron ${tasks.length} tareas en datos_precargados.js con sus enlaces a Drive.`);
}

run().catch(err => {
  console.error('Error al sincronizar:', err);
  process.exit(1);
});
