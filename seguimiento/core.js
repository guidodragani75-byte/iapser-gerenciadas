/**
 * Núcleo de lógica del módulo Seguimiento Consultora (sin DOM, testeable en Node).
 * Regla: nada hardcodeado de datos; solo parámetros de gestión en CONFIG.
 */
(function (root) {
  'use strict';

  const CONFIG = {
    CORTE_RESIDUAL: '2026-10-01',        // fecha máxima < corte => Residual
    CORTE_EXCLUIR_FUTURO: '2027-05-01',  // filtro predeterminado: excluye visitas desde May-2027 inclusive
    METAS: {
      EMERGENTE_MES: 100,                // 100/mes => 1.200/año (Sep-26 a Ago-27)
      EMERGENTE_ANUAL: 1200,
      EMERGENTE_INICIO: '2026-09',
      RESIDUAL_MES: 400,                 // 400/mes desde Nov-26
      RESIDUAL_INICIO: '2026-11',
      RESIDUAL_FIN: '2027-01-31',        // fin Etapa 1
      ETAPA2_FIN: '2027-04-30'           // fin Etapa 2
    },
    META_AGENDA_MES: 500,                // consolidado (100 emergentes + 400 residuales)
    PLAZO_ETAPA: {                       // vencimiento por etapa (Urgente usa su fecha máxima)
      'Etapa 1': '2027-01-31',
      'Etapa 2': '2027-04-30'
    }
  };

  const ESTADOS = {
    SIN_AGENDAR: 'Sin agendar',
    AGENDADA: 'Agendada',
    EFECTIVA: 'Efectiva (cerrada)',
    EFECTIVA_SIN_DOC: 'Efectiva sin documento',
    FALLIDA_REPROGRAMAR: 'Fallida: a reprogramar',
    FALLIDA_CERRADA: 'Fallida (cerrada)',
    FALLIDA_SIN_DOC: 'Fallida sin documento'
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** 'dd/mm/yyyy' | 'yyyy-mm-dd' | ISO => 'yyyy-mm-dd' ('' si inválida) */
  function aISO(s) {
    if (!s) return '';
    s = String(s).trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    return '';
  }
  function aDMY(iso) {
    const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }
  function mesDe(iso) { return iso ? iso.slice(0, 7) : ''; }
  function hoyISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function sumarMeses(ym, n) {
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    return (y + Math.floor(m / 12)) + '-' + pad(((m % 12) + 12) % 12 + 1);
  }
  function diffMeses(a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); }

  function sinTildes(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function cohorte(fechaMaxISO) {
    return fechaMaxISO && fechaMaxISO < CONFIG.CORTE_RESIDUAL ? 'Residual' : 'Emergente';
  }

  function esObra(tareas) { return /obra/i.test(sinTildes(tareas)); }
  function esTecnica(tareas) { return /visita tecnica/i.test(sinTildes(tareas)); }

  function esMayo2027OAdelante(v) {
    const f = (v && (v.fechaMax || v.plazo)) || '';
    return !!f && f >= CONFIG.CORTE_EXCLUIR_FUTURO;
  }

  function filtrarCorteFuturo(visitas, excluir) {
    if (!excluir) return visitas;
    return (visitas || []).filter(function (v) { return !esMayo2027OAdelante(v); });
  }

  function categoriaVencimiento(v, hoy) {
    hoy = hoy || hoyISO();
    if (v.cerrada || !v.plazo) return 'cerrada';
    if (v.plazo < hoy) return 'vencida';
    if (mesDe(v.plazo) === mesDe(hoy)) return 'mes_actual';
    return 'otro_mes';
  }

  function plazoVisita(v) {
    const et = String(v.planificacion || '');
    if (/urgente/i.test(et)) return v.fechaMax;
    for (const k of Object.keys(CONFIG.PLAZO_ETAPA)) {
      if (et.indexOf(k) === 0) return CONFIG.PLAZO_ETAPA[k];
    }
    return v.fechaMax;
  }

  function ultimoIntento(intentos) {
    return intentos && intentos.length ? intentos[intentos.length - 1] : null;
  }

  function estadoVisita(intentos) {
    const u = ultimoIntento(intentos);
    if (!u) return ESTADOS.SIN_AGENDAR;
    if (!u.resultado) return u.fechaAgendada ? ESTADOS.AGENDADA : ESTADOS.SIN_AGENDAR;
    if (u.resultado === 'Efectiva') return u.adjunto ? ESTADOS.EFECTIVA : ESTADOS.EFECTIVA_SIN_DOC;
    if (u.resultado === 'Fallida') {
      if (u.reprograma === 'Si') return ESTADOS.FALLIDA_REPROGRAMAR;
      return u.adjunto ? ESTADOS.FALLIDA_CERRADA : ESTADOS.FALLIDA_SIN_DOC;
    }
    return ESTADOS.SIN_AGENDAR;
  }

  /** Cuenta para el objetivo solo si está cerrada CON documento. */
  function cuentaObjetivo(estado) {
    return estado === ESTADOS.EFECTIVA || estado === ESTADOS.FALLIDA_CERRADA;
  }
  function estaCerrada(estado) { return cuentaObjetivo(estado); }

  /** Valida un intento antes de guardarlo. Devuelve lista de errores ([] = ok). */
  function validarIntento(it, hoy) {
    const err = [];
    hoy = hoy || hoyISO();
    if (it.fechaAgendada && !aISO(it.fechaAgendada)) err.push('Fecha agendada inválida');
    if (it.resultado) {
      if (!['Efectiva', 'Fallida'].includes(it.resultado)) err.push('Resultado inválido');
      if (!it.fechaReal) err.push('Falta la fecha real de la visita');
      else if (it.fechaReal > hoy) err.push('La fecha real no puede ser futura');
      if (it.resultado === 'Fallida') {
        if (!it.motivo) err.push('Falta el motivo de la visita fallida');
        if (!['Si', 'No'].includes(it.reprograma)) err.push('Indicá si se vuelve a ir (Sí/No)');
      }
    }
    if (it.adjunto && !/^https?:\/\//.test(it.adjunto) && !it.adjuntoPendiente) {
      err.push('Adjunto inválido');
    }
    return err;
  }

  /** Para cerrar (efectiva o fallida sin reprogramar) se exige PDF. */
  function requiereAdjunto(it) {
    return it.resultado === 'Efectiva' || (it.resultado === 'Fallida' && it.reprograma === 'No');
  }

  function esPDF(file) {
    if (!file) return false;
    return /\.pdf$/i.test(file.name || '') && (!file.type || file.type === 'application/pdf');
  }

  function esLinkValido(u) {
    return /^https?:\/\//i.test(String(u || '').trim());
  }

  /** Índice de PDFs de octubre del histórico por CUIT|NroEstabIntercambio (col. M / col. I en Hoja 1). */
  function indexarCruceOctubre(historico) {
    const mapa = {};
    (historico || []).forEach(function (h) {
      if (!esLinkValido(h.documentoAdjunto)) return;
      const iso = aISO(h.fechaRealizada);
      if (mesDe(iso) !== '2026-10') return;
      const k = String(h.cuit || '').trim() + '|' + String(h.nroEstabIntercambio || '').trim();
      (mapa[k] = mapa[k] || []).push({
        resultado: h.resultadoVisita === 'Efectiva' ? 'Efectiva' : 'Fallida',
        fecha: h.fechaRealizada || aDMY(iso),
        fechaISO: iso,
        tarea: h.tarea || '',
        url: h.documentoAdjunto
      });
    });
    return mapa;
  }

  /** Combina visitas base + intentos por id + cruce opcional con PDFs de octubre en Emergentes. */
  function armarVisitas(base, intentosPorId, hoy, historico) {
    hoy = hoy || hoyISO();
    const mapaOct = historico ? indexarCruceOctubre(historico) : {};
    return base.map(function (b) {
      const intentos = (intentosPorId && intentosPorId[b.id]) || [];
      const estado = estadoVisita(intentos);
      const plazo = plazoVisita(b);
      const cerrada = estaCerrada(estado);
      const u = ultimoIntento(intentos);
      let cruceOct = null;
      if (b.cohorte === 'Emergente') {
        const k = String(b.cuit || '').trim() + '|' + String(b.nroEstab || '').trim();
        const hits = mapaOct[k];
        if (hits && hits.length) {
          const ef = hits.find(function (x) { return x.resultado === 'Efectiva'; });
          const pri = ef || hits[0];
          cruceOct = { resultado: pri.resultado, fecha: pri.fecha, fechaISO: pri.fechaISO, tarea: pri.tarea, url: pri.url, items: hits };
        }
      }
      // Si no tiene intentos nuevos pero cruzó con un PDF de octubre, reflejar fecha real y estado en la grilla
      const cerradaPorCruceOct = !u && !!cruceOct;
      const estadoFinal = cerradaPorCruceOct
        ? (cruceOct.resultado === 'Efectiva' ? ESTADOS.EFECTIVA : ESTADOS.FALLIDA_CERRADA)
        : estado;
      const cerradaFinal = estaCerrada(estadoFinal);
      const fechaRealFinal = (u && u.fechaReal) ? u.fechaReal : (cerradaPorCruceOct ? cruceOct.fechaISO : '');
      const resultadoFinal = (u && u.resultado) ? u.resultado : (cerradaPorCruceOct ? cruceOct.resultado : '');
      const catVenc = cerradaFinal || !plazo ? 'cerrada' : (plazo < hoy ? 'vencida' : (mesDe(plazo) === mesDe(hoy) ? 'mes_actual' : 'otro_mes'));
      return Object.assign({}, b, {
        intentos: intentos,
        estado: estadoFinal,
        cerrada: cerradaFinal,
        cuentaObjetivo: cuentaObjetivo(estadoFinal),
        cerradaPorCruceOct: cerradaPorCruceOct,
        plazo: plazo,
        vencida: catVenc === 'vencida',
        catVenc: catVenc,
        fechaAgendada: u && u.fechaAgendada ? u.fechaAgendada : '',
        fechaReal: fechaRealFinal,
        resultadoActual: resultadoFinal,
        cruceOct: cruceOct
      });
    });
  }

  function cuenta(arr, fn) { let n = 0; arr.forEach(function (x) { if (fn(x)) n++; }); return n; }

  /** Agendas por mes (cada intento con fecha agendada = una gestión de agenda). Opcionalmente filtrado por cohorte. */
  function agendadasPorMes(visitas, soloCohorte) {
    const out = {};
    visitas.forEach(function (v) {
      if (soloCohorte && v.cohorte !== soloCohorte) return;
      v.intentos.forEach(function (it) {
        const m = mesDe(aISO(it.fechaAgendada));
        if (m) out[m] = (out[m] || 0) + 1;
      });
    });
    return out;
  }

  /** Cerradas con documento por mes de fecha real (visitas nuevas + histórico, sin doble conteo del cruce Oct). */
  function cerradasPorMes(visitas, historico, soloCohorte) {
    const out = {};
    function add(m, k) { if (!m) return; out[m] = out[m] || { efectivas: 0, fallidas: 0 }; out[m][k]++; }
    visitas.forEach(function (v) {
      if (soloCohorte && v.cohorte !== soloCohorte) return;
      if (!v.cuentaObjetivo || v.cerradaPorCruceOct) return;
      const u = ultimoIntento(v.intentos);
      if (!u) return;
      add(mesDe(aISO(u.fechaReal)), u.resultado === 'Efectiva' ? 'efectivas' : 'fallidas');
    });
    if (!soloCohorte || soloCohorte === 'Emergente') {
      (historico || []).forEach(function (h) {
        if (!esLinkValido(h.documentoAdjunto)) return;
        add(mesDe(aISO(h.fechaRealizada)), h.resultadoVisita === 'Efectiva' ? 'efectivas' : 'fallidas');
      });
    }
    return out;
  }

  /** Meta mensual consolidada por mes: 100 en Sep–Oct 2026; 500 (100+400) desde Nov 2026. */
  function metaConsolidadaMes(ym) {
    const M = CONFIG.METAS;
    return ym >= M.RESIDUAL_INICIO ? (M.EMERGENTE_MES + M.RESIDUAL_MES) : M.EMERGENTE_MES;
  }

  /** Tablero unificado: Consolidado (500/mes) = Emergentes (100/mes) + Residuales (400/mes). */
  function tablero(visitas, historico, hoy) {
    hoy = hoy || hoyISO();
    const M = CONFIG.METAS;
    const mesHoy = hoy.slice(0, 7);
    const hist = historico || [];
    const histCerr = hist.filter(function (h) { return esLinkValido(h.documentoAdjunto); });
    const histEf = histCerr.filter(function (h) { return h.resultadoVisita === 'Efectiva'; }).length;
    const histFa = histCerr.length - histEf;
    const histSinDoc = hist.length - histCerr.length;

    const bloque = function (arr) {
      return {
        total: arr.length,
        cerradas: cuenta(arr, function (v) { return v.cuentaObjetivo; }),
        efectivas: cuenta(arr, function (v) { return v.estado === ESTADOS.EFECTIVA; }),
        fallidas: cuenta(arr, function (v) { return v.estado === ESTADOS.FALLIDA_CERRADA; }),
        agendadasPend: cuenta(arr, function (v) { return v.estado === ESTADOS.AGENDADA; }),
        sinAgendar: cuenta(arr, function (v) { return v.estado === ESTADOS.SIN_AGENDAR || v.estado === ESTADOS.FALLIDA_REPROGRAMAR; }),
        sinDocumento: cuenta(arr, function (v) { return v.estado === ESTADOS.EFECTIVA_SIN_DOC || v.estado === ESTADOS.FALLIDA_SIN_DOC; }),
        vencidas: cuenta(arr, function (v) { return v.vencida; })
      };
    };

    const resArr = visitas.filter(function (v) { return v.cohorte === 'Residual'; });
    const emArr = visitas.filter(function (v) { return v.cohorte === 'Emergente'; });

    // 1. EMERGENTES (meta 100/mes · 1.200/año · Sep-26 a Ago-27)
    const emCerrMes = cerradasPorMes(visitas, hist, 'Emergente');
    const emAgMes = agendadasPorMes(visitas, 'Emergente');
    const emMeses = [];
    for (let i = 0; i < 12; i++) {
      const m = sumarMeses(M.EMERGENTE_INICIO, i);
      const c = emCerrMes[m] || { efectivas: 0, fallidas: 0 };
      const tot = c.efectivas + c.fallidas;
      emMeses.push({
        mes: m, meta: M.EMERGENTE_MES,
        efectivas: c.efectivas, fallidas: c.fallidas, total: tot,
        agendadas: m >= M.RESIDUAL_INICIO ? (emAgMes[m] || 0) : null,
        futuro: m > mesHoy
      });
    }
    const emEf = emMeses.reduce((s, x) => s + x.efectivas, 0);
    const emFa = emMeses.reduce((s, x) => s + x.fallidas, 0);
    const emTot = emEf + emFa;
    const emTransc = Math.max(0, Math.min(12, diffMeses(M.EMERGENTE_INICIO, mesHoy) + 1));
    const emMetaAcum = emTransc * M.EMERGENTE_MES;
    const emAct = emMeses.filter(function (x) { return !x.futuro; });
    const trimestres = [0, 1, 2, 3].map(function (i) {
      const sl = emMeses.slice(i * 3, i * 3 + 3);
      const qEf = sl.reduce((s, x) => s + x.efectivas, 0);
      const qFa = sl.reduce((s, x) => s + x.fallidas, 0);
      return { q: 'Q' + (i + 1), desde: sl[0].mes, hasta: sl[2].mes, meta: M.EMERGENTE_MES * 3, efectivas: qEf, fallidas: qFa, total: qEf + qFa };
    });
    const mejorEm = emAct.reduce((b, x) => (!b || x.total > b.total ? x : b), null);
    const emBase = bloque(emArr);
    const cruceOctEf = cuenta(emArr, function (v) { return v.cruceOct && v.cruceOct.resultado === 'Efectiva'; });
    const cruceOctFa = cuenta(emArr, function (v) { return v.cruceOct && v.cruceOct.resultado === 'Fallida'; });
    const emergentes = {
      metaMes: M.EMERGENTE_MES, metaAnual: M.EMERGENTE_ANUAL,
      total: emBase.total + hist.length,
      totalPendienteTabla: emBase.total,
      realizadas: emTot, efectivas: emEf, fallidas: emFa,
      pct: M.EMERGENTE_ANUAL ? emTot / M.EMERGENTE_ANUAL : 0,
      restanMetaAnual: Math.max(0, M.EMERGENTE_ANUAL - emTot),
      metaAcum: emMetaAcum, desvio: emTot - emMetaAcum,
      tasaEfectividad: emTot ? emEf / emTot : 0,
      promedioMensual: emAct.length ? emTot / emAct.length : 0,
      mejorMes: mejorEm,
      agendadasMesActual: emAgMes[mesHoy] || 0,
      agendadasPend: emBase.agendadasPend,
      sinAgendar: emBase.sinAgendar,
      sinDocumento: emBase.sinDocumento + histSinDoc,
      vencidas: emBase.vencidas,
      vencidasOctubre: cuenta(emArr, function (v) { return !v.cerrada && mesDe(v.fechaMax) === '2026-10'; }),
      cruceOct: { total: cruceOctEf + cruceOctFa, efectivas: cruceOctEf, fallidas: cruceOctFa },
      meses: emMeses, trimestres: trimestres
    };

    // 2. RESIDUALES (meta 400/mes desde Nov-26 · stock 1.341 · Etapa 1 fin Ene-27 / Etapa 2 fin Abr-27)
    const resBase = bloque(resArr);
    const resCerrMes = cerradasPorMes(visitas, [], 'Residual');
    const resAgMes = agendadasPorMes(visitas, 'Residual');
    const resMeses = [];
    const nResMeses = diffMeses(M.RESIDUAL_INICIO, M.ETAPA2_FIN.slice(0, 7)) + 1; // Nov-26 a Abr-27 (6 meses)
    for (let i = 0; i < nResMeses; i++) {
      const m = sumarMeses(M.RESIDUAL_INICIO, i);
      const c = resCerrMes[m] || { efectivas: 0, fallidas: 0 };
      resMeses.push({
        mes: m, meta: M.RESIDUAL_MES,
        efectivas: c.efectivas, fallidas: c.fallidas, total: c.efectivas + c.fallidas,
        agendadas: resAgMes[m] || 0,
        futuro: m > mesHoy
      });
    }
    const resPend = resBase.total - resBase.cerradas;
    const mesesRestE1 = Math.max(1, diffMeses(mesHoy, M.RESIDUAL_FIN.slice(0, 7)) + 1);
    let acumRes = 0;
    const burn = resMeses.map(function (x, i) {
      acumRes += x.total;
      return {
        mes: x.mes,
        teorico: Math.max(0, resBase.total - (i + 1) * M.RESIDUAL_MES),
        real: !x.futuro ? Math.max(0, resBase.total - acumRes) : null
      };
    });
    const residuales = {
      metaMes: M.RESIDUAL_MES, inicio: M.RESIDUAL_INICIO, finE1: M.RESIDUAL_FIN, finE2: M.ETAPA2_FIN,
      total: resBase.total, realizadas: resBase.cerradas, efectivas: resBase.efectivas, fallidas: resBase.fallidas,
      pendientes: resPend, pct: resBase.total ? resBase.cerradas / resBase.total : 0,
      agendadasMesActual: resAgMes[mesHoy] || 0,
      agendadasPend: resBase.agendadasPend,
      sinAgendar: resBase.sinAgendar,
      sinDocumento: resBase.sinDocumento,
      vencidas: resBase.vencidas,
      tecnicas: cuenta(resArr, function (v) { return esTecnica(v.tareas); }),
      especiales: cuenta(resArr, function (v) { return !esTecnica(v.tareas); }),
      ritmoRequeridoE1: resPend / mesesRestE1, mesesRestE1: mesesRestE1,
      etapas: ['Etapa 1', 'Etapa 1 - Urgente', 'Etapa 2'].map(function (e) {
        return Object.assign({ etapa: e }, bloque(resArr.filter(function (v) { return v.planificacion === e; })));
      }),
      meses: resMeses, burn: burn
    };

    // 3. CONSOLIDADO (Emergentes 100/mes + Residuales 400/mes = 500/mes desde Nov-26; 100/mes en Sep–Oct)
    const consMeses = [];
    const nCons = diffMeses(M.EMERGENTE_INICIO, M.ETAPA2_FIN.slice(0, 7)) + 1; // Sep-26 a Abr-27 (8 meses)
    for (let i = 0; i < nCons; i++) {
      const m = sumarMeses(M.EMERGENTE_INICIO, i);
      const ce = emCerrMes[m] || { efectivas: 0, fallidas: 0 };
      const cr = resCerrMes[m] || { efectivas: 0, fallidas: 0 };
      const ag = m >= M.RESIDUAL_INICIO ? ((emAgMes[m] || 0) + (resAgMes[m] || 0)) : null;
      const totE = ce.efectivas + ce.fallidas, totR = cr.efectivas + cr.fallidas;
      consMeses.push({
        mes: m, meta: metaConsolidadaMes(m),
        emEf: ce.efectivas, emFa: ce.fallidas, emTot: totE,
        resEf: cr.efectivas, resFa: cr.fallidas, resTot: totR,
        total: totE + totR, agendadas: ag, futuro: m > mesHoy
      });
    }
    const planTotal = M.EMERGENTE_ANUAL + residuales.total;
    const realTotal = emergentes.realizadas + residuales.realizadas;
    const pendTotal = emergentes.restanMetaAnual + residuales.pendientes;
    const consolidado = {
      hoy: hoy, mesActual: mesHoy,
      metaMesVigente: metaConsolidadaMes(mesHoy),
      planTotal: planTotal, realizadas: realTotal, pct: planTotal ? realTotal / planTotal : 0,
      pendientesPlan: pendTotal,
      agendadasMesActual: emergentes.agendadasMesActual + residuales.agendadasMesActual,
      agendadasPend: emergentes.agendadasPend + residuales.agendadasPend,
      sinAgendar: emergentes.sinAgendar + residuales.sinAgendar,
      sinDocumento: emergentes.sinDocumento + residuales.sinDocumento,
      vencidas: emergentes.vencidas + residuales.vencidas,
      duplicadasRevisar: cuenta(visitas, function (v) { return !!v.revisarDuplicada; }),
      etapas: ['Etapa 1', 'Etapa 1 - Urgente', 'Etapa 2'].map(function (e) {
        return Object.assign({ etapa: e }, bloque(visitas.filter(function (v) { return v.planificacion === e; })));
      }),
      historico: { total: hist.length, conDocumento: histCerr.length, efectivas: histEf, fallidas: histFa, sinDocumento: histSinDoc },
      meses: consMeses
    };

    return { consolidado: consolidado, emergentes: emergentes, residuales: residuales };
  }

  const API = {
    CONFIG, ESTADOS, aISO, aDMY, mesDe, hoyISO, sumarMeses, diffMeses, sinTildes,
    cohorte, esObra, esTecnica, esMayo2027OAdelante, filtrarCorteFuturo, categoriaVencimiento,
    plazoVisita, ultimoIntento, estadoVisita,
    cuentaObjetivo, estaCerrada, validarIntento, requiereAdjunto, esPDF,
    indexarCruceOctubre, armarVisitas, agendadasPorMes, cerradasPorMes,
    metaConsolidadaMes, tablero
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SegCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
