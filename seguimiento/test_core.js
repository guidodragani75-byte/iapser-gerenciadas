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
t('cruce PDFs de octubre vs Emergentes por CUIT + col. M (52 = 35 Ef + 17 Fa)', () => {
  const vs = C.armarVisitas(D.visitas, {}, '2026-11-21', D.historico);
  const conCruce = vs.filter(v => v.cruceOct);
  assert.strictEqual(conCruce.length, 52);
  assert.strictEqual(conCruce.filter(v => v.cruceOct.resultado === 'Efectiva').length, 35);
  assert.strictEqual(conCruce.filter(v => v.cruceOct.resultado === 'Fallida').length, 17);
  // Ninguna residual marcada por el cruce de emergentes
  assert.strictEqual(conCruce.filter(v => v.cohorte === 'Residual').length, 0);
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
  const hEf = D.historico.filter(h => h.documentoAdjunto && h.resultadoVisita === 'Efectiva').length;
  const hFa = D.historico.filter(h => h.documentoAdjunto && h.resultadoVisita !== 'Efectiva').length;
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
console.log('\n' + ok + ' pruebas OK');
