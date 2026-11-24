// Ejecutar: node seguimiento/test_core.js
const assert = require('assert');
const C = require('./core.js');
const OCR = require('./ocr.js');
global.window = {};
require('./datos.js');
const D = window.SEG_DATA, E = C.ESTADOS;

let ok = 0;
const t = (n, f) => { f(); ok++; console.log('ok -', n); };

t('datos: 2480 visitas, ids únicos', () => {
  assert.strictEqual(D.visitas.length, 2480);
  assert.strictEqual(new Set(D.visitas.map(v => v.id)).size, 2480);
});
t('cohortes 1341/1139 por fecha máxima', () => {
  assert.strictEqual(D.visitas.filter(v => v.cohorte === 'Residual').length, 1341);
  assert.strictEqual(D.visitas.filter(v => v.cohorte === 'Emergente').length, 1139);
});
t('820 emergentes de la hoja mensual encontradas en la general', () => {
  assert.strictEqual(D.visitas.filter(v => v.mesEmergente).length, 820);
});
t('sin duplicados exactos fuera de obras', () => {
  const m = {};
  D.visitas.filter(v => !v.esObra).forEach(v => { const k = [v.contrato, v.nroEstab, v.tareas, v.fechaMax].join('|'); m[k] = (m[k] || 0) + 1; });
  assert.strictEqual(Object.values(m).filter(x => x > 1).length, 0);
});
t('histórico 278 (123 sep + 155 oct)', () => assert.strictEqual(D.historico.length, 278));
t('estados', () => {
  const I = (o) => Object.assign({ n: 1 }, o);
  assert.strictEqual(C.estadoVisita([]), E.SIN_AGENDAR);
  assert.strictEqual(C.estadoVisita([I({ fechaAgendada: '2026-12-01' })]), E.AGENDADA);
  assert.strictEqual(C.estadoVisita([I({ resultado: 'Efectiva', fechaReal: '2026-12-02' })]), E.EFECTIVA_SIN_DOC);
  assert.strictEqual(C.estadoVisita([I({ resultado: 'Efectiva', adjunto: 'https://x' })]), E.EFECTIVA);
  assert.strictEqual(C.estadoVisita([I({ resultado: 'Fallida', reprograma: 'Si', adjunto: 'https://x' })]), E.FALLIDA_REPROGRAMAR);
  assert.strictEqual(C.estadoVisita([I({ resultado: 'Fallida', reprograma: 'No' })]), E.FALLIDA_SIN_DOC);
  assert.strictEqual(C.estadoVisita([I({ resultado: 'Fallida', reprograma: 'No', adjunto: 'https://x' })]), E.FALLIDA_CERRADA);
  assert.strictEqual(C.estadoVisita([I({ resultado: 'Fallida', reprograma: 'Si' }), { n: 2, fechaAgendada: '2026-12-10' }]), E.AGENDADA);
});
t('solo cuenta para el objetivo con PDF', () => {
  assert.ok(C.cuentaObjetivo(E.EFECTIVA) && C.cuentaObjetivo(E.FALLIDA_CERRADA));
  assert.ok(!C.cuentaObjetivo(E.EFECTIVA_SIN_DOC) && !C.cuentaObjetivo(E.AGENDADA) && !C.cuentaObjetivo(E.FALLIDA_REPROGRAMAR));
});
t('validaciones', () => {
  assert.ok(C.validarIntento({ resultado: 'Efectiva' }, '2026-12-01').length > 0);
  assert.ok(C.validarIntento({ resultado: 'Efectiva', fechaReal: '2027-01-01' }, '2026-12-01').length > 0);
  assert.ok(C.validarIntento({ resultado: 'Fallida', fechaReal: '2026-11-30' }, '2026-12-01').length >= 2);
  assert.strictEqual(C.validarIntento({ resultado: 'Fallida', fechaReal: '2026-11-30', motivo: 'x', reprograma: 'No' }, '2026-12-01').length, 0);
  assert.ok(C.requiereAdjunto({ resultado: 'Fallida', reprograma: 'No' }) && !C.requiereAdjunto({ resultado: 'Fallida', reprograma: 'Si' }));
  assert.ok(C.esPDF({ name: 'a.PDF', type: 'application/pdf' }) && !C.esPDF({ name: 'a.jpg', type: 'image/jpeg' }) && !C.esPDF({ name: 'a.pdf.exe', type: '' }));
});
t('cruce PDFs de octubre vs Emergentes por CUIT + col. M (52 = 35 Ef + 17 Fa, con fechaReal y estado)', () => {
  const vs = C.armarVisitas(D.visitas, {}, '2026-11-21', D.historico);
  const conCruce = vs.filter(v => v.cruceOct);
  assert.strictEqual(conCruce.length, 52);
  assert.strictEqual(conCruce.filter(v => v.cruceOct.resultado === 'Efectiva').length, 35);
  assert.strictEqual(conCruce.filter(v => v.cruceOct.resultado === 'Fallida').length, 17);
  assert.strictEqual(conCruce.filter(v => v.cohorte === 'Residual').length, 0);
  // Refleja fechaReal, estado cerrado y resultadoActual en la grilla
  assert.ok(conCruce.every(v => /^2026-10-\d{2}$/.test(v.fechaReal)));
  assert.ok(conCruce.every(v => v.cerrada && !v.vencida && v.cerradaPorCruceOct));
  assert.strictEqual(conCruce.filter(v => v.estado === E.EFECTIVA).length, 35);
  assert.strictEqual(conCruce.filter(v => v.estado === E.FALLIDA_CERRADA).length, 17);
  // Sin doble conteo en el tablero consolidado (268 PDFs reales en Sep-Oct: 113 Sep + 155 Oct; 10 de Sep sin PDF)
  const T = C.tablero(vs, D.historico, '2026-11-21');
  const hConPdf = D.historico.filter(h => /^https?:\/\//i.test(h.documentoAdjunto || '')).length;
  assert.strictEqual(hConPdf, 268);
  assert.strictEqual(T.consolidado.realizadas, hConPdf);
  assert.strictEqual(T.emergentes.realizadas, hConPdf);
  assert.strictEqual(T.consolidado.sinAgendar, 2480 - 52);
});
t('tablero unificado: Consolidado (100 Sep-Oct, 500 Nov+) = Emergentes (100) + Residuales (400)', () => {
  const emerg = D.visitas.filter(v => v.cohorte === 'Emergente').slice(0, 2);
  const resid = D.visitas.filter(v => v.cohorte === 'Residual').slice(0, 3);
  const ints = {
    [emerg[0].id]: [{ n: 1, fechaAgendada: '2026-11-10', fechaReal: '2026-11-12', resultado: 'Efectiva', adjunto: 'https://d' }],
    [emerg[1].id]: [{ n: 1, fechaAgendada: '2026-11-11', fechaReal: '2026-11-13', resultado: 'Fallida', reprograma: 'No', motivo: 'x', adjunto: 'https://d' }],
    [resid[0].id]: [{ n: 1, fechaAgendada: '2026-11-14', fechaReal: '2026-11-14', resultado: 'Efectiva', adjunto: 'https://d' }]
  };
  const vs = C.armarVisitas(D.visitas, ints, '2026-11-21', D.historico);
  const T = C.tablero(vs, D.historico, '2026-11-21');
  const hEf = D.historico.filter(h => /^https?:\/\//i.test(h.documentoAdjunto || '') && h.resultadoVisita === 'Efectiva').length;
  const hFa = D.historico.filter(h => /^https?:\/\//i.test(h.documentoAdjunto || '') && h.resultadoVisita !== 'Efectiva').length;
  // Emergentes
  assert.strictEqual(T.emergentes.metaMes, 100);
  assert.strictEqual(T.emergentes.efectivas, hEf + 1);
  assert.strictEqual(T.emergentes.fallidas, hFa + 1);
  assert.strictEqual(T.emergentes.realizadas, hEf + hFa + 2);
  assert.strictEqual(T.emergentes.trimestres[0].total, hEf + hFa + 2);
  assert.strictEqual(T.emergentes.cruceOct.total, 52);
  // Residuales
  assert.strictEqual(T.residuales.metaMes, 400);
  assert.strictEqual(T.residuales.total, 1341);
  assert.strictEqual(T.residuales.realizadas, 1);
  assert.strictEqual(T.residuales.pendientes, 1340);
  assert.strictEqual(T.residuales.burn[0].teorico, 1341 - 400);
  assert.strictEqual(T.residuales.burn[0].real, 1340);
  // Consolidado = Emergentes + Residuales
  assert.strictEqual(T.consolidado.metaMesVigente, 500);
  assert.strictEqual(T.consolidado.realizadas, T.emergentes.realizadas + T.residuales.realizadas);
  assert.strictEqual(T.consolidado.planTotal, 1200 + 1341);
  assert.strictEqual(T.consolidado.realizadas + T.consolidado.pendientesPlan, T.consolidado.planTotal);
  assert.strictEqual(T.consolidado.agendadasMesActual, 3);
  assert.strictEqual(T.consolidado.meses.find(m => m.mes === '2026-09').meta, 100);
  assert.strictEqual(T.consolidado.meses.find(m => m.mes === '2026-10').meta, 100);
  assert.strictEqual(T.consolidado.meses.find(m => m.mes === '2026-11').meta, 500);
});
t('OCR helpers: extracción desde nombre y texto + match por CUIT y Estab (col. M)', () => {
  const m = OCR.extraerDeNombre('30599884145_E2_20261118_FALLIDA_CERRADO.pdf');
  assert.strictEqual(m.cuit, '30599884145');
  assert.strictEqual(m.nroEstab, '2');
  assert.strictEqual(m.fechaReal, '2026-11-18');
  assert.strictEqual(m.resultado, 'Fallida');
  assert.strictEqual(m.motivoFallida, 'Establecimiento cerrado');
  const cand = OCR.buscarVisitaCandidata(D.visitas, '30599884145', '2');
  assert.ok(cand.match && cand.match.cuit === '30599884145' && String(cand.match.nroEstab) === '2');
});
t('filtros nuevos: vencimiento (vencida / mes_actual / otro_mes) y corte predeterminado >= May-2027', () => {
  const vs = C.armarVisitas(D.visitas, {}, '2026-11-21', D.historico);
  const nVenc = vs.filter(v => v.catVenc === 'vencida').length;
  const nMes = vs.filter(v => v.catVenc === 'mes_actual').length;
  const nOtro = vs.filter(v => v.catVenc === 'otro_mes').length;
  const nCerr = vs.filter(v => v.catVenc === 'cerrada').length;
  assert.strictEqual(nVenc + nMes + nOtro + nCerr, vs.length);
  assert.strictEqual(nCerr, 52);
  assert.ok(nVenc > 0 && nMes > 0 && nOtro > 0);
  // Corte >= 2027-05-01
  const prueba = [
    { id: '1', fechaMax: '2027-04-30' },
    { id: '2', fechaMax: '2027-05-01' },
    { id: '3', fechaMax: '2027-08-15' }
  ];
  assert.strictEqual(C.filtrarCorteFuturo(prueba, true).length, 1);
  assert.strictEqual(C.filtrarCorteFuturo(prueba, false).length, 3);
});
t('cumplimiento en plazo y participacion en los 3 universos (consolidado / emergentes / residuales)', () => {
  const vs = C.armarVisitas(D.visitas, {}, '2026-11-21', D.historico);
  const cCons = C.cumplimientoYParticipacion(vs, D.historico, 'consolidado', '2026-11-21');
  const cEmer = C.cumplimientoYParticipacion(vs, D.historico, 'emergentes', '2026-11-21');
  const cRes  = C.cumplimientoYParticipacion(vs, D.historico, 'residuales', '2026-11-21');
  // Consolidado = Emergentes + Residuales
  assert.strictEqual(cCons.enTermino, cEmer.enTermino + cRes.enTermino);
  assert.strictEqual(cCons.vencidas, cEmer.vencidas + cRes.vencidas);
  assert.strictEqual(cCons.efectivas, cEmer.efectivas + cRes.efectivas);
  assert.strictEqual(cCons.fallidas, cEmer.fallidas + cRes.fallidas);
  assert.strictEqual(cCons.totalCerradas, 268);
  assert.strictEqual(cCons.vencidas, 1765);
  assert.strictEqual(cEmer.vencidas, 424);
  assert.strictEqual(cRes.vencidas, 1341);
  assert.strictEqual(cEmer.mesesActivos.length, 2); // Sep 26, Oct 26
});
t('vencidas estrictamente por columna R (fechaMax), incluso en Etapa 1 y Etapa 2', () => {
  const vs = C.armarVisitas([
    { id: 'a', cohorte: 'Emergente', planificacion: 'Etapa 1', fechaMax: '2026-10-06', tareas: 'Visita Tecnica' },
    { id: 'b', cohorte: 'Residual',  planificacion: 'Etapa 2', fechaMax: '2026-03-05', tareas: 'Visita Tecnica' },
    { id: 'c', cohorte: 'Emergente', planificacion: 'Etapa 2', fechaMax: '2026-12-10', tareas: 'Visita de Obra' }
  ], {}, '2026-11-24', []);
  assert.strictEqual(vs[0].plazo, '2026-10-06');
  assert.strictEqual(vs[0].vencida, true);
  assert.strictEqual(vs[1].plazo, '2026-03-05');
  assert.strictEqual(vs[1].vencida, true);
  assert.strictEqual(vs[2].plazo, '2026-12-10');
  assert.strictEqual(vs[2].vencida, false);
  assert.strictEqual(vs[2].catVenc, 'otro_mes');
});
t('filtros por tarea: subtareasLimpias, catalogoTareas y coincideTarea', () => {
  const vs = C.armarVisitas(D.visitas, {}, '2026-11-24', D.historico);
  const cat = C.catalogoTareas(vs);
  assert.ok(cat.length >= 15 && cat.length <= 25);
  // Sin códigos numéricos sueltos de siniestros
  assert.ok(cat.every(t => !/^\d+$/.test(t.label)));
  // Coincidencia insensible a tildes y mayúsculas sobre subtareas combinadas con '//'
  assert.strictEqual(vs.filter(v => C.coincideTarea(v, 'capacitacion basica')).length, 594);
  assert.strictEqual(vs.filter(v => C.coincideTarea(v, 'Visita de Obra')).length, 139);
  // INV. AT agrupa las 8 filas estándar + 1 fila 'INV. AT 00163302//00163304...'
  assert.strictEqual(vs.filter(v => C.coincideTarea(v, 'INV. AT')).length, 9);
  const vt = cat.find(t => t.key === 'visita tecnica');
  assert.strictEqual(vt.total, 1554);
  assert.strictEqual(vt.cerradas + vt.pendientes, vt.total);
});
t('errores: misma tarea para CUIT + Estab entre año pasado (2025) y este año (2026)', () => {
  const vs = C.armarVisitas(D.visitas, {}, '2026-11-22', D.historico);
  const anios = vs.filter(v => v.errores && v.errores.indexOf('misma_tarea_anios') >= 0);
  const todos = vs.filter(v => v.revisarDuplicada);
  assert.strictEqual(anios.length, 8);   // 4 pares: Diaz Camposano, Ignacio Meschede, Celerity E2, Quinta Raiz
  assert.strictEqual(todos.length, 14);  // 8 inter-anio + 6 duplicadas mismo anio (Garcia, Barbieri, Baires)
  // Verificar que Quinta Raiz (que antes no se detectaba por tener tareas adicionales) ahora si entra
  assert.ok(anios.some(v => v.cuit === '30719048265' && v.tareasRepetidasAnio.indexOf('visita tecnica') >= 0));
  assert.ok(anios.some(v => v.cuit === '30530481545' && v.tareasRepetidasAnio.indexOf('capacitacion basica') >= 0));
});
t('validador de columnas: esquema exacto, columnas agregadas, renombradas, remapeo manual y duplicadas', () => {
  // 1. Esquema exacto A..W
  const vOk = C.validarColumnasPadron(C.COLUMNAS_PADRON);
  assert.strictEqual(vOk.ok, true);
  assert.strictEqual(vOk.coincidencias.length, 23);
  assert.strictEqual(vOk.faltantes.length, 0);
  assert.strictEqual(vOk.agregadas.length, 0);

  // 2. Columnas nuevas agregadas + auxiliar conocida + cambio de tildes
  const hdrs2 = C.COLUMNAS_PADRON.slice();
  hdrs2[9] = 'Teléfono'; // cambio de formato/tilde
  hdrs2.push('Planificacion', 'Prioridad Nueva', 'Cuit'); // auxiliar, nueva, duplicada
  const v2 = C.validarColumnasPadron(hdrs2);
  assert.strictEqual(v2.ok, true);
  assert.strictEqual(v2.cambiosFormato.length, 1);
  assert.strictEqual(v2.agregadas.length, 2); // Planificacion + Prioridad Nueva (Cuit duplicada queda como agregada/duplicada)
  assert.strictEqual(v2.nuevasDesconocidas.length, 1);
  assert.strictEqual(v2.nuevasDesconocidas[0].nombre, 'Prioridad Nueva');
  assert.strictEqual(v2.duplicadas.length, 1);

  // 3. Columna obligatoria renombrada (Fecha Programada -> Fecha Maxima en col. R) bloquea hasta remapear
  const hdrs3 = C.COLUMNAS_PADRON.slice();
  hdrs3[17] = 'Fecha Maxima';
  const v3 = C.validarColumnasPadron(hdrs3);
  assert.strictEqual(v3.ok, false);
  assert.strictEqual(v3.faltantesObligatorias.length, 1);
  assert.strictEqual(v3.faltantesObligatorias[0].esperada, 'Fecha Programada');
  assert.strictEqual(v3.faltantesObligatorias[0].sugerencias[0].idx, 17);
  // Al remapear manualmente la columna 17 -> OK
  const v3Map = C.validarColumnasPadron(hdrs3, { 'Fecha Programada': 17 });
  assert.strictEqual(v3Map.ok, true);
  assert.strictEqual(v3Map.indice['Fecha Programada'], 17);
});
t('parsearFilasPadron + compararPadron: fechas seriales Excel, altas, bajas con gestion y modificadas', () => {
  const actuales = [
    { id: '20111111111|1|visita tecnica|2026-10-06', cuit: '20111111111', empleador: 'EMPRESA A', contrato: '100', establecimiento: 'Central', localidad: 'CABA', provincia: 'CABA', domicilio: 'Av 1', nroEstabIAPART: '1', nroEstab: '1', programa: 'P', trabajadores: '10', preventor: 'Prev', tareas: 'Visita Tecnica', fechaMax: '2026-10-06', planificacion: 'Etapa 1', ambito: 'CABA', departamento: '', obsCS: '', obsIAPSER: '', cohorte: 'Emergente' },
    { id: '20222222222|1|visita de obra|2026-11-10', cuit: '20222222222', empleador: 'EMPRESA B', contrato: '200', establecimiento: 'Obra 1', localidad: 'Rosario', provincia: 'Santa Fe', domicilio: 'Calle 2', nroEstabIAPART: '1', nroEstab: '1', programa: 'P', trabajadores: '5', preventor: 'Prev', tareas: 'Visita de Obra', fechaMax: '2026-11-10', planificacion: 'Etapa 2', ambito: 'Santa Fe', departamento: '', obsCS: '', obsIAPSER: '', cohorte: 'Emergente' },
    { id: '20333333333|2|capacitacion basica|2026-09-01', cuit: '20333333333', empleador: 'EMPRESA BAJA', contrato: '300', establecimiento: 'Suc 2', localidad: 'Parana', provincia: 'Entre Rios', domicilio: 'Calle 3', nroEstabIAPART: '2', nroEstab: '2', programa: 'P', trabajadores: '3', preventor: 'Prev', tareas: 'CAPACITACIÓN BASICA', fechaMax: '2026-09-01', planificacion: 'Etapa 1', ambito: 'Entre Rios', departamento: '', obsCS: '', obsIAPSER: '', cohorte: 'Residual' }
  ];
  const rows = [
    C.COLUMNAS_PADRON,
    // Sin cambios (fecha como número serial Excel: 46301 = 2026-10-06)
    ['20111111111', 'EMPRESA A', '100', 'Central', 'CABA', 'CABA', '1000', 'Av 1', 'NULL', 'NULL', 'NULL', '1', '1', 'P', '10', 'Prev', 'Visita Tecnica', 46301, '', '', '', '', ''],
    // Modificada (cambió fecha máxima 10/11/2026 -> 25/11/2026, debe heredar Etapa 2)
    ['20222222222', 'EMPRESA B', '200', 'Obra 1', 'Rosario', 'Santa Fe', '2000', 'Calle 2', 'NULL', 'NULL', 'NULL', '1', '1', 'P', '5', 'Prev', 'Visita de Obra', '25/11/2026', '', '', '', '', ''],
    // Alta nueva
    ['20444444444', 'EMPRESA NUEVA', '400', 'Planta', 'Cordoba', 'Cordoba', '5000', 'Ruta 9', 'NULL', 'NULL', 'NULL', '1', '1', 'P', '20', 'Prev', 'Verosimilitud RGRL', '15/12/2026', '', '', '', '', '']
  ];
  const val = C.validarColumnasPadron(rows[0]);
  const parsed = C.parsearFilasPadron(rows, val, actuales);
  assert.strictEqual(parsed.visitas.length, 3);
  assert.strictEqual(parsed.visitas[0].fechaMax, '2026-10-06');
  assert.strictEqual(parsed.visitas[1].planificacion, 'Etapa 2');
  const ints = { '20333333333|2|capacitacion basica|2026-09-01': [{ n: 1, fechaAgendada: '2026-11-20' }] };
  const diff = C.compararPadron(actuales, parsed.visitas, ints, {});
  assert.strictEqual(diff.sinCambios.length, 1);
  assert.strictEqual(diff.modificadas.length, 1);
  assert.strictEqual(diff.modificadas[0].cambioId, true);
  assert.strictEqual(diff.altas.length, 1);
  assert.strictEqual(diff.bajas.length, 1);
  assert.strictEqual(diff.bajasConGestion.length, 1);
  assert.strictEqual(C.mesEmergenteActual('2026-11-24'), 'nov26');
  assert.strictEqual(C.mesEmergenteActual('2027-01-05'), 'ene27');
});
t('logistica: etiquetas dinamicas, normalizacion de ambito y agrupacion por ambito/depto', () => {
  const vs = C.armarVisitas(D.visitas, {}, '2026-11-24', D.historico).filter(v => !v.cerrada);
  const res = C.resumenEtiquetas(vs, '2026-11-24');
  const get = id => res.find(x => x.id === id).count;
  assert.strictEqual(get('etapa1_all'), 1369);
  assert.strictEqual(get('venc_prioritarias'), 108);
  assert.strictEqual(get('at_ep_venc'), 16);
  assert.strictEqual(get('pese_363_venc'), 26);
  assert.strictEqual(get('obras_venc'), 59);
  assert.strictEqual(C.filtrarPorEtiqueta(vs, 'obras_venc', '2026-11-24').length, 59);
  // Normalizacion de Ambito unifica MISIONES + Misiones y preserva GBA
  assert.strictEqual(C.normAmbito('MISIONES'), 'Misiones');
  assert.strictEqual(C.normAmbito('GBA'), 'GBA');
  const geo = C.agruparLogistica(vs);
  // Sin duplicados de Misiones ni San Juan ni Santa Fe
  const misiones = geo.ambitos.filter(a => /misiones/i.test(a.ambito));
  assert.strictEqual(misiones.length, 1);
  assert.strictEqual(misiones[0].total, 152); // 144 + 8
  // Suma de ambitos = total pendientes
  assert.strictEqual(geo.ambitos.reduce((s, a) => s + a.total, 0), vs.length);
  assert.strictEqual(geo.zonas.reduce((s, z) => s + z.total, 0), vs.length);
  // GBA usa departamento (ej. Vicente López)
  const gbaZonas = geo.zonas.filter(z => z.ambKey === 'gba');
  assert.ok(gbaZonas.some(z => z.zona === 'Vicente López' && z.esDepto));
});
console.log('\n' + ok + ' pruebas OK');
