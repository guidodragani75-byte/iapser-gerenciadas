/* Módulo Seguimiento Consultora - UI. Depende de core.js (SegCore), ocr.js (SegOCR) y datos.js (SEG_DATA). */
(function () {
  'use strict';
  const C = window.SegCore, E = C.ESTADOS, OCR = window.SegOCR;
  const D = window.SEG_DATA || { visitas: [], historico: [] };
  const LS_INT = 'SEG_INTENTOS_V1', LS_COLA = 'SEG_COLA_V1', LS_URL = 'SEG_URL_V1', LS_USER = 'SEG_USER_V1', LS_PADRON = 'SEG_PADRON_V1';
  const MOTIVOS = ['Establecimiento cerrado', 'No atiende nadie / sin responsable', 'Domicilio inexistente o incorrecto',
    'Empleador sin personal', 'Rechazo de la visita', 'Dificultad de acceso / clima', 'Otro'];
  const PAGE = 100;

  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);

  let INTENTOS = load(LS_INT, {});
  let COLA = load(LS_COLA, []);
  let PADRON_LOCAL = load(LS_PADRON, null);
  let VISITAS_TODAS = [];
  let VISITAS = [];
  let vista = 'tablero', subTab = 'consolidado', pagina = 1;
  let chMain = null, chSec = null, chPlazo = null, chPart = null;
  let partFiltro = 'all'; // 'all' | 'YYYY-MM'
  let ultimoCP = null;
  let geminiActivo = null; // null = sin verificar, true/false según backend
  const F = { cohorte: '', plan: '', ambito: '', estado: '', mes: '', venc: '', tarea: '', cruceOct: '', errTipo: '', q: '', sub: '', excluirMay27: true };
  const LOG = { etiqueta: '', ambito: '', zona: '', soloPendientes: true, orden: 'prioridad', q: '', verTodasZonas: false, pagina: 1 };

  const TABS = [['tablero', 'Tablero'], ['logistica', '🧭 Logística'], ['todas', 'Todas'], ['agendadas', 'Programadas'],
    ['realizadas', 'Realizadas'], ['pendientes', 'Pendientes'], ['revisar', 'Errores / A revisar']];

  function baseVisitas() {
    return (PADRON_LOCAL && Array.isArray(PADRON_LOCAL.visitas) && PADRON_LOCAL.visitas.length) ? PADRON_LOCAL.visitas : D.visitas;
  }

  function recalcular() {
    VISITAS_TODAS = C.armarVisitas(baseVisitas(), INTENTOS, C.hoyISO(), D.historico);
    VISITAS = C.filtrarCorteFuturo(VISITAS_TODAS, F.excluirMay27);
  }

  const enVista = {
    todas: () => true,
    agendadas: v => v.estado === E.AGENDADA,
    realizadas: v => !!v.resultadoActual,
    pendientes: v => !v.cerrada,
    revisar: v => v.revisarDuplicada
  };

  function pillEstado(s) {
    const cls = { [E.SIN_AGENDAR]: 'p-sin', [E.AGENDADA]: 'p-ag', [E.EFECTIVA]: 'p-ok', [E.EFECTIVA_SIN_DOC]: 'p-warn',
      [E.FALLIDA_REPROGRAMAR]: 'p-warn', [E.FALLIDA_CERRADA]: 'p-bad', [E.FALLIDA_SIN_DOC]: 'p-warn' }[s] || 'p-sin';
    return `<span class="pill ${cls}">${esc(s)}</span>`;
  }

  function filtrar() {
    const q = C.sinTildes(F.q).toLowerCase();
    return VISITAS.filter(v => {
      if (vista !== 'tablero' && enVista[vista] && !enVista[vista](v)) return false;
      if (vista === 'realizadas' && F.sub) {
        if (v.resultadoActual !== F.sub) return false;
      }
      if (F.cohorte && v.cohorte !== F.cohorte) return false;
      if (F.plan && v.planificacion !== F.plan) return false;
      if (F.ambito && C.normAmbito(v.ambito || v.provincia) !== F.ambito) return false;
      if (F.estado && v.estado !== F.estado) return false;
      if (F.mes && C.mesDe(v.fechaMax) !== F.mes) return false;
      if (F.venc && v.catVenc !== F.venc) return false;
      if (F.tarea && !C.coincideTarea(v, F.tarea)) return false;
      if (vista === 'revisar' && F.errTipo && (!v.errores || v.errores.indexOf(F.errTipo) < 0)) return false;
      if (F.cruceOct === 'con' && !v.cruceOct) return false;
      if (F.cruceOct === 'Efectiva' && !(v.cruceOct && v.cruceOct.resultado === 'Efectiva')) return false;
      if (F.cruceOct === 'Fallida' && !(v.cruceOct && v.cruceOct.resultado === 'Fallida')) return false;
      if (q) {
        const h = C.sinTildes([v.cuit, v.empleador, v.contrato, v.establecimiento, v.localidad, v.tareas, v.nroEstab].join(' ')).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    }).sort((a, b) => {
      if (vista === 'revisar') {
        const ka = `${a.cuit}|${String(a.nroEstab).padStart(4, '0')}|${a.fechaMax || '9'}`;
        const kb = `${b.cuit}|${String(b.nroEstab).padStart(4, '0')}|${b.fechaMax || '9'}`;
        return ka.localeCompare(kb);
      }
      return (a.fechaMax || '9').localeCompare(b.fechaMax || '9');
    });
  }

  const uniq = k => Array.from(new Set(baseVisitas().map(v => k === 'ambito' ? C.normAmbito(v.ambito || v.provincia) : v[k]).filter(Boolean))).sort();
  const opts = (arr, sel, all) => `<option value="">${all}</option>` + arr.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const pct = (a, b) => b ? Math.round(a * 100 / b) + '%' : '–';
  const pct1 = x => (Math.round(x * 1000) / 10).toLocaleString('es-AR') + '%';
  const n1 = x => (Math.round(x * 10) / 10).toLocaleString('es-AR');

  function renderTabs() {
    const excluidas = VISITAS_TODAS.length - C.filtrarCorteFuturo(VISITAS_TODAS, true).length;
    $('tabs').innerHTML = TABS.map(([k, n]) => {
      const c = (k === 'tablero' || k === 'logistica') ? '' : `<span class="badge">${VISITAS.filter(enVista[k]).length}</span>`;
      return `<button class="${k === vista ? 'on' : ''}" onclick="App.ir('${k}')">${n}${c}</button>`;
    }).join('') + `<label class="cut-toggle" title="Predeterminado: excluye visitas con fecha desde Mayo 2027 inclusive en adelante"><input type="checkbox" ${F.excluirMay27 ? 'checked' : ''} onchange="App.toggleMay27(this.checked)"> Excluir ≥ May-2027${excluidas ? ` (${excluidas})` : ''}</label>`;
  }

  /* ---------- TABLERO UNIFICADO (Consolidado 500 | Emergentes 100 | Residuales 400) ---------- */
  function destruirCharts() {
    if (chMain) { chMain.destroy(); chMain = null; }
    if (chSec) { chSec.destroy(); chSec = null; }
    if (chPlazo) { chPlazo.destroy(); chPlazo = null; }
    if (chPart) { chPart.destroy(); chPart = null; }
  }

  function bloqueCumplimientoHTML(cp, tituloScope) {
    const okBadge = cp.vencidas === 0
      ? `<span class="pill p-ok">✓ 0 vencidas (${pct1(cp.pctEnTermino)} en término)</span>`
      : `<span class="pill p-bad">⚠ ${cp.vencidas} vencidas (${pct1(cp.pctEnTermino)} en término)</span>`;
    const activeBtns = `<button class="${partFiltro === 'all' ? 'on' : ''}" onclick="App.partMes('all')">Acumulado</button>` +
      cp.mesesActivos.map(m => `<button class="${partFiltro === m.key ? 'on' : ''}" onclick="App.partMes('${esc(m.key)}')">${esc(m.label)}</button>`).join('');
    const resumenMeses = cp.series.filter(x => (x.enTermino + x.vencidas) > 0).slice(0, 4)
      .map(x => `<span>${esc(x.label)}: <b>${x.enTermino}</b> en término · <b class="${x.vencidas ? 'venc' : ''}">${x.vencidas}</b> venc.</span>`).join('');
    return `<div class="grid2" style="margin-top:16px">
      <div class="exec-card">
        <div class="exec-head">
          <div><div class="exec-title">Cumplimiento en Plazo y Visitas Vencidas (${esc(tituloScope)})</div>
          <div class="exec-sub">Visitas ejecutadas en término vs visitas vencidas por período mensual</div></div>
          ${okBadge}
        </div>
        <div style="height:230px"><canvas id="chPlazo"></canvas></div>
        <div class="exec-foot">
          <div style="display:flex;gap:14px;flex-wrap:wrap">${resumenMeses || 'Sin actividad registrada aún'}</div>
          <div>Total ${esc(tituloScope)}: <b>${cp.enTermino} en término</b> · <b class="${cp.vencidas ? 'venc' : ''}">${cp.vencidas} vencidas</b> (${pct1(cp.pctEnTermino)})</div>
        </div>
      </div>
      <div class="exec-card">
        <div class="exec-head">
          <div><div class="exec-title">Participación: Fallidas vs Efectivas (${esc(tituloScope)})</div>
          <div class="exec-sub">Distribución de visitas efectivas y fallidas cerradas con PDF</div></div>
          <div class="seg-btns" id="partBtns">${activeBtns}</div>
        </div>
        <div style="height:230px;position:relative"><canvas id="chPart"></canvas><div id="partEmpty" class="note" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center">Sin visitas cerradas c/PDF todavía en ${esc(tituloScope)}.</div></div>
        <div class="exec-foot" id="partFoot"></div>
      </div>
    </div>`;
  }

  function renderChartParticipacion(cp, tituloScope) {
    if (chPart) { chPart.destroy(); chPart = null; }
    let ef = cp.efectivas, fa = cp.fallidas;
    if (partFiltro !== 'all') {
      const m = cp.mesesActivos.find(x => x.key === partFiltro);
      if (m) { ef = m.efectivas; fa = m.fallidas; }
    }
    const tot = ef + fa;
    const pEf = tot ? pct1(ef / tot) : '0%';
    const pFa = tot ? pct1(fa / tot) : '0%';
    const foot = $('partFoot');
    if (foot) {
      foot.innerHTML = `<span>Efectivas: <b style="color:var(--teal)">${ef} (${pEf})</b></span>
        <span>Fallidas: <b style="color:var(--amber)">${fa} (${pFa})</b></span>
        <span>Cerradas c/PDF: <b>${tot}</b> | A reprogramar: <b>${cp.fallidasReprog}</b></span>`;
    }
    const emptyEl = $('partEmpty');
    if (!tot) {
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (!window.Chart || !$('chPart')) return;
    chPart = new Chart($('chPart'), {
      type: 'doughnut',
      data: {
        labels: [`Efectivas (${tituloScope})`, `Fallidas (${tituloScope})`],
        datasets: [{ data: [ef, fa], backgroundColor: ['#0F4C5C', '#A8470A'], borderWidth: 2, borderColor: '#fff' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: { legend: { position: 'right', labels: { usePointStyle: true, padding: 14 } } }
      }
    });
  }

  function renderChartsCumplimiento(cp, tituloScope) {
    ultimoCP = { cp, tituloScope };
    if (window.Chart && $('chPlazo')) {
      chPlazo = new Chart($('chPlazo'), {
        type: 'bar',
        data: {
          labels: cp.series.map(x => x.label),
          datasets: [
            { label: 'Visitas en Término (Ejecutadas)', data: cp.series.map(x => x.enTermino), backgroundColor: '#0F4C5C', maxBarThickness: 22 },
            { label: 'Visitas Vencidas (Fuera de Plazo)', data: cp.series.map(x => x.vencidas), backgroundColor: '#A8470A', maxBarThickness: 22 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } },
          plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 10 } } }
        }
      });
    }
    renderChartParticipacion(cp, tituloScope);
  }

  function renderTablero() {
    destruirCharts();
    const T = C.tablero(VISITAS, D.historico, C.hoyISO());
    const co = T.consolidado, em = T.emergentes, re = T.residuales;
    const card = (k, v, s, click) => `<div class="card${click ? ' click' : ''}"${click ? ` onclick="${click}"` : ''}><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || ''}</div></div>`;

    let h = `<div class="subtabs">
      <button class="${subTab === 'consolidado' ? 'on' : ''}" onclick="App.sub('consolidado')">Consolidado <small>(Meta 500/mes)</small></button>
      <button class="${subTab === 'emergentes' ? 'on' : ''}" onclick="App.sub('emergentes')">Emergentes Mensuales <small>(Meta 100/mes)</small></button>
      <button class="${subTab === 'residuales' ? 'on' : ''}" onclick="App.sub('residuales')">Stock Residual <small>(Meta 400/mes)</small></button>
    </div>`;

    if (subTab === 'consolidado') {
      h += `<div class="hero-dual">
        <div class="hero-box" onclick="App.sub('emergentes')">
          <div class="ht"><span>Universo 1 · Emergentes Mensuales</span><span>Ver detalle →</span></div>
          <div class="hv">${em.realizadas.toLocaleString('es-AR')} <span style="font-size:14px;font-weight:400;color:var(--mut)">/ ${em.metaAnual.toLocaleString('es-AR')} (${pct1(em.pct)})</span></div>
          <div class="hs"><span>Meta: <b>${em.metaMes}/mes</b></span><span>Efectivas: <b>${em.efectivas}</b></span><span>Fallidas: <b>${em.fallidas}</b></span><span>Programadas mes: <b>${em.agendadasMesActual}</b></span></div>
        </div>
        <div class="hero-box res" onclick="App.sub('residuales')">
          <div class="ht"><span>Universo 2 · Stock Residual (&lt; oct-26)</span><span>Ver detalle →</span></div>
          <div class="hv">${re.realizadas.toLocaleString('es-AR')} <span style="font-size:14px;font-weight:400;color:var(--mut)">/ ${re.total.toLocaleString('es-AR')} (${pct1(re.pct)})</span></div>
          <div class="hs"><span>Meta: <b>${re.metaMes}/mes</b> (desde Nov-26)</span><span>Pendientes: <b>${re.pendientes.toLocaleString('es-AR')}</b></span><span>Programadas mes: <b>${re.agendadasMesActual}</b></span><span>Vencidas: <b class="${re.vencidas ? 'venc' : ''}">${re.vencidas.toLocaleString('es-AR')}</b></span></div>
        </div>
      </div>
      <div class="cards">
        ${card('Objetivo Consolidado (c/PDF)', co.realizadas.toLocaleString('es-AR'), `de ${co.planTotal.toLocaleString('es-AR')} del plan (${pct1(co.pct)}) · incluye ${co.historico.conDocumento} Sep–Oct`)}
        ${card('Meta mensual vigente (' + co.mesActual + ')', co.metaMesVigente, '100 emergentes + 400 residuales')}
        ${card('Programadas este mes', co.agendadasMesActual, `por preventor · vs ${co.metaMesVigente} (${pct(co.agendadasMesActual, co.metaMesVigente)})`)}
        ${card('Sin programar / a reprogramar', co.sinAgendar.toLocaleString('es-AR'), 'en tabla vigente')}
        ${card('Vencidas (col. R)', co.vencidas.toLocaleString('es-AR'), `${re.vencidas.toLocaleString('es-AR')} residual + ${em.vencidas.toLocaleString('es-AR')} emergente · clic para ver →`, "App.verVencidas('')")}
        ${card('Con resultado sin PDF', co.sinDocumento, 'no cuentan para el objetivo' + (co.historico.sinDocumento ? ` (${co.historico.sinDocumento} Sep–Oct)` : ''))}
      </div>
      <h2>Evolución Mensual Consolidada · Cerradas c/PDF (apiladas) y Programadas vs Meta (100 Sep–Oct · 500 Nov+)</h2>
      <div class="card" style="height:290px"><canvas id="chMain"></canvas></div>
      <div class="grid2">
        <div><h2>Resumen Consolidado por Mes</h2>
        <table><thead><tr><th>Mes</th><th>Meta</th><th>Emerg. (Ef/Fa)</th><th>Resid. (Ef/Fa)</th><th>Total c/PDF</th><th>Cumpl.</th><th>Programadas</th></tr></thead><tbody>
        ${co.meses.map(m => `<tr style="cursor:default"><td>${m.mes}</td><td>${m.meta}</td><td>${m.emTot} <span class="note">(${m.emEf}/${m.emFa})</span></td><td>${m.resTot} <span class="note">(${m.resEf}/${m.resFa})</span></td><td><b>${m.total}</b></td><td><div class="bar"><i style="width:${Math.min(100, m.total * 100 / m.meta)}%"></i></div>${pct(m.total, m.meta)}</td><td>${m.agendadas == null ? '–' : m.agendadas}</td></tr>`).join('')}
        </tbody></table></div>
        <div><h2>Por Etapa (Total Padrón)</h2>
        <table><thead><tr><th>Etapa</th><th>Meta etapa</th><th>Total</th><th>Cerradas</th><th>Avance</th><th>Sin programar</th><th>Vencidas (col. R)</th></tr></thead><tbody>
        ${co.etapas.map(b => `<tr style="cursor:default"><td>${esc(b.etapa)}</td><td>${/Urgente/.test(b.etapa) ? 'según col. R' : C.aDMY(C.CONFIG.PLAZO_ETAPA[b.etapa])}</td><td>${b.total}</td><td>${b.cerradas}</td><td><div class="bar"><i style="width:${b.total ? b.cerradas * 100 / b.total : 0}%"></i></div>${pct(b.cerradas, b.total)}</td><td>${b.sinAgendar}</td><td class="${b.vencidas ? 'venc' : ''}">${b.vencidas}</td></tr>`).join('')}
        ${co.historico.total ? `<tr style="cursor:default"><td>Histórico Sep–Oct (Emergentes)</td><td>ejecutadas</td><td>${co.historico.total}</td><td>${co.historico.conDocumento}</td><td><div class="bar"><i style="width:${co.historico.conDocumento * 100 / co.historico.total}%"></i></div>${pct(co.historico.conDocumento, co.historico.total)}</td><td>0</td><td>0</td></tr>` : ''}
        </tbody></table></div>
      </div>
      <h2>Resumen por Tarea (clic en una fila para filtrar)</h2>
      <table><thead><tr><th>Tarea</th><th>Total visitas</th><th>Cerradas c/PDF</th><th>Pendientes</th><th>Vencidas (col. R)</th></tr></thead><tbody>
      ${C.catalogoTareas(VISITAS).map(t => `<tr onclick="App.verTarea('${esc(t.key)}')"><td><b>${esc(t.label)}</b></td><td>${t.total.toLocaleString('es-AR')}</td><td>${t.cerradas.toLocaleString('es-AR')}</td><td>${t.pendientes.toLocaleString('es-AR')}</td><td class="${t.vencidas ? 'venc' : ''}">${t.vencidas.toLocaleString('es-AR')}</td></tr>`).join('')}
      </tbody></table>`;
    } else if (subTab === 'emergentes') {
      h += `<div class="cards">
        ${card('Realizadas del ciclo (c/PDF)', em.realizadas, `de ${em.metaAnual.toLocaleString('es-AR')} (${pct1(em.pct)}) · restan ${em.restanMetaAnual}`)}
        ${card('Efectivas / Fallidas', `${em.efectivas} / ${em.fallidas}`, `tasa efectividad ${pct1(em.tasaEfectividad)}`)}
        ${card('Meta acumulada a hoy', em.metaAcum, `desvío ${em.desvio >= 0 ? '+' : ''}${em.desvio} (100/mes)`)}
        ${card('Programadas este mes', em.agendadasMesActual, `meta ${em.metaMes}/mes · ${pct(em.agendadasMesActual, em.metaMes)}`)}
        ${card('Promedio mensual', n1(em.promedioMensual), em.mejorMes ? `mejor mes ${em.mejorMes.mes}: ${em.mejorMes.total} (${em.mejorMes.efectivas} ef + ${em.mejorMes.fallidas} fa)` : '')}
        ${card('Arrastre Oct / Vencidas (col. R)', `${em.vencidasOctubre} / ${em.vencidas}`, `con PDF Oct (cruce): ${em.cruceOct.total} (${em.cruceOct.efectivas} ef · ${em.cruceOct.fallidas} fa) · clic →`, "App.verVencidas('Emergente')")}
      </div>
      <div class="info-box" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span><strong>Cruce PDF Octubre vs Emergentes (CUIT + Estab col. M):</strong> ${em.cruceOct.total} filas emergentes coinciden con un PDF de octubre (<b>${em.cruceOct.efectivas} Efectivas</b> y <b>${em.cruceOct.fallidas} Fallidas</b>). Se muestran marcadas en la tabla sin sumar doble al objetivo.</span>
        <button class="btn sec sm" onclick="App.verCruceOct()">Ver esas ${em.cruceOct.total} filas →</button>
      </div>
      <div class="grid2">
        <div><h2>Emergentes por Mes · Efectivas + Fallidas c/PDF y Programadas (Meta 100/mes)</h2><div class="card" style="height:270px"><canvas id="chMain"></canvas></div></div>
        <div><h2>Cortes Trimestrales (Meta 300/trimestre)</h2>
        <table><thead><tr><th>Corte</th><th>Período</th><th>Meta</th><th>Efectivas</th><th>Fallidas</th><th>Total</th><th>Cumpl.</th></tr></thead><tbody>
        ${em.trimestres.map(t => `<tr style="cursor:default"><td>${t.q}</td><td>${t.desde} → ${t.hasta}</td><td>${t.meta}</td><td>${t.efectivas}</td><td>${t.fallidas}</td><td><b>${t.total}</b></td><td><div class="bar"><i style="width:${Math.min(100, t.total * 100 / t.meta)}%"></i></div>${pct(t.total, t.meta)}</td></tr>`).join('')}
        </tbody></table></div>
      </div>`;
    } else {
      h += `<div class="cards">
        ${card('Residuales cerradas (c/PDF)', re.realizadas, `de ${re.total.toLocaleString('es-AR')} (${pct1(re.pct)})`)}
        ${card('Pendientes a liquidar', re.pendientes.toLocaleString('es-AR'), `Etapa 1 fin ${C.aDMY(re.finE1)} · Etapa 2 fin ${C.aDMY(re.finE2)}`)}
        ${card('Programadas este mes', re.agendadasMesActual, `meta ${re.metaMes}/mes · ${pct(re.agendadasMesActual, re.metaMes)}`)}
        ${card('Ritmo requerido (Etapa 1)', n1(re.ritmoRequeridoE1), `visitas/mes (${re.mesesRestE1} mes/es hasta Ene-27)`)}
        ${card('Técnicas / Especiales', `${re.tecnicas} / ${re.especiales}`, 'tipología del stock residual')}
        ${card('Vencidas (col. R)', re.vencidas.toLocaleString('es-AR'), 'fecha máx. (col. R) superada · clic para ver →', "App.verVencidas('Residual')")}
      </div>
      <div class="grid2">
        <div><h2>Residuales por Mes · Cerradas c/PDF y Programadas (Meta 400/mes)</h2><div class="card" style="height:270px"><canvas id="chMain"></canvas></div></div>
        <div><h2>Curva de Extinción (Burn-down a 400/mes)</h2><div class="card" style="height:270px"><canvas id="chSec"></canvas></div></div>
      </div>
      <h2>Stock Residual por Etapa</h2>
      <table><thead><tr><th>Etapa</th><th>Meta etapa</th><th>Total</th><th>Cerradas c/PDF</th><th>Avance</th><th>Programadas</th><th>Sin programar</th><th>Vencidas (col. R)</th></tr></thead><tbody>
      ${re.etapas.map(b => `<tr style="cursor:default"><td>${esc(b.etapa)}</td><td>${/Urgente/.test(b.etapa) ? 'según col. R' : C.aDMY(C.CONFIG.PLAZO_ETAPA[b.etapa])}</td><td>${b.total}</td><td>${b.cerradas}</td><td><div class="bar"><i style="width:${b.total ? b.cerradas * 100 / b.total : 0}%"></i></div>${pct(b.cerradas, b.total)}</td><td>${b.agendadasPend}</td><td>${b.sinAgendar}</td><td class="${b.vencidas ? 'venc' : ''}">${b.vencidas}</td></tr>`).join('')}
      </tbody></table>`;
    }

    const cp = C.cumplimientoYParticipacion(VISITAS, D.historico, subTab, C.hoyISO());
    if (partFiltro !== 'all' && !cp.mesesActivos.some(m => m.key === partFiltro)) partFiltro = 'all';
    const tituloScope = subTab === 'consolidado' ? 'Consolidado' : (subTab === 'emergentes' ? 'Emergentes' : 'Residuales');
    h += bloqueCumplimientoHTML(cp, tituloScope);
    h += `<p class="note" style="margin-top:14px">Solo cierra y cuenta para el objetivo lo que tiene documento PDF asociado. Datos base: ${esc(D.generado || '')}.</p>`;
    $('main').innerHTML = h;
    renderChartsCumplimiento(cp, tituloScope);

    if (!window.Chart) return;
    if (subTab === 'consolidado') {
      const ms = co.meses;
      chMain = new Chart($('chMain'), {
        type: 'bar',
        data: {
          labels: ms.map(x => x.mes),
          datasets: [
            { label: 'Emerg. Efectivas c/PDF', data: ms.map(x => x.emEf), backgroundColor: '#1E7B4B', stack: 'cerradas', order: 2 },
            { label: 'Emerg. Fallidas c/PDF',  data: ms.map(x => x.emFa), backgroundColor: '#B3261E', stack: 'cerradas', order: 2 },
            { label: 'Resid. Efectivas c/PDF', data: ms.map(x => x.resEf), backgroundColor: '#0F4C5C', stack: 'cerradas', order: 2 },
            { label: 'Resid. Fallidas c/PDF',  data: ms.map(x => x.resFa), backgroundColor: '#D97706', stack: 'cerradas', order: 2 },
            { label: 'Programadas (mes)',        data: ms.map(x => x.agendadas), backgroundColor: 'rgba(91,102,112,0.55)', stack: 'agenda', order: 2 },
            { type: 'line', label: 'Meta mensual (100 → 500)', data: ms.map(x => x.meta), borderColor: '#A8470A', borderWidth: 2, borderDash: [6, 4], pointRadius: 3, stepped: true, stack: 'meta', order: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
          plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index', intersect: false, callbacks: {
            afterBody: items => { const x = ms[items[0].dataIndex]; return x && x.total ? ['Total cerradas c/PDF: ' + x.total + ' (meta ' + x.meta + ')'] : []; }
          } } }
        }
      });
    } else if (subTab === 'emergentes') {
      const ms = em.meses;
      chMain = new Chart($('chMain'), {
        type: 'bar',
        data: {
          labels: ms.map(x => x.mes),
          datasets: [
            { label: 'Efectivas c/PDF', data: ms.map(x => x.futuro ? null : x.efectivas), backgroundColor: '#1E7B4B', stack: 'cerradas', order: 2 },
            { label: 'Fallidas c/PDF',  data: ms.map(x => x.futuro ? null : x.fallidas),  backgroundColor: '#B3261E', stack: 'cerradas', order: 2 },
            { label: 'Programadas',       data: ms.map(x => x.agendadas), backgroundColor: 'rgba(15,76,92,0.55)', stack: 'agenda', order: 2 },
            { type: 'line', label: 'Meta ' + em.metaMes + '/mes', data: ms.map(x => x.meta), borderColor: '#A8470A', borderDash: [6, 4], pointRadius: 0, stack: 'meta', order: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
          plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index', intersect: false, callbacks: {
            afterBody: items => { const x = ms[items[0].dataIndex]; return x && x.total ? ['Total cerradas c/PDF: ' + x.total] : []; }
          } } }
        }
      });
    } else {
      const ms = re.meses;
      chMain = new Chart($('chMain'), {
        type: 'bar',
        data: {
          labels: ms.map(x => x.mes),
          datasets: [
            { label: 'Efectivas c/PDF', data: ms.map(x => x.futuro ? null : x.efectivas), backgroundColor: '#0F4C5C', stack: 'cerradas', order: 2 },
            { label: 'Fallidas c/PDF',  data: ms.map(x => x.futuro ? null : x.fallidas),  backgroundColor: '#D97706', stack: 'cerradas', order: 2 },
            { label: 'Programadas',       data: ms.map(x => x.agendadas), backgroundColor: 'rgba(91,102,112,0.55)', stack: 'agenda', order: 2 },
            { type: 'line', label: 'Meta ' + re.metaMes + '/mes', data: ms.map(x => x.meta), borderColor: '#A8470A', borderDash: [6, 4], pointRadius: 0, stack: 'meta', order: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
          plugins: { legend: { position: 'bottom' } }
        }
      });
      chSec = new Chart($('chSec'), {
        type: 'line',
        data: {
          labels: re.burn.map(x => x.mes),
          datasets: [
            { label: 'Trayectoria meta (400/mes)', data: re.burn.map(x => x.teorico), borderColor: '#A8470A', borderDash: [6, 4], pointRadius: 3 },
            { label: 'Stock remanente real',       data: re.burn.map(x => x.real),    borderColor: '#0F4C5C', backgroundColor: '#0F4C5C', pointRadius: 4 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
      });
    }
  }

  /* ---------- GRILLA OPERATIVA ---------- */
  function renderLista() {
    destruirCharts();
    const lista = filtrar();
    const total = lista.length, pags = Math.max(1, Math.ceil(total / PAGE));
    if (pagina > pags) pagina = pags;
    const sl = lista.slice((pagina - 1) * PAGE, pagina * PAGE);
    const meses = Array.from(new Set(baseVisitas().map(v => C.mesDe(v.fechaMax)).filter(Boolean))).sort();
    const enEstaVista = VISITAS.filter(v => vista === 'tablero' || !enVista[vista] || enVista[vista](v));
    const nVenc = enEstaVista.filter(v => v.catVenc === 'vencida').length;
    const nMesAct = enEstaVista.filter(v => v.catVenc === 'mes_actual').length;
    const nOtroMes = enEstaVista.filter(v => v.catVenc === 'otro_mes').length;
    const tareasCat = C.catalogoTareas(enEstaVista);
    const tareaOpts = tareasCat.map(t => `<option value="${esc(t.key)}" ${F.tarea === t.key ? 'selected' : ''}>${esc(t.label)} (${t.total})</option>`).join('') +
      (F.tarea && !tareasCat.some(t => t.key === F.tarea) ? `<option value="${esc(F.tarea)}" selected>${esc(F.tarea)} (0)</option>` : '');
    const hayFiltros = !!(F.q || F.venc || F.tarea || F.cohorte || F.plan || F.ambito || F.mes || F.estado || F.cruceOct || F.sub || F.errTipo);
    let h = `<div class="filters">
      <input type="search" placeholder="Buscar CUIT, empleador, contrato, localidad…" value="${esc(F.q)}" oninput="App.f('q',this.value,true)">
      <select onchange="App.f('tarea',this.value)" title="Filtrar por tarea (columna Q)">
        <option value="">Tarea: todas</option>
        ${tareaOpts}
      </select>
      <select onchange="App.f('venc',this.value)" title="Vencimiento según Fecha máxima (columna R)">
        <option value="">Vencimiento (col. R): todos</option>
        <option value="vencida" ${F.venc === 'vencida' ? 'selected' : ''}>Vencidas (${nVenc})</option>
        <option value="mes_actual" ${F.venc === 'mes_actual' ? 'selected' : ''}>Vencen mes actual (${nMesAct})</option>
        <option value="otro_mes" ${F.venc === 'otro_mes' ? 'selected' : ''}>Vencen otro mes (${nOtroMes})</option>
      </select>
      <select onchange="App.f('cohorte',this.value)">${opts(['Residual', 'Emergente'], F.cohorte, 'Cohorte: todas')}</select>
      <select onchange="App.f('plan',this.value)">${opts(uniq('planificacion'), F.plan, 'Etapa: todas')}</select>
      <select onchange="App.f('ambito',this.value)">${opts(uniq('ambito'), F.ambito, 'Ámbito: todos')}</select>
      <select onchange="App.f('mes',this.value)">${opts(meses, F.mes, 'Mes fecha máx.: todos')}</select>
      <select onchange="App.f('estado',this.value)">${opts(Object.values(E), F.estado, 'Estado: todos')}</select>
      <select onchange="App.f('cruceOct',this.value)">
        <option value="">Cruce PDF Oct: todos</option>
        <option value="con" ${F.cruceOct === 'con' ? 'selected' : ''}>Con PDF de Oct (todos)</option>
        <option value="Efectiva" ${F.cruceOct === 'Efectiva' ? 'selected' : ''}>PDF Oct: Efectiva</option>
        <option value="Fallida" ${F.cruceOct === 'Fallida' ? 'selected' : ''}>PDF Oct: Fallida</option>
      </select>
      ${vista === 'realizadas' ? `<select onchange="App.f('sub',this.value)"><option value="">Efectivas y fallidas</option><option value="Efectiva" ${F.sub === 'Efectiva' ? 'selected' : ''}>Solo efectivas</option><option value="Fallida" ${F.sub === 'Fallida' ? 'selected' : ''}>Solo fallidas</option></select>` : ''}
      ${vista === 'revisar' ? `<select onchange="App.f('errTipo',this.value)"><option value="">Tipo de error: todos</option><option value="misma_tarea_anios" ${F.errTipo === 'misma_tarea_anios' ? 'selected' : ''}>Misma tarea año ant. y actual (${VISITAS.filter(v => v.errores && v.errores.indexOf('misma_tarea_anios') >= 0).length})</option><option value="duplicada_fecha" ${F.errTipo === 'duplicada_fecha' ? 'selected' : ''}>Duplicada otra fecha (${VISITAS.filter(v => v.errores && v.errores.indexOf('duplicada_fecha') >= 0).length})</option></select>` : ''}
      ${hayFiltros ? '<button class="btn sec sm" onclick="App.limpiarFiltros()">Limpiar filtros</button>' : ''}
      <button class="btn sec sm" onclick="App.exportar()">Exportar CSV</button>
      <span class="note">${total} visitas</span></div>`;
    h += `<div style="overflow:auto;max-height:72vh"><table class="grid-op"><thead><tr><th>Cohorte</th><th>Etapa</th><th>CUIT</th><th>Empleador</th><th>Estab. (M)</th><th>Localidad</th><th>Tareas</th><th title="Fecha máxima según Columna R de la planilla">Fecha máx. (R)</th><th title="Fecha programada cargada por el preventor">F. programada</th><th title="Fecha en que se realizó efectivamente la visita">Fecha real</th><th>Estado</th><th>Acción</th></tr></thead><tbody>`;
    sl.forEach(v => {
      const tareasTxt = v.tareas.split('//').join(' · ');
      const estabTxt = `${v.nroEstab} · ${v.establecimiento}`;
      const locTxt = `${v.localidad}, ${v.provincia}`;
      const cruceTag = v.cruceOct ? ` <a href="${esc(v.cruceOct.url)}" target="_blank" onclick="event.stopPropagation()" class="pill ${v.cruceOct.resultado === 'Efectiva' ? 'p-ok' : 'p-bad'}" title="PDF cargado en Octubre (${esc(v.cruceOct.fecha)} · ${esc(v.cruceOct.tarea)})">PDF Oct: ${v.cruceOct.resultado} ↗</a>` : '';
      const esAnios = v.errores && v.errores.indexOf('misma_tarea_anios') >= 0;
      const errTag = esAnios
        ? `<span class="pill p-bad" title="Misma tarea repetida entre año anterior y actual: ${esc((v.tareasRepetidasAnio || []).join(', '))}">🔁 Año ant./act.</span> `
        : (v.revisarDuplicada ? '<span class="pill p-warn" title="Misma tarea y establecimiento con fecha distinta">⚠ Duplicada</span> ' : '');
      const fechaCelda = C.aDMY(v.fechaMax) + (v.vencida ? ' <span class="pill p-bad">Vencida</span>' : '');
      h += `<tr class="${v.vencida ? 'is-venc' : ''}" data-id="${esc(v.id)}" onclick="App.abrir(this.dataset.id)"><td>${v.cohorte}</td><td>${esc(v.planificacion)}</td><td>${esc(v.cuit)}</td><td class="clip" style="max-width:190px" title="${esc(v.empleador)}">${esc(v.empleador)}</td>
        <td class="clip" style="max-width:140px" title="${esc(estabTxt)}">${esc(estabTxt)}</td><td class="clip" style="max-width:140px" title="${esc(locTxt)}">${esc(locTxt)}</td>
        <td class="clip" style="max-width:250px" title="${esc(tareasTxt)}">${errTag}${cruceTag ? cruceTag + ' ' : ''}${esc(tareasTxt)}</td>
        <td class="${v.vencida ? 'venc' : ''}">${fechaCelda}</td><td>${C.aDMY(v.fechaAgendada)}</td><td>${C.aDMY(v.fechaReal)}</td><td>${pillEstado(v.estado)}</td>
        <td><button class="btn sec sm" data-id="${esc(v.id)}" onclick="event.stopPropagation();App.abrir(this.dataset.id)">📄 PDF</button></td></tr>`;
    });
    if (!sl.length) h += '<tr><td colspan="12" class="note" style="padding:20px">Sin resultados.</td></tr>';
    h += `</tbody></table></div><div class="pager"><button onclick="App.pag(-1)">‹</button> Página ${pagina} de ${pags} <button onclick="App.pag(1)">›</button></div>`;
    $('main').innerHTML = h;
  }

  /* ---------- LOGÍSTICA Y ETIQUETAS DINÁMICAS ---------- */
  function filtrarLogisticaLista() {
    const hoy = C.hoyISO();
    const q = C.sinTildes(LOG.q).toLowerCase().trim();
    const base = LOG.soloPendientes ? VISITAS.filter(v => !v.cerrada) : VISITAS;
    const porEt = C.filtrarPorEtiqueta(base, LOG.etiqueta, hoy);
    const out = porEt.filter(v => {
      const ambKey = C.sinTildes(C.normAmbito(v.ambito || v.provincia)).toLowerCase();
      if (LOG.ambito && ambKey !== LOG.ambito) return false;
      const zonaKey = ambKey + '|' + C.sinTildes(C.zonaVisita(v)).toLowerCase();
      if (LOG.zona && zonaKey !== LOG.zona) return false;
      if (q) {
        const h = C.sinTildes([v.cuit, v.empleador, v.establecimiento, v.domicilio, v.localidad, v.departamento, v.ambito, v.tareas, v.cp].join(' ')).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    });
    return out.sort((a, b) => {
      if (LOG.orden === 'zona_cp') {
        const ka = [C.normAmbito(a.ambito || a.provincia), C.zonaVisita(a), String(a.cp || '').padStart(5, '0'), a.domicilio || '', a.cuit].join('|');
        const kb = [C.normAmbito(b.ambito || b.provincia), C.zonaVisita(b), String(b.cp || '').padStart(5, '0'), b.domicilio || '', b.cuit].join('|');
        return ka.localeCompare(kb);
      }
      if (LOG.orden === 'fecha') {
        return (a.fechaMax || '9').localeCompare(b.fechaMax || '9') || C.zonaVisita(a).localeCompare(C.zonaVisita(b));
      }
      return (C.prioridadLogistica(a) - C.prioridadLogistica(b)) || (a.fechaMax || '9').localeCompare(b.fechaMax || '9') || C.zonaVisita(a).localeCompare(C.zonaVisita(b));
    });
  }

  function renderLogistica() {
    destruirCharts();
    const hoy = C.hoyISO();
    const base = LOG.soloPendientes ? VISITAS.filter(v => !v.cerrada) : VISITAS;

    // 1. Etiquetas dinámicas (se actualizan según Ámbito/Zona si hay uno elegido para dar cruce bidireccional)
    const baseGeo = base.filter(v => {
      const ambKey = C.sinTildes(C.normAmbito(v.ambito || v.provincia)).toLowerCase();
      if (LOG.ambito && ambKey !== LOG.ambito) return false;
      const zonaKey = ambKey + '|' + C.sinTildes(C.zonaVisita(v)).toLowerCase();
      if (LOG.zona && zonaKey !== LOG.zona) return false;
      return true;
    });
    const tags = C.resumenEtiquetas(baseGeo, hoy);
    const tagsPrio = tags.filter(t => t.grupo === 'prioridad');
    const tagsTareas = tags.filter(t => t.grupo === 'tareas');

    // 2. Agrupación geográfica (filtrada por la etiqueta activa)
    const baseEt = C.filtrarPorEtiqueta(base, LOG.etiqueta, hoy);
    const geo = C.agruparLogistica(baseEt);
    const zonasVisibles = LOG.ambito ? geo.zonas.filter(z => z.ambKey === LOG.ambito) : geo.zonas;
    const limiteZonas = (LOG.ambito || LOG.verTodasZonas) ? zonasVisibles.length : Math.min(25, zonasVisibles.length);
    const ambSelObj = LOG.ambito ? geo.ambitos.find(a => a.key === LOG.ambito) : null;
    const zonaSelObj = LOG.zona ? geo.zonas.find(z => z.key === LOG.zona) : null;
    const etSelObj = LOG.etiqueta ? tags.find(t => t.id === LOG.etiqueta) : null;

    // 3. Lista operativa de ruta
    const ruta = filtrarLogisticaLista();
    const pags = Math.max(1, Math.ceil(ruta.length / PAGE));
    if (LOG.pagina > pags) LOG.pagina = pags;
    const sl = ruta.slice((LOG.pagina - 1) * PAGE, LOG.pagina * PAGE);
    const estabSet = new Set(ruta.map(v => `${v.cuit}|${v.nroEstab}`));
    const nVencRuta = ruta.filter(v => v.vencida).length;
    const nUrgRuta = ruta.filter(v => !v.cerrada && C.esUrgente(v)).length;
    const nProgRuta = ruta.filter(v => v.estado === E.AGENDADA).length;
    const haySel = !!(LOG.etiqueta || LOG.ambito || LOG.zona || LOG.q);

    const btnTag = t => `<button class="tag-btn t-${t.tono}${LOG.etiqueta === t.id ? ' on' : ''}${t.count === 0 ? ' zero' : ''}" onclick="App.logTag('${t.id}')">${esc(t.label)} <span class="cnt">${t.count.toLocaleString('es-AR')}</span></button>`;

    let h = `<div class="tag-panel">
      <div class="tag-row"><span class="tag-lbl">Prioridad y etapa</span>${tagsPrio.map(btnTag).join('')}</div>
      <div class="tag-row"><span class="tag-lbl">Críticas vencidas (R)</span>${tagsTareas.map(btnTag).join('')}</div>
    </div>`;

    h += `<div class="log-split">
      <div class="log-box">
        <div class="log-box-head">
          <h3>Por Ámbito (${geo.ambitos.length}) ${etSelObj ? `<span class="pill p-ag">${esc(etSelObj.label)}</span>` : ''}</h3>
          ${LOG.ambito ? `<button class="btn sec sm" onclick="App.logAmbito('')">Ver todos los ámbitos</button>` : '<span class="note">Clic para enfocar zona</span>'}
        </div>
        <div class="amb-grid">
          ${geo.ambitos.length ? geo.ambitos.map(a => `<button class="amb-card${LOG.ambito === a.key ? ' on' : ''}" onclick="App.logAmbito('${esc(a.key)}')">
            <div class="an" title="${esc(a.ambito)}">${esc(a.ambito)}</div>
            <div class="av">${a.total.toLocaleString('es-AR')}</div>
            <div class="as"><span class="${a.vencidas ? 'venc' : ''}">${a.vencidas} venc.</span>${a.urgentes ? `<span><b>${a.urgentes}</b> urg.</span>` : ''}<span>${a.estabUnicos} estab.</span></div>
          </button>`).join('') : '<span class="note">Sin visitas para esta etiqueta.</span>'}
        </div>
      </div>
      <div class="log-box">
        <div class="log-box-head">
          <h3>${ambSelObj ? `Departamentos / Localidades en ${esc(ambSelObj.ambito)} (${zonasVisibles.length})` : `Concentración por Departamento / Localidad (Top ${limiteZonas} de ${zonasVisibles.length})`}</h3>
          <div style="display:flex;gap:6px;align-items:center">
            ${LOG.zona ? `<button class="btn sec sm" onclick="App.logZona('')">Quitar localidad</button>` : ''}
            ${!LOG.ambito && zonasVisibles.length > 25 ? `<button class="btn sec sm" onclick="App.logToggleZonas()">${LOG.verTodasZonas ? 'Ver Top 25' : 'Ver todas (' + zonasVisibles.length + ')'}</button>` : ''}
          </div>
        </div>
        <div style="max-height:310px;overflow:auto">
          <table class="grid-op"><thead><tr>${LOG.ambito ? '' : '<th>Ámbito</th>'}<th>Depto / Localidad</th><th>Visitas</th><th>Estab.</th><th>Venc. (R)</th><th>Urg.</th><th>AT/EP</th><th>PESE/363</th><th>Obras</th><th>Sin prog.</th></tr></thead><tbody>
          ${zonasVisibles.length ? zonasVisibles.slice(0, limiteZonas).map(z => `<tr class="${LOG.zona === z.key ? 'zona-on' : ''}" onclick="App.logZona('${esc(z.key)}')">
            ${LOG.ambito ? '' : `<td>${esc(z.ambito)}</td>`}
            <td><b>${esc(z.zona)}</b></td><td><b>${z.total}</b></td><td>${z.estabUnicos}</td>
            <td class="${z.vencidas ? 'venc' : ''}">${z.vencidas}</td>
            <td>${z.urgentes || '–'}</td>
            <td class="${z.atEp ? 'venc' : ''}">${z.atEp || '–'}</td>
            <td class="${z.pese363 ? 'venc' : ''}">${z.pese363 || '–'}</td>
            <td>${z.obras || '–'}</td>
            <td>${z.sinProgramar}</td>
          </tr>`).join('') : '<tr><td colspan="10" class="note">Sin zonas con visitas para el filtro activo.</td></tr>'}
          </tbody></table>
        </div>
      </div>
    </div>`;

    // Barra de resumen + controles de hoja de ruta
    const focoPartes = [];
    if (etSelObj) focoPartes.push(`Etiqueta: <b>${esc(etSelObj.label)}</b>`);
    if (ambSelObj) focoPartes.push(`Ámbito: <b>${esc(ambSelObj.ambito)}</b>`);
    if (zonaSelObj) focoPartes.push(`Zona: <b>${esc(zonaSelObj.zona)}</b>`);

    h += `<div class="route-bar">
      <span>${focoPartes.length ? focoPartes.join(' · ') : '<b>Todo el país</b>'}</span>
      <span>· <b>${ruta.length.toLocaleString('es-AR')}</b> visitas (<b>${estabSet.size.toLocaleString('es-AR')}</b> estab. únicos)</span>
      <span>· <b class="${nVencRuta ? 'venc' : ''}">${nVencRuta.toLocaleString('es-AR')}</b> venc. · <b>${nUrgRuta}</b> urg. · <b>${nProgRuta}</b> prog.</span>
      <span style="flex:1"></span>
      <label style="display:inline-flex;align-items:center;gap:5px;margin:0;cursor:pointer;font-size:12px"><input type="checkbox" ${LOG.soloPendientes ? 'checked' : ''} onchange="App.logOpt('soloPendientes',this.checked)"> Solo pendientes</label>
      <select style="padding:4px 7px;font-size:12px;border:1px solid var(--line);border-radius:3px" onchange="App.logOpt('orden',this.value)" title="Orden de la hoja de ruta">
        <option value="prioridad" ${LOG.orden === 'prioridad' ? 'selected' : ''}>Orden: Prioridad crítica</option>
        <option value="zona_cp" ${LOG.orden === 'zona_cp' ? 'selected' : ''}>Orden: Zona + CP + Domicilio (ruta)</option>
        <option value="fecha" ${LOG.orden === 'fecha' ? 'selected' : ''}>Orden: Fecha máx. (col. R)</option>
      </select>
      <input type="search" id="logSearch" placeholder="Filtrar domicilio, empleador, CP…" value="${esc(LOG.q)}" style="padding:4px 8px;font-size:12px;border:1px solid var(--line);border-radius:3px;min-width:190px" oninput="App.logBuscar(this.value)">
      ${haySel ? '<button class="btn sec sm" onclick="App.logLimpiar()">Limpiar</button>' : ''}
      <button class="btn sm" onclick="App.exportarRutaCSV()">⬇ Exportar Hoja de Ruta</button>
    </div>`;

    h += `<div style="overflow:auto;max-height:58vh"><table class="grid-op"><thead><tr>
      <th>Ámbito</th><th>Depto / Localidad</th><th>Domicilio</th><th>CUIT</th><th>Empleador</th><th>Estab. (M)</th><th>Etapa</th><th>Tareas</th>
      <th title="Fecha máxima según Columna R de la planilla">Fecha máx. (R)</th><th title="Fecha programada cargada por el preventor">F. programada</th><th>Estado</th><th>Acción</th>
    </tr></thead><tbody>`;
    sl.forEach(v => {
      const tareasTxt = v.tareas.split('//').join(' · ');
      const ambTxt = C.normAmbito(v.ambito || v.provincia);
      const zonaTxt = C.zonaVisita(v);
      const fechaCelda = C.aDMY(v.fechaMax) + (v.vencida ? ' <span class="pill p-bad">Vencida</span>' : '');
      h += `<tr class="${v.vencida ? 'is-venc' : ''}" data-id="${esc(v.id)}" onclick="App.abrir(this.dataset.id)">
        <td>${esc(ambTxt)}</td>
        <td class="clip" style="max-width:130px" title="${esc(zonaTxt)}">${esc(zonaTxt)}</td>
        <td class="clip" style="max-width:170px" title="${esc(v.domicilio)}">${esc(v.domicilio)}</td>
        <td>${esc(v.cuit)}</td>
        <td class="clip" style="max-width:175px" title="${esc(v.empleador)}">${esc(v.empleador)}</td>
        <td>${esc(v.nroEstab)}</td>
        <td>${esc(v.planificacion)}</td>
        <td class="clip" style="max-width:220px" title="${esc(tareasTxt)}">${esc(tareasTxt)}</td>
        <td class="${v.vencida ? 'venc' : ''}">${fechaCelda}</td>
        <td>${C.aDMY(v.fechaAgendada)}</td>
        <td>${pillEstado(v.estado)}</td>
        <td><button class="btn sec sm" data-id="${esc(v.id)}" onclick="event.stopPropagation();App.abrir(this.dataset.id)">📅 Programar</button></td>
      </tr>`;
    });
    if (!sl.length) h += '<tr><td colspan="12" class="note" style="padding:20px">Sin visitas para esta selección.</td></tr>';
    h += `</tbody></table></div><div class="pager"><button onclick="App.logPag(-1)">‹</button> Página ${LOG.pagina} de ${pags} <button onclick="App.logPag(1)">›</button></div>`;
    $('main').innerHTML = h;
  }

  function exportarRutaCSV() {
    const lista = filtrarLogisticaLista();
    const cols = [
      ['ambitoNorm', 'Ambito'], ['zonaNorm', 'Depto / Localidad'], ['cp', 'CP'], ['domicilio', 'Domicilio'],
      ['cuit', 'CUIT'], ['empleador', 'Empleador'], ['nroEstab', 'Estab (M)'], ['establecimiento', 'Establecimiento'],
      ['planificacion', 'Etapa'], ['tareas', 'Tareas'], ['fechaMax', 'Fecha Maxima (Col R)'], ['vencida', 'Vencida'],
      ['fechaAgendada', 'Fecha Programada (Preventor)'], ['estado', 'Estado'], ['obsCS', 'Obs CS'], ['obsIAPSER', 'Obs IAPSER']
    ];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '\ufeff' + cols.map(c => q(c[1])).join(',') + '\n' + lista.map(v => cols.map(([k]) => {
      if (k === 'ambitoNorm') return q(C.normAmbito(v.ambito || v.provincia));
      if (k === 'zonaNorm') return q(C.zonaVisita(v));
      if (k === 'vencida') return q(v.vencida ? 'Si' : 'No');
      if (k === 'fechaMax' || k === 'fechaAgendada') return q(C.aDMY(v[k]));
      return q(v[k]);
    }).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'hoja_de_ruta_' + (LOG.etiqueta || 'general') + '_' + C.hoyISO() + '.csv';
    a.click();
  }

  function render() {
    renderTabs();
    if (vista === 'tablero') renderTablero();
    else if (vista === 'logistica') renderLogistica();
    else renderLista();
    const pend = COLA.length;
    const baseTxt = PADRON_LOCAL && PADRON_LOCAL.generado
      ? ('Padrón actualizado: ' + PADRON_LOCAL.generado + ' (' + baseVisitas().length + ' visitas)')
      : (D.generado ? 'Datos base: ' + D.generado : '');
    $('sync').textContent = baseTxt + (pend ? ' · ' + pend + ' envío(s) pendiente(s)' : '');
  }

  /* ---------- FICHA INDIVIDUAL (con detección automática + vista previa PDF) ---------- */
  let editando = null;
  let blobUrlIndividual = '';

  function drivePreviewUrl(u) {
    const m = String(u || '').match(/\/d\/([A-Za-z0-9_-]{10,})|[?&]id=([A-Za-z0-9_-]{10,})/);
    const id = m && (m[1] || m[2]);
    return id ? ('https://drive.google.com/file/d/' + id + '/preview') : '';
  }

  function renderPanePdf(container, src, titulo, openHref) {
    if (!container) return;
    if (!src) {
      container.innerHTML = `<div class="pdf-pane-head"><span>Previsualización de PDF</span></div><div class="pdf-empty">Seleccioná o arrastrá un PDF para previsualizarlo acá al lado de los datos detectados.</div>`;
      return;
    }
    container.innerHTML = `<div class="pdf-pane-head"><span title="${esc(titulo)}">📄 ${esc(titulo)}</span><a href="${esc(openHref || src)}" target="_blank">Abrir aparte ↗</a></div><iframe class="pdf-frame" src="${esc(src)}"></iframe>`;
  }

  function mostrarPreviewIndividual(src, titulo, openHref) {
    const wrap = $('dvSplit');
    const pane = $('dvPreview');
    if (!wrap || !pane) return;
    if (src) {
      $('dlgVisita').classList.add('wide');
      wrap.classList.add('split-preview');
      pane.style.display = 'flex';
      renderPanePdf(pane, src, titulo, openHref);
    } else {
      $('dlgVisita').classList.remove('wide');
      wrap.classList.remove('split-preview');
      pane.style.display = 'none';
      pane.innerHTML = '';
    }
  }

  function intentoEditable(v) {
    const u = C.ultimoIntento(v.intentos);
    if (!u) return { n: 1 };
    if (v.estado === E.FALLIDA_REPROGRAMAR) return { n: u.n + 1 };
    return Object.assign({}, u);
  }

  function abrir(id) {
    const v = VISITAS.find(x => x.id === id);
    if (!v) return;
    if (blobUrlIndividual) { URL.revokeObjectURL(blobUrlIndividual); blobUrlIndividual = ''; }
    const it = intentoEditable(v);
    editando = { id, it };
    const previos = v.intentos.filter(x => x.n !== it.n);
    const dato = (k, val) => `<b>${k}</b><span>${esc(val) || '–'}</span>`;
    const motivoBase = MOTIVOS.indexOf((it.motivo || '').split(' - ')[0]) >= 0 ? (it.motivo || '').split(' - ')[0] : '';
    const detalle = (it.motivo || '').indexOf(' - ') > 0 ? it.motivo.split(' - ').slice(1).join(' - ') : (motivoBase ? '' : (it.motivo || ''));
    const cruceHtml = v.cruceOct ? `<div class="info-box"><strong>Cruce con PDF de Octubre (CUIT + Estab ${esc(v.nroEstab)}):</strong><br>${v.cruceOct.items.map(x => `• ${esc(x.fecha)} — <b>${esc(x.resultado)}</b> (${esc(x.tarea)}) · <a href="${esc(x.url)}" target="_blank">Abrir PDF en Drive ↗</a>`).join('<br>')}</div>` : '';
    const errHtml = v.revisarDuplicada ? `<div class="err" style="display:block"><strong>Error / A revisar:</strong> ${v.errores && v.errores.indexOf('misma_tarea_anios') >= 0 ? `Misma tarea repetida entre año anterior y actual (${esc((v.tareasRepetidasAnio || []).join(', '))})` : 'Misma tarea y establecimiento con fecha máxima distinta'} · Fecha original planilla: <b>${C.aDMY(v.fechaMax)}</b></div>` : '';

    $('dvTitulo').textContent = v.empleador + ' · Estab ' + v.nroEstab;
    $('dvBody').innerHTML = `<div id="dvSplit"><div><div class="kv">
      ${dato('CUIT / Contrato', v.cuit + ' / ' + v.contrato)}${dato('Establecimiento', v.establecimiento + ' — ' + v.domicilio)}
      ${dato('Localidad', v.localidad + ', ' + v.provincia)}${dato('Tareas', v.tareas.split('//').join(' · '))}
      ${dato('Cohorte / Etapa', v.cohorte + ' · ' + v.planificacion)}
      <b>Fecha máxima (col. R)</b><span class="${v.vencida ? 'venc' : ''}">${C.aDMY(v.fechaMax)}${v.vencida ? ' <span class="pill p-bad">Vencida</span>' : ''}</span>
      <b>Estado</b><span>${pillEstado(v.estado)}</span>${v.obsCS ? dato('Obs. CS', v.obsCS) : ''}${v.obsIAPSER ? dato('Obs. IAPSER', v.obsIAPSER) : ''}</div>
      ${errHtml}
      ${cruceHtml}
      ${previos.length ? `<table class="hist"><thead><tr><th>#</th><th>Programada</th><th>Real</th><th>Resultado</th><th>Motivo</th><th>PDF</th></tr></thead><tbody>${previos.map(p => `<tr style="cursor:default"><td>${p.n}</td><td>${C.aDMY(p.fechaAgendada)}</td><td>${C.aDMY(p.fechaReal)}</td><td>${esc(p.resultado)}</td><td>${esc(p.motivo)}</td><td>${p.adjunto ? `<a href="${esc(p.adjunto)}" target="_blank">ver</a>` : '–'}</td></tr>`).join('')}</tbody></table>` : ''}
      <fieldset><legend>Intento ${it.n} · Programación (preventor)</legend>
        <label>Fecha programada (la que carga el preventor)</label><input type="date" id="fAg" value="${esc(it.fechaAgendada || '')}"></fieldset>
      <fieldset><legend>Resultado y Documento PDF</legend>
        <label>Documento PDF (obligatorio para cerrar · detecta fecha y resultado automáticamente)</label>
        <input type="file" id="fPdf" accept="application/pdf,.pdf" onchange="App.analizarPdfIndividual(this.files[0])">
        <div id="fOcrInfo" class="note" style="margin-top:4px">${it.adjunto ? `PDF actual: <a href="${esc(it.adjunto)}" target="_blank">abrir ↗</a> (subí otro para reemplazarlo)` : ''}</div>
        <div class="row2"><div><label>Fecha real de la visita (puede ser distinta a la programada)</label><input type="date" id="fReal" max="${C.hoyISO()}" value="${esc(it.fechaReal || '')}"></div>
        <div><label>Resultado</label><select id="fRes" onchange="App.toggleRes()"><option value="">— sin resultado aún —</option><option ${it.resultado === 'Efectiva' ? 'selected' : ''}>Efectiva</option><option ${it.resultado === 'Fallida' ? 'selected' : ''}>Fallida</option></select></div></div>
        <div id="bFall" style="display:none"><div class="row2"><div><label>Motivo</label><select id="fMot"><option value="">—</option>${MOTIVOS.map(m => `<option ${m === motivoBase ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
          <div><label>¿Se vuelve a ir?</label><select id="fRep"><option value="">—</option><option value="Si" ${it.reprograma === 'Si' ? 'selected' : ''}>Sí (se reprograma)</option><option value="No" ${it.reprograma === 'No' ? 'selected' : ''}>No (se cierra)</option></select></div></div>
          <label>Detalle (opcional)</label><input id="fDet" value="${esc(detalle)}"></div>
      </fieldset><div class="err" id="dvErr"></div></div>
      <div class="pdf-pane" id="dvPreview" style="display:none"></div></div>`;
    $('dvFoot').innerHTML = `<button class="btn sec" onclick="dlgVisita.close()">Cancelar</button><button class="btn" id="btnGuardar" onclick="App.guardar()">Guardar</button>`;
    toggleRes();
    const prevDrive = it.adjunto ? drivePreviewUrl(it.adjunto) : (v.cerradaPorCruceOct && v.cruceOct ? drivePreviewUrl(v.cruceOct.url) : '');
    const prevTitulo = it.adjunto ? 'PDF guardado en Drive' : (v.cerradaPorCruceOct && v.cruceOct ? `PDF Octubre (${v.cruceOct.fecha} · ${v.cruceOct.resultado})` : '');
    const prevHref = it.adjunto || (v.cerradaPorCruceOct && v.cruceOct ? v.cruceOct.url : '');
    mostrarPreviewIndividual(prevDrive, prevTitulo, prevHref);
    $('dlgVisita').showModal();
  }

  function toggleRes() {
    const r = $('fRes').value;
    $('bFall').style.display = r === 'Fallida' ? 'block' : 'none';
  }

  async function analizarPdfIndividual(file) {
    if (!file || !OCR) return;
    if (!C.esPDF(file)) { $('fOcrInfo').innerHTML = '<span class="venc">Solo se admiten archivos PDF.</span>'; return; }
    if (blobUrlIndividual) URL.revokeObjectURL(blobUrlIndividual);
    blobUrlIndividual = URL.createObjectURL(file);
    mostrarPreviewIndividual(blobUrlIndividual + '#view=FitH', file.name, blobUrlIndividual);
    $('fOcrInfo').innerHTML = '<span class="pill p-ai">Analizando PDF…</span>';
    try {
      const det = await OCR.analizarPDF(file, { backendUrl: url(), visitas: VISITAS, useGemini: geminiActivo !== false });
      if (det.fechaReal && !$('fReal').value && det.fechaReal <= C.hoyISO()) $('fReal').value = det.fechaReal;
      if (det.resultado && !$('fRes').value) { $('fRes').value = det.resultado; toggleRes(); }
      if (det.resultado === 'Fallida' && det.motivoFallida && $('fMot') && !$('fMot').value) {
        const m = MOTIVOS.find(x => x.toLowerCase() === det.motivoFallida.toLowerCase());
        if (m) $('fMot').value = m; else if ($('fDet')) $('fDet').value = det.motivoFallida;
      }
      const fuente = det.source === 'gemini' ? 'Gemini IA' : (det.source === 'ocr_local' ? 'OCR local' : (det.source === 'pdf_texto' ? 'Texto PDF' : 'Nombre archivo'));
      const partes = [];
      if (det.fechaReal) partes.push('fecha ' + C.aDMY(det.fechaReal));
      if (det.resultado) partes.push(det.resultado);
      $('fOcrInfo').innerHTML = `<span class="pill p-ai">✨ ${fuente}</span> ${partes.length ? 'Detectado: ' + esc(partes.join(' · ')) : 'Sin datos automáticos (completá manualmente)'}`;
    } catch (e) {
      $('fOcrInfo').textContent = 'No se pudo analizar automáticamente (podés cargar manualmente).';
    }
  }

  const mostrarErr = m => { const e = $('dvErr'); e.style.display = m ? 'block' : 'none'; e.innerHTML = m; };

  async function guardar() {
    mostrarErr('');
    const { id, it } = editando;
    const res = $('fRes').value;
    const det = $('fDet') ? $('fDet').value.trim() : '';
    const mot = res === 'Fallida' ? ($('fMot').value + (det ? ' - ' + det : '')) : '';
    const file = $('fPdf').files[0];
    const nuevo = {
      n: it.n, fechaAgendada: $('fAg').value, fechaReal: res ? $('fReal').value : '', resultado: res, motivo: res === 'Fallida' && !$('fMot').value ? '' : mot,
      reprograma: res === 'Fallida' ? $('fRep').value : '', adjunto: it.adjunto || '', cargadoPor: load(LS_USER, ''), ts: new Date().toISOString(), adjuntoPendiente: !!file
    };
    const errs = C.validarIntento(nuevo);
    if (!res && !nuevo.fechaAgendada) errs.push('Cargá una fecha programada o un resultado');
    if (file && !C.esPDF(file)) errs.push('El documento debe ser un archivo PDF');
    if (C.requiereAdjunto(nuevo) && !nuevo.adjunto && !file) errs.push('Para cerrar la visita hace falta adjuntar el PDF');
    if (errs.length) return mostrarErr(errs.map(esc).join('<br>'));
    $('btnGuardar').disabled = true;
    let b64 = '';
    if (file) {
      if (file.size > 15 * 1024 * 1024) { $('btnGuardar').disabled = false; return mostrarErr('El PDF supera 15 MB'); }
      b64 = await OCR.leerBase64(file);
    }
    const guardado = Object.assign({}, nuevo); delete guardado.adjuntoPendiente;
    const lista = (INTENTOS[id] || []).filter(x => x.n !== nuevo.n); lista.push(guardado); lista.sort((a, b) => a.n - b.n);
    INTENTOS[id] = lista; save(LS_INT, INTENTOS);
    COLA = COLA.filter(q => !(q.id === id && q.intento.n === nuevo.n));
    COLA.push({ id, intento: guardado, pdfBase64: b64, nombreArchivo: file ? nombrePDF(id, guardado) : '' });
    if (!save(LS_COLA, COLA)) { alert('No hay espacio local para el PDF pendiente: configurá la URL y sincronizá antes de seguir.'); }
    recalcular(); render(); $('dlgVisita').close();
    flush();
  }

  function nombrePDF(id, it) {
    const p = id.split('|');
    return [p[0], 'E' + p[1], (it.fechaReal || it.fechaAgendada || '').replace(/-/g, '')].join('_') + '.pdf';
  }

  /* ---------- SUBIDA MASIVA (OCR + GEMINI IA + PREVISUALIZACIÓN) ---------- */
  let LOTE = [];
  let previewUid = '';
  let renderedPreviewUid = '';
  let dropBound = false;

  function renderPreviewMasiva(force) {
    const it = LOTE.find(x => x.uid === previewUid && x.blobUrl);
    const key = it ? it.uid : '';
    if (!force && key === renderedPreviewUid) return;
    renderedPreviewUid = key;
    if (it) renderPanePdf($('masivaPreview'), it.blobUrl + '#view=FitH', it.nombre, it.blobUrl);
    else renderPanePdf($('masivaPreview'), '', '', '');
  }

  function verPdfLote(uid) {
    previewUid = uid;
    renderPreviewMasiva(true);
    document.querySelectorAll('#masivaLista .bitem').forEach(el => el.classList.toggle('active', el.dataset.uid === uid));
  }

  function actualizarBadgeMotor() {
    const el = $('masivaMotorBadge');
    if (!el) return;
    if (geminiActivo === true) el.innerHTML = '✨ <strong>Motor activo: Gemini IA (en Apps Script)</strong> + respaldo PDF.js / Tesseract local.';
    else if (geminiActivo === false) el.innerHTML = '<strong>Motor activo: PDF.js + Tesseract OCR local</strong> (si agregás <code>GEMINI_API_KEY</code> en Propiedades de Apps Script se activa Gemini IA automáticamente).';
    else el.innerHTML = 'Motor de detección: <strong>Híbrido (Gemini IA si está configurado en Apps Script, o PDF.js + Tesseract local)</strong>.';
  }

  function abrirMasiva() {
    if (!dropBound) {
      const dz = $('dropMasiva');
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
      dz.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files) agregarArchivosMasiva(e.dataTransfer.files); });
      dropBound = true;
    }
    actualizarBadgeMotor();
    renderMasiva();
    renderPreviewMasiva(true);
    $('dlgMasiva').showModal();
  }

  async function agregarArchivosMasiva(fileList) {
    const files = Array.from(fileList || []);
    const nuevos = [];
    files.forEach(file => {
      if (!C.esPDF(file)) {
        LOTE.push({ uid: 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), file, nombre: file.name, status: 'error', error: 'No es un archivo PDF válido' });
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        LOTE.push({ uid: 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), file, nombre: file.name, status: 'error', error: 'Supera 15 MB' });
        return;
      }
      const item = {
        uid: 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        file, nombre: file.name, blobUrl: URL.createObjectURL(file), status: 'analizando', source: '', base64: '',
        cuit: '', nroEstab: '', fechaReal: '', resultado: 'Efectiva', motivo: '', reprograma: 'No',
        visitaId: '', filtro: '', candidatos: [], error: ''
      };
      LOTE.push(item);
      nuevos.push(item);
      if (!previewUid) previewUid = item.uid;
    });
    renderMasiva();
    renderPreviewMasiva();
    for (const item of nuevos) {
      try {
        const det = await OCR.analizarPDF(item.file, { backendUrl: url(), visitas: VISITAS, useGemini: geminiActivo !== false });
        item.base64 = det.base64;
        item.source = det.source;
        if (det.source === 'gemini') geminiActivo = true;
        item.cuit = det.cuit;
        item.nroEstab = det.nroEstab;
        item.fechaReal = (det.fechaReal && det.fechaReal <= C.hoyISO()) ? det.fechaReal : '';
        item.resultado = det.resultado || 'Efectiva';
        item.motivo = det.motivoFallida || '';
        item.reprograma = 'No';
        item.candidatos = det.candidatos || [];
        item.visitaId = det.match ? det.match.id : '';
        item.filtro = det.cuit || '';
        item.status = 'listo';
      } catch (e) {
        item.status = 'listo';
        item.error = 'Detección parcial: revisá los campos';
      }
      actualizarBadgeMotor();
      renderMasiva();
    }
  }

  function buscarOpcionesVisita(q, cuit) {
    const term = C.sinTildes((q || cuit || '').trim()).toLowerCase();
    let arr = VISITAS;
    if (term) {
      arr = VISITAS.filter(v => C.sinTildes([v.cuit, v.empleador, v.contrato, v.nroEstab, v.localidad, v.tareas].join(' ')).toLowerCase().indexOf(term) >= 0);
    } else {
      arr = VISITAS.filter(v => !v.cerrada);
    }
    return arr.slice(0, 60);
  }

  function renderMasiva() {
    const el = $('masivaLista');
    if (!LOTE.length) {
      el.innerHTML = '<p class="note" style="margin-top:12px">Todavía no agregaste PDFs al lote.</p>';
      $('masivaResumen').textContent = '0 archivos en cola';
      $('btnSubirLote').disabled = true;
      return;
    }
    el.innerHTML = LOTE.map(it => {
      const badge = it.status === 'analizando' ? '<span class="pill p-ai">Analizando…</span>'
        : it.status === 'subiendo' ? '<span class="pill p-ag">Subiendo a Drive…</span>'
        : it.status === 'subido' ? '<span class="pill p-ok">✓ Subido</span>'
        : it.status === 'error' ? `<span class="pill p-bad">Error: ${esc(it.error)}</span>`
        : `<span class="pill p-ai">✨ ${it.source === 'gemini' ? 'Gemini IA' : (it.source === 'ocr_local' ? 'OCR local' : (it.source === 'pdf_texto' ? 'Texto PDF' : 'Nombre'))}</span>`;

      if (it.status === 'error' && !it.base64) {
        return `<div class="bitem bad"><div class="bitem-head"><strong>${esc(it.nombre)}</strong><div>${badge} <button class="btn sec sm" onclick="App.quitarLote('${it.uid}')">✕</button></div></div></div>`;
      }
      const opciones = buscarOpcionesVisita(it.filtro, it.cuit);
      const selVisita = opciones.map(v => `<option value="${esc(v.id)}" ${v.id === it.visitaId ? 'selected' : ''}>${esc(v.cuit)} · ${esc(v.empleador)} · Estab ${esc(v.nroEstab)} (${esc(v.cohorte)} · ${esc(v.tareas.slice(0, 35))})</option>`).join('');
      const cls = (it.status === 'subido' ? 'ok' : (it.error ? 'bad' : '')) + (it.uid === previewUid ? ' active' : '');
      const dis = (it.status === 'subiendo' || it.status === 'subido') ? 'disabled' : '';
      return `<div class="bitem ${cls}" data-uid="${it.uid}">
        <div class="bitem-head">
          <div style="cursor:pointer" onclick="App.verPdfLote('${it.uid}')"><strong>📄 ${esc(it.nombre)}</strong> ${it.cuit ? `<span class="note">CUIT: ${esc(it.cuit)}${it.nroEstab ? ' · Estab ' + esc(it.nroEstab) : ''}</span>` : ''}</div>
          <div>${badge} <button class="btn sec sm" onclick="App.verPdfLote('${it.uid}')">👁 Ver</button> <button class="btn sec sm" ${dis} onclick="App.quitarLote('${it.uid}')">✕</button></div>
        </div>
        ${it.error && it.status !== 'subido' ? `<div class="venc" style="font-size:12px;margin-bottom:6px">${esc(it.error)}</div>` : ''}
        <div class="row2">
          <div><label>Filtrar visita (CUIT, empleador o N° estab)</label><input ${dis} value="${esc(it.filtro)}" placeholder="Tipeá CUIT o empleador…" oninput="App.updLote('${it.uid}','filtro',this.value,true)"></div>
          <div><label>Visita destino (${opciones.length} coincidencia/s)</label>
            <select ${dis} onchange="App.updLote('${it.uid}','visitaId',this.value)"><option value="">— Seleccioná una visita —</option>${selVisita}</select></div>
        </div>
        <div class="row3">
          <div><label>Fecha real de visita</label><input type="date" ${dis} max="${C.hoyISO()}" value="${esc(it.fechaReal)}" onchange="App.updLote('${it.uid}','fechaReal',this.value)"></div>
          <div><label>Resultado</label><select ${dis} onchange="App.updLote('${it.uid}','resultado',this.value)"><option ${it.resultado === 'Efectiva' ? 'selected' : ''}>Efectiva</option><option ${it.resultado === 'Fallida' ? 'selected' : ''}>Fallida</option></select></div>
          <div>${it.resultado === 'Fallida' ? `<label>¿Se vuelve a ir?</label><select ${dis} onchange="App.updLote('${it.uid}','reprograma',this.value)"><option value="No" ${it.reprograma === 'No' ? 'selected' : ''}>No (cierra con PDF)</option><option value="Si" ${it.reprograma === 'Si' ? 'selected' : ''}>Sí (reprograma)</option></select>` : '<label>Cierre</label><input disabled value="Cierra con PDF">'}</div>
        </div>
        ${it.resultado === 'Fallida' ? `<label>Motivo de fallida</label><select ${dis} onchange="App.updLote('${it.uid}','motivo',this.value)"><option value="">— Elegí motivo —</option>${MOTIVOS.map(m => `<option ${m === it.motivo ? 'selected' : ''}>${m}</option>`).join('')}</select>` : ''}
      </div>`;
    }).join('');

    const listos = LOTE.filter(x => x.status === 'listo');
    const subidos = LOTE.filter(x => x.status === 'subido').length;
    $('masivaResumen').textContent = `${LOTE.length} archivo(s) · ${listos.length} listo(s) para subir` + (subidos ? ` · ${subidos} subido(s)` : '');
    $('btnSubirLote').disabled = listos.length === 0 || LOTE.some(x => x.status === 'analizando' || x.status === 'subiendo');
  }

  function updLote(uid, k, val, soloSelect) {
    const it = LOTE.find(x => x.uid === uid);
    if (!it) return;
    it[k] = val;
    it.error = '';
    if (k === 'filtro') {
      const ops = buscarOpcionesVisita(val, '');
      if (ops.length === 1) it.visitaId = ops[0].id;
    }
    if (soloSelect) {
      const act = document.activeElement;
      const pos = act ? act.selectionStart : null;
      renderMasiva();
      // restaurar foco en el input de filtro
      const inputs = $('masivaLista').querySelectorAll('input[placeholder*="Tipeá"]');
      const idx = LOTE.findIndex(x => x.uid === uid);
      if (inputs[idx]) { inputs[idx].focus(); if (pos != null) inputs[idx].setSelectionRange(pos, pos); }
    } else {
      renderMasiva();
    }
  }

  function quitarLote(uid) {
    const it = LOTE.find(x => x.uid === uid);
    if (it && it.blobUrl) URL.revokeObjectURL(it.blobUrl);
    LOTE = LOTE.filter(x => x.uid !== uid);
    if (previewUid === uid) {
      const next = LOTE.find(x => x.blobUrl);
      previewUid = next ? next.uid : '';
    }
    renderMasiva();
    renderPreviewMasiva();
  }
  function limpiarMasiva() {
    LOTE.forEach(it => { if (it.blobUrl) URL.revokeObjectURL(it.blobUrl); });
    LOTE = []; previewUid = '';
    renderMasiva();
    renderPreviewMasiva(true);
  }

  async function confirmarLote() {
    const pendientes = LOTE.filter(x => x.status === 'listo');
    if (!pendientes.length) return;
    $('btnSubirLote').disabled = true;
    const usuario = load(LS_USER, '');
    for (const it of pendientes) {
      const v = VISITAS.find(x => x.id === it.visitaId);
      if (!v) { it.error = 'Seleccioná una visita destino'; continue; }
      const nro = intentoEditable(v).n;
      const nuevo = {
        n: nro, fechaAgendada: (intentoEditable(v).fechaAgendada || ''),
        fechaReal: it.fechaReal, resultado: it.resultado,
        motivo: it.resultado === 'Fallida' ? it.motivo : '',
        reprograma: it.resultado === 'Fallida' ? it.reprograma : '',
        adjunto: '', cargadoPor: usuario, ts: new Date().toISOString(), adjuntoPendiente: true
      };
      const errs = C.validarIntento(nuevo);
      if (errs.length) { it.error = errs.join(' · '); continue; }
      it.status = 'subiendo'; it.error = ''; renderMasiva();
      try {
        const guardado = Object.assign({}, nuevo); delete guardado.adjuntoPendiente;
        const r = await post({ action: 'saveIntento', id: v.id, intento: guardado, pdfBase64: it.base64, nombreArchivo: nombrePDF(v.id, guardado) });
        if (!r || !r.ok) { it.status = 'listo'; it.error = (r && r.error) || 'Error del backend'; renderMasiva(); continue; }
        guardado.adjunto = r.adjunto || '';
        const lista = (INTENTOS[v.id] || []).filter(x => x.n !== guardado.n); lista.push(guardado); lista.sort((a, b) => a.n - b.n);
        INTENTOS[v.id] = lista; save(LS_INT, INTENTOS);
        it.status = 'subido';
      } catch (e) {
        it.status = 'listo'; it.error = 'Sin conexión con el servidor';
      }
      recalcular(); renderMasiva();
    }
    render();
  }

  /* ---------- ACTUALIZAR PADRÓN (.XLSX / .CSV) + VALIDADOR DE COLUMNAS ---------- */
  let PADRON_UI = null;
  let padronDropBound = false;

  function parsearCSVTexto(texto) {
    const firstLine = (texto || '').split(/\r?\n/)[0] || '';
    const sep = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
    const rows = [];
    let row = [''], inQ = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (inQ) {
        if (ch === '"' && texto[i + 1] === '"') { row[row.length - 1] += '"'; i++; }
        else if (ch === '"') inQ = false;
        else row[row.length - 1] += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === sep) row.push('');
        else if (ch === '\r') { /* ignore */ }
        else if (ch === '\n') { rows.push(row); row = ['']; }
        else row[row.length - 1] += ch;
      }
    }
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows.filter(r => r.some(c => String(c || '').trim() !== ''));
  }

  function mostrarStatusPadron(msg, esOk) {
    const el = $('padronStatus');
    if (!el) return;
    if (!msg) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'block';
    el.className = esOk ? 'info-box' : 'err';
    el.innerHTML = msg;
  }

  function abrirPadron() {
    if (!padronDropBound) {
      const dz = $('dropPadron');
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
      dz.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) cargarArchivoPadron(e.dataTransfer.files[0]); });
      padronDropBound = true;
    }
    mostrarStatusPadron('');
    $('btnPadronRestaurar').style.display = PADRON_LOCAL ? 'inline-block' : 'none';
    renderPadron();
    $('dlgPadron').showModal();
  }

  async function cargarArchivoPadron(file) {
    if (!file) return;
    mostrarStatusPadron('');
    const nombre = file.name || 'archivo';
    try {
      const hojas = {};
      let nombresHojas = [];
      if (/\.csv$/i.test(nombre)) {
        const txt = await file.text();
        const rows = parsearCSVTexto(txt.replace(/^\uFEFF/, ''));
        hojas['CSV'] = rows;
        nombresHojas = ['CSV'];
      } else if (/\.(xlsx|xls)$/i.test(nombre)) {
        if (!window.XLSX) {
          return mostrarStatusPadron('No se cargó la librería XLSX (revisá tu conexión a internet o subí el archivo como CSV).');
        }
        const buf = await file.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array', cellDates: false });
        nombresHojas = wb.SheetNames || [];
        nombresHojas.forEach(sn => {
          hojas[sn] = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true });
        });
      } else {
        return mostrarStatusPadron('Formato no soportado. Subí un archivo .xlsx, .xls o .csv.');
      }
      if (!nombresHojas.length) return mostrarStatusPadron('El archivo no contiene hojas con datos.');

      // Elegir automáticamente la hoja con mejor coincidencia de columnas (priorizando "General")
      let mejorHoja = nombresHojas[0], mejorScore = -1;
      nombresHojas.forEach(sn => {
        const rows = hojas[sn] || [];
        const val = C.validarColumnasPadron(rows[0] || []);
        const bonus = /^general$/i.test(sn.trim()) ? 2 : (/detalle visitas/i.test(sn) ? 1.5 : 0);
        const sc = (val.ok ? 100 : 0) + val.coincidencias.length + bonus;
        if (sc > mejorScore) { mejorScore = sc; mejorHoja = sn; }
      });

      PADRON_UI = {
        archivo: nombre,
        hojas: hojas,
        nombresHojas: nombresHojas,
        hojaActiva: mejorHoja,
        mapeo: {},
        diffTab: 'altas',
        aplicarBajas: true,
        syncSheets: !!url(),
        registrarEmergentes: true,
        mesEmergente: C.mesEmergenteActual(),
        val: null,
        parsed: null,
        diff: null
      };
      recomputarPadronUI();
      renderPadron();
    } catch (e) {
      mostrarStatusPadron('Error al leer el archivo: ' + esc(e && e.message || e));
    }
  }

  function recomputarPadronUI() {
    if (!PADRON_UI) return;
    const rows = PADRON_UI.hojas[PADRON_UI.hojaActiva] || [];
    const val = C.validarColumnasPadron(rows[0] || [], PADRON_UI.mapeo);
    PADRON_UI.val = val;
    if (val.ok) {
      const actuales = baseVisitas();
      const parsed = C.parsearFilasPadron(rows, val, actuales);
      const mapaOct = C.indexarCruceOctubre(D.historico);
      const diff = C.compararPadron(actuales, parsed.visitas, INTENTOS, mapaOct);
      PADRON_UI.parsed = parsed;
      PADRON_UI.diff = diff;
      // Elegir pestaña con datos por defecto
      if (diff.bajas.length && !diff.altas.length && !diff.modificadas.length) PADRON_UI.diffTab = 'bajas';
      else if (diff.modificadas.length && !diff.altas.length) PADRON_UI.diffTab = 'modificadas';
    } else {
      PADRON_UI.parsed = null;
      PADRON_UI.diff = null;
    }
  }

  function cambiarHojaPadron(sn) {
    if (!PADRON_UI || !PADRON_UI.hojas[sn]) return;
    PADRON_UI.hojaActiva = sn;
    PADRON_UI.mapeo = {};
    recomputarPadronUI();
    renderPadron();
  }

  function remapearColumnaPadron(colEsperada, idxVal) {
    if (!PADRON_UI) return;
    if (idxVal === '') delete PADRON_UI.mapeo[colEsperada];
    else PADRON_UI.mapeo[colEsperada] = parseInt(idxVal, 10);
    recomputarPadronUI();
    renderPadron();
  }

  function setPadronOpt(k, val) {
    if (!PADRON_UI) return;
    PADRON_UI[k] = val;
    renderPadron();
  }

  function renderPadron() {
    const wrapHoja = $('padronHojaWrap');
    const cont = $('padronContenido');
    const btnOk = $('btnAplicarPadron');
    const btnCsv = $('btnPadronDiffCsv');
    const btnJs = $('btnPadronDatosJs');
    $('btnPadronRestaurar').style.display = PADRON_LOCAL ? 'inline-block' : 'none';

    if (!PADRON_UI) {
      wrapHoja.style.display = 'none';
      cont.innerHTML = '';
      btnOk.disabled = true;
      btnCsv.style.display = 'none';
      btnJs.style.display = 'none';
      $('padronResumen').textContent = 'Subí un archivo .xlsx o .csv para iniciar la validación';
      return;
    }

    const { archivo, nombresHojas, hojaActiva, val, parsed, diff } = PADRON_UI;
    const rows = PADRON_UI.hojas[hojaActiva] || [];
    wrapHoja.style.display = 'flex';
    wrapHoja.innerHTML = `<strong>📄 ${esc(archivo)}</strong>` +
      (nombresHojas.length > 1
        ? `<label style="display:inline-flex;align-items:center;gap:6px">Hoja a importar: <select style="width:auto" onchange="App.cambiarHojaPadron(this.value)">${nombresHojas.map(sn => `<option value="${esc(sn)}" ${sn === hojaActiva ? 'selected' : ''}>${esc(sn)} (${Math.max(0, (PADRON_UI.hojas[sn] || []).length - 1)} filas)</option>`).join('')}</select></label>`
        : `<span class="note">Hoja: ${esc(hojaActiva)} (${Math.max(0, rows.length - 1)} filas)</span>`);

    // 1. VALIDADOR DE COLUMNAS
    const hayNovedades = val.nuevasDesconocidas.length || val.faltantes.length || val.cambiosFormato.length || val.cambiosPosicion.length || val.duplicadas.length;
    const clsVal = !val.ok ? 'bad' : (hayNovedades ? 'warn' : 'ok');
    const titVal = !val.ok
      ? `❌ Validador de columnas: faltan ${val.faltantesObligatorias.length} columna(s) obligatoria(s)`
      : (hayNovedades
        ? '⚠ Validador de columnas: esquema válido, pero se detectaron cambios en encabezados'
        : '✅ Validador de columnas: todas las columnas esperadas (A..W) coinciden exactamente');

    let h = `<div class="val-box ${clsVal}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <strong>${titVal}</strong>
        <div class="chip-list" style="margin:0">
          <span class="pill p-ok">Encontradas: ${val.coincidencias.length}/${C.COLUMNAS_PADRON.length}</span>
          ${val.faltantesObligatorias.length ? `<span class="pill p-bad">Obligatorias faltantes: ${val.faltantesObligatorias.length}</span>` : ''}
          ${val.faltantes.length - val.faltantesObligatorias.length > 0 ? `<span class="pill p-warn">Opcionales faltantes: ${val.faltantes.length - val.faltantesObligatorias.length}</span>` : ''}
          ${val.nuevasDesconocidas.length ? `<span class="pill p-warn">Columnas nuevas: ${val.nuevasDesconocidas.length}</span>` : ''}
          ${val.cambiosFormato.length ? `<span class="pill p-ag">Tildes/mayúsculas: ${val.cambiosFormato.length}</span>` : ''}
          ${val.cambiosPosicion.length ? `<span class="pill p-ag">Orden cambiado: ${val.cambiosPosicion.length}</span>` : ''}
          ${val.duplicadas.length ? `<span class="pill p-bad">Duplicadas: ${val.duplicadas.length}</span>` : ''}
        </div>
      </div>`;

    // Tabla de faltantes / renombradas con remapeo manual
    const remapeadas = val.coincidencias.filter(c => c.estado === 'remapeada');
    if (val.faltantes.length || remapeadas.length) {
      const todasOpciones = val.headers.map((hd, i) => ({ idx: i, letra: C.letraCol(i), nombre: hd || '(sin título)' })).filter(o => o.nombre !== '(sin título)');
      h += `<div style="margin-top:8px"><strong>Columnas faltantes o renombradas</strong> <span class="note">(si en el Excel le cambiaron el nombre, podés asociarla acá)</span>
        <table class="diff-tbl" style="margin-top:6px"><thead><tr><th>Columna esperada</th><th>Tipo</th><th>Sugerencia</th><th>Mapear a columna del archivo</th></tr></thead><tbody>`;
      val.faltantes.forEach(f => {
        const sugTxt = f.sugerencias.length
          ? f.sugerencias.slice(0, 2).map(s => `<b>${esc(s.letra)}: "${esc(s.nombre)}"</b> (${esc(s.motivo)})`).join(' · ')
          : '<span class="note">Sin sugerencia clara</span>';
        const optsCol = '<option value="">— No mapear —</option>' + todasOpciones.map(o => {
          const esSug = f.sugerencias.some(s => s.idx === o.idx);
          return `<option value="${o.idx}">${esSug ? '★ ' : ''}${o.letra}: ${esc(o.nombre)}</option>`;
        }).join('');
        h += `<tr style="cursor:default"><td><b>${esc(f.esperada)}</b> <span class="note">(esp. ${f.letraEsperada})</span></td>
          <td>${f.obligatoria ? '<span class="pill p-bad">Obligatoria</span>' : '<span class="pill p-sin">Opcional</span>'}</td>
          <td>${sugTxt}</td>
          <td><select style="padding:3px 6px;font-size:12px" onchange="App.remapearColumnaPadron('${esc(f.esperada)}',this.value)">${optsCol}</select></td></tr>`;
      });
      remapeadas.forEach(c => {
        const optsCol = '<option value="">— Quitar mapeo manual —</option>' + todasOpciones.map(o => `<option value="${o.idx}" ${o.idx === c.idx ? 'selected' : ''}>${o.letra}: ${esc(o.nombre)}</option>`).join('');
        h += `<tr style="cursor:default"><td><b>${esc(c.esperada)}</b></td><td><span class="pill p-ai">Remapeada</span></td>
          <td>Asociada a <b>${c.letra}: "${esc(c.encontrada)}"</b></td>
          <td><select style="padding:3px 6px;font-size:12px" onchange="App.remapearColumnaPadron('${esc(c.esperada)}',this.value)">${optsCol}</select></td></tr>`;
      });
      h += '</tbody></table></div>';
    }

    // Columnas agregadas / nuevas
    if (val.agregadas.length) {
      h += `<div style="margin-top:8px"><strong>Columnas adicionales detectadas en el archivo (${val.agregadas.length}):</strong>
        <div class="chip-list">${val.agregadas.map(a => `<span class="pill ${a.esAuxiliarConocida ? 'p-ag' : 'p-warn'}">${a.letra}: ${esc(a.nombre)}${a.esAuxiliarConocida ? ' (auxiliar)' : ' (NUEVA)'}</span>`).join('')}</div>
        <div class="note" style="margin-top:4px">Las columnas marcadas como <b>NUEVA</b> no estaban en el esquema A..W. No rompen la importación, pero revisá si alguna corresponde a un campo renombrado.</div></div>`;
    }

    if (val.cambiosFormato.length) {
      h += `<div class="note" style="margin-top:6px">🔄 <b>Cambio de mayúsculas/tildes:</b> ${val.cambiosFormato.map(c => `${esc(c.esperada)} → "${esc(c.encontrada)}" (${c.letra})`).join(' · ')}</div>`;
    }
    if (val.cambiosPosicion.length) {
      h += `<div class="note" style="margin-top:4px">↔ <b>Cambio de posición</b> (se lee por nombre, sin problema): ${val.cambiosPosicion.map(c => `${esc(c.esperada)} (${c.letraEsperada} → ${c.letra})`).join(' · ')}</div>`;
    }
    if (val.duplicadas.length) {
      h += `<div class="venc" style="font-size:12px;margin-top:4px">⚠ <b>Encabezados duplicados:</b> ${val.duplicadas.map(d => `"${esc(d.nombre)}" en ${d.primeraLetra} y ${d.letra} (se usa la primera)`).join(' · ')}</div>`;
    }

    // Auditoría completa plegable
    h += `<details style="margin-top:8px"><summary class="note" style="cursor:pointer">Ver detalle completo de mapeo (${val.coincidencias.length} columnas mapeadas)</summary>
      <table class="diff-tbl"><thead><tr><th>Esperada</th><th>Letra esp.</th><th>En archivo</th><th>Letra arch.</th><th>Estado</th></tr></thead><tbody>
      ${val.coincidencias.map(c => `<tr style="cursor:default"><td>${esc(c.esperada)}</td><td>${c.letraEsperada}</td><td>${esc(c.encontrada)}</td><td>${c.letra}</td><td><span class="pill ${c.estado === 'exacta' ? 'p-ok' : (c.estado === 'remapeada' ? 'p-ai' : 'p-ag')}">${c.estado}</span></td></tr>`).join('')}
      </tbody></table></details></div>`;

    // 2. VISTA PREVIA DE CAMBIOS (si el esquema es válido)
    if (val.ok && parsed && diff) {
      h += `<div class="cards" style="margin:12px 0 8px">
        <div class="card"><div class="k">Sin cambios</div><div class="v">${diff.sinCambios.length.toLocaleString('es-AR')}</div><div class="s">se conservan intactas</div></div>
        <div class="card"><div class="k">Altas (nuevas)</div><div class="v" style="color:var(--ok)">+${diff.altas.length.toLocaleString('es-AR')}</div><div class="s">nuevas en el archivo</div></div>
        <div class="card"><div class="k">Modificadas</div><div class="v" style="color:var(--amber)">${diff.modificadas.length.toLocaleString('es-AR')}</div><div class="s">cambió algún dato o fecha máx.</div></div>
        <div class="card"><div class="k">Bajas (eliminadas)</div><div class="v" style="color:var(--bad)">-${diff.bajas.length.toLocaleString('es-AR')}</div><div class="s">${diff.bajasConGestion.length ? `<span class="venc">${diff.bajasConGestion.length} con gestión/PDF</span>` : 'sin gestión cargada'}</div></div>
      </div>`;

      if (diff.bajasConGestion.length) {
        h += `<div class="val-box bad"><strong>⚠ Atención: ${diff.bajasConGestion.length} visita(s) eliminada(s) del Excel ya tienen gestión o PDF cargado.</strong>
          <div class="note" style="margin-top:3px">Sus registros en <code>Seguimiento_Intentos</code> nunca se borran, y si sincronizás con Sheets las bajas se respaldan en la pestaña <code>Bajas_Historico</code>. Revisá la pestaña "Bajas" abajo antes de confirmar.</div></div>`;
      }
      if (parsed.duplicadosOmitidos.length || parsed.filasSinFecha) {
        h += `<div class="note" style="margin:4px 0">Avisos del archivo: ${parsed.duplicadosOmitidos.length ? `<b>${parsed.duplicadosOmitidos.length} duplicado(s) exacto(s)</b> fuera de obras omitidos. ` : ''}${parsed.filasSinFecha ? `<b>${parsed.filasSinFecha} fila(s)</b> sin Fecha máxima válida en columna R.` : ''}</div>`;
      }

      h += `<div class="opt-row">
        <label><input type="checkbox" ${PADRON_UI.aplicarBajas ? 'checked' : ''} onchange="App.setPadronOpt('aplicarBajas',this.checked)"> Aplicar bajas (quitar las ${diff.bajas.length} eliminadas del padrón${PADRON_UI.syncSheets ? ' y respaldarlas en Bajas_Historico' : ''})</label>
        <label><input type="checkbox" ${PADRON_UI.syncSheets ? 'checked' : ''} ${url() ? '' : 'disabled'} onchange="App.setPadronOpt('syncSheets',this.checked)"> Sincronizar también con Google Sheets (preserva X..AJ, fórmulas =AG/AH/AI y Seguimiento_Intentos)</label>
        <label><input type="checkbox" ${PADRON_UI.registrarEmergentes ? 'checked' : ''} onchange="App.setPadronOpt('registrarEmergentes',this.checked)"> Alimentar <b>Visitas emergentes mensuales</b> con las ${diff.altas.length} alta(s) · Mes: <input style="width:74px;padding:2px 6px;font-size:12px" value="${esc(PADRON_UI.mesEmergente)}" onchange="App.setPadronOpt('mesEmergente',this.value.trim())"></label>
      </div>`;

      const dt = PADRON_UI.diffTab;
      h += `<div class="diff-tabs">
        <button class="${dt === 'altas' ? 'on' : ''}" onclick="App.setPadronOpt('diffTab','altas')">Altas (${diff.altas.length})</button>
        <button class="${dt === 'modificadas' ? 'on' : ''}" onclick="App.setPadronOpt('diffTab','modificadas')">Modificadas (${diff.modificadas.length})</button>
        <button class="${dt === 'bajas' ? 'on' : ''}" onclick="App.setPadronOpt('diffTab','bajas')">Bajas (${diff.bajas.length})</button>
        ${parsed.duplicadosOmitidos.length ? `<button class="${dt === 'dups' ? 'on' : ''}" onclick="App.setPadronOpt('diffTab','dups')">Duplicados omitidos (${parsed.duplicadosOmitidos.length})</button>` : ''}
      </div>`;

      h += '<div style="max-height:240px;overflow:auto;border:1px solid var(--line);border-radius:4px">';
      if (dt === 'altas') {
        h += `<table class="diff-tbl"><thead><tr><th>CUIT</th><th>Empleador</th><th>Estab (M)</th><th>Localidad</th><th>Tareas</th><th>Fecha máx. (R)</th></tr></thead><tbody>` +
          (diff.altas.length ? diff.altas.slice(0, 100).map(v => `<tr style="cursor:default"><td>${esc(v.cuit)}</td><td>${esc(v.empleador)}</td><td>${esc(v.nroEstab)}</td><td>${esc(v.localidad)}</td><td>${esc(v.tareas.split('//').join(' · '))}</td><td>${C.aDMY(v.fechaMax)}</td></tr>`).join('') : '<tr><td colspan="6" class="note">Sin altas nuevas.</td></tr>') +
          '</tbody></table>';
      } else if (dt === 'modificadas') {
        h += `<table class="diff-tbl"><thead><tr><th>CUIT</th><th>Empleador</th><th>Estab (M)</th><th>Cambios detectados</th></tr></thead><tbody>` +
          (diff.modificadas.length ? diff.modificadas.slice(0, 100).map(m => `<tr style="cursor:default"><td>${esc(m.nueva.cuit)}</td><td>${esc(m.nueva.empleador)}</td><td>${esc(m.nueva.nroEstab)}</td><td>${m.cambios.map(c => `<b>${esc(c.campo)}:</b> ${esc(c.key === 'fechaMax' ? C.aDMY(c.antes) : c.antes) || '–'} → <b>${esc(c.key === 'fechaMax' ? C.aDMY(c.despues) : c.despues) || '–'}</b>`).join('<br>')}</td></tr>`).join('') : '<tr><td colspan="4" class="note">Sin filas modificadas.</td></tr>') +
          '</tbody></table>';
      } else if (dt === 'bajas') {
        h += `<table class="diff-tbl"><thead><tr><th>CUIT</th><th>Empleador</th><th>Estab (M)</th><th>Tareas</th><th>Fecha máx. (R)</th><th>Gestión</th></tr></thead><tbody>` +
          (diff.bajas.length ? diff.bajas.slice(0, 100).map(b => `<tr style="cursor:default"><td>${esc(b.visita.cuit)}</td><td>${esc(b.visita.empleador)}</td><td>${esc(b.visita.nroEstab)}</td><td>${esc(b.visita.tareas.split('//').join(' · '))}</td><td>${C.aDMY(b.visita.fechaMax)}</td><td>${b.tieneGestion ? `<span class="pill p-bad">⚠ ${b.cantIntentos ? b.cantIntentos + ' intento(s)' : 'PDF Oct'}</span>` : '<span class="pill p-sin">Sin gestión</span>'}</td></tr>`).join('') : '<tr><td colspan="6" class="note">Sin bajas.</td></tr>') +
          '</tbody></table>';
      } else {
        h += `<table class="diff-tbl"><thead><tr><th>Fila Excel</th><th>CUIT</th><th>Empleador</th><th>Estab (M)</th><th>Tareas</th><th>Fecha máx.</th></tr></thead><tbody>` +
          parsed.duplicadosOmitidos.slice(0, 100).map(d => `<tr style="cursor:default"><td>${d.fila}</td><td>${esc(d.cuit)}</td><td>${esc(d.empleador)}</td><td>${esc(d.nroEstab)}</td><td>${esc(d.tareas)}</td><td>${C.aDMY(d.fechaMax)}</td></tr>`).join('') +
          '</tbody></table>';
      }
      h += '</div>';

      const totalFinal = parsed.visitas.length + (PADRON_UI.aplicarBajas ? 0 : diff.bajas.length);
      $('padronResumen').textContent = `Resultado: ${totalFinal.toLocaleString('es-AR')} visitas (+${diff.altas.length} altas · ${diff.modificadas.length} modif. · ${PADRON_UI.aplicarBajas ? '-' + diff.bajas.length + ' bajas' : diff.bajas.length + ' bajas conservadas'})`;
      btnOk.disabled = false;
      btnCsv.style.display = 'inline-block';
      btnJs.style.display = 'inline-block';
    } else {
      $('padronResumen').textContent = 'Resolvé las columnas obligatorias faltantes para habilitar la actualización';
      btnOk.disabled = true;
      btnCsv.style.display = 'none';
      btnJs.style.display = 'none';
    }

    cont.innerHTML = h;
  }

  function construirVisitasFinalesPadron() {
    if (!PADRON_UI || !PADRON_UI.parsed || !PADRON_UI.diff) return [];
    const altasIds = {};
    PADRON_UI.diff.altas.forEach(a => { altasIds[a.id] = true; });
    const mesEm = (PADRON_UI.mesEmergente || C.mesEmergenteActual()).trim();
    const base = PADRON_UI.parsed.visitas.map(v => {
      if (PADRON_UI.registrarEmergentes && altasIds[v.id] && !v.mesEmergente) {
        return Object.assign({}, v, { mesEmergente: mesEm });
      }
      return v;
    });
    if (!PADRON_UI.aplicarBajas) {
      PADRON_UI.diff.bajas.forEach(b => base.push(b.visita));
    }
    return base;
  }

  function descargarDiffCSV() {
    if (!PADRON_UI || !PADRON_UI.diff) return;
    const { altas, modificadas, bajas } = PADRON_UI.diff;
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lineas = [['Tipo', 'CUIT', 'Empleador', 'Estab (M)', 'Tareas', 'Fecha Max (Col R)', 'Detalle Cambios / Gestion'].map(q).join(',')];
    altas.forEach(v => lineas.push(['ALTA', v.cuit, v.empleador, v.nroEstab, v.tareas, C.aDMY(v.fechaMax), 'Registro nuevo'].map(q).join(',')));
    modificadas.forEach(m => lineas.push(['MODIFICADA', m.nueva.cuit, m.nueva.empleador, m.nueva.nroEstab, m.nueva.tareas, C.aDMY(m.nueva.fechaMax), m.cambios.map(c => `${c.campo}: ${c.antes} -> ${c.despues}`).join(' | ')].map(q).join(',')));
    bajas.forEach(b => lineas.push(['BAJA', b.visita.cuit, b.visita.empleador, b.visita.nroEstab, b.visita.tareas, C.aDMY(b.visita.fechaMax), b.tieneGestion ? 'CON GESTION/PDF' : 'Sin gestion'].map(q).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'reporte_cambios_padron_' + C.hoyISO() + '.csv';
    a.click();
  }

  function descargarDatosJS() {
    if (!PADRON_UI || !PADRON_UI.parsed) return;
    const ahora = new Date();
    const gen = C.hoyISO(ahora) + ' ' + String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
    const payload = { generado: gen, visitas: construirVisitasFinalesPadron(), historico: D.historico || [] };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['window.SEG_DATA = ' + JSON.stringify(payload) + ';\n'], { type: 'application/javascript;charset=utf-8' }));
    a.download = 'datos.js';
    a.click();
  }

  async function aplicarPadron() {
    if (!PADRON_UI || !PADRON_UI.val || !PADRON_UI.val.ok || !PADRON_UI.parsed) return;
    const btn = $('btnAplicarPadron');
    btn.disabled = true;
    mostrarStatusPadron('');
    const finales = construirVisitasFinalesPadron();
    const ahora = new Date();
    const gen = C.hoyISO(ahora) + ' ' + String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
    const nuevoLocal = { generado: gen, ts: ahora.toISOString(), archivo: PADRON_UI.archivo, visitas: finales };

    // 1. Aplicar localmente en la app inmediatamente
    PADRON_LOCAL = nuevoLocal;
    save(LS_PADRON, PADRON_LOCAL);
    recalcular();
    render();

    // 2. Sincronizar con Google Sheets si está marcado
    if (PADRON_UI.syncSheets && url()) {
      mostrarStatusPadron('Actualizado en pantalla. Sincronizando cambios con Google Sheets (preservando X..AJ y fórmulas)…', true);
      try {
        const res = await post({
          action: 'syncPadron',
          archivo: PADRON_UI.archivo,
          usuario: load(LS_USER, ''),
          aplicarBajas: !!PADRON_UI.aplicarBajas,
          registrarEmergentes: !!PADRON_UI.registrarEmergentes,
          mesEmergente: (PADRON_UI.mesEmergente || C.mesEmergenteActual()).trim(),
          filas: PADRON_UI.parsed.filasRaw
        });
        if (res && res.ok) {
          if (res.ts) { PADRON_LOCAL.ts = res.ts; save(LS_PADRON, PADRON_LOCAL); }
          const emTxt = res.emergentesAgregadas ? `, <b>+${res.emergentesAgregadas}</b> en <code>Visitas emergentes mensuales</code> (${esc(res.mesEmergente || '')})` : '';
          mostrarStatusPadron(`✅ Padrón actualizado y sincronizado con Google Sheets: <b>${res.totalFinal}</b> filas (+${res.altas} altas, ${res.modificadas} modificadas, ${res.bajas} bajas respaldadas en <code>Bajas_Historico</code>${emTxt}).`, true);
        } else {
          mostrarStatusPadron('⚠ Aplicado en esta app, pero Google Sheets respondió: ' + esc((res && res.error) || 'actualizá el Apps Script para habilitar syncPadron') + '. Podés descargar <code>datos.js</code> desde el botón de abajo.', false);
        }
      } catch (e) {
        mostrarStatusPadron('⚠ Aplicado en esta app, pero no se pudo conectar con Google Sheets (' + esc(e && e.message || 'sin conexión') + ').', false);
      }
    } else {
      mostrarStatusPadron(`✅ Padrón actualizado en la app (${finales.length.toLocaleString('es-AR')} visitas). Podés descargar <code>datos.js</code> o activar la sincronización con Google Sheets.`, true);
    }
    btn.disabled = false;
  }

  function restaurarPadronBase() {
    if (!confirm('¿Volver al padrón base empaquetado en datos.js? (No borra tus intentos ni PDFs).')) return;
    localStorage.removeItem(LS_PADRON);
    PADRON_LOCAL = null;
    PADRON_UI = null;
    recalcular();
    render();
    $('dlgPadron').close();
  }

  /* ---------- SINCRONIZACIÓN ---------- */
  const URL_POR_DEFECTO = 'https://script.google.com/macros/s/AKfycbw8JBrmXonEGfn0ypWzXRaVrzuPdi8CNN4sqRVtOFvWpKvu1Jeq5_IRyPXN84lX8xqilQ/exec';
  const url = () => load(LS_URL, '') || URL_POR_DEFECTO;

  async function post(payload) {
    const r = await fetch(url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    return r.json();
  }

  async function flush() {
    if (!url() || !COLA.length) return;
    for (const q of COLA.slice()) {
      try {
        const r = await post({ action: 'saveIntento', id: q.id, intento: q.intento, pdfBase64: q.pdfBase64, nombreArchivo: q.nombreArchivo });
        if (!r.ok) { $('sync').textContent = 'Error al enviar: ' + r.error; continue; }
        if (r.adjunto) {
          const a = (INTENTOS[q.id] || []).find(x => x.n === q.intento.n);
          if (a) a.adjunto = r.adjunto;
        }
        COLA = COLA.filter(x => x !== q && !(x.id === q.id && x.intento.n === q.intento.n && x.intento.ts === q.intento.ts));
      } catch (e) { $('sync').textContent = 'Sin conexión con la Web App'; break; }
    }
    save(LS_INT, INTENTOS); save(LS_COLA, COLA); recalcular(); render();
  }

  async function sincronizar() {
    if (!url()) { $('sync').textContent = 'Configurá la URL de la Web App'; return abrirConfig(); }
    try {
      $('sync').textContent = 'Sincronizando…';
      const r = await (await fetch(url() + '?action=getState')).json();
      if (r.ok) {
        if (typeof r.geminiConfigured === 'boolean') geminiActivo = r.geminiConfigured;
        Object.keys(r.intentos).forEach(id => {
          const mapa = {};
          (INTENTOS[id] || []).forEach(x => mapa[x.n] = x);
          r.intentos[id].forEach(b => { if (!COLA.some(q => q.id === id && q.intento.n === b.n)) mapa[b.n] = b; });
          INTENTOS[id] = Object.values(mapa).sort((a, b) => a.n - b.n);
        });
        save(LS_INT, INTENTOS);
        if (r.padronUpdatedAt && (!PADRON_LOCAL || !PADRON_LOCAL.ts || r.padronUpdatedAt > PADRON_LOCAL.ts)) {
          try {
            const rp = await (await fetch(url() + '?action=getPadron')).json();
            if (rp && rp.ok && Array.isArray(rp.visitas) && rp.visitas.length) {
              PADRON_LOCAL = { generado: rp.generado || C.hoyISO(), ts: rp.ts || r.padronUpdatedAt, archivo: 'Google Sheets', visitas: rp.visitas };
              save(LS_PADRON, PADRON_LOCAL);
            }
          } catch (e2) { /* silencioso si backend anterior no tiene getPadron */ }
        }
      }
      await flush();
    } catch (e) { $('sync').textContent = 'No se pudo sincronizar'; }
    recalcular(); render();
  }

  function abrirConfig() { $('cfgUrl').value = url(); $('cfgUser').value = load(LS_USER, ''); $('dlgCfg').showModal(); }
  function guardarConfig() { save(LS_URL, $('cfgUrl').value.trim()); save(LS_USER, $('cfgUser').value.trim()); if (OCR) OCR.resetGeminiCache(); $('dlgCfg').close(); sincronizar(); }

  function exportar() {
    const cols = [
      ['id', 'ID'], ['cohorte', 'Cohorte'], ['planificacion', 'Etapa'], ['cuit', 'CUIT'], ['empleador', 'Empleador'],
      ['contrato', 'Contrato'], ['nroEstab', 'Estab (M)'], ['establecimiento', 'Establecimiento'], ['localidad', 'Localidad'],
      ['provincia', 'Provincia'], ['tareas', 'Tareas'], ['fechaMax', 'Fecha Maxima (Col R)'], ['vencida', 'Vencida'],
      ['fechaAgendada', 'Fecha Programada (Preventor)'], ['fechaReal', 'Fecha Real'], ['estado', 'Estado']
    ];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '\ufeff' + cols.map(c => q(c[1])).join(',') + '\n' + filtrar().map(v => cols.map(([k]) => q(k === 'vencida' ? (v.vencida ? 'Si' : 'No') : v[k])).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'seguimiento_' + vista + '_' + C.hoyISO() + '.csv'; a.click();
  }

  function resetFiltros() {
    Object.assign(F, { cohorte: '', plan: '', ambito: '', estado: '', mes: '', venc: '', tarea: '', cruceOct: '', errTipo: '', q: '', sub: '' });
    pagina = 1;
  }

  function limpiarFiltros() {
    resetFiltros();
    render();
  }

  window.App = {
    ir(v) { vista = v; pagina = 1; render(); },
    sub(s) { subTab = s; partFiltro = 'all'; vista = 'tablero'; render(); },
    partMes(k) {
      partFiltro = k;
      if (ultimoCP) {
        document.querySelectorAll('#partBtns button').forEach(b => b.classList.toggle('on', b.getAttribute('onclick') === `App.partMes('${k}')`));
        renderChartParticipacion(ultimoCP.cp, ultimoCP.tituloScope);
      }
    },
    toggleMay27(checked) { F.excluirMay27 = !!checked; pagina = 1; recalcular(); render(); },
    verCruceOct() { resetFiltros(); F.cohorte = 'Emergente'; F.cruceOct = 'con'; vista = 'todas'; render(); },
    verTarea(k) { resetFiltros(); F.tarea = k; vista = 'todas'; render(); },
    verVencidas(cohorte) { resetFiltros(); if (cohorte) F.cohorte = cohorte; F.venc = 'vencida'; vista = 'pendientes'; render(); },
    limpiarFiltros,
    f(k, val, keep) { F[k] = val; pagina = 1; if (keep) { renderLista(); const i = document.querySelector('input[type=search]'); if (i) { i.focus(); i.setSelectionRange(val.length, val.length); } } else render(); },
    pag(d) { pagina = Math.max(1, pagina + d); renderLista(); },
    logTag(id) { LOG.etiqueta = (LOG.etiqueta === id) ? '' : id; LOG.pagina = 1; renderLogistica(); },
    logAmbito(k) { LOG.ambito = (LOG.ambito === k) ? '' : k; LOG.zona = ''; LOG.pagina = 1; renderLogistica(); },
    logZona(k) { LOG.zona = (LOG.zona === k) ? '' : k; if (LOG.zona && !LOG.ambito) LOG.ambito = LOG.zona.split('|')[0]; LOG.pagina = 1; renderLogistica(); },
    logToggleZonas() { LOG.verTodasZonas = !LOG.verTodasZonas; renderLogistica(); },
    logOpt(k, val) { LOG[k] = val; LOG.pagina = 1; renderLogistica(); },
    logBuscar(val) { LOG.q = val; LOG.pagina = 1; renderLogistica(); const i = $('logSearch'); if (i) { i.focus(); i.setSelectionRange(val.length, val.length); } },
    logPag(d) { LOG.pagina = Math.max(1, LOG.pagina + d); renderLogistica(); },
    logLimpiar() { Object.assign(LOG, { etiqueta: '', ambito: '', zona: '', q: '', pagina: 1 }); renderLogistica(); },
    exportarRutaCSV,
    abrir, guardar, toggleRes, analizarPdfIndividual,
    abrirMasiva, agregarArchivosMasiva, updLote, quitarLote, limpiarMasiva, confirmarLote, verPdfLote,
    abrirPadron, cargarArchivoPadron, cambiarHojaPadron, remapearColumnaPadron, setPadronOpt, aplicarPadron, descargarDiffCSV, descargarDatosJS, restaurarPadronBase,
    sincronizar, abrirConfig, guardarConfig, exportar,
    _estado: () => ({ VISITAS, INTENTOS, COLA, LOTE, PADRON_LOCAL, PADRON_UI, geminiActivo })
  };
  window.dlgVisita = $('dlgVisita'); window.dlgCfg = $('dlgCfg'); window.dlgMasiva = $('dlgMasiva'); window.dlgPadron = $('dlgPadron');
  $('dlgVisita').addEventListener('close', () => {
    if (blobUrlIndividual) { URL.revokeObjectURL(blobUrlIndividual); blobUrlIndividual = ''; }
    $('dlgVisita').classList.remove('wide');
  });

  recalcular(); render();
  if (url()) sincronizar();
})();
