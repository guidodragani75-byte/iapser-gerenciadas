/* Módulo Seguimiento Consultora - UI. Depende de core.js (SegCore) y datos.js (SEG_DATA). */
(function () {
  'use strict';
  const C = window.SegCore, E = C.ESTADOS;
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
  let VISITAS = [];
  let vista = 'tablero', pagina = 1, chart = null;
  const F = { cohorte: '', plan: '', ambito: '', estado: '', mes: '', q: '', sub: '' };

  const TABS = [['tablero', 'Tablero'], ['originales', 'Plan anual y residual (KPIs)'], ['todas', 'Todas'], ['agendadas', 'Agendadas'], ['realizadas', 'Realizadas'],
    ['pendientes', 'Pendientes'], ['revisar', 'A revisar (duplicadas)']];

  function recalcular() { VISITAS = C.armarVisitas(D.visitas, INTENTOS, C.hoyISO()); }

  const enVista = {
    todas: () => true,
    agendadas: v => v.estado === E.AGENDADA,
    realizadas: v => !!(C.ultimoIntento(v.intentos) || {}).resultado,
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
        const r = (C.ultimoIntento(v.intentos) || {}).resultado;
        if (r !== F.sub) return false;
      }
      if (F.cohorte && v.cohorte !== F.cohorte) return false;
      if (F.plan && v.planificacion !== F.plan) return false;
      if (F.ambito && v.ambito !== F.ambito) return false;
      if (F.estado && v.estado !== F.estado) return false;
      if (F.mes && C.mesDe(v.fechaMax) !== F.mes) return false;
      if (q) {
        const h = C.sinTildes([v.cuit, v.empleador, v.contrato, v.establecimiento, v.localidad, v.tareas, v.nroEstab].join(' ')).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    }).sort((a, b) => (a.plazo || '9').localeCompare(b.plazo || '9'));
  }

  const uniq = k => Array.from(new Set(D.visitas.map(v => v[k]).filter(Boolean))).sort();
  const opts = (arr, sel, all) => `<option value="">${all}</option>` + arr.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');

  function renderTabs() {
    $('tabs').innerHTML = TABS.map(([k, n]) => {
      const c = (k === 'tablero' || k === 'originales') ? '' : `<span class="badge">${VISITAS.filter(enVista[k]).length}</span>`;
      return `<button class="${k === vista ? 'on' : ''}" onclick="App.ir('${k}')">${n}${c}</button>`;
    }).join('');
  }

  function renderLista() {
    const lista = filtrar();
    const total = lista.length, pags = Math.max(1, Math.ceil(total / PAGE));
    if (pagina > pags) pagina = pags;
    const sl = lista.slice((pagina - 1) * PAGE, pagina * PAGE);
    const meses = Array.from(new Set(D.visitas.map(v => C.mesDe(v.fechaMax)).filter(Boolean))).sort();
    let h = `<div class="filters">
      <input type="search" placeholder="Buscar CUIT, empleador, contrato, localidad…" value="${esc(F.q)}" oninput="App.f('q',this.value,true)">
      <select onchange="App.f('cohorte',this.value)">${opts(['Residual', 'Emergente'], F.cohorte, 'Cohorte: todas')}</select>
      <select onchange="App.f('plan',this.value)">${opts(uniq('planificacion'), F.plan, 'Etapa: todas')}</select>
      <select onchange="App.f('ambito',this.value)">${opts(uniq('ambito'), F.ambito, 'Ámbito: todos')}</select>
      <select onchange="App.f('mes',this.value)">${opts(meses, F.mes, 'Mes fecha máx.: todos')}</select>
      <select onchange="App.f('estado',this.value)">${opts(Object.values(E), F.estado, 'Estado: todos')}</select>
      ${vista === 'realizadas' ? `<select onchange="App.f('sub',this.value)"><option value="">Efectivas y fallidas</option><option value="Efectiva" ${F.sub === 'Efectiva' ? 'selected' : ''}>Solo efectivas</option><option value="Fallida" ${F.sub === 'Fallida' ? 'selected' : ''}>Solo fallidas</option></select>` : ''}
      <button class="btn sec" onclick="App.exportar()">Exportar CSV</button>
      <span class="note">${total} visitas</span></div>`;
    h += `<div style="overflow:auto;max-height:68vh"><table><thead><tr><th>Cohorte</th><th>Etapa</th><th>CUIT</th><th>Empleador</th><th>Estab.</th><th>Localidad</th><th>Tareas</th><th>Fecha máx.</th><th>Agendada</th><th>Fecha real</th><th>Estado</th></tr></thead><tbody>`;
    sl.forEach(v => {
      h += `<tr data-id="${esc(v.id)}" onclick="App.abrir(this.dataset.id)"><td>${v.cohorte}</td><td>${esc(v.planificacion)}</td><td>${esc(v.cuit)}</td><td>${esc(v.empleador)}</td>
        <td>${esc(v.nroEstab)} · ${esc(v.establecimiento)}</td><td>${esc(v.localidad)}, ${esc(v.provincia)}</td>
        <td style="max-width:260px">${esc(v.tareas.split('//').join(' · '))}${v.revisarDuplicada ? ' <span class="pill p-warn">revisar</span>' : ''}</td>
        <td class="${v.vencida ? 'venc' : ''}">${C.aDMY(v.plazo)}${v.vencida ? ' ⚠' : ''}</td><td>${C.aDMY(v.fechaAgendada)}</td><td>${C.aDMY(v.fechaReal)}</td><td>${pillEstado(v.estado)}</td></tr>`;
    });
    if (!sl.length) h += '<tr><td colspan="11" class="note" style="padding:20px">Sin resultados.</td></tr>';
    h += `</tbody></table></div><div class="pager"><button onclick="App.pag(-1)">‹</button> Página ${pagina} de ${pags} <button onclick="App.pag(1)">›</button></div>`;
    $('main').innerHTML = h;
  }

  function mesesRango(r) {
    const s = new Set(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
    Object.keys(r.agendadasMes).concat(Object.keys(r.cerradasMes)).forEach(m => s.add(m));
    return Array.from(s).sort();
  }
  const pct = (a, b) => b ? Math.round(a * 100 / b) + '%' : '–';

  function renderTablero() {
    const r = C.resumen(VISITAS, D.historico, C.hoyISO());
    const meta = C.CONFIG.META_AGENDA_MES;
    const mesesR = mesesRango(r);
    const mesActual = C.hoyISO().slice(0, 7);
    const agMes = r.agendadasMes[mesActual] || 0;
    const card = (k, v, s) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || ''}</div></div>`;
    let h = `<div class="cards">
      ${card('Objetivo: cerradas con PDF', r.objetivoTotal, `incluye ${r.historico.conDocumento} del histórico Sep–Oct`)}
      ${card('Agendadas este mes (' + mesActual + ')', agMes, `meta de gestión ${meta} · ${pct(agMes, meta)}`)}
      ${card('Sin agendar / a reprogramar', r.residual.sinAgendar + r.emergente.sinAgendar, 'pendientes de agenda')}
      ${card('Agendadas pendientes', r.residual.agendadasPend + r.emergente.agendadasPend, 'con fecha, sin resultado')}
      ${card('Vencidas', r.residual.vencidas + r.emergente.vencidas, 'pasó su plazo y no están cerradas')}
      ${card('Con resultado sin PDF', r.residual.sinDocumento + r.emergente.sinDocumento, 'no cuentan para el objetivo')}
      ${card('Duplicadas a revisar', r.duplicadasRevisar, 'misma tarea/estab, fechas distintas')}</div>`;

    h += `<div class="grid2"><div><h2>Agenda de la consultora por mes (meta ${meta}/mes)</h2><div class="card" style="height:260px"><canvas id="chAg"></canvas></div></div>
      <div><h2>Por cohorte</h2><table><thead><tr><th>Cohorte</th><th>Total</th><th>Cerradas c/PDF</th><th>Avance</th><th>Agendadas</th><th>Sin agendar</th><th>Vencidas</th></tr></thead><tbody>
      ${[['Residual (anterior a oct-26)', r.residual], ['Emergente (oct-26 en adelante)', r.emergente]].map(([n, b]) => `<tr style="cursor:default"><td>${n}</td><td>${b.total}</td><td>${b.cerradas}</td><td><div class="bar"><i style="width:${b.total ? b.cerradas * 100 / b.total : 0}%"></i></div>${pct(b.cerradas, b.total)}</td><td>${b.agendadasPend}</td><td>${b.sinAgendar}</td><td class="${b.vencidas ? 'venc' : ''}">${b.vencidas}</td></tr>`).join('')}
      </tbody></table>
      <h2>Por etapa</h2><table><thead><tr><th>Etapa</th><th>Plazo</th><th>Total</th><th>Cerradas</th><th>Avance</th><th>Sin agendar</th><th>Vencidas</th></tr></thead><tbody>
      ${r.etapas.map(b => `<tr style="cursor:default"><td>${esc(b.etapa)}</td><td>${/Urgente/.test(b.etapa) ? 'fecha máx. de cada fila' : C.aDMY(C.CONFIG.PLAZO_ETAPA[b.etapa])}</td><td>${b.total}</td><td>${b.cerradas}</td><td><div class="bar"><i style="width:${b.total ? b.cerradas * 100 / b.total : 0}%"></i></div>${pct(b.cerradas, b.total)}</td><td>${b.sinAgendar}</td><td class="${b.vencidas ? 'venc' : ''}">${b.vencidas}</td></tr>`).join('')}
      </tbody></table></div></div>`;

    h += `<h2>Detalle mensual</h2><table><thead><tr><th>Mes</th><th>Agendadas</th><th>vs ${meta}</th><th>Efectivas c/PDF</th><th>Fallidas cerradas c/PDF</th><th>Total cerradas</th></tr></thead><tbody>
      ${mesesR.map(m => { const a = r.agendadasMes[m] || 0, c = r.cerradasMes[m] || { efectivas: 0, fallidas: 0 }; const aplica = m >= '2026-11';
        return `<tr style="cursor:default"><td>${m}</td><td>${a || (aplica ? 0 : '–')}</td><td>${aplica ? `<div class="bar m"><i style="width:${Math.min(100, a * 100 / meta)}%"></i></div>${pct(a, meta)}` : '–'}</td><td>${c.efectivas}</td><td>${c.fallidas}</td><td><b>${c.efectivas + c.fallidas}</b></td></tr>`; }).join('')}
      </tbody></table>
      <p class="note">Sep–Oct provienen del histórico (modelo anterior). Solo cuenta para el objetivo lo que tiene PDF asociado. Datos base generados: ${esc(D.generado || '')}.</p>`;
    $('main').innerHTML = h;

    if (chart) chart.destroy();
    if (window.Chart) {
      const ms = mesesR.filter(m => m >= '2026-11');
      chart = new Chart($('chAg'), { type: 'bar',
        data: { labels: ms, datasets: [
          { label: 'Agendadas', data: ms.map(m => r.agendadasMes[m] || 0), backgroundColor: '#0F4C5C' },
          { label: 'Cerradas c/PDF', data: ms.map(m => { const c = r.cerradasMes[m]; return c ? c.efectivas + c.fallidas : 0; }), backgroundColor: '#1E7B4B' },
          { type: 'line', label: 'Meta ' + meta, data: ms.map(() => meta), borderColor: '#A8470A', pointRadius: 0, borderDash: [6, 4] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
    }
  }

  /* ---------- Indicadores del módulo original: Universo 1 / 2 / 3 ---------- */
  let ch1 = null, ch2 = null;
  function renderOriginales() {
    const I = C.indicadoresOriginales(VISITAS, D.historico, C.hoyISO()), u1 = I.u1, u2 = I.u2, u3 = I.u3;
    const p = x => Math.round(x * 1000) / 10 + '%';
    const n1 = x => (Math.round(x * 10) / 10).toLocaleString('es-AR');
    const card = (k, v, s) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || ''}</div></div>`;
    let h = `<h2>Universo 1 · Altas mensuales (meta ${u1.metaAnual.toLocaleString('es-AR')} / año · ${u1.metaMes} / mes)</h2><div class="cards">
      ${card('Efectivas del ciclo', u1.efectivas, 'de ' + u1.metaAnual.toLocaleString('es-AR') + ' · ' + p(u1.pct))}
      ${card('Meta acumulada a hoy', u1.metaAcum, 'desvío ' + (u1.desvio >= 0 ? '+' : '') + u1.desvio)}
      ${card('Fallidas cerradas', u1.fallidas, 'con PDF')}
      ${card('Tasa de efectividad', p(u1.tasaEfectividad), 'efectivas / (efectivas + fallidas)')}
      ${card('Promedio mensual', n1(u1.promedioMensual), u1.mejorMes ? 'mejor mes ' + u1.mejorMes.mes + ': ' + u1.mejorMes.efectivas : '')}</div>
      <div class="grid2"><div class="card" style="height:260px"><canvas id="chU1"></canvas></div>
      <table><thead><tr><th>Corte</th><th>Período</th><th>Meta</th><th>Efectivas</th><th>Fallidas</th><th>Cumplimiento</th></tr></thead><tbody>
      ${u1.trimestres.map(t => `<tr style="cursor:default"><td>${t.q}</td><td>${t.desde} → ${t.hasta}</td><td>${t.meta}</td><td>${t.efectivas}</td><td>${t.fallidas}</td><td><div class="bar"><i style="width:${Math.min(100, t.efectivas * 100 / t.meta)}%"></i></div>${pct(t.efectivas, t.meta)}</td></tr>`).join('')}</tbody></table></div>
      <h2>Universo 2 · Stock residual (anterior a oct-26): liquidar hasta ${C.aDMY(u2.fin)}</h2><div class="cards">
      ${card('Realizadas (c/PDF)', u2.realizadas, 'de ' + u2.total + ' · ' + p(u2.pct))}
      ${card('Pendientes', u2.pendientes, 'remanente a liquidar')}
      ${card('Ritmo requerido', n1(u2.ritmoRequerido), 'por mes (' + u2.mesesRestantes + ' mes/es restante/s)')}
      ${card('Técnicas / Especiales', u2.tecnicas + ' / ' + u2.especiales, 'tipología del stock')}
      ${card('Vencidas', u2.vencidas, 'plazo individual superado')}</div>
      <div class="card" style="height:260px"><canvas id="chU2"></canvas></div>
      <h2>Universo 3 · Vista consolidada (metas independientes)</h2><div class="cards">
      ${card('Realizadas totales', u3.realizadas, 'de ' + u3.plan.toLocaleString('es-AR') + ' del plan · ' + p(u3.pct))}
      ${card('Efectivas altas / fallidas', u3.efAltas + ' / ' + u3.faAltas, 'Universo 1')}
      ${card('Realizadas residual', u3.realResidual, 'Universo 2')}
      ${card('Pendientes totales', u3.pendientes.toLocaleString('es-AR'), 'altas por cumplir + residual')}</div>
      <p class="note">Conteo con la regla vigente: solo cierra y cuenta lo que tiene PDF asociado. Altas = histórico Sep–Oct + emergentes cerradas desde octubre.</p>`;
    $('main').innerHTML = h;
    if (ch1) ch1.destroy(); if (ch2) ch2.destroy();
    if (!window.Chart) return;
    const act = u1.meses;
    ch1 = new Chart($('chU1'), { type: 'bar', data: { labels: act.map(x => x.mes), datasets: [
      { label: 'Efectivas', data: act.map(x => x.futuro ? null : x.efectivas), backgroundColor: '#1E7B4B' },
      { label: 'Fallidas', data: act.map(x => x.futuro ? null : x.fallidas), backgroundColor: '#B3261E' },
      { type: 'line', label: 'Meta ' + u1.metaMes, data: act.map(() => u1.metaMes), borderColor: '#A8470A', pointRadius: 0, borderDash: [6, 4] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
    ch2 = new Chart($('chU2'), { type: 'line', data: { labels: u2.burn.map(x => x.mes), datasets: [
      { label: 'Trayectoria teórica', data: u2.burn.map(x => x.teorico), borderColor: '#A8470A', borderDash: [6, 4], pointRadius: 3 },
      { label: 'Stock remanente real', data: u2.burn.map(x => x.real), borderColor: '#0F4C5C', backgroundColor: '#0F4C5C', pointRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
  }
  function render() {
    renderTabs();
    if (vista === 'tablero') renderTablero(); else if (vista === 'originales') renderOriginales(); else renderLista();
    const pend = COLA.length;
    $('sync').textContent = (D.generado ? 'Datos base: ' + D.generado : '') + (pend ? ' · ' + pend + ' envío(s) pendiente(s)' : '');
  }

  /* ---------- ficha de visita ---------- */
  let editando = null;
  function intentoEditable(v) {
    const u = C.ultimoIntento(v.intentos);
    if (!u) return { n: 1 };
    if (v.estado === E.FALLIDA_REPROGRAMAR) return { n: u.n + 1 };
    return Object.assign({}, u);
  }

  function abrir(id) {
    const v = VISITAS.find(x => x.id === id);
    if (!v) return;
    const it = intentoEditable(v);
    editando = { id, it };
    const previos = v.intentos.filter(x => x.n !== it.n);
    const dato = (k, val) => `<b>${k}</b><span>${esc(val) || '–'}</span>`;
    const motivoBase = MOTIVOS.indexOf((it.motivo || '').split(' - ')[0]) >= 0 ? (it.motivo || '').split(' - ')[0] : '';
    const detalle = (it.motivo || '').indexOf(' - ') > 0 ? it.motivo.split(' - ').slice(1).join(' - ') : (motivoBase ? '' : (it.motivo || ''));
    $('dvTitulo').textContent = v.empleador + ' · Estab ' + v.nroEstab;
    $('dvBody').innerHTML = `<div class="kv">
      ${dato('CUIT / Contrato', v.cuit + ' / ' + v.contrato)}${dato('Establecimiento', v.establecimiento + ' — ' + v.domicilio)}
      ${dato('Localidad', v.localidad + ', ' + v.provincia)}${dato('Tareas', v.tareas.split('//').join(' · '))}
      ${dato('Cohorte / Etapa', v.cohorte + ' · ' + v.planificacion)}
      <b>Fecha máxima</b><span class="${v.vencida ? 'venc' : ''}">${C.aDMY(v.plazo)}${v.vencida ? ' (vencida)' : ''}</span>
      <b>Estado</b><span>${pillEstado(v.estado)}</span>${v.obsCS ? dato('Obs. CS', v.obsCS) : ''}${v.obsIAPSER ? dato('Obs. IAPSER', v.obsIAPSER) : ''}</div>
      ${previos.length ? `<table class="hist"><thead><tr><th>#</th><th>Agendada</th><th>Real</th><th>Resultado</th><th>Motivo</th><th>PDF</th></tr></thead><tbody>${previos.map(p => `<tr style="cursor:default"><td>${p.n}</td><td>${C.aDMY(p.fechaAgendada)}</td><td>${C.aDMY(p.fechaReal)}</td><td>${esc(p.resultado)}</td><td>${esc(p.motivo)}</td><td>${p.adjunto ? `<a href="${esc(p.adjunto)}" target="_blank">ver</a>` : '–'}</td></tr>`).join('')}</tbody></table>` : ''}
      <fieldset><legend>Intento ${it.n} · Agenda</legend>
        <label>Fecha agendada</label><input type="date" id="fAg" value="${esc(it.fechaAgendada || '')}"></fieldset>
      <fieldset><legend>Resultado de la visita</legend>
        <div class="row2"><div><label>Fecha real de la visita (puede ser distinta a la agendada)</label><input type="date" id="fReal" max="${C.hoyISO()}" value="${esc(it.fechaReal || '')}"></div>
        <div><label>Resultado</label><select id="fRes" onchange="App.toggleRes()"><option value="">— sin resultado aún —</option><option ${it.resultado === 'Efectiva' ? 'selected' : ''}>Efectiva</option><option ${it.resultado === 'Fallida' ? 'selected' : ''}>Fallida</option></select></div></div>
        <div id="bFall" style="display:none"><div class="row2"><div><label>Motivo</label><select id="fMot"><option value="">—</option>${MOTIVOS.map(m => `<option ${m === motivoBase ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
          <div><label>¿Se vuelve a ir?</label><select id="fRep"><option value="">—</option><option value="Si" ${it.reprograma === 'Si' ? 'selected' : ''}>Sí (se reprograma)</option><option value="No" ${it.reprograma === 'No' ? 'selected' : ''}>No (se cierra)</option></select></div></div>
          <label>Detalle (opcional)</label><input id="fDet" value="${esc(detalle)}"></div>
        <div id="bPdf"><label>Documento PDF (obligatorio para cerrar)</label><input type="file" id="fPdf" accept="application/pdf,.pdf">
          ${it.adjunto ? `<div class="note">PDF actual: <a href="${esc(it.adjunto)}" target="_blank">abrir</a> (subí otro para reemplazarlo)</div>` : ''}</div>
      </fieldset><div class="err" id="dvErr"></div>`;
    $('dvFoot').innerHTML = `<button class="btn sec" onclick="dlgVisita.close()">Cancelar</button><button class="btn" id="btnGuardar" onclick="App.guardar()">Guardar</button>`;
    toggleRes();
    $('dlgVisita').showModal();
  }

  function toggleRes() {
    const r = $('fRes').value;
    $('bFall').style.display = r === 'Fallida' ? 'block' : 'none';
    $('bPdf').style.display = r ? 'block' : 'none';
  }

  const leerB64 = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(f); });
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
      b64 = await leerB64(file);
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

  /* ---------- sincronización ---------- */
  const url = () => load(LS_URL, '');

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

  function abrirConfig() { $('cfgUrl').value = load(LS_URL, ''); $('cfgUser').value = load(LS_USER, ''); $('dlgCfg').showModal(); }
  function guardarConfig() { save(LS_URL, $('cfgUrl').value.trim()); save(LS_USER, $('cfgUser').value.trim()); $('dlgCfg').close(); sincronizar(); }

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
    f(k, val, keep) { F[k] = val; pagina = 1; if (keep) { const p = document.activeElement; renderLista(); const i = document.querySelector('input[type=search]'); if (i) { i.focus(); i.setSelectionRange(val.length, val.length); } } else render(); },
    pag(d) { pagina = Math.max(1, pagina + d); renderLista(); },
    abrir, guardar, toggleRes, sincronizar, abrirConfig, guardarConfig, exportar,
    _estado: () => ({ VISITAS, INTENTOS, COLA })
  };
  window.dlgVisita = $('dlgVisita'); window.dlgCfg = $('dlgCfg');

  recalcular(); render();
  if (url()) sincronizar();
})();
