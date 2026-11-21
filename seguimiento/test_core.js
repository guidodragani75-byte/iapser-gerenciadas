// Ejecutar: node seguimiento/test_core.js
const assert = require('assert');
const C = require('./core.js');
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
  // reprogramada y luego efectiva
  assert.strictEqual(C.estadoVisita([I({ resultado: 'Fallida', reprograma: 'Si' }), { n: 2, fechaAgendada: '2026-12-10' }]), E.AGENDADA);
});
t('solo cuenta para el objetivo con PDF', () => {
  assert.ok(C.cuentaObjetivo(E.EFECTIVA) && C.cuentaObjetivo(E.FALLIDA_CERRADA));
  assert.ok(!C.cuentaObjetivo(E.EFECTIVA_SIN_DOC) && !C.cuentaObjetivo(E.AGENDADA) && !C.cuentaObjetivo(E.FALLIDA_REPROGRAMAR));
});
t('validaciones', () => {
  assert.ok(C.validarIntento({ resultado: 'Efectiva' }, '2026-12-01').length > 0);                      // sin fecha real
  assert.ok(C.validarIntento({ resultado: 'Efectiva', fechaReal: '2027-01-01' }, '2026-12-01').length > 0); // futura
  assert.ok(C.validarIntento({ resultado: 'Fallida', fechaReal: '2026-11-30' }, '2026-12-01').length >= 2); // sin motivo/reprograma
  assert.strictEqual(C.validarIntento({ resultado: 'Fallida', fechaReal: '2026-11-30', motivo: 'x', reprograma: 'No' }, '2026-12-01').length, 0);
  assert.ok(C.requiereAdjunto({ resultado: 'Fallida', reprograma: 'No' }) && !C.requiereAdjunto({ resultado: 'Fallida', reprograma: 'Si' }));
  assert.ok(C.esPDF({ name: 'a.PDF', type: 'application/pdf' }) && !C.esPDF({ name: 'a.jpg', type: 'image/jpeg' }) && !C.esPDF({ name: 'a.pdf.exe', type: '' }));
});
t('fecha real distinta a la agendada es válida', () => {
  assert.strictEqual(C.validarIntento({ fechaAgendada: '2026-11-20', resultado: 'Efectiva', fechaReal: '2026-11-25', adjunto: 'https://d' }, '2026-12-01').length, 0);
});
t('resumen: plazos por etapa, vencidas y objetivo con histórico', () => {
  const base = D.visitas.slice(0, 5).map((v, i) => Object.assign({}, v, { planificacion: ['Etapa 1', 'Etapa 1 - Urgente', 'Etapa 2', 'Etapa 2', 'Etapa 1'][i], fechaMax: '2026-12-15' }));
  const ints = { [base[0].id]: [{ n: 1, fechaAgendada: '2026-11-10', fechaReal: '2026-11-12', resultado: 'Efectiva', adjunto: 'https://d' }] };
  const vs = C.armarVisitas(base, ints, '2026-12-20');
  assert.strictEqual(vs[0].plazo, '2027-01-31');
  assert.strictEqual(vs[1].plazo, '2026-12-15');     // urgente = su fecha máxima
  assert.strictEqual(vs[2].plazo, '2027-04-30');
  assert.ok(vs[1].vencida && !vs[2].vencida && !vs[0].vencida);
  const r = C.resumen(vs, D.historico, '2026-12-20');
  const conDoc = D.historico.filter(h => h.documentoAdjunto).length;
  assert.strictEqual(r.objetivoTotal, 1 + conDoc);
  assert.strictEqual(r.agendadasMes['2026-11'], 1);
});
t('indicadores originales: U1 (altas), U2 (residual), U3 (consolidado)', () => {
  const emerg = D.visitas.filter(v => v.cohorte === 'Emergente').slice(0, 2);
  const resid = D.visitas.filter(v => v.cohorte === 'Residual').slice(0, 3);
  const ints = {
    [emerg[0].id]: [{ n: 1, fechaReal: '2026-11-12', resultado: 'Efectiva', adjunto: 'https://d' }],
    [emerg[1].id]: [{ n: 1, fechaReal: '2026-11-13', resultado: 'Fallida', reprograma: 'No', motivo: 'x', adjunto: 'https://d' }],
    [resid[0].id]: [{ n: 1, fechaReal: '2026-11-14', resultado: 'Efectiva', adjunto: 'https://d' }]
  };
  const vs = C.armarVisitas(D.visitas, ints, '2026-11-21');
  const I = C.indicadoresOriginales(vs, D.historico, '2026-11-21');
  const hEf = D.historico.filter(h => h.documentoAdjunto && h.resultadoVisita === 'Efectiva').length;
  const hFa = D.historico.filter(h => h.documentoAdjunto && h.resultadoVisita !== 'Efectiva').length;
  assert.strictEqual(I.u1.efectivas, hEf + 1);
  assert.strictEqual(I.u1.fallidas, hFa + 1);
  assert.strictEqual(I.u1.metaAcum, 300);
  assert.strictEqual(I.u1.trimestres[0].meta, 300);
  assert.strictEqual(I.u1.trimestres[0].efectivas, hEf + 1);
  assert.strictEqual(I.u2.total, 1341);
  assert.strictEqual(I.u2.realizadas, 1);
  assert.strictEqual(I.u2.pendientes, 1340);
  assert.strictEqual(I.u2.tecnicas + I.u2.especiales, 1341);
  assert.strictEqual(I.u2.mesesRestantes, 3);
  assert.strictEqual(I.u2.burn.find(x => x.mes === '2026-11').real, 1340);
  assert.strictEqual(I.u3.realizadas, hEf + 1 + hFa + 1 + 1);
  assert.strictEqual(I.u3.plan, 1200 + 1341);
});
console.log('\n' + ok + ' pruebas OK');
