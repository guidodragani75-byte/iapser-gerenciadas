/**
 * Motor híbrido de detección de PDFs (Gemini en Apps Script + respaldo local PDF.js / Tesseract.js).
 * Extrae: cuit, nroEstab (col. M), fechaReal (YYYY-MM-DD), resultado ('Efectiva'|'Fallida'|''), motivoFallida.
 */
(function (root) {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function leerBase64(file) {
    return new Promise(function (res, rej) {
      const fr = new FileReader();
      fr.onload = function () { res(String(fr.result || '').split(',')[1] || ''); };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  function extraerCuit(texto) {
    const s = String(texto || '');
    const m1 = s.match(/(?:^|[^\d])(20|23|24|27|30|33|34)[\s-]?(\d{8})[\s-]?(\d)(?!\d)/);
    return m1 ? (m1[1] + m1[2] + m1[3]) : '';
  }

  function extraerEstab(texto) {
    const s = String(texto || '');
    const mFile = s.match(/(?:^|[_\s-])(?:ESTAB(?:LECIMIENTO)?|PLANTA|SEDE|SUCURSAL|OBRA|E)[\s._:#-]{0,3}(\d{1,4})(?=\b|[_\s.-]|$)/i);
    if (mFile) return String(parseInt(mFile[1], 10));
    const mDoc = s.match(/\b(?:ESTAB(?:LECIMIENTO)?|N[°ºo.]?\s*ESTAB|PLANTA|SEDE|SUCURSAL)\s*[:.#-]?\s*(\d{1,4})\b/i);
    return mDoc ? String(parseInt(mDoc[1], 10)) : '';
  }

  function extraerFechaISO(texto) {
    const s = String(texto || '');
    const hoy = new Date();
    const maxY = hoy.getFullYear() + 1;
    // DD/MM/YYYY o DD-MM-YYYY
    const m1 = s.match(/(?:^|[^\d])(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})(?!\d)/);
    if (m1 && +m1[3] >= 2024 && +m1[3] <= maxY) return m1[3] + '-' + pad(+m1[2]) + '-' + pad(+m1[1]);
    // YYYY-MM-DD o YYYYMMDD
    const m2 = s.match(/(?:^|[^\d])(20\d{2})[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])(?!\d)/);
    if (m2 && +m2[1] >= 2024 && +m2[1] <= maxY) return m2[1] + '-' + m2[2] + '-' + m2[3];
    return '';
  }

  function extraerResultado(texto) {
    const u = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\-.]+/g, ' ').toUpperCase();
    if (/\b(FALLIDA|NO REALIZADA|NO SE PUDO REALIZAR|ESTABLECIMIENTO CERRADO|SIN ACCESO|NO ATIENDE|RECHAZA(?:DA)?|AUSENTE|DOMICILIO INEXISTENTE)\b/.test(u)) {
      let motivo = '';
      if (/CERRADO/.test(u)) motivo = 'Establecimiento cerrado';
      else if (/NO ATIENDE|AUSENTE|SIN RESPONSABLE/.test(u)) motivo = 'No atiende nadie / sin responsable';
      else if (/INEXISTENTE|INCORRECTO|NO EXISTE/.test(u)) motivo = 'Domicilio inexistente o incorrecto';
      else if (/SIN PERSONAL/.test(u)) motivo = 'Empleador sin personal';
      else if (/RECHAZ/.test(u)) motivo = 'Rechazo de la visita';
      return { resultado: 'Fallida', motivoFallida: motivo };
    }
    if (/\b(EFECTIVA|CONSTANCIA DE VISITA|ACTA DE VISITA|RELEVAMIENTO|VEROSIMILITUD|VISITA TECNICA|VISITA DE OBRA)\b/.test(u)) {
      return { resultado: 'Efectiva', motivoFallida: '' };
    }
    return { resultado: '', motivoFallida: '' };
  }

  function extraerDeNombre(nombre) {
    const res = extraerResultado(nombre);
    return {
      cuit: extraerCuit(nombre),
      nroEstab: extraerEstab(nombre),
      fechaReal: extraerFechaISO(nombre),
      resultado: res.resultado,
      motivoFallida: res.motivoFallida
    };
  }

  async function extraerConPDFyTesseract(file, yaTieneDatos) {
    let texto = '';
    let metodo = 'nombre';
    if (window.pdfjsLib && typeof file.arrayBuffer === 'function') {
      try {
        if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const buf = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        const maxP = Math.min(pdf.numPages, 3);
        for (let p = 1; p <= maxP; p++) {
          const page = await pdf.getPage(p);
          const tc = await page.getTextContent();
          texto += tc.items.map(function (it) { return it.str; }).join(' ') + ' ';
        }
        if (texto.trim().length >= 30) metodo = 'pdf_texto';

        // Fallback OCR sobre página 1 solo si es escaneo y todavía faltan datos clave
        const falta = !yaTieneDatos && (texto.trim().length < 40 || (!extraerCuit(texto) && !extraerFechaISO(texto)));
        if (falta && window.Tesseract) {
          const p1 = await pdf.getPage(1);
          const vp = p1.getViewport({ scale: 1.8 });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          await p1.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          const ocr = await window.Tesseract.recognize(canvas, 'spa');
          if (ocr && ocr.data && ocr.data.text) {
            texto += ' ' + ocr.data.text;
            metodo = 'ocr_local';
          }
        }
      } catch (e) {
        console.warn('PDF/OCR local:', e);
      }
    }
    const r = extraerResultado(texto);
    return {
      source: metodo,
      cuit: extraerCuit(texto),
      nroEstab: extraerEstab(texto),
      fechaReal: extraerFechaISO(texto),
      resultado: r.resultado,
      motivoFallida: r.motivoFallida
    };
  }

  let geminiDisponible = null; // null = desconocido, true/false cacheado por sesión

  async function intentarGemini(backendUrl, b64, nombre) {
    if (!backendUrl || geminiDisponible === false) return null;
    try {
      const resp = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'analyzePdf', pdfBase64: b64, nombreArchivo: nombre })
      });
      const j = await resp.json();
      if (j && j.ok && j.data) {
        geminiDisponible = true;
        return Object.assign({ source: 'gemini' }, j.data);
      }
      if (j && j.reason === 'no_api_key') geminiDisponible = false;
    } catch (e) {
      console.warn('Gemini backend no disponible, usando OCR local:', e);
    }
    return null;
  }

  /** Busca la mejor visita candidata en VISITAS priorizando pendientes (!cerrada). */
  function buscarVisitaCandidata(visitas, cuit, nroEstab) {
    if (!visitas || !visitas.length || !cuit) return { match: null, candidatos: [] };
    const norm = function (s) { return String(s || '').replace(/\D/g, ''); };
    const c = norm(cuit);
    const porCuit = visitas.filter(function (v) { return norm(v.cuit) === c; });
    if (!porCuit.length) return { match: null, candidatos: [] };
    const ordenados = porCuit.slice().sort(function (a, b) {
      if (!!a.cerrada !== !!b.cerrada) return a.cerrada ? 1 : -1;
      return (a.plazo || '9').localeCompare(b.plazo || '9');
    });
    if (nroEstab !== '' && nroEstab != null) {
      const e = String(parseInt(nroEstab, 10));
      const exacto = ordenados.find(function (v) { return String(parseInt(v.nroEstab, 10)) === e; });
      if (exacto) return { match: exacto, candidatos: ordenados };
    }
    return { match: ordenados.length === 1 ? ordenados[0] : null, candidatos: ordenados };
  }

  /** Orquesta la detección híbrida: Gemini (si activo) -> PDF.js/Tesseract local -> nombre archivo. */
  async function analizarPDF(file, opts) {
    opts = opts || {};
    const b64 = opts.base64 || await leerBase64(file);
    const porNombre = extraerDeNombre(file.name);
    let det = opts.useGemini === false ? null : await intentarGemini(opts.backendUrl, b64, file.name);
    if (!det) {
      const yaTieneDatos = !!(porNombre.cuit && porNombre.fechaReal);
      det = await extraerConPDFyTesseract(file, yaTieneDatos);
    }
    const cuit = det.cuit || porNombre.cuit || '';
    const nroEstab = (det.nroEstab !== '' && det.nroEstab != null) ? String(det.nroEstab) : porNombre.nroEstab;
    const fechaReal = det.fechaReal || porNombre.fechaReal || '';
    const resultado = det.resultado || porNombre.resultado || '';
    const motivoFallida = det.motivoFallida || porNombre.motivoFallida || '';
    const m = buscarVisitaCandidata(opts.visitas || [], cuit, nroEstab);
    return {
      base64: b64,
      source: det.source || 'nombre',
      cuit: cuit,
      nroEstab: nroEstab,
      fechaReal: fechaReal,
      resultado: resultado,
      motivoFallida: motivoFallida,
      match: m.match,
      candidatos: m.candidatos
    };
  }

  function resetGeminiCache() { geminiDisponible = null; }

  const API = {
    leerBase64, extraerCuit, extraerEstab, extraerFechaISO, extraerResultado,
    extraerDeNombre, buscarVisitaCandidata, analizarPDF, resetGeminiCache
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SegOCR = API;
})(typeof window !== 'undefined' ? window : globalThis);
