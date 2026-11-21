/**
 * Núcleo de lógica del módulo Seguimiento Consultora (sin DOM, testeable en Node).
 * Regla: nada hardcodeado de datos; solo parámetros de gestión en CONFIG.
 */
(function (root) {
  'use strict';

  const CONFIG = {
    CORTE_RESIDUAL: '2026-10-01',        // fecha máxima < corte => Residual
    META_AGENDA_MES: 400,                // indicador de gestión de la consultora
    ORIGINAL: {                          // parámetros de los indicadores del módulo original
      META_ANUAL: 1200, META_MES: 100, CICLO_INICIO: '2026-09',      // Universo 1: ciclo Sep-26 a Ago-27
      RESIDUAL_INICIO: '2026-11', RESIDUAL_FIN: '2027-01-31'         // Universo 2: ventana de liquidación del residual
    },
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

  function sinTildes(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function cohorte(fechaMaxISO) {
    return fechaMaxISO && fechaMaxISO < CONFIG.CORTE_RESIDUAL ? 'Residual' : 'Emergente';
  }

  function esObra(tareas) { return /obra/i.test(sinTildes(tareas)); }

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

  /** Combina visitas base + intentos por id. */
  function armarVisitas(base, intentosPorId, hoy) {
    hoy = hoy || hoyISO();
    return base.map(function (b) {
      const intentos = (intentosPorId && intentosPorId[b.id]) || [];
      const estado = estadoVisita(intentos);
      const plazo = plazoVisita(b);
      const cerrada = estaCerrada(estado);
      const u = ultimoIntento(intentos);
      return Object.assign({}, b, {
        intentos: intentos,
        estado: estado,
        cerrada: cerrada,
        cuentaObjetivo: cuentaObjetivo(estado),
        plazo: plazo,
        vencida: !cerrada && !!plazo && plazo < hoy,
        fechaAgendada: u && u.fechaAgendada ? u.fechaAgendada : '',
        fechaReal: u && u.fechaReal ? u.fechaReal : ''
      });
    });
  }

  function cuenta(arr, fn) { let n = 0; arr.forEach(function (x) { if (fn(x)) n++; }); return n; }

  /** Agendas por mes (cada intento con fecha agendada = una gestión de agenda). */
  function agendadasPorMes(visitas) {
    const out = {};
    visitas.forEach(function (v) {
      v.intentos.forEach(function (it) {
        const m = mesDe(aISO(it.fechaAgendada));
        if (m) out[m] = (out[m] || 0) + 1;
      });
    });
    return out;
  }

  /** Cerradas con documento por mes de fecha real (visitas + histórico). */
  function cerradasPorMes(visitas, historico) {
    const out = {};
    function add(m, k) { if (!m) return; out[m] = out[m] || { efectivas: 0, fallidas: 0 }; out[m][k]++; }
    visitas.forEach(function (v) {
      if (!v.cuentaObjetivo) return;
      const u = ultimoIntento(v.intentos);
      add(mesDe(aISO(u.fechaReal)), u.resultado === 'Efectiva' ? 'efectivas' : 'fallidas');
    });
    (historico || []).forEach(function (h) {
      if (!h.documentoAdjunto) return; // sin documento no cuenta
      add(mesDe(aISO(h.fechaRealizada)), h.resultadoVisita === 'Efectiva' ? 'efectivas' : 'fallidas');
    });
    return out;
  }

  function resumen(visitas, historico, hoy) {
    hoy = hoy || hoyISO();
    const por = {};
    Object.keys(ESTADOS).forEach(function (k) { por[ESTADOS[k]] = cuenta(visitas, function (v) { return v.estado === ESTADOS[k]; }); });
    const cerr = cerradasPorMes(visitas, historico);
    const histCerr = (historico || []).filter(function (h) { return h.documentoAdjunto; });
    const sub = function (coh) { return visitas.filter(function (v) { return v.cohorte === coh; }); };
    const bloque = function (arr) {
      return {
        total: arr.length,
        cerradas: cuenta(arr, function (v) { return v.cuentaObjetivo; }),
        efectivas: cuenta(arr, function (v) { return v.estado === ESTADOS.EFECTIVA; }),
        fallidasCerradas: cuenta(arr, function (v) { return v.estado === ESTADOS.FALLIDA_CERRADA; }),
        agendadasPend: cuenta(arr, function (v) { return v.estado === ESTADOS.AGENDADA; }),
        sinAgendar: cuenta(arr, function (v) { return v.estado === ESTADOS.SIN_AGENDAR || v.estado === ESTADOS.FALLIDA_REPROGRAMAR; }),
        sinDocumento: cuenta(arr, function (v) { return v.estado === ESTADOS.EFECTIVA_SIN_DOC || v.estado === ESTADOS.FALLIDA_SIN_DOC; }),
        vencidas: cuenta(arr, function (v) { return v.vencida; })
      };
    };
    return {
      hoy: hoy,
      porEstado: por,
      residual: bloque(sub('Residual')),
      emergente: bloque(sub('Emergente')),
      etapas: ['Etapa 1', 'Etapa 1 - Urgente', 'Etapa 2'].map(function (e) {
        return Object.assign({ etapa: e }, bloque(visitas.filter(function (v) { return v.planificacion === e; })));
      }),
      agendadasMes: agendadasPorMes(visitas),
      cerradasMes: cerr,
      historico: {
        total: (historico || []).length,
        conDocumento: histCerr.length,
        sinDocumento: (historico || []).length - histCerr.length
      },
      objetivoTotal: cuenta(visitas, function (v) { return v.cuentaObjetivo; }) + histCerr.length,
      duplicadasRevisar: cuenta(visitas, function (v) { return !!v.revisarDuplicada; })
    };
  }

  /* ---------- Indicadores del módulo original (3 universos) ---------- */
  function sumarMeses(ym, n) {
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    return (y + Math.floor(m / 12)) + '-' + pad(((m % 12) + 12) % 12 + 1);
  }
  function diffMeses(a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); }

  function esTecnica(tareas) { return /visita tecnica/i.test(sinTildes(tareas)); }

  function indicadoresOriginales(visitas, historico, hoy) {
    hoy = hoy || hoyISO();
    const K = CONFIG.ORIGINAL;
    const mesHoy = hoy.slice(0, 7);
    // U1: altas = histórico Sep/Oct + emergentes cerradas con PDF, por mes de fecha real
    const porMes = {};
    function add(m, tipo) {
      if (!m) return;
      porMes[m] = porMes[m] || { efectivas: 0, fallidas: 0 };
      porMes[m][tipo]++;
    }
    (historico || []).forEach(function (h) {
      if (h.documentoAdjunto) add(mesDe(aISO(h.fechaRealizada)), h.resultadoVisita === 'Efectiva' ? 'efectivas' : 'fallidas');
    });
    visitas.forEach(function (v) {
      if (v.cohorte !== 'Emergente' || !v.cuentaObjetivo) return;
      const u = ultimoIntento(v.intentos);
      add(mesDe(aISO(u.fechaReal)), u.resultado === 'Efectiva' ? 'efectivas' : 'fallidas');
    });
    const meses = [];
    for (let i = 0; i < 12; i++) {
      const m = sumarMeses(K.CICLO_INICIO, i), d = porMes[m] || { efectivas: 0, fallidas: 0 };
      meses.push({ mes: m, efectivas: d.efectivas, fallidas: d.fallidas, meta: K.META_MES, futuro: m > mesHoy });
    }
    const ef = meses.reduce((s, x) => s + x.efectivas, 0), fa = meses.reduce((s, x) => s + x.fallidas, 0);
    const transcurridos = Math.max(0, Math.min(12, diffMeses(K.CICLO_INICIO, mesHoy) + 1));
    const metaAcum = transcurridos * K.META_MES;
    const act = meses.filter(function (x) { return !x.futuro; });
    const q = [0, 1, 2, 3].map(function (i) {
      const ms = meses.slice(i * 3, i * 3 + 3);
      return { q: 'Q' + (i + 1), desde: ms[0].mes, hasta: ms[2].mes, meta: K.META_MES * 3,
        efectivas: ms.reduce(function (s, x) { return s + x.efectivas; }, 0),
        fallidas: ms.reduce(function (s, x) { return s + x.fallidas; }, 0) };
    });
    const mejor = act.reduce(function (b, x) { return !b || x.efectivas > b.efectivas ? x : b; }, null);
    const u1 = {
      metaAnual: K.META_ANUAL, metaMes: K.META_MES, efectivas: ef, fallidas: fa,
      pct: K.META_ANUAL ? ef / K.META_ANUAL : 0, metaAcum: metaAcum, desvio: ef - metaAcum,
      tasaEfectividad: ef + fa ? ef / (ef + fa) : 0,
      promedioMensual: act.length ? ef / act.length : 0, mejorMes: mejor, meses: meses, trimestres: q
    };
    // U2: stock residual
    const res = visitas.filter(function (v) { return v.cohorte === 'Residual'; });
    const cerr = res.filter(function (v) { return v.cuentaObjetivo; });
    const pend = res.length - cerr.length;
    const mesesRestantes = Math.max(1, diffMeses(mesHoy, K.RESIDUAL_FIN.slice(0, 7)) + 1);
    const cerrPorMes = {};
    cerr.forEach(function (v) { const m = mesDe(aISO(ultimoIntento(v.intentos).fechaReal)); cerrPorMes[m] = (cerrPorMes[m] || 0) + 1; });
    const nBurn = diffMeses(K.RESIDUAL_INICIO, K.RESIDUAL_FIN.slice(0, 7)) + 1;
    let acum = 0;
    const burn = [];
    for (let i = 0; i < nBurn; i++) {
      const m = sumarMeses(K.RESIDUAL_INICIO, i);
      acum += cerrPorMes[m] || 0;
      burn.push({ mes: m, teorico: Math.round(res.length * (1 - (i + 1) / nBurn)), real: m <= mesHoy ? res.length - acum : null });
    }
    const u2 = {
      total: res.length, realizadas: cerr.length, pendientes: pend, pct: res.length ? cerr.length / res.length : 0,
      tecnicas: res.filter(function (v) { return esTecnica(v.tareas); }).length,
      especiales: res.filter(function (v) { return !esTecnica(v.tareas); }).length,
      vencidas: res.filter(function (v) { return v.vencida; }).length,
      ritmoRequerido: pend / mesesRestantes, mesesRestantes: mesesRestantes, burn: burn,
      fin: K.RESIDUAL_FIN
    };
    // U3: consolidado (series con metas independientes)
    const plan = K.META_ANUAL + u2.total, real = ef + fa + u2.realizadas;
    const u3 = { plan: plan, realizadas: real, pct: plan ? real / plan : 0,
      efAltas: ef, faAltas: fa, realResidual: u2.realizadas, pendientes: Math.max(0, K.META_ANUAL - ef) + u2.pendientes };
    return { u1: u1, u2: u2, u3: u3 };
  }

  const API = {
    indicadoresOriginales, esTecnica,
    CONFIG, ESTADOS, aISO, aDMY, mesDe, hoyISO, sinTildes, cohorte, esObra, plazoVisita,
    ultimoIntento, estadoVisita, cuentaObjetivo, estaCerrada, validarIntento, requiereAdjunto,
    esPDF, armarVisitas, agendadasPorMes, cerradasPorMes, resumen
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SegCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
