/* Módulo Seguimiento Consultora - UI. Depende de core.js (SegCore), ocr.js (SegOCR) y datos.js (SEG_DATA). */
(function () {
  'use strict';
  const C = window.SegCore, E = C.ESTADOS, OCR = window.SegOCR;
  const D = window.SEG_DATA || { visitas: [], historico: [] };
  const LS_INT = 'SEG_INTENTOS_V1', LS_COLA = 'SEG_COLA_V1', LS_URL = 'SEG_URL_V1', LS_USER = 'SEG_USER_V1';
  const MOTIVOS = ['Establecimiento cerrado', 'No atiende nadie / sin responsable', 'Domicilio inexistente o incorrecto',
    'Empleador sin personal', 'Rechazo de la visita', 'Dificultad de acceso / clima', 'Otro'];
  const PAGE = 100;

  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);

  let INTENTOS = load(LS_INT, {});
  let COLA = load(LS_COLA, []);
  let VISITAS_TODAS = [];
  let VISITAS = [];
  let vista = 'tablero', subTab = 'consolidado', pagina = 1;
  let chMain = null, chSec = null;
  let geminiActivo = null; // null = sin verificar, true/false según backend
  const F = { cohorte: '', plan: '', ambito: '', estado: '', mes: '', venc: '', cruceOct: '', q: '', sub: '', excluirMay27: true };

  const TABS = [['tablero', 'Tablero'], ['todas', 'Todas'], ['agendadas', 'Agendadas'],
    ['realizadas', 'Realizadas'], ['pendientes', 'Pendientes'], ['revisar', 'A revisar (duplicadas)']];

  function recalcular() {
    VISITAS_TODAS = C.armarVisitas(D.visitas, INTENTOS, C.hoyISO(), D.historico);
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
      if (F.ambito && v.ambito !== F.ambito) return false;
      if (F.estado && v.estado !== F.estado) return false;
      if (F.mes && C.mesDe(v.fechaMax) !== F.mes) return false;
      if (F.venc && v.catVenc !== F.venc) return false;
      if (F.cruceOct === 'con' && !v.cruceOct) return false;
      if (F.cruceOct === 'Efectiva' && !(v.cruceOct && v.cruceOct.resultado === 'Efectiva')) return false;
      if (F.cruceOct === 'Fallida' && !(v.cruceOct && v.cruceOct.resultado === 'Fallida')) return false;
      if (q) {
        const h = C.sinTildes([v.cuit, v.empleador, v.contrato, v.establecimiento, v.localidad, v.tareas, v.nroEstab].join(' ')).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    }).sort((a, b) => (a.plazo || '9').localeCompare(b.plazo || '9'));
  }

  const uniq = k => Array.from(new Set(D.visitas.map(v => v[k]).filter(Boolean))).sort();
  const opts = (arr, sel, all) => `<option value="">${all}</option>` + arr.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const pct = (a, b) => b ? Math.round(a * 100 / b) + '%' : '–';
  const pct1 = x => (Math.round(x * 1000) / 10).toLocaleString('es-AR') + '%';
  const n1 = x => (Math.round(x * 10) / 10).toLocaleString('es-AR');

  function renderTabs() {
    const excluidas = VISITAS_TODAS.length - C.filtrarCorteFuturo(VISITAS_TODAS, true).length;
    $('tabs').innerHTML = TABS.map(([k, n]) => {
      const c = k === 'tablero' ? '' : `<span class="badge">${VISITAS.filter(enVista[k]).length}</span>`;
      return `<button class="${k === vista ? 'on' : ''}" onclick="App.ir('${k}')">${n}${c}</button>`;
    }).join('') + `<label class="cut-toggle" title="Predeterminado: excluye visitas con fecha desde Mayo 2027 inclusive en adelante"><input type="checkbox" ${F.excluirMay27 ? 'checked' : ''} onchange="App.toggleMay27(this.checked)"> Excluir ≥ May-2027${excluidas ? ` (${excluidas})` : ''}</label>`;
  }

  /* ---------- TABLERO UNIFICADO (Consolidado 500 | Emergentes 100 | Residuales 400) ---------- */
  function destruirCharts() {
    if (chMain) { chMain.destroy(); chMain = null; }
    if (chSec) { chSec.destroy(); chSec = null; }
  }

  function renderTablero() {
    destruirCharts();
    const T = C.tablero(VISITAS, D.historico, C.hoyISO());
    const co = T.consolidado, em = T.emergentes, re = T.residuales;
    const card = (k, v, s) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || ''}</div></div>`;

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
          <div class="hs"><span>Meta: <b>${em.metaMes}/mes</b></span><span>Efectivas: <b>${em.efectivas}</b></span><span>Fallidas: <b>${em.fallidas}</b></span><span>Agendadas mes: <b>${em.agendadasMesActual}</b></span></div>
        </div>
        <div class="hero-box res" onclick="App.sub('residuales')">
          <div class="ht"><span>Universo 2 · Stock Residual (&lt; oct-26)</span><span>Ver detalle →</span></div>
          <div class="hv">${re.realizadas.toLocaleString('es-AR')} <span style="font-size:14px;font-weight:400;color:var(--mut)">/ ${re.total.toLocaleString('es-AR')} (${pct1(re.pct)})</span></div>
          <div class="hs"><span>Meta: <b>${re.metaMes}/mes</b> (desde Nov-26)</span><span>Pendientes: <b>${re.pendientes.toLocaleString('es-AR')}</b></span><span>Agendadas mes: <b>${re.agendadasMesActual}</b></span><span>Vencidas: <b class="${re.vencidas ? 'venc' : ''}">${re.vencidas}</b></span></div>
        </div>
      </div>
      <div class="cards">
        ${card('Objetivo Consolidado (c/PDF)', co.realizadas.toLocaleString('es-AR'), `de ${co.planTotal.toLocaleString('es-AR')} del plan (${pct1(co.pct)}) · incluye ${co.historico.conDocumento} Sep–Oct`)}
        ${card('Meta mensual vigente (' + co.mesActual + ')', co.metaMesVigente, '100 emergentes + 400 residuales')}
        ${card('Agendadas este mes', co.agendadasMesActual, `vs ${co.metaMesVigente} (${pct(co.agendadasMesActual, co.metaMesVigente)})`)}
        ${card('Sin agendar / a reprogramar', co.sinAgendar.toLocaleString('es-AR'), 'en tabla vigente')}
        ${card('Vencidas', co.vencidas, `${re.vencidas} residual + ${em.vencidas} emergente`)}
        ${card('Con resultado sin PDF', co.sinDocumento, 'no cuentan para el objetivo' + (co.historico.sinDocumento ? ` (${co.historico.sinDocumento} Sep–Oct)` : ''))}
      </div>
      <h2>Evolución Mensual Consolidada · Cerradas c/PDF (apiladas) y Agendadas vs Meta (100 Sep–Oct · 500 Nov+)</h2>
      <div class="card" style="height:290px"><canvas id="chMain"></canvas></div>
      <div class="grid2">
        <div><h2>Resumen Consolidado por Mes</h2>
        <table><thead><tr><th>Mes</th><th>Meta</th><th>Emerg. (Ef/Fa)</th><th>Resid. (Ef/Fa)</th><th>Total c/PDF</th><th>Cumpl.</th><th>Agendadas</th></tr></thead><tbody>
        ${co.meses.map(m => `<tr style="cursor:default"><td>${m.mes}</td><td>${m.meta}</td><td>${m.emTot} <span class="note">(${m.emEf}/${m.emFa})</span></td><td>${m.resTot} <span class="note">(${m.resEf}/${m.resFa})</span></td><td><b>${m.total}</b></td><td><div class="bar"><i style="width:${Math.min(100, m.total * 100 / m.meta)}%"></i></div>${pct(m.total, m.meta)}</td><td>${m.agendadas == null ? '–' : m.agendadas}</td></tr>`).join('')}
        </tbody></table></div>
        <div><h2>Por Etapa (Total Padrón)</h2>
        <table><thead><tr><th>Etapa</th><th>Plazo</th><th>Total</th><th>Cerradas</th><th>Avance</th><th>Sin agendar</th><th>Vencidas</th></tr></thead><tbody>
        ${co.etapas.map(b => `<tr style="cursor:default"><td>${esc(b.etapa)}</td><td>${/Urgente/.test(b.etapa) ? 'fecha máx. fila' : C.aDMY(C.CONFIG.PLAZO_ETAPA[b.etapa])}</td><td>${b.total}</td><td>${b.cerradas}</td><td><div class="bar"><i style="width:${b.total ? b.cerradas * 100 / b.total : 0}%"></i></div>${pct(b.cerradas, b.total)}</td><td>${b.sinAgendar}</td><td class="${b.vencidas ? 'venc' : ''}">${b.vencidas}</td></tr>`).join('')}
        ${co.historico.total ? `<tr style="cursor:default"><td>Histórico Sep–Oct (Emergentes)</td><td>ejecutadas</td><td>${co.historico.total}</td><td>${co.historico.conDocumento}</td><td><div class="bar"><i style="width:${co.historico.conDocumento * 100 / co.historico.total}%"></i></div>${pct(co.historico.conDocumento, co.historico.total)}</td><td>0</td><td>0</td></tr>` : ''}
        </tbody></table></div>
      </div>`;
    } else if (subTab === 'emergentes') {
      h += `<div class="cards">
        ${card('Realizadas del ciclo (c/PDF)', em.realizadas, `de ${em.metaAnual.toLocaleString('es-AR')} (${pct1(em.pct)}) · restan ${em.restanMetaAnual}`)}
        ${card('Efectivas / Fallidas', `${em.efectivas} / ${em.fallidas}`, `tasa efectividad ${pct1(em.tasaEfectividad)}`)}
        ${card('Meta acumulada a hoy', em.metaAcum, `desvío ${em.desvio >= 0 ? '+' : ''}${em.desvio} (100/mes)`)}
        ${card('Agendadas este mes', em.agendadasMesActual, `meta ${em.metaMes}/mes · ${pct(em.agendadasMesActual, em.metaMes)}`)}
        ${card('Promedio mensual', n1(em.promedioMensual), em.mejorMes ? `mejor mes ${em.mejorMes.mes}: ${em.mejorMes.total} (${em.mejorMes.efectivas} ef + ${em.mejorMes.fallidas} fa)` : '')}
        ${card('Arrastre Oct / Vencidas', `${em.vencidasOctubre} / ${em.vencidas}`, `con PDF Oct (cruce): ${em.cruceOct.total} (${em.cruceOct.efectivas} ef · ${em.cruceOct.fallidas} fa)`)}
      </div>
      <div class="info-box" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span><strong>Cruce PDF Octubre vs Emergentes (CUIT + Estab col. M):</strong> ${em.cruceOct.total} filas emergentes coinciden con un PDF de octubre (<b>${em.cruceOct.efectivas} Efectivas</b> y <b>${em.cruceOct.fallidas} Fallidas</b>). Se muestran marcadas en la tabla sin sumar doble al objetivo.</span>
        <button class="btn sec sm" onclick="App.verCruceOct()">Ver esas ${em.cruceOct.total} filas →</button>
      </div>
      <div class="grid2">
        <div><h2>Emergentes por Mes · Efectivas + Fallidas c/PDF y Agendadas (Meta 100/mes)</h2><div class="card" style="height:270px"><canvas id="chMain"></canvas></div></div>
        <div><h2>Cortes Trimestrales (Meta 300/trimestre)</h2>
        <table><thead><tr><th>Corte</th><th>Período</th><th>Meta</th><th>Efectivas</th><th>Fallidas</th><th>Total</th><th>Cumpl.</th></tr></thead><tbody>
        ${em.trimestres.map(t => `<tr style="cursor:default"><td>${t.q}</td><td>${t.desde} → ${t.hasta}</td><td>${t.meta}</td><td>${t.efectivas}</td><td>${t.fallidas}</td><td><b>${t.total}</b></td><td><div class="bar"><i style="width:${Math.min(100, t.total * 100 / t.meta)}%"></i></div>${pct(t.total, t.meta)}</td></tr>`).join('')}
        </tbody></table></div>
      </div>`;
    } else {
      h += `<div class="cards">
        ${card('Residuales cerradas (c/PDF)', re.realizadas, `de ${re.total.toLocaleString('es-AR')} (${pct1(re.pct)})`)}
        ${card('Pendientes a liquidar', re.pendientes.toLocaleString('es-AR'), `Etapa 1 fin ${C.aDMY(re.finE1)} · Etapa 2 fin ${C.aDMY(re.finE2)}`)}
        ${card('Agendadas este mes', re.agendadasMesActual, `meta ${re.metaMes}/mes · ${pct(re.agendadasMesActual, re.metaMes)}`)}
        ${card('Ritmo requerido (Etapa 1)', n1(re.ritmoRequeridoE1), `visitas/mes (${re.mesesRestE1} mes/es hasta Ene-27)`)}
        ${card('Técnicas / Especiales', `${re.tecnicas} / ${re.especiales}`, 'tipología del stock residual')}
        ${card('Vencidas', re.vencidas, 'plazo individual superado')}
      </div>
      <div class="grid2">
        <div><h2>Residuales por Mes · Cerradas c/PDF y Agendadas (Meta 400/mes)</h2><div class="card" style="height:270px"><canvas id="chMain"></canvas></div></div>
        <div><h2>Curva de Extinción (Burn-down a 400/mes)</h2><div class="card" style="height:270px"><canvas id="chSec"></canvas></div></div>
      </div>
      <h2>Stock Residual por Etapa</h2>
      <table><thead><tr><th>Etapa</th><th>Plazo</th><th>Total</th><th>Cerradas c/PDF</th><th>Avance</th><th>Agendadas</th><th>Sin agendar</th><th>Vencidas</th></tr></thead><tbody>
      ${re.etapas.map(b => `<tr style="cursor:default"><td>${esc(b.etapa)}</td><td>${/Urgente/.test(b.etapa) ? 'fecha máx. fila' : C.aDMY(C.CONFIG.PLAZO_ETAPA[b.etapa])}</td><td>${b.total}</td><td>${b.cerradas}</td><td><div class="bar"><i style="width:${b.total ? b.cerradas * 100 / b.total : 0}%"></i></div>${pct(b.cerradas, b.total)}</td><td>${b.agendadasPend}</td><td>${b.sinAgendar}</td><td class="${b.vencidas ? 'venc' : ''}">${b.vencidas}</td></tr>`).join('')}
      </tbody></table>`;
    }

    h += `<p class="note" style="margin-top:14px">Solo cierra y cuenta para el objetivo lo que tiene documento PDF asociado. Datos base: ${esc(D.generado || '')}.</p>`;
    $('main').innerHTML = h;

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
            { label: 'Agendadas (mes)',        data: ms.map(x => x.agendadas), backgroundColor: 'rgba(91,102,112,0.55)', stack: 'agenda', order: 2 },
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
            { label: 'Agendadas',       data: ms.map(x => x.agendadas), backgroundColor: 'rgba(15,76,92,0.55)', stack: 'agenda', order: 2 },
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
            { label: 'Agendadas',       data: ms.map(x => x.agendadas), backgroundColor: 'rgba(91,102,112,0.55)', stack: 'agenda', order: 2 },
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
    const meses = Array.from(new Set(D.visitas.map(v => C.mesDe(v.fechaMax)).filter(Boolean))).sort();
    const nVenc = VISITAS.filter(v => v.catVenc === 'vencida').length;
    const nMesAct = VISITAS.filter(v => v.catVenc === 'mes_actual').length;
    const nOtroMes = VISITAS.filter(v => v.catVenc === 'otro_mes').length;
    let h = `<div class="filters">
      <input type="search" placeholder="Buscar CUIT, empleador, contrato, localidad…" value="${esc(F.q)}" oninput="App.f('q',this.value,true)">
      <select onchange="App.f('venc',this.value)">
        <option value="">Vencimiento: todos</option>
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
      <button class="btn sec sm" onclick="App.exportar()">Exportar CSV</button>
      <span class="note">${total} visitas</span></div>`;
    h += `<div style="overflow:auto;max-height:72vh"><table class="grid-op"><thead><tr><th>Cohorte</th><th>Etapa</th><th>CUIT</th><th>Empleador</th><th>Estab. (M)</th><th>Localidad</th><th>Tareas</th><th>Fecha máx.</th><th>Agendada</th><th>Fecha real</th><th>Estado</th><th>Acción</th></tr></thead><tbody>`;
    sl.forEach(v => {
      const tareasTxt = v.tareas.split('//').join(' · ');
      const estabTxt = `${v.nroEstab} · ${v.establecimiento}`;
      const locTxt = `${v.localidad}, ${v.provincia}`;
      const cruceTag = v.cruceOct ? ` <a href="${esc(v.cruceOct.url)}" target="_blank" onclick="event.stopPropagation()" class="pill ${v.cruceOct.resultado === 'Efectiva' ? 'p-ok' : 'p-bad'}" title="PDF cargado en Octubre (${esc(v.cruceOct.fecha)} · ${esc(v.cruceOct.tarea)})">PDF Oct: ${v.cruceOct.resultado} ↗</a>` : '';
      h += `<tr data-id="${esc(v.id)}" onclick="App.abrir(this.dataset.id)"><td>${v.cohorte}</td><td>${esc(v.planificacion)}</td><td>${esc(v.cuit)}</td><td class="clip" style="max-width:190px" title="${esc(v.empleador)}">${esc(v.empleador)}</td>
        <td class="clip" style="max-width:140px" title="${esc(estabTxt)}">${esc(estabTxt)}</td><td class="clip" style="max-width:140px" title="${esc(locTxt)}">${esc(locTxt)}</td>
        <td class="clip" style="max-width:220px" title="${esc(tareasTxt)}">${esc(tareasTxt)}${v.revisarDuplicada ? ' <span class="pill p-warn">revisar</span>' : ''}${cruceTag}</td>
        <td class="${v.vencida ? 'venc' : ''}">${C.aDMY(v.plazo)}${v.vencida ? ' ⚠' : ''}</td><td>${C.aDMY(v.fechaAgendada)}</td><td>${C.aDMY(v.fechaReal)}</td><td>${pillEstado(v.estado)}</td>
        <td><button class="btn sec sm" data-id="${esc(v.id)}" onclick="event.stopPropagation();App.abrir(this.dataset.id)">📄 PDF</button></td></tr>`;
    });
    if (!sl.length) h += '<tr><td colspan="12" class="note" style="padding:20px">Sin resultados.</td></tr>';
    h += `</tbody></table></div><div class="pager"><button onclick="App.pag(-1)">‹</button> Página ${pagina} de ${pags} <button onclick="App.pag(1)">›</button></div>`;
    $('main').innerHTML = h;
  }

  function render() {
    renderTabs();
    if (vista === 'tablero') renderTablero(); else renderLista();
    const pend = COLA.length;
    $('sync').textContent = (D.generado ? 'Datos base: ' + D.generado : '') + (pend ? ' · ' + pend + ' envío(s) pendiente(s)' : '');
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

    $('dvTitulo').textContent = v.empleador + ' · Estab ' + v.nroEstab;
    $('dvBody').innerHTML = `<div id="dvSplit"><div><div class="kv">
      ${dato('CUIT / Contrato', v.cuit + ' / ' + v.contrato)}${dato('Establecimiento', v.establecimiento + ' — ' + v.domicilio)}
      ${dato('Localidad', v.localidad + ', ' + v.provincia)}${dato('Tareas', v.tareas.split('//').join(' · '))}
      ${dato('Cohorte / Etapa', v.cohorte + ' · ' + v.planificacion)}
      <b>Fecha máxima</b><span class="${v.vencida ? 'venc' : ''}">${C.aDMY(v.plazo)}${v.vencida ? ' (vencida)' : ''}</span>
      <b>Estado</b><span>${pillEstado(v.estado)}</span>${v.obsCS ? dato('Obs. CS', v.obsCS) : ''}${v.obsIAPSER ? dato('Obs. IAPSER', v.obsIAPSER) : ''}</div>
      ${cruceHtml}
      ${previos.length ? `<table class="hist"><thead><tr><th>#</th><th>Agendada</th><th>Real</th><th>Resultado</th><th>Motivo</th><th>PDF</th></tr></thead><tbody>${previos.map(p => `<tr style="cursor:default"><td>${p.n}</td><td>${C.aDMY(p.fechaAgendada)}</td><td>${C.aDMY(p.fechaReal)}</td><td>${esc(p.resultado)}</td><td>${esc(p.motivo)}</td><td>${p.adjunto ? `<a href="${esc(p.adjunto)}" target="_blank">ver</a>` : '–'}</td></tr>`).join('')}</tbody></table>` : ''}
      <fieldset><legend>Intento ${it.n} · Agenda</legend>
        <label>Fecha agendada</label><input type="date" id="fAg" value="${esc(it.fechaAgendada || '')}"></fieldset>
      <fieldset><legend>Resultado y Documento PDF</legend>
        <label>Documento PDF (obligatorio para cerrar · detecta fecha y resultado automáticamente)</label>
        <input type="file" id="fPdf" accept="application/pdf,.pdf" onchange="App.analizarPdfIndividual(this.files[0])">
        <div id="fOcrInfo" class="note" style="margin-top:4px">${it.adjunto ? `PDF actual: <a href="${esc(it.adjunto)}" target="_blank">abrir ↗</a> (subí otro para reemplazarlo)` : ''}</div>
        <div class="row2"><div><label>Fecha real de la visita (puede ser distinta a la agendada)</label><input type="date" id="fReal" max="${C.hoyISO()}" value="${esc(it.fechaReal || '')}"></div>
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
    if (!res && !nuevo.fechaAgendada) errs.push('Cargá una fecha agendada o un resultado');
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
      }
      await flush();
    } catch (e) { $('sync').textContent = 'No se pudo sincronizar'; }
    recalcular(); render();
  }

  function abrirConfig() { $('cfgUrl').value = url(); $('cfgUser').value = load(LS_USER, ''); $('dlgCfg').showModal(); }
  function guardarConfig() { save(LS_URL, $('cfgUrl').value.trim()); save(LS_USER, $('cfgUser').value.trim()); if (OCR) OCR.resetGeminiCache(); $('dlgCfg').close(); sincronizar(); }

  function exportar() {
    const cols = ['id', 'cohorte', 'planificacion', 'cuit', 'empleador', 'contrato', 'nroEstab', 'establecimiento', 'localidad', 'provincia', 'tareas', 'plazo', 'fechaAgendada', 'fechaReal', 'estado'];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '\ufeff' + cols.join(',') + '\n' + filtrar().map(v => cols.map(c => q(v[c])).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'seguimiento_' + vista + '_' + C.hoyISO() + '.csv'; a.click();
  }

  window.App = {
    ir(v) { vista = v; pagina = 1; render(); },
    sub(s) { subTab = s; vista = 'tablero'; render(); },
    toggleMay27(checked) { F.excluirMay27 = !!checked; pagina = 1; recalcular(); render(); },
    verCruceOct() { F.cohorte = 'Emergente'; F.cruceOct = 'con'; vista = 'todas'; pagina = 1; render(); },
    f(k, val, keep) { F[k] = val; pagina = 1; if (keep) { renderLista(); const i = document.querySelector('input[type=search]'); if (i) { i.focus(); i.setSelectionRange(val.length, val.length); } } else render(); },
    pag(d) { pagina = Math.max(1, pagina + d); renderLista(); },
    abrir, guardar, toggleRes, analizarPdfIndividual,
    abrirMasiva, agregarArchivosMasiva, updLote, quitarLote, limpiarMasiva, confirmarLote, verPdfLote,
    sincronizar, abrirConfig, guardarConfig, exportar,
    _estado: () => ({ VISITAS, INTENTOS, COLA, LOTE, geminiActivo })
  };
  window.dlgVisita = $('dlgVisita'); window.dlgCfg = $('dlgCfg'); window.dlgMasiva = $('dlgMasiva');
  $('dlgVisita').addEventListener('close', () => {
    if (blobUrlIndividual) { URL.revokeObjectURL(blobUrlIndividual); blobUrlIndividual = ''; }
    $('dlgVisita').classList.remove('wide');
  });

  recalcular(); render();
  if (url()) sincronizar();
})();
