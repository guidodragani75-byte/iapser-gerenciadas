/* Módulo Seguimiento Consultora - UI v4. Depende de core.js (SegCore), ocr.js (SegOCR) y datos.js (SEG_DATA). */
(function () {
  'use strict';
  const C = window.SegCore, E = C.ESTADOS, OCR = window.SegOCR;
  const D = window.SEG_DATA || { visitas: [], historico: [], historialABM: [] };
  const LS_INT = 'SEG_INTENTOS_V1', LS_COLA = 'SEG_COLA_V1', LS_URL = 'SEG_URL_V1', LS_USER = 'SEG_USER_V1', LS_PADRON = 'SEG_PADRON_V1', LS_ABM = 'SEG_ABM_V1';
  const MOTIVOS = ['Establecimiento cerrado', 'No atiende nadie / sin responsable', 'Domicilio inexistente o incorrecto',
    'Empleador sin personal', 'Rechazo de la visita', 'Dificultad de acceso / clima', 'Otro'];
  const PAGE = 100;
  const ETAPAS_ORDEN = ['U', '1', '2'];
  const ETAPA_LABEL = { U: 'Urgente', '1': 'Etapa 1', '2': 'Etapa 2' };
  const COL = { sinV: '#C9CDD0', sin: '#8A949C', agV: '#B3261E', ag: '#0F4C5C', ef: '#1E7B4B', fa: '#8FB8C4', sd: '#D97706' };

  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);

  let INTENTOS = load(LS_INT, {});
  let COLA = load(LS_COLA, []);
  let PADRON_LOCAL = load(LS_PADRON, null);
  let ABM_LOCAL = load(LS_ABM, { ts: '', movimientos: [] });
  let ULTIMO_LOTE_ABM = null;
  let abmPopTab = 'resumen';
  let VISITAS_TODAS = [];
  let VISITAS = [];
  let HIST_VISITAS = [];
  let vista = 'resumen', subTab = 'consolidado', pagina = 1;
  let verTodosAmbitosResumen = false, verTodasTareasResumen = false;
  let chMain = null, chSec = null, chPlazo = null, chPart = null;
  let partFiltro = 'all'; // 'all' | 'YYYY-MM'
  let ultimoCP = null;
  let geminiActivo = null; // null = sin verificar, true/false según backend

  const F = {
    cohorte: '',            // '' | 'Emergente' | 'Residual'
    etapas: ['U', '1', '2'], // selección múltiple de prioridades
    ambito: '',             // nombre normalizado de ámbito
    q: '',                  // búsqueda global
    sub: '',                // subfiltro contextual de cada lista
    etiqueta: '',           // id de ETIQUETAS_LOGISTICA al venir desde Resumen
    estado: '',
    mes: '',
    venc: '',
    tarea: '',
    cruceOct: '',
    obsFiltro: '',          // '' | 'riesgo' | 'alto' | 'medio' | 'con_obs'
    errTipo: '',
    excluirMay27: true
  };
  const LOG = { etiqueta: '', zona: '', soloPendientes: true, orden: 'prioridad', q: '', verTodasZonas: false, pagina: 1 };
  const ABM_F = { lote: '', tipo: '', ambito: '', q: '', pagina: 1 };

  function claveMovABM(m) {
    return [m.loteId || '', m.fechaABM || '', m.tipo || '', m.cuit || '', m.nroEstab || '', m.tareasAntes || '', m.tareasDespues || '', m.fechaMaxAntes || '', m.fechaMaxDespues || ''].join('|');
  }

  function movimientosABMUnificados() {
    const vistos = {};
    const out = [];
    const push = m => {
      if (!m || (!m.cuit && !m.tipo)) return;
      const k = claveMovABM(m);
      if (vistos[k]) return;
      vistos[k] = true;
      out.push(m);
    };
    (D.historialABM || []).forEach(push);
    ((ABM_LOCAL && ABM_LOCAL.movimientos) || []).forEach(push);
    const pesoTipo = m => {
      if (m.tipo === 'ALTA') return 0;
      if (m.tipo === 'CAMBIO_TAREA') return 1;
      if (m.tipo === 'BAJA') return (m.teniaGestion && m.teniaGestion !== 'No') ? 2 : 3;
      return 4;
    };
    return out.sort((a, b) =>
      String(b.fechaABM || '').localeCompare(String(a.fechaABM || '')) ||
      (pesoTipo(a) - pesoTipo(b)) ||
      String(a.empleador || '').localeCompare(String(b.empleador || ''))
    );
  }

  function baseVisitas() {
    return (PADRON_LOCAL && Array.isArray(PADRON_LOCAL.visitas) && PADRON_LOCAL.visitas.length) ? PADRON_LOCAL.visitas : (D.visitas || []);
  }

  function armarHistoricoVisitas(padron, historico) {
    const porCE = {}, porLoc = {}, porC = {};
    (padron || []).forEach(v => {
      const a = C.normAmbito(v.ambito || v.provincia);
      porCE[String(v.cuit || '').trim() + '|' + String(v.nroEstab || '').trim()] = v;
      if (v.localidad) porLoc[C.sinTildes(v.localidad).toLowerCase().trim()] = a;
      const c = String(v.cuit || '').trim();
      if (c) {
        porC[c] = porC[c] || new Set();
        if (a && a !== '(Sin ámbito)') porC[c].add(a);
      }
    });
    return (historico || []).map((h, idx) => {
      const cuit = String(h.cuit || '').trim();
      const nroEstab = String(h.nroEstabIntercambio || h.nroEstab || '').trim();
      const match = porCE[cuit + '|' + nroEstab] || null;
      let amb = match ? C.normAmbito(match.ambito || match.provincia) : '';
      if (!amb && h.localidad) amb = porLoc[C.sinTildes(h.localidad).toLowerCase().trim()] || '';
      if (!amb && porC[cuit] && porC[cuit].size === 1) amb = Array.from(porC[cuit])[0];
      const tieneDoc = /^https?:\/\//i.test(String(h.documentoAdjunto || '').trim());
      const esEf = h.resultadoVisita === 'Efectiva';
      const estado = esEf
        ? (tieneDoc ? E.EFECTIVA : E.EFECTIVA_SIN_DOC)
        : (tieneDoc ? E.FALLIDA_CERRADA : E.FALLIDA_SIN_DOC);
      const fReal = C.aISO(h.fechaRealizada);
      return {
        id: 'hist|' + (h.rowId != null ? h.rowId : idx),
        esHistorico: true,
        tieneEtapaPadron: !!match,
        origenPlan: h.origenPlan || 'Ciclo Sep–Oct',
        observacionesHist: h.observaciones || '',
        adjuntoHist: tieneDoc ? String(h.documentoAdjunto).trim() : '',
        cuit: cuit,
        empleador: h.empleador || (match ? match.empleador : ''),
        contrato: h.contrato || (match ? match.contrato : ''),
        establecimiento: h.establecimiento || (match ? match.establecimiento : ''),
        localidad: h.localidad || (match ? match.localidad : ''),
        provincia: amb || '',
        ambito: amb || '',
        departamento: match ? match.departamento : '',
        domicilio: match ? match.domicilio : '',
        cp: match ? match.cp : '',
        nroEstab: nroEstab,
        tareas: h.tarea || 'Visita',
        fechaMax: match ? match.fechaMax : '',
        planificacion: match ? match.planificacion : (h.origenPlan || 'Ciclo Sep–Oct'),
        cohorte: 'Emergente',
        estado: estado,
        cerrada: tieneDoc,
        cuentaObjetivo: tieneDoc,
        cerradaPorCruceOct: false,
        vencida: false,
        catVenc: 'cerrada',
        fechaAgendada: '',
        fechaReal: fReal,
        resultadoActual: esEf ? 'Efectiva' : 'Fallida',
        intentos: [],
        partesObs: h.observaciones ? [{ fuente: 'Observaciones', texto: String(h.observaciones).trim() }] : [],
        textoObs: h.observaciones ? String(h.observaciones).trim() : '',
        riesgoFallida: null
      };
    });
  }

  function recalcular() {
    const base = baseVisitas();
    VISITAS_TODAS = C.armarVisitas(base, INTENTOS, C.hoyISO(), D.historico);
    VISITAS = C.filtrarCorteFuturo(VISITAS_TODAS, F.excluirMay27);
    HIST_VISITAS = armarHistoricoVisitas(base, D.historico);
  }

  function etapaClave(v) {
    if (C.esUrgente(v)) return 'U';
    if (C.esEtapa1(v)) return '1';
    return '2';
  }

  function esSinAgendar(v) {
    return v.estado === E.SIN_AGENDAR || v.estado === E.FALLIDA_REPROGRAMAR;
  }
  function esAgendada(v) {
    return v.estado === E.AGENDADA;
  }
  function esRealizada(v) {
    return v.estado === E.EFECTIVA || v.estado === E.FALLIDA_CERRADA || v.estado === E.EFECTIVA_SIN_DOC || v.estado === E.FALLIDA_SIN_DOC;
  }
  function esSinDoc(v) {
    return v.estado === E.EFECTIVA_SIN_DOC || v.estado === E.FALLIDA_SIN_DOC;
  }

  function pasaFiltroObs(v) {
    if (!F.obsFiltro) return true;
    if (F.obsFiltro === 'riesgo') return !!v.riesgoFallida;
    if (F.obsFiltro === 'alto') return !!(v.riesgoFallida && v.riesgoFallida.nivel === 'alto');
    if (F.obsFiltro === 'medio') return !!(v.riesgoFallida && v.riesgoFallida.nivel === 'medio');
    if (F.obsFiltro === 'con_obs') return !!v.textoObs;
    return true;
  }

  function pasaGlobal(v, ignorarAmbito, ignorarObs) {
    if (F.cohorte && v.cohorte !== F.cohorte) return false;
    if (F.etapas.length < 3) {
      if (v.esHistorico && !v.tieneEtapaPadron) return false;
      if (F.etapas.indexOf(etapaClave(v)) < 0) return false;
    }
    if (!ignorarAmbito && F.ambito) {
      const ambV = v.esHistorico ? v.ambito : C.normAmbito(v.ambito || v.provincia);
      if (ambV !== F.ambito) return false;
    }
    if (!ignorarObs && !pasaFiltroObs(v)) return false;
    if (F.q) {
      const q = C.sinTildes(F.q).toLowerCase().trim();
      if (q) {
        const h = C.sinTildes([
          v.cuit, v.empleador, v.contrato, v.establecimiento, v.localidad,
          v.departamento, v.provincia, v.ambito, v.domicilio, v.tareas, v.nroEstab, v.cp,
          v.obs, v.obsCS, v.obsIAPSER, v.observacionesHist
        ].join(' ')).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
    }
    return true;
  }

  function baseGlobal(ignorarAmbito, ignorarObs) {
    return VISITAS.filter(v => pasaGlobal(v, ignorarAmbito, ignorarObs));
  }

  /** Todas las realizadas sin doble conteo: nuevas cargadas en el padrón (!cerradaPorCruceOct) + histórico Sep–Oct. */
  function realizadasUnificadas(ignorarAmbito) {
    const nuevas = VISITAS.filter(v => !v.cerradaPorCruceOct && esRealizada(v) && pasaGlobal(v, ignorarAmbito));
    const hist = HIST_VISITAS.filter(v => pasaGlobal(v, ignorarAmbito));
    return nuevas.concat(hist);
  }

  function hayFiltroGlobal(ignorarCohorte) {
    return !!((!ignorarCohorte && F.cohorte) || F.etapas.length < 3 || F.ambito || F.obsFiltro || (F.q && F.q.trim()));
  }

  function contarEstados(rows, rowsRealizadasExtra) {
    const s = { sin: 0, sinV: 0, sinPot: 0, reprog: 0, ag: 0, agV: 0, ef: 0, fa: 0, sd: 0 };
    (rows || []).forEach(v => {
      if (esSinAgendar(v)) {
        if (v.vencida) s.sinV++; else s.sin++;
        if (v.riesgoFallida) s.sinPot++;
        if (v.estado === E.FALLIDA_REPROGRAMAR) s.reprog++;
      } else if (esAgendada(v)) {
        if (v.vencida) s.agV++; else s.ag++;
      } else if (!rowsRealizadasExtra) {
        if (v.estado === E.EFECTIVA) s.ef++;
        else if (v.estado === E.FALLIDA_CERRADA) s.fa++;
        else if (esSinDoc(v)) s.sd++;
      }
    });
    if (rowsRealizadasExtra) {
      rowsRealizadasExtra.forEach(v => {
        if (v.estado === E.EFECTIVA) s.ef++;
        else if (v.estado === E.FALLIDA_CERRADA) s.fa++;
        else if (esSinDoc(v)) s.sd++;
      });
    }
    s.S = s.sin + s.sinV;
    s.A = s.ag + s.agV;
    s.Re = s.ef + s.fa; // Cerradas con PDF (único número oficial de Realizadas)
    s.ReTodas = s.ef + s.fa + s.sd;
    s.T = s.S + s.A + s.Re;
    s.V = (rows || []).filter(v => v.vencida).length;
    return s;
  }

  const enVista = {
    todas: () => true,
    sin_agendar: esSinAgendar,
    agendadas: esAgendada,
    realizadas: esRealizada,
    vencidas: v => v.vencida,
    pot_fallidas: v => !v.cerrada && !!v.riesgoFallida,
    pendientes: v => !v.cerrada,
    revisar: v => v.revisarDuplicada
  };

  function pillEstado(s, vencida) {
    if (s === E.SIN_AGENDAR) {
      return vencida
        ? '<span class="pill p-bad">○ Sin agendar · venc.</span>'
        : '<span class="pill p-sin">○ Sin agendar</span>';
    }
    if (s === E.FALLIDA_REPROGRAMAR) {
      return '<span class="pill p-warn">↻ Fallida: a reprogramar</span>';
    }
    if (s === E.AGENDADA) {
      return vencida
        ? '<span class="pill p-bad">⚠ Agendada · venc.</span>'
        : '<span class="pill p-ag">📅 En término</span>';
    }
    if (s === E.EFECTIVA) return '<span class="pill p-ok">✔ Efectiva c/PDF</span>';
    if (s === E.FALLIDA_CERRADA) return '<span class="pill p-bad">✖ Fallida c/PDF</span>';
    if (s === E.EFECTIVA_SIN_DOC || s === E.FALLIDA_SIN_DOC) {
      return `<span class="pill p-warn">📎 ${esc(s)}</span>`;
    }
    return `<span class="pill p-sin">${esc(s)}</span>`;
  }

  function pasaSubfiltro(v) {
    if (vista === 'realizadas' && !F.etiqueta) {
      if (!F.sub) return v.cuentaObjetivo; // Por defecto muestra las cerradas c/PDF (ej. 268)
      if (F.sub === 'ef' || F.sub === 'Efectiva') return v.estado === E.EFECTIVA;
      if (F.sub === 'fa' || F.sub === 'Fallida') return v.estado === E.FALLIDA_CERRADA;
      if (F.sub === 'sd') return esSinDoc(v);
      if (F.sub === 'all') return true;
      return true;
    }
    if (!F.sub) return true;
    if (vista === 'sin_agendar') {
      if (F.sub === 'venc') return v.vencida;
      if (F.sub === 'plazo') return !v.vencida;
      if (F.sub === 'reprog') return v.estado === E.FALLIDA_REPROGRAMAR;
    } else if (vista === 'agendadas') {
      if (F.sub === 'venc') return v.vencida;
      if (F.sub === 'plazo') return !v.vencida;
    } else if (vista === 'vencidas') {
      if (F.sub === 'sin') return esSinAgendar(v);
      if (F.sub === 'ag') return esAgendada(v);
      if (F.sub === 'sd') return esSinDoc(v);
    } else if (vista === 'pot_fallidas') {
      if (F.sub === 'alto') return !!(v.riesgoFallida && v.riesgoFallida.nivel === 'alto');
      if (F.sub === 'medio') return !!(v.riesgoFallida && v.riesgoFallida.nivel === 'medio');
    }
    return true;
  }

  function baseListaSinSub() {
    if (vista === 'realizadas' && !F.etiqueta) {
      return realizadasUnificadas(false);
    }
    let arr = baseGlobal(false);
    if (F.etiqueta) {
      arr = C.filtrarPorEtiqueta(arr, F.etiqueta, C.hoyISO());
    } else if (enVista[vista]) {
      arr = arr.filter(enVista[vista]);
    }
    return arr;
  }

  function badgeObsHTML(v) {
    const rf = v.riesgoFallida;
    if (rf) {
      const cls = rf.nivel === 'alto' ? 'p-bad' : 'p-warn';
      return `<span class="pill ${cls} obs-trig" data-obs-id="${esc(v.id)}">⚠ ${esc(rf.motivo)}</span>`;
    }
    if (v.textoObs) {
      return `<span class="pill p-sin obs-trig" data-obs-id="${esc(v.id)}">💬 Obs.</span>`;
    }
    return '<span class="note">–</span>';
  }

  function filtrar() {
    return baseListaSinSub().filter(v => {
      if (!pasaSubfiltro(v)) return false;
      if (F.estado && v.estado !== F.estado) return false;
      if (F.mes && C.mesDe(v.fechaMax || v.fechaReal) !== F.mes) return false;
      if (F.venc && v.catVenc !== F.venc) return false;
      if (F.tarea && !C.coincideTarea(v, F.tarea)) return false;
      if (vista === 'revisar' && F.errTipo && (!v.errores || v.errores.indexOf(F.errTipo) < 0)) return false;
      if (F.cruceOct === 'con' && !v.cruceOct) return false;
      if (F.cruceOct === 'Efectiva' && !(v.cruceOct && v.cruceOct.resultado === 'Efectiva')) return false;
      if (F.cruceOct === 'Fallida' && !(v.cruceOct && v.cruceOct.resultado === 'Fallida')) return false;
      return true;
    }).sort((a, b) => {
      if (vista === 'realizadas') {
        return (b.fechaReal || '').localeCompare(a.fechaReal || '') || String(a.empleador || '').localeCompare(String(b.empleador || ''));
      }
      if (vista === 'revisar') {
        const ka = `${a.cuit}|${String(a.nroEstab).padStart(4, '0')}|${a.fechaMax || '9'}`;
        const kb = `${b.cuit}|${String(b.nroEstab).padStart(4, '0')}|${b.fechaMax || '9'}`;
        return ka.localeCompare(kb);
      }
      return (a.fechaMax || '9').localeCompare(b.fechaMax || '9');
    });
  }

  const opts = (arr, sel, all) => `<option value="">${all}</option>` + arr.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const pct = (a, b) => b ? Math.round(a * 100 / b) + '%' : '–';
  const pct1 = x => (Math.round(x * 1000) / 10).toLocaleString('es-AR') + '%';
  const n1 = x => (Math.round(x * 10) / 10).toLocaleString('es-AR');
  const fmt = n => Math.round(n || 0).toLocaleString('es-AR');

  /* ---------- NAVEGACIÓN LATERAL Y BARRA DE FILTROS GLOBAL ---------- */
  function renderRail() {
    const rows = baseGlobal(false);
    const reals = realizadasUnificadas(false);
    const s = contarEstados(rows, reals);
    const nPot = rows.filter(v => !v.cerrada && v.riesgoFallida).length;
    const nRev = rows.filter(v => v.revisarDuplicada).length;
    const excluidas = VISITAS_TODAS.length - C.filtrarCorteFuturo(VISITAS_TODAS, true).length;
    const item = (k, ico, lbl, cnt, alerta) =>
      `<button type="button" class="nav ${vista === k ? 'on' : ''}" onclick="App.ir('${k}')"><span>${ico}</span><span>${lbl}</span>${cnt != null ? `<span class="n ${alerta && cnt > 0 ? 'al' : ''}">${fmt(cnt)}</span>` : ''}</button>`;

    $('rail').innerHTML = `
      <div class="brand"><small>IAPSER ART</small><div>Seguimiento de Visitas</div></div>
      <div class="grp">Análisis</div>
      ${item('resumen', '📊', 'Resumen')}
      ${item('metas', '📈', 'Metas y evolución')}
      ${item('logistica', '🧭', 'Logística por ámbito')}
      <div class="grp">Visitas</div>
      ${item('sin_agendar', '○', 'Sin agendar', s.S)}
      ${item('agendadas', '📅', 'Agendadas', s.A)}
      ${item('realizadas', '✅', 'Realizadas', s.Re)}
      ${item('vencidas', '⚠', 'Vencidas (col. R)', s.V, true)}
      ${item('pot_fallidas', '⚡', 'Pot. fallidas', nPot, true)}
      ${item('todas', '🗂', 'Padrón vigente', rows.length)}
      <div class="grp">Control</div>
      ${item('abm', '📋', 'Historial ABM', movimientosABMUnificados().length)}
      ${item('revisar', '🔎', 'Errores / A revisar', nRev, nRev > 0)}
      <button type="button" class="nav" onclick="App.abrirConfig()"><span>⚙</span><span>Configurar</span></button>
      <a class="nav" href="../index.html"><span>↩</span><span>Plataforma anterior</span></a>
      <div class="rail-foot">
        <label class="cut-rail" title="Predeterminado: excluye visitas con fecha máxima desde Mayo 2027 inclusive">
          <input type="checkbox" ${F.excluirMay27 ? 'checked' : ''} onchange="App.toggleMay27(this.checked)">
          <span>Excluir ≥ May-2027${excluidas ? ` (${excluidas})` : ''}</span>
        </label>
        <div>Etapa 1 → 31/01/27 · Etapa 2 → 30/04/27<br>Urgente: vence según col. R</div>
      </div>`;
  }

  function barraFiltrosGlobalHTML(totalMostrado) {
    const ambitosDisp = Array.from(new Set(baseGlobal(true, true).map(v => C.normAmbito(v.ambito || v.provincia)).filter(Boolean))).sort();
    if (F.ambito && ambitosDisp.indexOf(F.ambito) < 0) ambitosDisp.push(F.ambito);
    const baseSinObs = baseGlobal(false, true);
    const nRiesgoG = baseSinObs.filter(v => v.riesgoFallida).length;
    const nAltoG = baseSinObs.filter(v => v.riesgoFallida && v.riesgoFallida.nivel === 'alto').length;
    const nMedioG = baseSinObs.filter(v => v.riesgoFallida && v.riesgoFallida.nivel === 'medio').length;
    const nConObsG = baseSinObs.filter(v => v.textoObs).length;
    const btnU = (val, lbl, cls) => `<button type="button" class="${cls} ${F.cohorte === val ? 'on' : ''}" onclick="App.setCohorte('${val}')">${lbl}</button>`;
    const hayAct = hayFiltroGlobal(false);
    return `<div class="fbar">
      <div class="fg">
        <label>Universo</label>
        <div class="seg">
          ${btnU('', 'Todos', '')}
          ${btnU('Emergente', 'Emergentes', 'e')}
          ${btnU('Residual', 'Residuales', 'r')}
        </div>
      </div>
      <div class="fg">
        <label>Prioridad</label>
        ${ETAPAS_ORDEN.map(k => `<span class="chk ${F.etapas.indexOf(k) >= 0 ? 'on' : ''}" onclick="App.togEtapa('${k}')"><i></i>${ETAPA_LABEL[k]}</span>`).join('')}
        ${F.etapas.length < 3 ? `<button type="button" class="clear-lnk" onclick="App.todasEtapas()">todas</button>` : ''}
      </div>
      <div class="fg">
        <label>Ámbito</label>
        <select class="${F.ambito ? 'act' : ''}" onchange="App.setAmbito(this.value)">
          <option value="">Todos (${ambitosDisp.length})</option>
          ${ambitosDisp.map(a => `<option value="${esc(a)}" ${F.ambito === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
        </select>
      </div>
      <div class="fg">
        <label>Obs. / Riesgo</label>
        <select class="${F.obsFiltro ? 'act' : ''}" onchange="App.setObsFiltro(this.value)">
          <option value="">Todas</option>
          <option value="riesgo" ${F.obsFiltro === 'riesgo' ? 'selected' : ''}>⚠ Pot. fallidas (${fmt(nRiesgoG)})</option>
          <option value="alto" ${F.obsFiltro === 'alto' ? 'selected' : ''}>↳ Riesgo alto (${fmt(nAltoG)})</option>
          <option value="medio" ${F.obsFiltro === 'medio' ? 'selected' : ''}>↳ Riesgo medio (${fmt(nMedioG)})</option>
          <option value="con_obs" ${F.obsFiltro === 'con_obs' ? 'selected' : ''}>💬 Con observaciones (${fmt(nConObsG)})</option>
        </select>
      </div>
      ${hayAct ? `<button type="button" class="clear-lnk" onclick="App.limpiarGlobal()">limpiar filtros</button>` : ''}
      <div class="scope"><b>${fmt(totalMostrado != null ? totalMostrado : baseGlobal(false).length)}</b> visitas</div>
    </div>`;
  }

  function destruirCharts() {
    if (chMain) { chMain.destroy(); chMain = null; }
    if (chSec) { chSec.destroy(); chSec = null; }
    if (chPlazo) { chPlazo.destroy(); chPlazo = null; }
    if (chPart) { chPart.destroy(); chPart = null; }
  }

  /* ---------- 1. PANTALLA RESUMEN ---------- */
  function svgDonut(parts, centerTxt, subTxt) {
    const tot = parts.reduce((a, p) => a + p[0], 0);
    if (!tot) {
      return `<svg viewBox="0 0 42 42" width="118" height="118"><circle cx="21" cy="21" r="15.9" fill="none" stroke="#EEF0ED" stroke-width="5.5"/><text x="21" y="22.5" text-anchor="middle" font-size="5.5" fill="#5B6670">0</text></svg>`;
    }
    let off = 25;
    const arcs = parts.map(([v, col]) => {
      if (!v) return '';
      const d = (v * 100) / tot;
      const el = `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${col}" stroke-width="5.5" stroke-dasharray="${d} ${Math.max(0, 100 - d)}" stroke-dashoffset="${off}"/>`;
      off -= d;
      return el;
    }).join('');
    return `<svg viewBox="0 0 42 42" width="118" height="118">
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="#EEF0ED" stroke-width="5.5"/>
      ${arcs}
      <text x="21" y="21" text-anchor="middle" font-size="6.8" font-weight="700" fill="#17202A">${esc(centerTxt)}</text>
      <text x="21" y="26.8" text-anchor="middle" font-size="3.5" fill="#5B6670">${esc(subTxt)}</text>
    </svg>`;
  }

  function renderResumen() {
    destruirCharts();
    const hoy = C.hoyISO();
    const rows = baseGlobal(false);
    const reals = realizadasUnificadas(false);
    const s = contarEstados(rows, reals);
    const sinSubfiltros = !F.ambito && F.etapas.length === 3 && !(F.q && F.q.trim());

    const stackSeg = list => list.map(([v, c, l]) => v ? `<div style="flex:${v};background:${c}" title="${esc(l)}: ${fmt(v)}"></div>` : '').join('');
    const miniSeg = list => list.map(([v, c]) => v ? `<i style="flex:${v};background:${c}"></i>` : '').join('');

    let h = `<div class="page-head"><div><h1>Resumen</h1><div class="sub">Dónde está cada visita hoy, en qué ámbitos se concentra y qué requiere prioridad.</div></div></div>`;
    h += barraFiltrosGlobalHTML(s.T);

    if (s.V > 0) {
      const detalleV = [];
      if (s.sinV) detalleV.push(`<b>${fmt(s.sinV)}</b> sin agendar`);
      if (s.agV) detalleV.push(`<b>${fmt(s.agV)}</b> agendadas`);
      const restV = s.V - s.sinV - s.agV;
      if (restV > 0) detalleV.push(`<b>${fmt(restV)}</b> con resultado sin PDF`);
      h += `<div class="alert-banner">
        <span>⚠ <b>${fmt(s.V)} visitas con la fecha máxima (col. R) superada</b>${detalleV.length ? ': ' + detalleV.join(' · ') : ''}.</span>
        <span class="go" onclick="App.ir('vencidas')">Ver vencidas →</span>
      </div>`;
    }

    /* Bloque 1: Estado de las visitas */
    h += `<div class="sec-t">1 · Estado de las visitas</div>
    <div class="panel" style="margin-bottom:14px">
      <div class="stack">${s.T ? stackSeg([
        [s.sinV, COL.sinV, 'Sin agendar · vencidas (col. R)'],
        [s.sin, COL.sin, 'Sin agendar · en plazo'],
        [s.agV, COL.agV, 'Agendadas · vencidas (col. R)'],
        [s.ag, COL.ag, 'Agendadas · en término'],
        [s.ef, COL.ef, 'Efectivas c/PDF'],
        [s.fa, COL.fa, 'Fallidas c/PDF']
      ]) : ''}</div>
      <div class="stack-l">
        <span>○ Sin agendar: <b>${fmt(s.S)}</b> (${pct(s.S, s.T)})</span>
        <span>📅 Agendadas: <b>${fmt(s.A)}</b> (${pct(s.A, s.T)})</span>
        <span>✅ Realizadas c/PDF: <b>${fmt(s.Re)}</b> (${pct(s.Re, s.T)})</span>
      </div>
    </div>
    <div class="three">
      <div class="sc" onclick="App.ir('sin_agendar')">
        <h4>Sin agendar <span>Ver lista →</span></h4>
        <div class="big">${fmt(s.S)} <small>${pct(s.S, s.T)}</small></div>
        <div class="mini">${miniSeg([[s.sinV, COL.agV], [s.sin, COL.sin]])}</div>
        <div class="ls">
          <div class="clickable ${s.sinV ? 'bad' : ''}" onclick="event.stopPropagation();App.irLista('sin_agendar',{sub:'venc'})"><i style="background:${COL.agV}"></i>Vencidas (col. R)<b>${fmt(s.sinV)}</b></div>
          <div class="clickable" onclick="event.stopPropagation();App.irLista('sin_agendar',{sub:'plazo'})"><i style="background:${COL.sin}"></i>En plazo<b>${fmt(s.sin)}</b></div>
          ${s.sinPot ? `<div class="clickable" onclick="event.stopPropagation();App.ir('pot_fallidas')"><i style="background:${COL.sd}"></i>Potencialmente fallidas (obs.)<b>${fmt(s.sinPot)}</b></div>` : ''}
          ${s.reprog ? `<div class="clickable" onclick="event.stopPropagation();App.irLista('sin_agendar',{sub:'reprog'})"><i style="background:${COL.sd}"></i>Fallidas a reprogramar<b>${fmt(s.reprog)}</b></div>` : ''}
        </div>
      </div>

      <div class="sc ag" onclick="App.ir('agendadas')">
        <h4>Agendadas <span>Ver lista →</span></h4>
        <div class="big">${fmt(s.A)} <small>${pct(s.A, s.T)}</small></div>
        <div class="mini">${miniSeg([[s.agV, COL.agV], [s.ag, COL.ag]])}</div>
        <div class="ls">
          <div class="clickable ${s.agV ? 'bad' : ''}" onclick="event.stopPropagation();App.irLista('agendadas',{sub:'venc'})"><i style="background:${COL.agV}"></i>Vencidas (col. R)<b>${fmt(s.agV)}</b></div>
          <div class="clickable" onclick="event.stopPropagation();App.irLista('agendadas',{sub:'plazo'})"><i style="background:${COL.ag}"></i>En término<b>${fmt(s.ag)}</b></div>
        </div>
      </div>

      <div class="sc re" onclick="App.ir('realizadas')">
        <h4>Realizadas c/PDF <span>Ver lista →</span></h4>
        <div class="big">${fmt(s.Re)} <small>${pct(s.Re, s.T)}</small></div>
        <div class="mini">${miniSeg([[s.ef, COL.ef], [s.fa, COL.fa]])}</div>
        <div class="ls">
          <div class="clickable" onclick="event.stopPropagation();App.irLista('realizadas',{sub:'ef'})"><i style="background:${COL.ef}"></i>Efectivas c/PDF<b>${fmt(s.ef)}</b></div>
          <div class="clickable" onclick="event.stopPropagation();App.irLista('realizadas',{sub:'fa'})"><i style="background:${COL.fa}"></i>Fallidas c/PDF<b>${fmt(s.fa)}</b></div>
        </div>
        ${s.sd ? `<div class="card-foot">📎 Hay <b>${fmt(s.sd)}</b> cargada(s) sin PDF que no suman al objetivo · <button type="button" class="clear-lnk" onclick="event.stopPropagation();App.irLista('realizadas',{sub:'sd'})">ver sin PDF →</button></div>` : ''}
      </div>
    </div>`;

    /* Bloque 2: Concentración por ámbito y prioridades críticas */
    const rowsAmb = baseGlobal(true); // conserva todos los ámbitos visibles para comparar y clicar
    const porAmb = {};
    rowsAmb.forEach(v => {
      const a = C.normAmbito(v.ambito || v.provincia);
      (porAmb[a] = porAmb[a] || []).push(v);
    });
    const listaAmb = Object.keys(porAmb).map(a => ({ ambito: a, c: contarEstados(porAmb[a]) }))
      .sort((x, y) => (y.c.T - x.c.T) || (y.c.V - x.c.V) || x.ambito.localeCompare(y.ambito));
    const limAmb = verTodosAmbitosResumen ? listaAmb.length : Math.min(12, listaAmb.length);
    const maxAmb = listaAmb.length ? listaAmb[0].c.T : 1;

    const tags = C.resumenEtiquetas(rows, hoy);
    const tagsPrio = tags.filter(t => t.grupo === 'prioridad');
    const tagsTar = tags.filter(t => t.grupo === 'tareas');
    const renderTag = t => `<button type="button" class="tag-btn t-${t.tono}${t.count === 0 ? ' zero' : ''}" onclick="App.verEtiqueta('${t.id}')">${esc(t.label)} <span class="cnt">${fmt(t.count)}</span></button>`;

    h += `<div class="sec-t">2 · Concentración por ámbito y prioridades críticas</div>
    <div class="two w">
      <div class="panel">
        <h3>
          <span>Concentración por ámbito (${listaAmb.length}) ${F.ambito ? `<span class="pill p-ag">${esc(F.ambito)}</span>` : ''}</span>
          <span>
            ${F.ambito ? `<a onclick="App.setAmbito('')" style="margin-right:10px">Quitar filtro</a>` : ''}
            <a onclick="App.ir('logistica')">Por depto / localidad →</a>
          </span>
        </h3>
        <div class="hbh"><span>Ámbito</span><span>Distribución por estado</span><span class="num">Visitas</span><span class="num">Vencidas</span></div>
        ${listaAmb.length ? listaAmb.slice(0, limAmb).map(x => `<div class="hb ${F.ambito === x.ambito ? 'on' : ''}" data-amb="${esc(x.ambito)}" onclick="App.setAmbito(this.dataset.amb)" title="Clic para filtrar todo por ${esc(x.ambito)}">
          <span class="nm" title="${esc(x.ambito)}">${esc(x.ambito)}</span>
          <div class="b-track"><div class="b" style="width:${Math.max(2, (x.c.T * 100) / maxAmb)}%">${miniSeg([[x.c.sinV, COL.sinV], [x.c.sin, COL.sin], [x.c.agV, COL.agV], [x.c.ag, COL.ag], [x.c.ef + x.c.fa + x.c.sd, COL.ef]])}</div></div>
          <span class="num"><b>${fmt(x.c.T)}</b></span>
          <span class="vv">${x.c.V ? fmt(x.c.V) + ' (' + pct(x.c.V, x.c.T) + ')' : '–'}</span>
        </div>`).join('') : '<div class="note" style="padding:12px 6px">Sin visitas para el filtro activo.</div>'}
        ${listaAmb.length > 12 ? `<div class="note" style="padding:7px 6px 0"><button type="button" class="clear-lnk" onclick="App.togAmbitosResumen()">${verTodosAmbitosResumen ? 'Mostrar Top 12' : `Ver los ${listaAmb.length} ámbitos (+${listaAmb.length - 12} más)`}</button></div>` : ''}
        <div class="legend">
          <span><i style="background:${COL.sinV}"></i>Sin agendar venc.</span>
          <span><i style="background:${COL.sin}"></i>Sin agendar</span>
          <span><i style="background:${COL.agV}"></i>Agend. venc.</span>
          <span><i style="background:${COL.ag}"></i>Agend. en término</span>
          <span><i style="background:${COL.ef}"></i>Realizadas</span>
        </div>
      </div>

      <div class="panel">
        <h3><span>Prioridades críticas</span><span class="note" style="font-weight:400">clic para abrir lista</span></h3>
        <div class="tlbl">Prioridad y plazo</div>
        <div class="tags">${tagsPrio.map(renderTag).join('')}</div>
        <div class="tlbl" style="margin-top:14px">Críticas vencidas por tipo de tarea (col. R)</div>
        <div class="tags">${tagsTar.map(renderTag).join('')}</div>
      </div>
    </div>`;

    /* Bloque 3: Tareas y calidad de cumplimiento */
    const tareas = C.catalogoTareas(rows);
    const limTar = verTodasTareasResumen ? tareas.length : Math.min(10, tareas.length);
    const totCerr = s.ef + s.fa;
    const enTermino = totCerr;
    const pctEnTerm = (enTermino + s.V) ? (enTermino / (enTermino + s.V)) : 0;

    h += `<div class="sec-t">3 · Tareas y calidad de cumplimiento</div>
    <div class="two w">
      <div class="panel">
        <h3><span>Resumen por tarea (${tareas.length})</span><span class="note" style="font-weight:400">clic en una fila para filtrar</span></h3>
        <div class="tw" style="border:0">
          <table><thead><tr><th>Tarea</th><th class="num">Total</th><th class="num">Cerradas c/PDF</th><th class="num">Pendientes</th><th class="num">Vencidas (R)</th></tr></thead><tbody>
          ${tareas.length ? tareas.slice(0, limTar).map(t => `<tr data-tarea="${esc(t.key)}" onclick="App.verTarea(this.dataset.tarea)">
            <td>${esc(t.label)}</td>
            <td class="num">${fmt(t.total)}</td>
            <td class="num">${fmt(t.cerradas)}</td>
            <td class="num">${fmt(t.pendientes)}</td>
            <td class="num ${t.vencidas ? 'venc' : ''}">${fmt(t.vencidas)}</td>
          </tr>`).join('') : '<tr><td colspan="5" class="note">Sin tareas para el filtro activo.</td></tr>'}
          </tbody></table>
        </div>
        ${tareas.length > 10 ? `<div class="note" style="padding-top:8px"><button type="button" class="clear-lnk" onclick="App.togTareasResumen()">${verTodasTareasResumen ? 'Mostrar Top 10' : `Ver todas las tareas (${tareas.length})`}</button></div>` : ''}
      </div>

      <div class="panel" style="display:flex;flex-direction:column">
        <h3><span>Cumplimiento en plazo y efectividad</span><a onclick="App.ir('metas')">Metas y evolución →</a></h3>
        <div class="donut-wrap" style="margin:6px 0">
          ${svgDonut([[s.ef, COL.ef], [s.fa, COL.fa]], totCerr ? pct(s.ef, totCerr) : '–', 'efectivas')}
          <div class="ls" style="flex:1;min-width:190px">
            <div><i style="background:${COL.ef}"></i>Efectivas cerradas c/PDF<b>${fmt(s.ef)}</b></div>
            <div><i style="background:${COL.fa}"></i>Fallidas cerradas c/PDF<b>${fmt(s.fa)}</b></div>
            <div style="margin-top:8px"><i style="background:${COL.ag}"></i>Ejecutadas en término<b>${fmt(enTermino)}</b></div>
            <div class="${s.V ? 'bad' : ''}"><i style="background:${COL.agV}"></i>Vencidas fuera de plazo<b>${fmt(s.V)}</b></div>
            <div><span class="note">% en término</span><b>${pct1(pctEnTerm)}</b></div>
          </div>
        </div>
        <div class="card-foot">
          Solo cuenta para el objetivo lo cerrado <b>con PDF</b>. Ver curvas mensuales y metas en <button type="button" class="clear-lnk" onclick="App.ir('metas')">Metas y evolución →</button>
        </div>
      </div>
    </div>`;

    $('main').innerHTML = h;
  }

  /* ---------- 2. METAS Y EVOLUCIÓN (con Chart.js + tablas ejecutivas) ---------- */
  function bloqueCumplimientoHTML(cp, tituloScope) {
    const okBadge = cp.vencidas === 0
      ? `<span class="pill p-ok">✓ 0 vencidas (${pct1(cp.pctEnTermino)} en término)</span>`
      : `<span class="pill p-bad">⚠ ${fmt(cp.vencidas)} vencidas (${pct1(cp.pctEnTermino)} en término)</span>`;
    const activeBtns = `<button type="button" class="${partFiltro === 'all' ? 'on' : ''}" onclick="App.partMes('all')">Acumulado</button>` +
      cp.mesesActivos.map(m => `<button type="button" class="${partFiltro === m.key ? 'on' : ''}" onclick="App.partMes('${esc(m.key)}')">${esc(m.label)}</button>`).join('');
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
          <div>Total ${esc(tituloScope)}: <b>${fmt(cp.enTermino)} en término</b> · <b class="${cp.vencidas ? 'venc' : ''}">${fmt(cp.vencidas)} vencidas</b> (${pct1(cp.pctEnTermino)})</div>
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

  function renderMetas() {
    destruirCharts();
    const hoy = C.hoyISO();
    const rows = baseGlobal(false);
    const sinSubfiltros = !F.ambito && F.etapas.length === 3 && !(F.q && F.q.trim());
    const histScope = sinSubfiltros ? D.historico : [];
    // Para calcular el tablero respetando filtros de ámbito/prioridad/búsqueda pero manteniendo los 3 universos disponibles:
    const visitasParaTablero = VISITAS.filter(v => {
      if (F.etapas.length < 3 && F.etapas.indexOf(etapaClave(v)) < 0) return false;
      if (F.ambito && C.normAmbito(v.ambito || v.provincia) !== F.ambito) return false;
      if (F.q && !pasaGlobal(v, false)) return false;
      return true;
    });
    const T = C.tablero(visitasParaTablero, histScope, hoy);
    const co = T.consolidado, em = T.emergentes, re = T.residuales;
    const card = (k, v, s, cls, click) => `<div class="card${cls ? ' ' + cls : ''}${click ? ' click' : ''}"${click ? ` onclick="${click}"` : ''}><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || ''}</div></div>`;

    let h = `<div class="page-head"><div><h1>Metas y evolución</h1><div class="sub">Meta vigente: 500 visitas/mes desde nov-26 (100 emergentes + 400 residuales). Solo cuenta lo cerrado <b>con PDF</b>.</div></div></div>`;
    h += barraFiltrosGlobalHTML(rows.length);

    if (!sinSubfiltros) {
      h += `<div class="info-box">Filtro activo sobre el padrón (${fmt(visitasParaTablero.length)} visitas). El histórico Sep–Oct no tiene columna de ámbito ni etapa, por lo que no se incluye al filtrar.</div>`;
    }

    h += `<div style="margin-bottom:14px"><div class="seg">
      <button type="button" class="${subTab === 'consolidado' ? 'on' : ''}" onclick="App.sub('consolidado')">Objetivo y ritmo (500/mes)</button>
      <button type="button" class="e ${subTab === 'emergentes' ? 'on' : ''}" onclick="App.sub('emergentes')">Emergentes (100/mes)</button>
      <button type="button" class="r ${subTab === 'residuales' ? 'on' : ''}" onclick="App.sub('residuales')">Stock Residual (400/mes)</button>
    </div></div>`;

    if (subTab === 'consolidado') {
      h += `<div class="cards">
        ${card('Objetivo Consolidado (c/PDF)', `${fmt(co.realizadas)} <small>/ ${fmt(co.planTotal)}</small>`, `${pct1(co.pct)} del plan${co.historico.conDocumento ? ` · incluye ${co.historico.conDocumento} Sep–Oct` : ''}`, 'ok')}
        ${card('Programadas este mes (' + co.mesActual + ')', `${fmt(co.agendadasMesActual)} <small>/ ${co.metaMesVigente}</small>`, `${pct(co.agendadasMesActual, co.metaMesVigente)} de la meta mensual (100 em + 400 res)`, 'warn')}
        ${card('Ritmo requerido Etapa 1', `${n1(re.ritmoRequeridoE1)} <small>/mes</small>`, `${re.mesesRestE1} mes(es) restantes hasta 31/01/27`, '')}
        ${card('Vencidas (col. R)', fmt(co.vencidas), `${fmt(re.vencidas)} residual + ${fmt(em.vencidas)} emergente · clic para ver →`, co.vencidas ? 'bad' : '', "App.verVencidas('')")}
        ${card('Con resultado sin PDF', fmt(co.sinDocumento), 'no cuentan para el objetivo' + (co.historico.sinDocumento ? ` (${co.historico.sinDocumento} Sep–Oct)` : ''), co.sinDocumento ? 'bad' : '')}
      </div>
      <div class="sec-t">Evolución mensual consolidada · cerradas c/PDF y programadas vs. meta</div>
      <div class="panel" style="height:295px;margin-bottom:16px"><canvas id="chMain"></canvas></div>
      <div class="grid2">
        <div class="panel"><h3>Resumen consolidado por mes</h3>
          <div class="tw" style="border:0"><table><thead><tr><th>Mes</th><th class="num">Meta</th><th class="num">Emerg. (Ef/Fa)</th><th class="num">Resid. (Ef/Fa)</th><th class="num">Total c/PDF</th><th>Cumpl.</th><th class="num">Prog.</th></tr></thead><tbody>
          ${co.meses.map(m => `<tr style="cursor:default;${m.futuro ? 'color:#8A949C' : ''}"><td>${m.mes}</td><td class="num">${m.meta}</td><td class="num">${m.emTot} <span class="note">(${m.emEf}/${m.emFa})</span></td><td class="num">${m.resTot} <span class="note">(${m.resEf}/${m.resFa})</span></td><td class="num"><b>${m.total}</b></td><td><span class="bar"><i style="width:${Math.min(100, (m.total * 100) / m.meta)}%"></i></span>${pct(m.total, m.meta)}</td><td class="num">${m.agendadas == null ? '–' : m.agendadas}</td></tr>`).join('')}
          </tbody></table></div>
        </div>
        <div class="panel"><h3>Por etapa</h3>
          <div class="tw" style="border:0"><table><thead><tr><th>Etapa</th><th>Plazo</th><th class="num">Total</th><th class="num">Cerradas</th><th>Avance</th><th class="num">Sin prog.</th><th class="num">Venc. (R)</th></tr></thead><tbody>
          ${co.etapas.map(b => `<tr style="cursor:default"><td><b>${esc(b.etapa)}</b></td><td>${/Urgente/.test(b.etapa) ? 'según col. R' : C.aDMY(C.CONFIG.PLAZO_ETAPA[b.etapa])}</td><td class="num">${fmt(b.total)}</td><td class="num">${fmt(b.cerradas)}</td><td><span class="bar"><i style="width:${b.total ? (b.cerradas * 100) / b.total : 0}%"></i></span>${pct(b.cerradas, b.total)}</td><td class="num">${fmt(b.sinAgendar)}</td><td class="num ${b.vencidas ? 'venc' : ''}">${fmt(b.vencidas)}</td></tr>`).join('')}
          ${co.historico.total ? `<tr style="cursor:default"><td>Histórico Sep–Oct (Emerg.)</td><td>ejecutadas</td><td class="num">${fmt(co.historico.total)}</td><td class="num">${fmt(co.historico.conDocumento)}</td><td><span class="bar"><i style="width:${(co.historico.conDocumento * 100) / co.historico.total}%"></i></span>${pct(co.historico.conDocumento, co.historico.total)}</td><td class="num">0</td><td class="num">0</td></tr>` : ''}
          </tbody></table></div>
        </div>
      </div>`;
    } else if (subTab === 'emergentes') {
      h += `<div class="cards">
        ${card('Realizadas del ciclo (c/PDF)', `${fmt(em.realizadas)} <small>/ ${fmt(em.metaAnual)}</small>`, `${pct1(em.pct)} · restan ${fmt(em.restanMetaAnual)}`, 'ok')}
        ${card('Efectivas / Fallidas', `${em.efectivas} / ${em.fallidas}`, `tasa efectividad ${pct1(em.tasaEfectividad)}`, '')}
        ${card('Meta acumulada a hoy', fmt(em.metaAcum), `desvío ${em.desvio >= 0 ? '+' : ''}${em.desvio} (100/mes)`, em.desvio < 0 ? 'bad' : 'ok')}
        ${card('Programadas este mes', fmt(em.agendadasMesActual), `meta ${em.metaMes}/mes · ${pct(em.agendadasMesActual, em.metaMes)}`, 'warn')}
        ${card('Promedio mensual', n1(em.promedioMensual), em.mejorMes ? `mejor mes ${em.mejorMes.mes}: ${em.mejorMes.total} (${em.mejorMes.efectivas} ef + ${em.mejorMes.fallidas} fa)` : '', '')}
        ${card('Arrastre Oct / Vencidas (col. R)', `${em.vencidasOctubre} / ${em.vencidas}`, `con PDF Oct (cruce): ${em.cruceOct.total} (${em.cruceOct.efectivas} ef · ${em.cruceOct.fallidas} fa) · clic →`, em.vencidas ? 'bad' : '', "App.verVencidas('Emergente')")}
      </div>
      <div class="info-box" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px">
        <span><strong>Cruce PDF Octubre vs Emergentes (CUIT + Estab col. M):</strong> ${em.cruceOct.total} filas emergentes coinciden con un PDF de octubre (<b>${em.cruceOct.efectivas} Efectivas</b> y <b>${em.cruceOct.fallidas} Fallidas</b>). Se marcan en la tabla sin sumar doble al objetivo.</span>
        <button type="button" class="btn sec sm" onclick="App.verCruceOct()">Ver esas ${em.cruceOct.total} filas →</button>
      </div>
      <div class="grid2">
        <div class="panel"><h3>Emergentes por mes · Efectivas + Fallidas c/PDF y Programadas (Meta 100/mes)</h3><div style="height:260px"><canvas id="chMain"></canvas></div></div>
        <div class="panel"><h3>Cortes trimestrales (Meta 300/trimestre)</h3>
          <div class="tw" style="border:0"><table><thead><tr><th>Corte</th><th>Período</th><th class="num">Meta</th><th class="num">Ef.</th><th class="num">Fa.</th><th class="num">Total</th><th>Cumpl.</th></tr></thead><tbody>
          ${em.trimestres.map(t => `<tr style="cursor:default"><td><b>${t.q}</b></td><td>${t.desde} → ${t.hasta}</td><td class="num">${t.meta}</td><td class="num">${t.efectivas}</td><td class="num">${t.fallidas}</td><td class="num"><b>${t.total}</b></td><td><span class="bar"><i style="width:${Math.min(100, (t.total * 100) / t.meta)}%"></i></span>${pct(t.total, t.meta)}</td></tr>`).join('')}
          </tbody></table></div>
        </div>
      </div>`;
    } else {
      h += `<div class="cards">
        ${card('Residuales cerradas (c/PDF)', `${fmt(re.realizadas)} <small>/ ${fmt(re.total)}</small>`, `${pct1(re.pct)} del stock residual`, 'ok')}
        ${card('Pendientes a liquidar', fmt(re.pendientes), `Etapa 1 fin ${C.aDMY(re.finE1)} · Etapa 2 fin ${C.aDMY(re.finE2)}`, 'warn')}
        ${card('Programadas este mes', fmt(re.agendadasMesActual), `meta ${re.metaMes}/mes · ${pct(re.agendadasMesActual, re.metaMes)}`, '')}
        ${card('Ritmo requerido (Etapa 1)', `${n1(re.ritmoRequeridoE1)} <small>/mes</small>`, `${re.mesesRestE1} mes(es) hasta Ene-27`, '')}
        ${card('Técnicas / Especiales', `${fmt(re.tecnicas)} / ${fmt(re.especiales)}`, 'tipología del stock residual', '')}
        ${card('Vencidas (col. R)', fmt(re.vencidas), 'fecha máx. (col. R) superada · clic para ver →', re.vencidas ? 'bad' : '', "App.verVencidas('Residual')")}
      </div>
      <div class="grid2" style="margin-bottom:16px">
        <div class="panel"><h3>Residuales por mes · Cerradas c/PDF y Programadas (Meta 400/mes)</h3><div style="height:260px"><canvas id="chMain"></canvas></div></div>
        <div class="panel"><h3>Curva de extinción (Burn-down a 400/mes)</h3><div style="height:260px"><canvas id="chSec"></canvas></div></div>
      </div>
      <div class="panel"><h3>Stock residual por etapa</h3>
        <div class="tw" style="border:0"><table><thead><tr><th>Etapa</th><th>Meta etapa</th><th class="num">Total</th><th class="num">Cerradas c/PDF</th><th>Avance</th><th class="num">Programadas</th><th class="num">Sin programar</th><th class="num">Vencidas (R)</th></tr></thead><tbody>
        ${re.etapas.map(b => `<tr style="cursor:default"><td><b>${esc(b.etapa)}</b></td><td>${/Urgente/.test(b.etapa) ? 'según col. R' : C.aDMY(C.CONFIG.PLAZO_ETAPA[b.etapa])}</td><td class="num">${fmt(b.total)}</td><td class="num">${fmt(b.cerradas)}</td><td><span class="bar"><i style="width:${b.total ? (b.cerradas * 100) / b.total : 0}%"></i></span>${pct(b.cerradas, b.total)}</td><td class="num">${fmt(b.agendadasPend)}</td><td class="num">${fmt(b.sinAgendar)}</td><td class="num ${b.vencidas ? 'venc' : ''}">${fmt(b.vencidas)}</td></tr>`).join('')}
        </tbody></table></div>
      </div>`;
    }

    const cp = C.cumplimientoYParticipacion(visitasParaTablero, histScope, subTab, hoy);
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
            { label: 'Programadas (mes)',      data: ms.map(x => x.agendadas), backgroundColor: 'rgba(91,102,112,0.55)', stack: 'agenda', order: 2 },
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
            { label: 'Programadas',     data: ms.map(x => x.agendadas), backgroundColor: 'rgba(15,76,92,0.55)', stack: 'agenda', order: 2 },
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
            { label: 'Programadas',     data: ms.map(x => x.agendadas), backgroundColor: 'rgba(91,102,112,0.55)', stack: 'agenda', order: 2 },
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

  /* ---------- 3. LOGÍSTICA POR ÁMBITO Y DEPARTAMENTO/LOCALIDAD ---------- */
  function filtrarLogisticaLista() {
    const hoy = C.hoyISO();
    const q = C.sinTildes(LOG.q).toLowerCase().trim();
    const baseSinAmb = baseGlobal(true).filter(v => !LOG.soloPendientes || !v.cerrada);
    const porEt = C.filtrarPorEtiqueta(baseSinAmb, LOG.etiqueta, hoy);
    const ambKeyAct = F.ambito ? C.sinTildes(F.ambito).toLowerCase() : '';
    const out = porEt.filter(v => {
      const ambKey = C.sinTildes(C.normAmbito(v.ambito || v.provincia)).toLowerCase();
      if (ambKeyAct && ambKey !== ambKeyAct) return false;
      const zonaKey = ambKey + '|' + C.sinTildes(C.zonaVisita(v)).toLowerCase();
      if (LOG.zona && zonaKey !== LOG.zona) return false;
      if (q) {
        const h = C.sinTildes([v.cuit, v.empleador, v.establecimiento, v.domicilio, v.localidad, v.departamento, v.ambito, v.tareas, v.cp, v.obs, v.obsCS, v.obsIAPSER].join(' ')).toLowerCase();
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
    const baseSinAmb = baseGlobal(true).filter(v => !LOG.soloPendientes || !v.cerrada);
    const ambKeyAct = F.ambito ? C.sinTildes(F.ambito).toLowerCase() : '';

    // 1. Etiquetas dinámicas (cruce bidireccional con Ámbito/Zona)
    const baseGeo = baseSinAmb.filter(v => {
      const ambKey = C.sinTildes(C.normAmbito(v.ambito || v.provincia)).toLowerCase();
      if (ambKeyAct && ambKey !== ambKeyAct) return false;
      const zonaKey = ambKey + '|' + C.sinTildes(C.zonaVisita(v)).toLowerCase();
      if (LOG.zona && zonaKey !== LOG.zona) return false;
      return true;
    });
    const tags = C.resumenEtiquetas(baseGeo, hoy);
    const tagsPrio = tags.filter(t => t.grupo === 'prioridad');
    const tagsTareas = tags.filter(t => t.grupo === 'tareas');

    // 2. Agrupación geográfica (filtrada por la etiqueta activa)
    const baseEt = C.filtrarPorEtiqueta(baseSinAmb, LOG.etiqueta, hoy);
    const geo = C.agruparLogistica(baseEt);
    const zonasVisibles = ambKeyAct ? geo.zonas.filter(z => z.ambKey === ambKeyAct) : geo.zonas;
    const limiteZonas = (ambKeyAct || LOG.verTodasZonas) ? zonasVisibles.length : Math.min(25, zonasVisibles.length);
    const ambSelObj = ambKeyAct ? geo.ambitos.find(a => a.key === ambKeyAct) : null;
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
    const haySel = !!(LOG.etiqueta || F.ambito || LOG.zona || LOG.q);

    const btnTag = t => `<button type="button" class="tag-btn t-${t.tono}${LOG.etiqueta === t.id ? ' on' : ''}${t.count === 0 ? ' zero' : ''}" onclick="App.logTag('${t.id}')">${esc(t.label)} <span class="cnt">${fmt(t.count)}</span></button>`;

    let h = `<div class="page-head"><div><h1>Logística por ámbito</h1><div class="sub">Agrupación geográfica por ámbito y departamento/localidad para armar hojas de ruta.</div></div></div>`;
    h += barraFiltrosGlobalHTML(ruta.length);

    h += `<div class="panel" style="margin-bottom:14px">
      <div class="tlbl">Prioridad y etapa</div>
      <div class="tags">${tagsPrio.map(btnTag).join('')}</div>
      <div class="tlbl" style="margin-top:11px">Críticas vencidas (col. R)</div>
      <div class="tags">${tagsTareas.map(btnTag).join('')}</div>
    </div>`;

    h += `<div class="two w">
      <div class="panel">
        <h3>
          <span>Por Ámbito (${geo.ambitos.length}) ${etSelObj ? `<span class="pill p-ag">${esc(etSelObj.label)}</span>` : ''}</span>
          ${F.ambito ? `<button type="button" class="btn sec sm" onclick="App.setAmbito('')">Ver todos los ámbitos</button>` : '<span class="note" style="font-weight:400">Clic para enfocar zona</span>'}
        </h3>
        <div class="amb-grid">
          ${geo.ambitos.length ? geo.ambitos.map(a => `<button type="button" class="amb-card${ambKeyAct === a.key ? ' on' : ''}" data-amb="${esc(a.ambito)}" onclick="App.setAmbito(this.dataset.amb)">
            <div class="an" title="${esc(a.ambito)}">${esc(a.ambito)}</div>
            <div class="av">${fmt(a.total)}</div>
            <div class="as"><span class="${a.vencidas ? 'venc' : ''}">${a.vencidas} venc.</span>${a.urgentes ? `<span><b>${a.urgentes}</b> urg.</span>` : ''}<span>${a.estabUnicos} estab.</span></div>
          </button>`).join('') : '<span class="note">Sin visitas para esta etiqueta.</span>'}
        </div>
      </div>

      <div class="panel">
        <h3>
          <span>${ambSelObj ? `Departamentos / Localidades en ${esc(ambSelObj.ambito)} (${zonasVisibles.length})` : `Concentración por Departamento / Localidad (Top ${limiteZonas} de ${zonasVisibles.length})`}</span>
          <span style="display:flex;gap:6px;align-items:center">
            ${LOG.zona ? `<button type="button" class="btn sec sm" onclick="App.logZona('')">Quitar localidad</button>` : ''}
            ${!ambKeyAct && zonasVisibles.length > 25 ? `<button type="button" class="btn sec sm" onclick="App.logToggleZonas()">${LOG.verTodasZonas ? 'Ver Top 25' : 'Ver todas (' + zonasVisibles.length + ')'}</button>` : ''}
          </span>
        </h3>
        <div style="max-height:310px;overflow:auto">
          <table class="grid-op"><thead><tr>${ambKeyAct ? '' : '<th>Ámbito</th>'}<th>Depto / Localidad</th><th class="num">Visitas</th><th class="num">Estab.</th><th class="num">Venc. (R)</th><th class="num">Urg.</th><th class="num">AT/EP</th><th class="num">PESE/363</th><th class="num">Obras</th><th class="num">Sin prog.</th></tr></thead><tbody>
          ${zonasVisibles.length ? zonasVisibles.slice(0, limiteZonas).map(z => `<tr class="${LOG.zona === z.key ? 'zona-on' : ''}" data-zona="${esc(z.key)}" data-amb="${esc(z.ambito)}" onclick="App.logZona(this.dataset.zona,this.dataset.amb)">
            ${ambKeyAct ? '' : `<td>${esc(z.ambito)}</td>`}
            <td><b>${esc(z.zona)}</b></td><td class="num"><b>${z.total}</b></td><td class="num">${z.estabUnicos}</td>
            <td class="num ${z.vencidas ? 'venc' : ''}">${z.vencidas}</td>
            <td class="num">${z.urgentes || '–'}</td>
            <td class="num ${z.atEp ? 'venc' : ''}">${z.atEp || '–'}</td>
            <td class="num ${z.pese363 ? 'venc' : ''}">${z.pese363 || '–'}</td>
            <td class="num">${z.obras || '–'}</td>
            <td class="num">${z.sinProgramar}</td>
          </tr>`).join('') : '<tr><td colspan="10" class="note">Sin zonas con visitas para el filtro activo.</td></tr>'}
          </tbody></table>
        </div>
      </div>
    </div>`;

    const focoPartes = [];
    if (etSelObj) focoPartes.push(`Etiqueta: <b>${esc(etSelObj.label)}</b>`);
    if (F.ambito) focoPartes.push(`Ámbito: <b>${esc(F.ambito)}</b>`);
    if (zonaSelObj) focoPartes.push(`Zona: <b>${esc(zonaSelObj.zona)}</b>`);

    h += `<div class="route-bar">
      <span>${focoPartes.length ? focoPartes.join(' · ') : '<b>Todo el país</b>'}</span>
      <span>· <b>${fmt(ruta.length)}</b> visitas (<b>${fmt(estabSet.size)}</b> estab. únicos)</span>
      <span>· <b class="${nVencRuta ? 'venc' : ''}">${fmt(nVencRuta)}</b> venc. · <b>${fmt(nUrgRuta)}</b> urg. · <b>${fmt(nProgRuta)}</b> prog.</span>
      <span style="flex:1"></span>
      <label style="display:inline-flex;align-items:center;gap:5px;margin:0;cursor:pointer;font-size:12px"><input type="checkbox" style="width:auto;margin:0" ${LOG.soloPendientes ? 'checked' : ''} onchange="App.logOpt('soloPendientes',this.checked)"> Solo pendientes</label>
      <select style="padding:5px 8px;font-size:12px;border:1px solid var(--line);border-radius:6px;background:#fff" onchange="App.logOpt('orden',this.value)" title="Orden de la hoja de ruta">
        <option value="prioridad" ${LOG.orden === 'prioridad' ? 'selected' : ''}>Orden: Prioridad crítica</option>
        <option value="zona_cp" ${LOG.orden === 'zona_cp' ? 'selected' : ''}>Orden: Zona + CP + Domicilio (ruta)</option>
        <option value="fecha" ${LOG.orden === 'fecha' ? 'selected' : ''}>Orden: Fecha máx. (col. R)</option>
      </select>
      <input type="search" id="logSearch" placeholder="Filtrar domicilio, empleador, CP…" value="${esc(LOG.q)}" style="padding:5px 9px;font-size:12px;border:1px solid var(--line);border-radius:6px;min-width:190px;background:#fff" oninput="App.logBuscar(this.value)">
      ${haySel ? '<button type="button" class="btn sec sm" onclick="App.logLimpiar()">Limpiar</button>' : ''}
      <button type="button" class="btn sm" onclick="App.exportarRutaCSV()">⬇ Exportar Hoja de Ruta</button>
    </div>`;

    h += `<div class="tw"><div style="overflow:auto;max-height:58vh"><table class="grid-op"><thead><tr>
      <th>Ámbito</th><th>Depto / Localidad</th><th>Domicilio</th><th>CUIT</th><th>Empleador</th><th>Estab. (M)</th><th>Etapa</th><th>Tareas</th>
      <th title="Observaciones y alerta de visita potencialmente fallida">Obs. / Riesgo</th><th title="Fecha máxima según Columna R de la planilla">Fecha máx. (R)</th><th title="Fecha programada cargada por el preventor">F. programada</th><th>Estado</th><th>Acción</th>
    </tr></thead><tbody>`;
    sl.forEach(v => {
      const tareasTxt = C.formatearTareas(v.tareas);
      const ambTxt = C.normAmbito(v.ambito || v.provincia);
      const zonaTxt = C.zonaVisita(v);
      const fechaCelda = C.aDMY(v.fechaMax) + (v.vencida ? ' <span class="pill p-bad">Vencida</span>' : '');
      h += `<tr class="${v.vencida ? 'is-venc' : ''}" data-id="${esc(v.id)}" onclick="App.abrir(this.dataset.id)">
        <td>${esc(ambTxt)}</td>
        <td class="clip" style="max-width:125px" title="${esc(zonaTxt)}">${esc(zonaTxt)}</td>
        <td class="clip" style="max-width:165px" title="${esc(v.domicilio)}">${esc(v.domicilio)}</td>
        <td>${esc(v.cuit)}</td>
        <td class="clip${v.textoObs ? ' obs-trig' : ''}" ${v.textoObs ? `data-obs-id="${esc(v.id)}"` : `title="${esc(v.empleador)}"`} style="max-width:170px">${esc(v.empleador)}</td>
        <td>${esc(v.nroEstab)}</td>
        <td>${esc(v.planificacion)}</td>
        <td class="clip" style="max-width:205px" title="${esc(tareasTxt)}">${esc(tareasTxt)}</td>
        <td>${badgeObsHTML(v)}</td>
        <td class="${v.vencida ? 'venc' : ''}">${fechaCelda}</td>
        <td>${C.aDMY(v.fechaAgendada)}</td>
        <td>${pillEstado(v.estado, v.vencida)}</td>
        <td><button type="button" class="btn sec sm" data-id="${esc(v.id)}" onclick="event.stopPropagation();App.abrir(this.dataset.id)">📅 Programar</button></td>
      </tr>`;
    });
    if (!sl.length) h += '<tr><td colspan="13" class="note" style="padding:20px;text-align:center">Sin visitas para esta selección.</td></tr>';
    h += `</tbody></table></div><div class="pager"><button type="button" class="btn sec sm" onclick="App.logPag(-1)">‹</button> Página ${LOG.pagina} de ${pags} <button type="button" class="btn sec sm" onclick="App.logPag(1)">›</button></div></div>`;
    $('main').innerHTML = h;
  }

  function exportarRutaCSV() {
    const lista = filtrarLogisticaLista();
    const cols = [
      ['ambitoNorm', 'Ambito'], ['zonaNorm', 'Depto / Localidad'], ['cp', 'CP'], ['domicilio', 'Domicilio'],
      ['cuit', 'CUIT'], ['empleador', 'Empleador'], ['nroEstab', 'Estab (M)'], ['establecimiento', 'Establecimiento'],
      ['planificacion', 'Etapa'], ['tareas', 'Tareas'], ['fechaMax', 'Fecha Maxima (Col R)'], ['vencida', 'Vencida'],
      ['fechaAgendada', 'Fecha Programada (Preventor)'], ['estado', 'Estado'],
      ['riesgoTxt', 'Potencialmente Fallida'], ['obsTodo', 'Observaciones']
    ];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '\ufeff' + cols.map(c => q(c[1])).join(',') + '\n' + lista.map(v => cols.map(([k]) => {
      if (k === 'ambitoNorm') return q(C.normAmbito(v.ambito || v.provincia));
      if (k === 'zonaNorm') return q(C.zonaVisita(v));
      if (k === 'vencida') return q(v.vencida ? 'Si' : 'No');
      if (k === 'riesgoTxt') return q(v.riesgoFallida ? ('Si (' + v.riesgoFallida.nivel + ': ' + v.riesgoFallida.motivo + ')') : 'No');
      if (k === 'obsTodo') return q(v.textoObs || '');
      if (k === 'fechaMax' || k === 'fechaAgendada') return q(C.aDMY(v[k]));
      return q(v[k]);
    }).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'hoja_de_ruta_' + (LOG.etiqueta || 'general') + '_' + C.hoyISO() + '.csv';
    a.click();
  }

  /* ---------- 4. GRILLAS OPERATIVAS DE VISITAS ---------- */
  const META_VISTA = {
    sin_agendar: ['Sin agendar', 'Visitas sin fecha programada o fallidas pendientes de reprogramar.'],
    agendadas: ['Agendadas', 'Visitas con fecha programada por preventor, aún sin resultado cargado.'],
    realizadas: ['Realizadas', 'Todas las visitas realizadas (ciclo vigente + Sep–Oct sin doble conteo). Solo suman al objetivo las que tienen PDF.'],
    vencidas: ['Vencidas (col. R)', 'Visitas abiertas cuya fecha máxima (columna R) ya fue superada.'],
    pot_fallidas: ['Potencialmente fallidas', 'Visitas abiertas con alertas en sus observaciones (cerrado, fallecido, sin actividad AFIP/pública o domicilio dudoso).'],
    todas: ['Padrón vigente', 'Planilla operativa vigente completa con todos los filtros.'],
    pendientes: ['Pendientes', 'Visitas aún no cerradas con documento PDF.'],
    revisar: ['Errores / A revisar', 'Posibles duplicadas por fecha o tareas repetidas entre año anterior y actual.']
  };

  function subtabsVistaHTML(baseRows) {
    if (F.etiqueta) return '';
    if (vista === 'pot_fallidas') {
      const nA = baseRows.filter(v => v.riesgoFallida && v.riesgoFallida.nivel === 'alto').length;
      const nM = baseRows.filter(v => v.riesgoFallida && v.riesgoFallida.nivel === 'medio').length;
      const defs = [
        ['', `Todas (${fmt(baseRows.length)})`],
        ['alto', `Riesgo alto (${fmt(nA)})`],
        ['medio', `Riesgo medio (${fmt(nM)})`]
      ];
      return `<div class="seg">${defs.map(([k, l]) => `<button type="button" class="${F.sub === k ? 'on' : ''}" onclick="App.f('sub','${k}')">${l}</button>`).join('')}</div>`;
    }
    if (vista === 'realizadas') {
      const c = contarEstados([], baseRows);
      const defs = [
        ['', `Con PDF (${fmt(c.Re)})`],
        ['ef', `Efectivas c/PDF (${fmt(c.ef)})`],
        ['fa', `Fallidas c/PDF (${fmt(c.fa)})`]
      ];
      if (c.sd) defs.push(['sd', `Sin PDF (${fmt(c.sd)})`], ['all', `Todas (${fmt(c.ReTodas)})`]);
      return `<div class="seg">${defs.map(([k, l]) => `<button type="button" class="${F.sub === k ? 'on' : ''}" onclick="App.f('sub','${k}')">${l}</button>`).join('')}</div>`;
    }
    const c = contarEstados(baseRows);
    let defs = null;
    if (vista === 'sin_agendar') {
      defs = [['', `Todas (${fmt(c.S)})`], ['venc', `Vencidas col. R (${fmt(c.sinV)})`], ['plazo', `En plazo (${fmt(c.sin)})`]];
      if (c.reprog) defs.push(['reprog', `A reprogramar (${fmt(c.reprog)})`]);
    } else if (vista === 'agendadas') {
      defs = [['', `Todas (${fmt(c.A)})`], ['venc', `Vencidas (${fmt(c.agV)})`], ['plazo', `En término (${fmt(c.ag)})`]];
    } else if (vista === 'vencidas') {
      const nSdV = baseRows.filter(v => esSinDoc(v) && v.vencida).length;
      defs = [['', `Todas (${fmt(c.V)})`], ['sin', `Sin agendar (${fmt(c.sinV)})`], ['ag', `Agendadas (${fmt(c.agV)})`]];
      if (nSdV) defs.push(['sd', `Sin PDF (${fmt(nSdV)})`]);
    }
    if (!defs) return '';
    return `<div class="seg">${defs.map(([k, l]) => `<button type="button" class="${F.sub === k ? 'on' : ''}" onclick="App.f('sub','${k}')">${l}</button>`).join('')}</div>`;
  }

  function renderLista() {
    destruirCharts();
    const baseVista = baseListaSinSub();
    const lista = filtrar();
    const total = lista.length, pags = Math.max(1, Math.ceil(total / PAGE));
    if (pagina > pags) pagina = pags;
    const sl = lista.slice((pagina - 1) * PAGE, pagina * PAGE);

    const meses = Array.from(new Set(baseVisitas().map(v => C.mesDe(v.fechaMax)).filter(Boolean))).sort();
    const nVenc = baseVista.filter(v => v.catVenc === 'vencida').length;
    const nMesAct = baseVista.filter(v => v.catVenc === 'mes_actual').length;
    const nOtroMes = baseVista.filter(v => v.catVenc === 'otro_mes').length;
    const tareasCat = C.catalogoTareas(baseVista);
    const tareaOpts = tareasCat.map(t => `<option value="${esc(t.key)}" ${F.tarea === t.key ? 'selected' : ''}>${esc(t.label)} (${t.total})</option>`).join('') +
      (F.tarea && !tareasCat.some(t => t.key === F.tarea) ? `<option value="${esc(F.tarea)}" selected>${esc(F.tarea)} (0)</option>` : '');

    const etObj = F.etiqueta ? C.ETIQUETAS_LOGISTICA.find(x => x.id === F.etiqueta) : null;
    const [tit, desc] = etObj ? [etObj.label, 'Prioridad crítica seleccionada desde Resumen.'] : (META_VISTA[vista] || ['Visitas', '']);
    const hayFiltrosLocales = !!(F.sub || F.etiqueta || F.tarea || F.venc || F.mes || F.estado || F.cruceOct || F.errTipo);

    let h = `<div class="page-head"><div><h1>${esc(tit)}</h1><div class="sub">${esc(desc)}</div></div></div>`;
    h += barraFiltrosGlobalHTML(total);

    if (etObj) {
      h += `<div class="info-box" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px">
        <span>Filtro de prioridad activa: <b>${esc(etObj.label)}</b> (${fmt(total)} visitas)</span>
        <button type="button" class="btn sec sm" onclick="App.f('etiqueta','')">Quitar prioridad</button>
      </div>`;
    }

    h += `<div class="filters">
      ${subtabsVistaHTML(baseVista)}
      <select class="${F.tarea ? 'act' : ''}" onchange="App.f('tarea',this.value)" title="Filtrar por tarea (columna Q)">
        <option value="">Tarea: todas</option>
        ${tareaOpts}
      </select>
      ${(vista === 'todas' || vista === 'revisar' || vista === 'pendientes') ? `<select class="${F.venc ? 'act' : ''}" onchange="App.f('venc',this.value)" title="Vencimiento según Fecha máxima (columna R)">
        <option value="">Vencimiento (col. R): todos</option>
        <option value="vencida" ${F.venc === 'vencida' ? 'selected' : ''}>Vencidas (${nVenc})</option>
        <option value="mes_actual" ${F.venc === 'mes_actual' ? 'selected' : ''}>Vencen mes actual (${nMesAct})</option>
        <option value="otro_mes" ${F.venc === 'otro_mes' ? 'selected' : ''}>Vencen otro mes (${nOtroMes})</option>
      </select>` : ''}
      <select class="${F.mes ? 'act' : ''}" onchange="App.f('mes',this.value)">${opts(meses, F.mes, 'Mes fecha máx.: todos')}</select>
      ${vista === 'todas' ? `<select class="${F.estado ? 'act' : ''}" onchange="App.f('estado',this.value)">${opts(Object.values(E), F.estado, 'Estado: todos')}</select>` : ''}
      <select class="${F.cruceOct ? 'act' : ''}" onchange="App.f('cruceOct',this.value)">
        <option value="">Cruce PDF Oct: todos</option>
        <option value="con" ${F.cruceOct === 'con' ? 'selected' : ''}>Con PDF de Oct (todos)</option>
        <option value="Efectiva" ${F.cruceOct === 'Efectiva' ? 'selected' : ''}>PDF Oct: Efectiva</option>
        <option value="Fallida" ${F.cruceOct === 'Fallida' ? 'selected' : ''}>PDF Oct: Fallida</option>
      </select>
      ${vista === 'revisar' ? `<select class="${F.errTipo ? 'act' : ''}" onchange="App.f('errTipo',this.value)">
        <option value="">Tipo de error: todos</option>
        <option value="misma_tarea_anios" ${F.errTipo === 'misma_tarea_anios' ? 'selected' : ''}>Misma tarea año ant. y actual (${baseVista.filter(v => v.errores && v.errores.indexOf('misma_tarea_anios') >= 0).length})</option>
        <option value="duplicada_fecha" ${F.errTipo === 'duplicada_fecha' ? 'selected' : ''}>Duplicada otra fecha (${baseVista.filter(v => v.errores && v.errores.indexOf('duplicada_fecha') >= 0).length})</option>
      </select>` : ''}
      ${hayFiltrosLocales ? '<button type="button" class="btn sec sm" onclick="App.limpiarFiltros()">Limpiar subfiltros</button>' : ''}
      <button type="button" class="btn sec sm" style="margin-left:auto" onclick="App.exportar()">⬇ Exportar CSV</button>
    </div>`;

    h += `<div class="tw"><div style="overflow:auto;max-height:70vh"><table class="grid-op"><thead><tr>
      <th>Universo</th><th>Prioridad</th><th>CUIT</th><th>Empleador</th><th>Estab. (M)</th><th>Ámbito / Localidad</th><th>Tareas</th>
      <th title="Observaciones y alerta de visita potencialmente fallida">Obs. / Riesgo</th><th title="Fecha máxima según Columna R de la planilla">Fecha máx. (R)</th><th title="Fecha programada cargada por el preventor">F. programada</th><th title="Fecha en que se realizó efectivamente la visita">Fecha real</th><th>Estado</th><th>Acción</th>
    </tr></thead><tbody>`;

    sl.forEach(v => {
      const tareasTxt = C.formatearTareas(v.tareas);
      const estabTxt = v.establecimiento ? `${v.nroEstab || '–'} · ${v.establecimiento}` : (v.nroEstab || '–');
      const ambTxt = v.esHistorico ? (v.ambito || '–') : C.normAmbito(v.ambito || v.provincia);
      const zonaTxt = v.esHistorico ? (v.localidad ? C.zonaVisita(v) : '') : C.zonaVisita(v);
      const locTxt = zonaTxt ? `${ambTxt} / ${zonaTxt}` : ambTxt;
      const cruceTag = v.cruceOct ? ` <a href="${esc(v.cruceOct.url)}" target="_blank" onclick="event.stopPropagation()" class="pill ${v.cruceOct.resultado === 'Efectiva' ? 'p-ok' : 'p-bad'}" title="PDF cargado en Octubre (${esc(v.cruceOct.fecha)} · ${esc(v.cruceOct.tarea)})">PDF Oct: ${v.cruceOct.resultado} ↗</a>` : '';
      const esAnios = v.errores && v.errores.indexOf('misma_tarea_anios') >= 0;
      const errTag = esAnios
        ? `<span class="pill p-bad" title="Misma tarea repetida entre año anterior y actual: ${esc((v.tareasRepetidasAnio || []).join(', '))}">🔁 Año ant./act.</span> `
        : (v.revisarDuplicada ? '<span class="pill p-warn" title="Misma tarea y establecimiento con fecha distinta">⚠ Duplicada</span> ' : '');
      const fechaCelda = (v.fechaMax ? C.aDMY(v.fechaMax) : '–') + (v.vencida ? ' <span class="pill p-bad">Vencida</span>' : '');
      h += `<tr class="${v.vencida ? 'is-venc' : ''}" data-id="${esc(v.id)}" onclick="App.abrir(this.dataset.id)">
        <td class="${v.cohorte === 'Emergente' ? 'tE' : 'tR'}">${v.cohorte}</td>
        <td>${esc(v.planificacion)}</td>
        <td>${esc(v.cuit)}</td>
        <td class="clip${v.textoObs ? ' obs-trig' : ''}" ${v.textoObs ? `data-obs-id="${esc(v.id)}"` : `title="${esc(v.empleador)}"`} style="max-width:180px">${esc(v.empleador)}</td>
        <td class="clip" style="max-width:130px" title="${esc(estabTxt)}">${esc(estabTxt)}</td>
        <td class="clip" style="max-width:145px" title="${esc(locTxt)}">${esc(ambTxt)}${zonaTxt ? ` <span class="note">/ ${esc(zonaTxt)}</span>` : ''}</td>
        <td class="clip" style="max-width:225px" title="${esc(tareasTxt)}">${errTag}${cruceTag ? cruceTag + ' ' : ''}${esc(tareasTxt)}</td>
        <td>${badgeObsHTML(v)}</td>
        <td class="${v.vencida ? 'venc' : ''}">${fechaCelda}</td>
        <td>${C.aDMY(v.fechaAgendada) || '–'}</td>
        <td>${C.aDMY(v.fechaReal) || '–'}</td>
        <td>${pillEstado(v.estado, v.vencida)}</td>
        <td><button type="button" class="btn sec sm" data-id="${esc(v.id)}" onclick="event.stopPropagation();App.abrir(this.dataset.id)">📄 PDF</button></td>
      </tr>`;
    });
    if (!sl.length) h += '<tr><td colspan="13" class="note" style="padding:24px;text-align:center">Sin visitas para los filtros actuales.</td></tr>';
    h += `</tbody></table></div><div class="pager"><span style="margin-right:auto">${fmt(total)} visita(s)</span><button type="button" class="btn sec sm" onclick="App.pag(-1)">‹</button> Página ${pagina} de ${pags} <button type="button" class="btn sec sm" onclick="App.pag(1)">›</button></div></div>`;
    $('main').innerHTML = h;
  }

  function render(mantenerBusqueda) {
    if (vista === 'tablero') vista = 'resumen';
    renderRail();
    if (!mantenerBusqueda && $('qGlobal')) $('qGlobal').value = F.q;
    if ($('qClear')) $('qClear').style.display = F.q ? 'block' : 'none';

    if (vista === 'resumen') renderResumen();
    else if (vista === 'metas') renderMetas();
    else if (vista === 'logistica') renderLogistica();
    else if (vista === 'abm') renderHistorialABM();
    else renderLista();

    const pend = COLA.length;
    const baseTxt = PADRON_LOCAL && PADRON_LOCAL.generado
      ? ('Padrón: ' + PADRON_LOCAL.generado + ' (' + fmt(baseVisitas().length) + ')')
      : (D.generado ? 'Datos: ' + D.generado : '');
    $('sync').textContent = '● ' + baseTxt + (pend ? ' · ' + pend + ' envío(s) pend.' : '');
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
    if (String(id || '').indexOf('hist|') === 0) {
      const vh = HIST_VISITAS.find(x => x.id === id);
      if (!vh) return;
      if (blobUrlIndividual) { URL.revokeObjectURL(blobUrlIndividual); blobUrlIndividual = ''; }
      editando = null;
      const datoH = (k, val) => `<b>${k}</b><span>${esc(val) || '–'}</span>`;
      $('dvTitulo').textContent = (vh.empleador || 'Visita') + (vh.nroEstab ? ' · Estab ' + vh.nroEstab : '');
      $('dvBody').innerHTML = `<div id="dvSplit"><div><div class="kv">
        ${datoH('CUIT / Contrato', vh.cuit + (vh.contrato ? ' / ' + vh.contrato : ''))}
        ${datoH('Establecimiento', [vh.establecimiento, vh.domicilio].filter(Boolean).join(' — '))}
        ${datoH('Localidad / Ámbito', [vh.localidad, vh.ambito].filter(Boolean).join(', '))}
        ${datoH('Tareas', C.formatearTareas(vh.tareas))}
        ${datoH('Origen', 'Emergente · ' + vh.origenPlan)}
        ${datoH('Fecha realizada', C.aDMY(vh.fechaReal))}
        <b>Estado</b><span>${pillEstado(vh.estado, false)}</span>
        ${vh.observacionesHist ? datoH('Observaciones', vh.observacionesHist) : ''}
        <b>Documento</b><span>${vh.adjuntoHist ? `<a href="${esc(vh.adjuntoHist)}" target="_blank">Abrir PDF en Google Drive ↗</a>` : 'Sin documento adjunto'}</span>
      </div></div>
      <div class="pdf-pane" id="dvPreview" style="display:none"></div></div>`;
      $('dvFoot').innerHTML = `${vh.adjuntoHist ? `<a class="btn sec" href="${esc(vh.adjuntoHist)}" target="_blank">Abrir PDF aparte ↗</a>` : ''}<button type="button" class="btn" onclick="dlgVisita.close()">Cerrar</button>`;
      const prevH = vh.adjuntoHist ? drivePreviewUrl(vh.adjuntoHist) : '';
      mostrarPreviewIndividual(prevH, `PDF (${C.aDMY(vh.fechaReal)} · ${vh.resultadoActual})`, vh.adjuntoHist);
      $('dlgVisita').showModal();
      return;
    }
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
    const riesgoHtml = v.riesgoFallida ? `<div class="val-box ${v.riesgoFallida.nivel === 'alto' ? 'bad' : 'warn'}"><strong>⚠ Potencialmente fallida (${esc(v.riesgoFallida.motivo)}):</strong> revisá las observaciones antes de asignar o enviar al preventor.</div>` : '';
    const contactoTxt = [v.responsable, v.telefono, v.email].filter(Boolean).join(' · ');

    $('dvTitulo').textContent = v.empleador + ' · Estab ' + v.nroEstab;
    $('dvBody').innerHTML = `<div id="dvSplit"><div><div class="kv">
      ${dato('CUIT / Contrato', v.cuit + ' / ' + v.contrato)}${dato('Establecimiento', v.establecimiento + ' — ' + v.domicilio)}
      ${dato('Localidad', v.localidad + ', ' + v.provincia)}${dato('Tareas', C.formatearTareas(v.tareas))}
      ${dato('Cohorte / Etapa', v.cohorte + ' · ' + v.planificacion)}
      ${contactoTxt ? dato('Contacto', contactoTxt) : ''}
      <b>Fecha máxima (col. R)</b><span class="${v.vencida ? 'venc' : ''}">${C.aDMY(v.fechaMax)}${v.vencida ? ' <span class="pill p-bad">Vencida</span>' : ''}</span>
      <b>Estado</b><span>${pillEstado(v.estado, v.vencida)}</span>${v.obsCS ? dato('Obs. CS', v.obsCS) : ''}${v.obsIAPSER ? dato('Obs. IAPSER', v.obsIAPSER) : ''}${v.obs ? dato('Observaciones', v.obs) : ''}</div>
      ${riesgoHtml}
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
    $('dvFoot').innerHTML = `<button type="button" class="btn sec" onclick="dlgVisita.close()">Cancelar</button><button type="button" class="btn" id="btnGuardar" onclick="App.guardar()">Guardar</button>`;
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
        return `<div class="bitem bad"><div class="bitem-head"><strong>${esc(it.nombre)}</strong><div>${badge} <button type="button" class="btn sec sm" onclick="App.quitarLote('${it.uid}')">✕</button></div></div></div>`;
      }
      const opciones = buscarOpcionesVisita(it.filtro, it.cuit);
      const selVisita = opciones.map(v => `<option value="${esc(v.id)}" ${v.id === it.visitaId ? 'selected' : ''}>${esc(v.cuit)} · ${esc(v.empleador)} · Estab ${esc(v.nroEstab)} (${esc(v.cohorte)} · ${esc(C.formatearTareas(v.tareas).slice(0, 38))})</option>`).join('');
      const cls = (it.status === 'subido' ? 'ok' : (it.error ? 'bad' : '')) + (it.uid === previewUid ? ' active' : '');
      const dis = (it.status === 'subiendo' || it.status === 'subido') ? 'disabled' : '';
      return `<div class="bitem ${cls}" data-uid="${it.uid}">
        <div class="bitem-head">
          <div style="cursor:pointer" onclick="App.verPdfLote('${it.uid}')"><strong>📄 ${esc(it.nombre)}</strong> ${it.cuit ? `<span class="note">CUIT: ${esc(it.cuit)}${it.nroEstab ? ' · Estab ' + esc(it.nroEstab) : ''}</span>` : ''}</div>
          <div>${badge} <button type="button" class="btn sec sm" onclick="App.verPdfLote('${it.uid}')">👁 Ver</button> <button type="button" class="btn sec sm" ${dis} onclick="App.quitarLote('${it.uid}')">✕</button></div>
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

  async function decodificarTextoCSV(file) {
    if (typeof file.arrayBuffer === 'function' && typeof TextDecoder !== 'undefined') {
      const buf = await file.arrayBuffer();
      const utf8 = new TextDecoder('utf-8').decode(buf);
      if (utf8.indexOf('\uFFFD') >= 0) {
        try { return new TextDecoder('windows-1252').decode(buf); } catch (e) { /* fallback */ }
      }
      return utf8;
    }
    return file.text();
  }

  async function cargarArchivoPadron(file) {
    if (!file) return;
    mostrarStatusPadron('');
    const nombre = file.name || 'archivo';
    try {
      const hojas = {};
      let nombresHojas = [];
      if (/\.csv$/i.test(nombre)) {
        const txt = await decodificarTextoCSV(file);
        const rows = parsearCSVTexto(txt.replace(/^\uFEFF/, ''));
        hojas['CSV'] = rows;
        nombresHojas = ['CSV'];
      } else if (/\.(xlsx|xls|ods)$/i.test(nombre)) {
        if (!window.XLSX) {
          return mostrarStatusPadron('No se cargó la librería XLSX (revisá tu conexión a internet o subí el archivo como CSV UTF-8).');
        }
        const buf = await file.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array', cellDates: false });
        nombresHojas = wb.SheetNames || [];
        nombresHojas.forEach(sn => {
          hojas[sn] = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true });
        });
      } else {
        return mostrarStatusPadron('Formato no soportado. Subí un archivo .csv (UTF-8), .xlsx, .xls o .ods.');
      }
      if (!nombresHojas.length) return mostrarStatusPadron('El archivo no contiene hojas con datos.');

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
      if (diff.altas.length) PADRON_UI.diffTab = 'altas';
      else if (diff.bajas.length) PADRON_UI.diffTab = 'bajas';
      else if (diff.cambiosTareas.length) PADRON_UI.diffTab = 'tareas';
      else if (diff.otrasModificadas.length) PADRON_UI.diffTab = 'otras';
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
      $('padronResumen').textContent = 'Subí un archivo .csv (UTF-8), .xlsx o .ods para iniciar la validación';
      return;
    }

    const { archivo, nombresHojas, hojaActiva, val, parsed, diff } = PADRON_UI;
    const rows = PADRON_UI.hojas[hojaActiva] || [];
    wrapHoja.style.display = 'flex';
    wrapHoja.innerHTML = `<strong>📄 ${esc(archivo)}</strong>` +
      (nombresHojas.length > 1
        ? `<label style="display:inline-flex;align-items:center;gap:6px">Hoja a importar: <select style="width:auto" onchange="App.cambiarHojaPadron(this.value)">${nombresHojas.map(sn => `<option value="${esc(sn)}" ${sn === hojaActiva ? 'selected' : ''}>${esc(sn)} (${Math.max(0, (PADRON_UI.hojas[sn] || []).length - 1)} filas)</option>`).join('')}</select></label>`
        : `<span class="note">Hoja: ${esc(hojaActiva)} (${Math.max(0, rows.length - 1)} filas)</span>`);

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

    h += `<details style="margin-top:8px"><summary class="note" style="cursor:pointer">Ver detalle completo de mapeo (${val.coincidencias.length} columnas mapeadas)</summary>
      <table class="diff-tbl"><thead><tr><th>Esperada</th><th>Letra esp.</th><th>En archivo</th><th>Letra arch.</th><th>Estado</th></tr></thead><tbody>
      ${val.coincidencias.map(c => `<tr style="cursor:default"><td>${esc(c.esperada)}</td><td>${c.letraEsperada}</td><td>${esc(c.encontrada)}</td><td>${c.letra}</td><td><span class="pill ${c.estado === 'exacta' ? 'p-ok' : (c.estado === 'remapeada' ? 'p-ai' : 'p-ag')}">${c.estado}</span></td></tr>`).join('')}
      </tbody></table></details></div>`;

    if (val.ok && parsed && diff) {
      h += `<div class="cards" style="margin:12px 0 8px">
        <div class="card ok"><div class="k">Altas (nuevas)</div><div class="v" style="color:var(--ok)">+${fmt(diff.altas.length)}</div><div class="s">ingresan al padrón</div></div>
        <div class="card bad"><div class="k">Bajas (eliminadas)</div><div class="v" style="color:var(--bad)">-${fmt(diff.bajas.length)}</div><div class="s">${diff.bajasConGestion.length ? `<span class="venc">${diff.bajasConGestion.length} con gestión/PDF</span>` : 'sin gestión cargada'}</div></div>
        <div class="card warn"><div class="k">Cambios de tareas</div><div class="v" style="color:#5B21B6">${fmt(diff.cambiosTareas.length)}</div><div class="s">mismo CUIT + Estab (conserva agenda)</div></div>
        <div class="card"><div class="k">Cambios de plazo / datos</div><div class="v">${fmt(diff.otrasModificadas.length)}</div><div class="s">${fmt(diff.sinCambios.length)} sin cambios</div></div>
      </div>`;

      if (diff.bajasConGestion.length) {
        h += `<div class="val-box bad"><strong>⚠ Atención: ${diff.bajasConGestion.length} visita(s) eliminada(s) del archivo ya tienen gestión o PDF cargado.</strong>
          <div class="note" style="margin-top:3px">Sus registros en <code>Seguimiento_Intentos</code> nunca se borran, y se registran en <code>Historial_ABM</code> y <code>Bajas_Historico</code>. Revisá la pestaña "Bajas" antes de confirmar.</div></div>`;
      }
      if (parsed.duplicadosOmitidos.length || parsed.filasSinFecha) {
        h += `<div class="note" style="margin:4px 0">Avisos del archivo: ${parsed.duplicadosOmitidos.length ? `<b>${parsed.duplicadosOmitidos.length} duplicado(s) exacto(s)</b> fuera de obras omitidos. ` : ''}${parsed.filasSinFecha ? `<b>${parsed.filasSinFecha} fila(s)</b> sin Fecha máxima válida en columna R.` : ''}</div>`;
      }

      h += `<div class="opt-row">
        <label><input type="checkbox" ${PADRON_UI.aplicarBajas ? 'checked' : ''} onchange="App.setPadronOpt('aplicarBajas',this.checked)"> Aplicar bajas (quitar las ${diff.bajas.length} eliminadas${PADRON_UI.syncSheets ? ' y respaldarlas en Bajas_Historico + Historial_ABM' : ''})</label>
        <label><input type="checkbox" ${PADRON_UI.syncSheets ? 'checked' : ''} ${url() ? '' : 'disabled'} onchange="App.setPadronOpt('syncSheets',this.checked)"> Sincronizar con Google Sheets (actualiza General, Historial_ABM y preserva X..AJ)</label>
        <label><input type="checkbox" ${PADRON_UI.registrarEmergentes ? 'checked' : ''} onchange="App.setPadronOpt('registrarEmergentes',this.checked)"> Alimentar <b>Visitas emergentes mensuales</b> con las ${diff.altas.length} alta(s) · Mes: <input style="width:74px;padding:2px 6px;font-size:12px" value="${esc(PADRON_UI.mesEmergente)}" onchange="App.setPadronOpt('mesEmergente',this.value.trim())"></label>
      </div>`;

      const dt = PADRON_UI.diffTab;
      h += `<div class="diff-tabs">
        <button type="button" class="${dt === 'altas' ? 'on' : ''}" onclick="App.setPadronOpt('diffTab','altas')">Altas (+${diff.altas.length})</button>
        <button type="button" class="${dt === 'bajas' ? 'on' : ''}" onclick="App.setPadronOpt('diffTab','bajas')">Bajas (-${diff.bajas.length})</button>
        <button type="button" class="${dt === 'tareas' ? 'on' : ''}" onclick="App.setPadronOpt('diffTab','tareas')">Cambios de tareas (${diff.cambiosTareas.length})</button>
        <button type="button" class="${dt === 'otras' ? 'on' : ''}" onclick="App.setPadronOpt('diffTab','otras')">Otros cambios (${diff.otrasModificadas.length})</button>
        ${parsed.duplicadosOmitidos.length ? `<button type="button" class="${dt === 'dups' ? 'on' : ''}" onclick="App.setPadronOpt('diffTab','dups')">Duplicados omitidos (${parsed.duplicadosOmitidos.length})</button>` : ''}
      </div>`;

      h += '<div style="max-height:250px;overflow:auto;border:1px solid var(--line);border-radius:8px">';
      if (dt === 'altas') {
        h += `<table class="diff-tbl"><thead><tr><th>CUIT</th><th>Empleador</th><th>Estab (M)</th><th>Localidad</th><th>Tareas</th><th>Fecha máx. (R)</th></tr></thead><tbody>` +
          (diff.altas.length ? diff.altas.slice(0, 120).map(v => `<tr style="cursor:default"><td>${esc(v.cuit)}</td><td>${esc(v.empleador)}</td><td>${esc(v.nroEstab)}</td><td>${esc(v.localidad)}</td><td>${esc(C.formatearTareas(v.tareas))}</td><td>${C.aDMY(v.fechaMax)}</td></tr>`).join('') : '<tr><td colspan="6" class="note">Sin altas nuevas.</td></tr>') +
          '</tbody></table>';
      } else if (dt === 'bajas') {
        h += `<table class="diff-tbl"><thead><tr><th>CUIT</th><th>Empleador</th><th>Estab (M)</th><th>Tareas</th><th>Fecha máx. (R)</th><th>Gestión</th></tr></thead><tbody>` +
          (diff.bajas.length ? diff.bajas.slice(0, 120).map(b => `<tr style="cursor:default"><td>${esc(b.visita.cuit)}</td><td>${esc(b.visita.empleador)}</td><td>${esc(b.visita.nroEstab)}</td><td>${esc(C.formatearTareas(b.visita.tareas))}</td><td>${C.aDMY(b.visita.fechaMax)}</td><td>${b.tieneGestion ? `<span class="pill p-bad">⚠ ${b.cantIntentos ? b.cantIntentos + ' intento(s)' : 'PDF Oct'}</span>` : '<span class="pill p-sin">Sin gestión</span>'}</td></tr>`).join('') : '<tr><td colspan="6" class="note">Sin bajas.</td></tr>') +
          '</tbody></table>';
      } else if (dt === 'tareas') {
        h += `<table class="diff-tbl"><thead><tr><th>CUIT</th><th>Empleador</th><th>Estab (M)</th><th>Diff de tareas</th><th>Plazo (R)</th><th>Gestión</th></tr></thead><tbody>` +
          (diff.cambiosTareas.length ? diff.cambiosTareas.slice(0, 120).map(m => {
            const dTar = m.diffTareas || C.diffTareas(m.anterior.tareas, m.nueva.tareas);
            const chips = dTar.agregadas.map(t => `<span class="diff-add">+ ${esc(t)}</span>`).join('') +
                          dTar.quitadas.map(t => `<span class="diff-del">− ${esc(t)}</span>`).join('');
            const plazoTxt = m.anterior.fechaMax !== m.nueva.fechaMax ? `${C.aDMY(m.anterior.fechaMax)} → <b>${C.aDMY(m.nueva.fechaMax)}</b>` : C.aDMY(m.nueva.fechaMax);
            return `<tr style="cursor:default"><td>${esc(m.nueva.cuit)}</td><td>${esc(m.nueva.empleador)}</td><td>${esc(m.nueva.nroEstab)}</td><td>${chips || esc(C.formatearTareas(m.nueva.tareas))}<div class="note">Ahora: ${esc(C.formatearTareas(m.nueva.tareas))}</div></td><td>${plazoTxt}</td><td>${m.tieneGestion ? '<span class="pill p-ag">Conserva agenda</span>' : '<span class="note">–</span>'}</td></tr>`;
          }).join('') : '<tr><td colspan="6" class="note">Sin cambios de tareas en establecimientos existentes.</td></tr>') +
          '</tbody></table>';
      } else if (dt === 'otras') {
        h += `<table class="diff-tbl"><thead><tr><th>CUIT</th><th>Empleador</th><th>Estab (M)</th><th>Cambios detectados</th></tr></thead><tbody>` +
          (diff.otrasModificadas.length ? diff.otrasModificadas.slice(0, 120).map(m => `<tr style="cursor:default"><td>${esc(m.nueva.cuit)}</td><td>${esc(m.nueva.empleador)}</td><td>${esc(m.nueva.nroEstab)}</td><td>${m.cambios.map(c => `<b>${esc(c.campo)}:</b> ${esc(c.key === 'fechaMax' ? C.aDMY(c.antes) : c.antes) || '–'} → <b>${esc(c.key === 'fechaMax' ? C.aDMY(c.despues) : c.despues) || '–'}</b>`).join('<br>')}</td></tr>`).join('') : '<tr><td colspan="4" class="note">Sin otros cambios de plazo o datos.</td></tr>') +
          '</tbody></table>';
      } else {
        h += `<table class="diff-tbl"><thead><tr><th>Fila</th><th>CUIT</th><th>Empleador</th><th>Estab (M)</th><th>Tareas</th><th>Fecha máx.</th></tr></thead><tbody>` +
          parsed.duplicadosOmitidos.slice(0, 100).map(d => `<tr style="cursor:default"><td>${d.fila}</td><td>${esc(d.cuit)}</td><td>${esc(d.empleador)}</td><td>${esc(d.nroEstab)}</td><td>${esc(d.tareas)}</td><td>${C.aDMY(d.fechaMax)}</td></tr>`).join('') +
          '</tbody></table>';
      }
      h += '</div>';

      const totalFinal = parsed.visitas.length + (PADRON_UI.aplicarBajas ? 0 : diff.bajas.length);
      $('padronResumen').textContent = `Resultado: ${fmt(totalFinal)} visitas (+${diff.altas.length} altas · ${PADRON_UI.aplicarBajas ? '-' + diff.bajas.length + ' bajas' : diff.bajas.length + ' bajas conservadas'} · ${diff.cambiosTareas.length} cambios de tareas · ${diff.otrasModificadas.length} otros)`;
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
    const { altas, cambiosTareas, otrasModificadas, bajas } = PADRON_UI.diff;
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lineas = [['Tipo', 'CUIT', 'Empleador', 'Estab (M)', 'Tareas', 'Fecha Max (Col R)', 'Detalle Cambios / Gestion'].map(q).join(',')];
    altas.forEach(v => lineas.push(['ALTA', v.cuit, v.empleador, v.nroEstab, C.formatearTareas(v.tareas), C.aDMY(v.fechaMax), 'Registro nuevo'].map(q).join(',')));
    cambiosTareas.forEach(m => {
      const dt = m.diffTareas || C.diffTareas(m.anterior.tareas, m.nueva.tareas);
      const det = (dt.agregadas.length ? '+ ' + dt.agregadas.join(', ') : '') + (dt.quitadas.length ? (dt.agregadas.length ? ' | ' : '') + '- ' + dt.quitadas.join(', ') : '');
      lineas.push(['CAMBIO_TAREA', m.nueva.cuit, m.nueva.empleador, m.nueva.nroEstab, C.formatearTareas(m.nueva.tareas), C.aDMY(m.nueva.fechaMax), det].map(q).join(','));
    });
    otrasModificadas.forEach(m => lineas.push(['MODIFICADA', m.nueva.cuit, m.nueva.empleador, m.nueva.nroEstab, C.formatearTareas(m.nueva.tareas), C.aDMY(m.nueva.fechaMax), m.cambios.map(c => `${c.campo}: ${c.antes} -> ${c.despues}`).join(' | ')].map(q).join(',')));
    bajas.forEach(b => lineas.push(['BAJA', b.visita.cuit, b.visita.empleador, b.visita.nroEstab, C.formatearTareas(b.visita.tareas), C.aDMY(b.visita.fechaMax), b.tieneGestion ? 'CON GESTION/PDF' : 'Sin gestion'].map(q).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'reporte_cambios_padron_' + C.hoyISO() + '.csv';
    a.click();
  }

  function descargarDatosJS() {
    if (!PADRON_UI || !PADRON_UI.parsed) return;
    const ahora = new Date();
    const gen = C.hoyISO(ahora) + ' ' + String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
    const payload = { generado: gen, visitas: construirVisitasFinalesPadron(), historico: D.historico || [], historialABM: movimientosABMUnificados() };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['window.SEG_DATA = ' + JSON.stringify(payload) + ';\n'], { type: 'application/javascript;charset=utf-8' }));
    a.download = 'datos.js';
    a.click();
  }

  function pillTipoABM(tipo) {
    if (tipo === 'ALTA') return '<span class="pill p-ok">✔ Alta</span>';
    if (tipo === 'BAJA') return '<span class="pill p-bad">✖ Baja</span>';
    if (tipo === 'CAMBIO_TAREA') return '<span class="pill p-chg">⇄ Cambio de tareas</span>';
    if (tipo === 'CAMBIO_PLAZO') return '<span class="pill p-ag">📅 Cambio de plazo</span>';
    return '<span class="pill p-warn">✎ Modificación</span>';
  }

  function celdaDetalleABM(m) {
    if (m.tipo === 'CAMBIO_TAREA') {
      const adds = (m.tareasAgregadas || '').split(' · ').filter(Boolean).map(t => `<span class="diff-add">+ ${esc(t)}</span>`).join('');
      const dels = (m.tareasQuitadas || '').split(' · ').filter(Boolean).map(t => `<span class="diff-del">− ${esc(t)}</span>`).join('');
      return `${adds}${dels}<div class="note">Quedó: ${esc(m.tareasDespues || '–')}</div>`;
    }
    if (m.tipo === 'ALTA') return esc(m.tareasDespues || m.detalle || '–');
    if (m.tipo === 'BAJA') return `<span style="color:var(--mut)">${esc(m.tareasAntes || '–')}</span>`;
    return `${esc(m.detalle || '')}${m.tareasDespues ? `<div class="note">${esc(m.tareasDespues)}</div>` : ''}`;
  }

  function celdaPlazoABM(m) {
    if (m.fechaMaxAntes && m.fechaMaxDespues && m.fechaMaxAntes !== m.fechaMaxDespues) {
      return `${C.aDMY(m.fechaMaxAntes)} → <b>${C.aDMY(m.fechaMaxDespues)}</b>`;
    }
    return C.aDMY(m.fechaMaxDespues || m.fechaMaxAntes) || '–';
  }

  function renderPopupResumenABM() {
    const lote = ULTIMO_LOTE_ABM;
    if (!lote || !$('abmPopBody')) return;
    const r = lote.resumen;
    $('abmPopTitulo').textContent = `Novedades del Padrón Registradas · ${lote.fechaABM}`;
    $('abmPopSub').textContent = `Archivo: ${lote.archivo || 'Padrón'} ${lote.usuario ? '· Cargado por: ' + lote.usuario : ''}`;

    const movs = lote.movimientos || [];
    const filtrados = movs.filter(m => {
      if (abmPopTab === 'altas') return m.tipo === 'ALTA';
      if (abmPopTab === 'bajas') return m.tipo === 'BAJA';
      if (abmPopTab === 'tareas') return m.tipo === 'CAMBIO_TAREA';
      if (abmPopTab === 'otras') return m.tipo === 'CAMBIO_PLAZO' || m.tipo === 'MODIFICACION';
      return true;
    });

    let h = `<div class="cards" style="margin:0 0 12px">
      <div class="card ok"><div class="k">Altas registradas</div><div class="v" style="color:var(--ok)">+${fmt(r.altas)}</div><div class="s">nuevas visitas incorporadas</div></div>
      <div class="card bad"><div class="k">Bajas registradas</div><div class="v" style="color:var(--bad)">-${fmt(r.bajas)}</div><div class="s">${r.bajasConGestion ? `<span class="venc">${r.bajasConGestion} tenían gestión</span>` : 'sin gestión previa'}</div></div>
      <div class="card warn"><div class="k">Cambios de tareas</div><div class="v" style="color:#5B21B6">${fmt(r.cambiosTareas)}</div><div class="s">actualizadas manteniendo historial</div></div>
      <div class="card"><div class="k">Otros cambios</div><div class="v">${fmt(r.otrasModificadas)}</div><div class="s">plazos (col. R) o datos</div></div>
    </div>`;

    h += `<div class="diff-tabs">
      <button type="button" class="${abmPopTab === 'resumen' ? 'on' : ''}" onclick="App.setAbmPopTab('resumen')">Todos (${movs.length})</button>
      <button type="button" class="${abmPopTab === 'altas' ? 'on' : ''}" onclick="App.setAbmPopTab('altas')">Altas (+${r.altas})</button>
      <button type="button" class="${abmPopTab === 'bajas' ? 'on' : ''}" onclick="App.setAbmPopTab('bajas')">Bajas (-${r.bajas})</button>
      <button type="button" class="${abmPopTab === 'tareas' ? 'on' : ''}" onclick="App.setAbmPopTab('tareas')">Cambios de tareas (${r.cambiosTareas})</button>
      <button type="button" class="${abmPopTab === 'otras' ? 'on' : ''}" onclick="App.setAbmPopTab('otras')">Otros (${r.otrasModificadas})</button>
    </div>`;

    h += `<div style="max-height:340px;overflow:auto;border:1px solid var(--line);border-radius:8px"><table class="diff-tbl"><thead><tr>
      <th>Tipo</th><th>CUIT</th><th>Empleador</th><th>Estab (M)</th><th>Ámbito</th><th>Tareas / Detalle</th><th>Fecha máx. (R)</th><th>Gestión</th>
    </tr></thead><tbody>`;
    if (filtrados.length) {
      filtrados.slice(0, 150).forEach(m => {
        h += `<tr style="cursor:default">
          <td>${pillTipoABM(m.tipo)}</td>
          <td>${esc(m.cuit)}</td>
          <td>${esc(m.empleador)}</td>
          <td>${esc(m.nroEstab)}</td>
          <td>${esc(m.ambito)}</td>
          <td>${celdaDetalleABM(m)}</td>
          <td>${celdaPlazoABM(m)}</td>
          <td>${m.teniaGestion && m.teniaGestion !== 'No' ? `<span class="pill p-warn">${esc(m.teniaGestion)}</span>` : '<span class="note">No</span>'}</td>
        </tr>`;
      });
    } else {
      h += '<tr><td colspan="8" class="note" style="padding:18px;text-align:center">No hubo movimientos de este tipo en el listado cargado.</td></tr>';
    }
    h += '</tbody></table></div>';
    $('abmPopBody').innerHTML = h;
  }

  async function aplicarPadron() {
    if (!PADRON_UI || !PADRON_UI.val || !PADRON_UI.val.ok || !PADRON_UI.parsed) return;
    const btn = $('btnAplicarPadron');
    btn.disabled = true;
    mostrarStatusPadron('');
    const finales = construirVisitasFinalesPadron();
    const ahora = new Date();
    const gen = C.hoyISO(ahora) + ' ' + String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
    const usuario = load(LS_USER, '');
    const loteABM = C.construirLoteABM(PADRON_UI.diff, {
      fechaABM: gen,
      archivo: PADRON_UI.archivo,
      usuario: usuario,
      aplicarBajas: !!PADRON_UI.aplicarBajas
    });

    // 1. Migrar IDs en INTENTOS y COLA locales cuando cambió Tareas o Fecha máx.
    (PADRON_UI.diff.migracionesId || []).forEach(m => {
      if (INTENTOS[m.idAnterior] && m.idAnterior !== m.idNuevo) {
        const comb = (INTENTOS[m.idNuevo] || []).concat(INTENTOS[m.idAnterior]);
        const porN = {};
        comb.forEach(x => { porN[x.n] = x; });
        INTENTOS[m.idNuevo] = Object.values(porN).sort((a, b) => a.n - b.n);
        delete INTENTOS[m.idAnterior];
      }
      COLA.forEach(q => { if (q.id === m.idAnterior) q.id = m.idNuevo; });
    });
    save(LS_INT, INTENTOS);
    save(LS_COLA, COLA);

    // 2. Guardar movimientos en el historial ABM local
    if (loteABM.movimientos.length) {
      ABM_LOCAL = ABM_LOCAL || { ts: '', movimientos: [] };
      ABM_LOCAL.movimientos = (ABM_LOCAL.movimientos || []).concat(loteABM.movimientos);
      ABM_LOCAL.ts = ahora.toISOString();
      save(LS_ABM, ABM_LOCAL);
    }

    // 3. Actualizar padrón local inmediatamente
    const nuevoLocal = { generado: gen, ts: ahora.toISOString(), archivo: PADRON_UI.archivo, visitas: finales };
    PADRON_LOCAL = nuevoLocal;
    save(LS_PADRON, PADRON_LOCAL);
    recalcular();
    render();

    // 4. Mostrar el Pop-up de Novedades ABM con Fecha de ABM
    ULTIMO_LOTE_ABM = loteABM;
    abmPopTab = 'resumen';
    renderPopupResumenABM();
    $('dlgPadron').close();
    if ($('dlgResumenABM')) {
      $('abmPopSyncInfo').textContent = PADRON_UI.syncSheets && url()
        ? 'Sincronizando padrón e Historial_ABM con Google Sheets…'
        : `Guardado en la app (${loteABM.movimientos.length} movimiento(s) ABM con fecha ${gen}).`;
      $('dlgResumenABM').showModal();
    }

    // 5. Sincronizar con Google Sheets (General + Bajas_Historico + Visitas emergentes + Historial_ABM)
    if (PADRON_UI.syncSheets && url()) {
      try {
        const res = await post({
          action: 'syncPadron',
          archivo: PADRON_UI.archivo,
          usuario: usuario,
          aplicarBajas: !!PADRON_UI.aplicarBajas,
          registrarEmergentes: !!PADRON_UI.registrarEmergentes,
          mesEmergente: (PADRON_UI.mesEmergente || C.mesEmergenteActual()).trim(),
          migracionesId: PADRON_UI.diff.migracionesId || [],
          movimientosABM: loteABM.movimientos || [],
          filas: PADRON_UI.parsed.filasRaw
        });
        if (res && res.ok) {
          if (res.ts) {
            PADRON_LOCAL.ts = res.ts; save(LS_PADRON, PADRON_LOCAL);
            ABM_LOCAL.ts = res.ts; save(LS_ABM, ABM_LOCAL);
          }
          if ($('abmPopSyncInfo')) {
            $('abmPopSyncInfo').innerHTML = `✅ Guardado en Google Sheets (<code>Historial_ABM</code>: ${res.abmGuardados != null ? res.abmGuardados : loteABM.movimientos.length} mov. · <code>General</code>: ${res.totalFinal} filas).`;
          }
        } else if ($('abmPopSyncInfo')) {
          $('abmPopSyncInfo').innerHTML = '⚠ Guardado en la app; Google Sheets respondió: ' + esc((res && res.error) || 'actualizá el código de Apps Script');
        }
      } catch (e) {
        if ($('abmPopSyncInfo')) {
          $('abmPopSyncInfo').textContent = '⚠ Guardado en la app; sin conexión con Google Sheets en este momento.';
        }
      }
    }
    btn.disabled = false;
  }

  /* ---------- 5. VISTA INDEPENDIENTE: HISTORIAL ABM ---------- */
  function filtrarMovimientosABM() {
    const todos = movimientosABMUnificados();
    const q = C.sinTildes(ABM_F.q).toLowerCase().trim();
    return todos.filter(m => {
      if (ABM_F.lote && (m.loteId || m.fechaABM) !== ABM_F.lote) return false;
      if (ABM_F.tipo) {
        if (ABM_F.tipo === 'OTROS') {
          if (m.tipo !== 'CAMBIO_PLAZO' && m.tipo !== 'MODIFICACION') return false;
        } else if (m.tipo !== ABM_F.tipo) return false;
      }
      if (ABM_F.ambito && m.ambito !== ABM_F.ambito) return false;
      if (q) {
        const h = C.sinTildes([m.cuit, m.empleador, m.nroEstab, m.ambito, m.localidad, m.tareasAntes, m.tareasDespues, m.detalle, m.archivo, m.usuario].join(' ')).toLowerCase();
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function renderHistorialABM() {
    destruirCharts();
    const todos = movimientosABMUnificados();
    const filtrados = filtrarMovimientosABM();
    const pags = Math.max(1, Math.ceil(filtrados.length / PAGE));
    if (ABM_F.pagina > pags) ABM_F.pagina = pags;
    const sl = filtrados.slice((ABM_F.pagina - 1) * PAGE, ABM_F.pagina * PAGE);

    // Agrupar lotes por loteId o fechaABM
    const lotesMap = {};
    todos.forEach(m => {
      const k = m.loteId || m.fechaABM || 'sin_lote';
      if (!lotesMap[k]) lotesMap[k] = { key: k, fechaABM: m.fechaABM || '–', archivo: m.archivo || 'Padrón', count: 0 };
      lotesMap[k].count++;
    });
    const lotes = Object.values(lotesMap).sort((a, b) => String(b.fechaABM).localeCompare(String(a.fechaABM)));
    const ambitosABM = Array.from(new Set(todos.map(m => m.ambito).filter(Boolean))).sort();

    const baseLote = ABM_F.lote ? todos.filter(m => (m.loteId || m.fechaABM) === ABM_F.lote) : todos;
    const nAltas = baseLote.filter(m => m.tipo === 'ALTA').length;
    const nBajas = baseLote.filter(m => m.tipo === 'BAJA').length;
    const nBajasGest = baseLote.filter(m => m.tipo === 'BAJA' && m.teniaGestion && m.teniaGestion !== 'No').length;
    const nTareas = baseLote.filter(m => m.tipo === 'CAMBIO_TAREA').length;
    const nOtros = baseLote.filter(m => m.tipo === 'CAMBIO_PLAZO' || m.tipo === 'MODIFICACION').length;
    const hayFil = !!(ABM_F.lote || ABM_F.tipo || ABM_F.ambito || ABM_F.q);

    let h = `<div class="page-head">
      <div><h1>Historial ABM del Padrón</h1><div class="sub">Registro histórico con Fecha de ABM de altas, bajas y cambios de tareas entre listados (sincronizado con hoja <code>Historial_ABM</code>).</div></div>
      <div style="display:flex;gap:8px">
        ${ULTIMO_LOTE_ABM ? '<button type="button" class="btn sec" onclick="App.verUltimoPopupABM()">🔔 Ver último resumen</button>' : ''}
        <button type="button" class="btn" onclick="App.abrirPadron()">📥 Subir nuevo listado</button>
      </div>
    </div>`;

    h += `<div class="cards" style="margin-top:14px">
      <div class="card"><div class="k">Cortes registrados</div><div class="v">${fmt(lotes.length)}</div><div class="s">${lotes.length ? 'último: ' + esc(lotes[0].fechaABM) : 'sin cargas aún'}</div></div>
      <div class="card ok"><div class="k">Altas</div><div class="v" style="color:var(--ok)">+${fmt(nAltas)}</div><div class="s">incorporadas al padrón</div></div>
      <div class="card bad"><div class="k">Bajas</div><div class="v" style="color:var(--bad)">-${fmt(nBajas)}</div><div class="s">${nBajasGest ? `<span class="venc">${fmt(nBajasGest)} tenían gestión/PDF</span>` : 'dadas de baja'}</div></div>
      <div class="card warn"><div class="k">Cambios de tareas</div><div class="v" style="color:#5B21B6">${fmt(nTareas)}</div><div class="s">${nOtros ? `+ ${fmt(nOtros)} cambio(s) de plazo/datos` : 'mismo CUIT + Estab'}</div></div>
    </div>`;

    const segBtn = (k, lbl) => `<button type="button" class="${ABM_F.tipo === k ? 'on' : ''}" onclick="App.abmFiltro('tipo','${k}')">${lbl}</button>`;
    h += `<div class="filters" style="margin-top:6px">
      <div class="seg">
        ${segBtn('', `Todos (${fmt(baseLote.length)})`)}
        ${segBtn('ALTA', `Altas (${fmt(nAltas)})`)}
        ${segBtn('BAJA', `Bajas (${fmt(nBajas)})`)}
        ${segBtn('CAMBIO_TAREA', `Cambios de tareas (${fmt(nTareas)})`)}
        ${segBtn('OTROS', `Plazos / otros (${fmt(nOtros)})`)}
      </div>
      <select class="${ABM_F.lote ? 'act' : ''}" onchange="App.abmFiltro('lote',this.value)">
        <option value="">Fecha ABM / Corte: todos (${lotes.length})</option>
        ${lotes.map(l => `<option value="${esc(l.key)}" ${ABM_F.lote === l.key ? 'selected' : ''}>${esc(l.fechaABM)} · ${esc(l.archivo)} (${l.count})</option>`).join('')}
      </select>
      <select class="${ABM_F.ambito ? 'act' : ''}" onchange="App.abmFiltro('ambito',this.value)">
        <option value="">Ámbito: todos</option>
        ${ambitosABM.map(a => `<option value="${esc(a)}" ${ABM_F.ambito === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
      </select>
      <input type="search" id="abmSearch" placeholder="Buscar CUIT, empleador, tarea…" value="${esc(ABM_F.q)}" oninput="App.abmBuscar(this.value)">
      ${hayFil ? '<button type="button" class="btn sec sm" onclick="App.abmLimpiar()">Limpiar</button>' : ''}
      <button type="button" class="btn sec sm" style="margin-left:auto" onclick="App.exportarHistorialABM()">⬇ Exportar Historial ABM (.csv)</button>
    </div>`;

    h += `<div class="tw"><div style="overflow:auto;max-height:66vh"><table class="grid-op"><thead><tr>
      <th>Fecha ABM</th><th>Tipo</th><th>CUIT</th><th>Empleador</th><th>Estab. (M)</th><th>Ámbito / Localidad</th><th>Tareas / Cambios detectados</th><th>Fecha máx. (R)</th><th>Gestión previa</th><th>Archivo / Usuario</th>
    </tr></thead><tbody>`;

    if (sl.length) {
      sl.forEach(m => {
        const archUsr = [m.archivo, m.usuario].filter(Boolean).join(' · ');
        h += `<tr style="cursor:default">
          <td><b>${esc(m.fechaABM || '–')}</b></td>
          <td>${pillTipoABM(m.tipo)}</td>
          <td>${esc(m.cuit)}</td>
          <td class="clip" style="max-width:185px" title="${esc(m.empleador)}">${esc(m.empleador)}</td>
          <td>${esc(m.nroEstab)}</td>
          <td class="clip" style="max-width:150px" title="${esc(m.ambito + ' / ' + m.localidad)}">${esc(m.ambito)} <span class="note">/ ${esc(m.localidad)}</span></td>
          <td style="white-space:normal;min-width:250px;max-width:360px">${celdaDetalleABM(m)}</td>
          <td>${celdaPlazoABM(m)}</td>
          <td>${m.teniaGestion && m.teniaGestion !== 'No' ? `<span class="pill p-warn">${esc(m.teniaGestion)}</span>` : '<span class="note">No</span>'}</td>
          <td class="clip note" style="max-width:165px" title="${esc(archUsr)}">${esc(archUsr || '–')}</td>
        </tr>`;
      });
    } else {
      h += `<tr><td colspan="10" class="note" style="padding:28px;text-align:center">${todos.length ? 'Sin movimientos para los filtros seleccionados.' : 'Todavía no hay movimientos ABM registrados. Al subir un listado nuevo desde "📥 Padrón", las altas, bajas y cambios de tareas quedarán guardados acá con su Fecha de ABM.'}</td></tr>`;
    }
    h += `</tbody></table></div><div class="pager"><span style="margin-right:auto">${fmt(filtrados.length)} movimiento(s)</span><button type="button" class="btn sec sm" onclick="App.abmPag(-1)">‹</button> Página ${ABM_F.pagina} de ${pags} <button type="button" class="btn sec sm" onclick="App.abmPag(1)">›</button></div></div>`;
    $('main').innerHTML = h;
  }

  function exportarHistorialABM() {
    const lista = filtrarMovimientosABM();
    const cols = [
      ['fechaABM', 'Fecha ABM'], ['loteId', 'ID Lote'], ['tipo', 'Tipo'], ['cuit', 'CUIT'],
      ['empleador', 'Empleador'], ['nroEstab', 'Estab (M)'], ['ambito', 'Ambito'], ['localidad', 'Localidad'],
      ['tareasAntes', 'Tareas Antes'], ['tareasDespues', 'Tareas Despues'],
      ['tareasAgregadas', 'Tareas Agregadas'], ['tareasQuitadas', 'Tareas Quitadas'],
      ['fechaMaxAntes', 'Fecha Max Antes'], ['fechaMaxDespues', 'Fecha Max Despues'],
      ['teniaGestion', 'Tenia Gestion'], ['detalle', 'Detalle'], ['archivo', 'Archivo'], ['usuario', 'Usuario']
    ];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '\ufeff' + cols.map(c => q(c[1])).join(',') + '\n' + lista.map(m => cols.map(([k]) => {
      if (k === 'fechaMaxAntes' || k === 'fechaMaxDespues') return q(C.aDMY(m[k]));
      return q(m[k]);
    }).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'historial_abm_' + C.hoyISO() + '.csv';
    a.click();
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
        if (r.abmUpdatedAt && (!ABM_LOCAL || !ABM_LOCAL.ts || r.abmUpdatedAt > ABM_LOCAL.ts)) {
          try {
            const ra = await (await fetch(url() + '?action=getHistorialABM')).json();
            if (ra && ra.ok && Array.isArray(ra.movimientos)) {
              const vistos = {};
              const comb = [];
              ra.movimientos.concat((ABM_LOCAL && ABM_LOCAL.movimientos) || []).forEach(m => {
                const k = claveMovABM(m);
                if (!vistos[k]) { vistos[k] = true; comb.push(m); }
              });
              ABM_LOCAL = { ts: ra.abmUpdatedAt || r.abmUpdatedAt, movimientos: comb };
              save(LS_ABM, ABM_LOCAL);
            }
          } catch (e3) { /* silencioso si backend anterior no tiene getHistorialABM */ }
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
      ['fechaAgendada', 'Fecha Programada (Preventor)'], ['fechaReal', 'Fecha Real'], ['estado', 'Estado'],
      ['riesgoTxt', 'Potencialmente Fallida'], ['textoObs', 'Observaciones']
    ];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '\ufeff' + cols.map(c => q(c[1])).join(',') + '\n' + filtrar().map(v => cols.map(([k]) => {
      if (k === 'vencida') return q(v.vencida ? 'Si' : 'No');
      if (k === 'riesgoTxt') return q(v.riesgoFallida ? ('Si (' + v.riesgoFallida.nivel + ': ' + v.riesgoFallida.motivo + ')') : 'No');
      return q(v[k]);
    }).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'seguimiento_' + vista + '_' + C.hoyISO() + '.csv'; a.click();
  }

  function resetSubfiltrosLista() {
    Object.assign(F, { sub: '', etiqueta: '', estado: '', mes: '', venc: '', tarea: '', cruceOct: '', errTipo: '' });
    pagina = 1;
  }

  function limpiarFiltros() {
    resetSubfiltrosLista();
    render();
  }

  function limpiarGlobal() {
    F.cohorte = '';
    F.etapas = ['U', '1', '2'];
    F.ambito = '';
    F.obsFiltro = '';
    F.q = '';
    LOG.zona = '';
    pagina = 1;
    LOG.pagina = 1;
    render();
  }

  window.App = {
    ir(v) {
      vista = v;
      resetSubfiltrosLista();
      render();
      if ($('main')) $('main').scrollTop = 0;
    },
    irLista(v, optsLista) {
      vista = v;
      resetSubfiltrosLista();
      Object.assign(F, optsLista || {});
      render();
      if ($('main')) $('main').scrollTop = 0;
    },
    sub(s) {
      subTab = s;
      partFiltro = 'all';
      vista = 'metas';
      render();
    },
    setCohorte(c) {
      F.cohorte = c;
      if (vista === 'metas') {
        subTab = c === 'Emergente' ? 'emergentes' : (c === 'Residual' ? 'residuales' : 'consolidado');
        partFiltro = 'all';
      }
      pagina = 1; LOG.pagina = 1;
      render();
    },
    togEtapa(k) {
      const idx = F.etapas.indexOf(k);
      if (idx >= 0) {
        if (F.etapas.length > 1) F.etapas.splice(idx, 1);
      } else {
        F.etapas.push(k);
      }
      pagina = 1; LOG.pagina = 1;
      render();
    },
    todasEtapas() {
      F.etapas = ['U', '1', '2'];
      pagina = 1; LOG.pagina = 1;
      render();
    },
    setAmbito(a) {
      F.ambito = (F.ambito === a) ? '' : a;
      LOG.zona = '';
      pagina = 1; LOG.pagina = 1;
      render();
    },
    setObsFiltro(val) {
      F.obsFiltro = val || '';
      pagina = 1; LOG.pagina = 1;
      render();
    },
    buscarGlobal(val, forzarInput) {
      F.q = val || '';
      pagina = 1; LOG.pagina = 1;
      render(!forzarInput);
      if (forzarInput && $('qGlobal')) $('qGlobal').focus();
    },
    togAmbitosResumen() { verTodosAmbitosResumen = !verTodosAmbitosResumen; renderResumen(); },
    togTareasResumen() { verTodasTareasResumen = !verTodasTareasResumen; renderResumen(); },
    verEtiqueta(id) {
      resetSubfiltrosLista();
      if (id === 'potencial_fallida') {
        vista = 'pot_fallidas';
      } else {
        F.etiqueta = id;
        const esVenc = /venc/.test(id) && id !== 'vence_mes' && id !== 'vence_prox';
        vista = esVenc ? 'vencidas' : 'todas';
      }
      render();
      if ($('main')) $('main').scrollTop = 0;
    },
    partMes(k) {
      partFiltro = k;
      if (ultimoCP) {
        document.querySelectorAll('#partBtns button').forEach(b => b.classList.toggle('on', b.getAttribute('onclick') === `App.partMes('${k}')`));
        renderChartParticipacion(ultimoCP.cp, ultimoCP.tituloScope);
      }
    },
    toggleMay27(checked) { F.excluirMay27 = !!checked; pagina = 1; recalcular(); render(); },
    verCruceOct() { resetSubfiltrosLista(); F.cohorte = 'Emergente'; F.cruceOct = 'con'; vista = 'todas'; render(); if ($('main')) $('main').scrollTop = 0; },
    verTarea(k) { resetSubfiltrosLista(); F.tarea = k; vista = 'todas'; render(); if ($('main')) $('main').scrollTop = 0; },
    verVencidas(cohorte) { resetSubfiltrosLista(); if (cohorte) F.cohorte = cohorte; vista = 'vencidas'; render(); if ($('main')) $('main').scrollTop = 0; },
    limpiarFiltros,
    limpiarGlobal,
    f(k, val) { F[k] = val; pagina = 1; render(); },
    pag(d) { pagina = Math.max(1, pagina + d); renderLista(); },
    logTag(id) { LOG.etiqueta = (LOG.etiqueta === id) ? '' : id; LOG.pagina = 1; renderLogistica(); },
    logAmbito(a) { App.setAmbito(a); },
    logZona(k, ambNombre) {
      LOG.zona = (LOG.zona === k) ? '' : k;
      if (LOG.zona && !F.ambito && ambNombre) F.ambito = ambNombre;
      LOG.pagina = 1;
      render();
    },
    logToggleZonas() { LOG.verTodasZonas = !LOG.verTodasZonas; renderLogistica(); },
    logOpt(k, val) { LOG[k] = val; LOG.pagina = 1; renderLogistica(); },
    logBuscar(val) { LOG.q = val; LOG.pagina = 1; renderLogistica(); const i = $('logSearch'); if (i) { i.focus(); i.setSelectionRange(val.length, val.length); } },
    logPag(d) { LOG.pagina = Math.max(1, LOG.pagina + d); renderLogistica(); },
    logLimpiar() { Object.assign(LOG, { etiqueta: '', zona: '', q: '', pagina: 1 }); F.ambito = ''; render(); },
    exportarRutaCSV,
    abrir, guardar, toggleRes, analizarPdfIndividual,
    abrirMasiva, agregarArchivosMasiva, updLote, quitarLote, limpiarMasiva, confirmarLote, verPdfLote,
    abrirPadron, cargarArchivoPadron, cambiarHojaPadron, remapearColumnaPadron, setPadronOpt, aplicarPadron, descargarDiffCSV, descargarDatosJS, restaurarPadronBase,
    setAbmPopTab(t) { abmPopTab = t; renderPopupResumenABM(); },
    verUltimoPopupABM() { if (ULTIMO_LOTE_ABM && $('dlgResumenABM')) { renderPopupResumenABM(); $('dlgResumenABM').showModal(); } },
    abmFiltro(k, val) { ABM_F[k] = val; ABM_F.pagina = 1; renderHistorialABM(); },
    abmBuscar(val) { ABM_F.q = val; ABM_F.pagina = 1; renderHistorialABM(); const i = $('abmSearch'); if (i) { i.focus(); i.setSelectionRange(val.length, val.length); } },
    abmPag(d) { ABM_F.pagina = Math.max(1, ABM_F.pagina + d); renderHistorialABM(); },
    abmLimpiar() { Object.assign(ABM_F, { lote: '', tipo: '', ambito: '', q: '', pagina: 1 }); renderHistorialABM(); },
    exportarHistorialABM,
    sincronizar, abrirConfig, guardarConfig, exportar,
    _estado: () => ({ VISITAS, INTENTOS, COLA, LOTE, PADRON_LOCAL, PADRON_UI, ABM_LOCAL, ULTIMO_LOTE_ABM, geminiActivo, F, LOG, ABM_F, vista, subTab })
  };
  /* ---------- HINT FLOTANTE DE OBSERVACIONES ---------- */
  function buscarPorIdCualquiera(id) {
    if (!id) return null;
    if (String(id).indexOf('hist|') === 0) return HIST_VISITAS.find(x => x.id === id) || null;
    return VISITAS.find(x => x.id === id) || null;
  }

  function ocultarObsTip() {
    const tip = $('obsTip');
    if (tip) tip.style.display = 'none';
  }

  function mostrarObsTip(targetEl) {
    const tip = $('obsTip');
    if (!tip || !targetEl) return;
    const id = targetEl.getAttribute('data-obs-id');
    const v = buscarPorIdCualquiera(id);
    if (!v || (!v.textoObs && !v.riesgoFallida)) { ocultarObsTip(); return; }
    let html = '';
    if (v.riesgoFallida) {
      html += `<div class="ot-risk ${v.riesgoFallida.nivel}">⚠ Potencialmente fallida · ${esc(v.riesgoFallida.motivo)}</div>`;
    }
    const partes = v.partesObs && v.partesObs.length ? v.partesObs : (v.textoObs ? [{ fuente: 'Observaciones', texto: v.textoObs }] : []);
    html += partes.map(p => `<div class="ot-item"><span class="ot-src">${esc(p.fuente)}:</span> ${esc(p.texto)}</div>`).join('');
    const ctcUnicos = Array.from(new Set([v.responsable, v.telefono, v.email].map(x => String(x || '').trim()).filter(Boolean)));
    if (ctcUnicos.length) html += `<div class="ot-ctc">📞 ${esc(ctcUnicos.join(' · '))}</div>`;
    tip.innerHTML = html;
    tip.style.display = 'block';
    if (typeof targetEl.getBoundingClientRect === 'function') {
      const r = targetEl.getBoundingClientRect();
      const tw = tip.offsetWidth || 340, th = tip.offsetHeight || 90;
      const vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
      let left = Math.min(vw - tw - 14, Math.max(12, r.left));
      let top = r.bottom + 8;
      if (top + th > vh - 12) top = Math.max(12, r.top - th - 8);
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }
  }

  if (typeof document.addEventListener === 'function') {
    document.addEventListener('mouseover', e => {
      const el = e.target && e.target.closest ? e.target.closest('[data-obs-id]') : null;
      if (el) mostrarObsTip(el); else ocultarObsTip();
    });
    document.addEventListener('scroll', ocultarObsTip, true);
  }

  window.dlgVisita = $('dlgVisita'); window.dlgCfg = $('dlgCfg'); window.dlgMasiva = $('dlgMasiva'); window.dlgPadron = $('dlgPadron'); window.dlgResumenABM = $('dlgResumenABM');
  $('dlgVisita').addEventListener('close', () => {
    if (blobUrlIndividual) { URL.revokeObjectURL(blobUrlIndividual); blobUrlIndividual = ''; }
    $('dlgVisita').classList.remove('wide');
  });

  recalcular(); render();
  if (url()) sincronizar();
})();
