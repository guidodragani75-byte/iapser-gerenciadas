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
    PLAZO_ETAPA: {                       // meta de finalización por etapa (el vencimiento de cada visita se evalúa por Fecha máx. col. R)
      'Etapa 1': '2027-01-31',
      'Etapa 2': '2027-04-30'
    }
  };

  const COLUMNAS_PADRON = [
    'Cuit', 'Empleador', 'Contrato IAPART', 'Establecimiento', 'Localidad', 'Provincia', 'CP',
    'Domicilio estab.', 'Responsable', 'Telefono', 'E-mail', 'Nro Estab IAPART', 'Nro Estab Intercambio',
    'Programa', 'CantidadTrabajadoresCUIT', 'Preventor Asignado', 'Tareas', 'Fecha Programada',
    'Fecha Vencimiento', 'Tarea Cargada', 'Fecha Carga', 'Observaciones CS', 'Observaciones IAPSER'
  ];
  const COLUMNAS_OBLIGATORIAS = [
    'Cuit', 'Empleador', 'Contrato IAPART', 'Establecimiento', 'Localidad', 'Provincia',
    'Nro Estab Intercambio', 'Tareas', 'Fecha Programada'
  ];
  const COLUMNAS_AUXILIARES = [
    'Contacto', 'Ambito', 'Departamento', 'Planificacion', 'Concentracion', 'VIsitas en CP (>20)',
    'Normativa', 'Clave', 'Observaciones'
  ];

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

  /** 'dd/mm/yyyy' | 'yyyy-mm-dd' | número serial Excel | Date => 'yyyy-mm-dd' ('' si inválida) */
  function aISO(s) {
    if (s == null || s === '') return '';
    if (s instanceof Date && !isNaN(s.getTime())) {
      return s.getFullYear() + '-' + pad(s.getMonth() + 1) + '-' + pad(s.getDate());
    }
    if (typeof s === 'number' && isFinite(s) && s > 20000 && s < 80000) {
      const ms = Math.round((s - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }
    s = String(s).trim();
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      const num = parseFloat(s);
      if (num > 20000 && num < 80000) return aISO(num);
    }
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
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
  function esATEP(tareas) { return /(inv\.?\s*at|seg\.?\s*at|inv\.?\s*ep|seg\.?\s*ep)/i.test(sinTildes(tareas)); }
  function esPese363(tareas) { return /(pese|363|prs)/i.test(sinTildes(tareas)); }
  function esRgrlVerosim(tareas) { return /(verosimilitud|seg incumplimientos rgrl)/i.test(sinTildes(tareas)); }
  function esCapacitacion(tareas) { return /capacitaci/i.test(sinTildes(tareas)); }
  function esUrgente(v) { return /urgente/i.test(String(v && v.planificacion || '')); }
  function esEtapa1(v) { return /^etapa\s*1/i.test(String(v && v.planificacion || '')); }

  /** Normaliza Ámbito unificando variantes de mayúsculas (ej. 'MISIONES' -> 'Misiones', conserva 'GBA'). */
  function normAmbito(s) {
    const raw = String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
    if (!raw) return '(Sin ámbito)';
    if (/^gba$/i.test(raw)) return 'GBA';
    if (/^caba$/i.test(raw)) return 'CABA';
    if (raw === raw.toUpperCase() && raw.length > 3) {
      return raw.toLowerCase().replace(/(^|\s|\.)([a-záéíóúñ])/g, function (_, p1, p2) { return p1 + p2.toUpperCase(); });
    }
    return raw;
  }

  /** Sub-zona logística: Departamento (en GBA) o Localidad (en provincias). */
  function zonaVisita(v) {
    const z = String((v && (v.departamento || v.localidad)) || '').trim().replace(/\s+/g, ' ');
    if (!z) return '(Sin localidad)';
    if (z === z.toUpperCase() && z.length > 3) {
      return z.toLowerCase().replace(/(^|\s|\.)([a-záéíóúñ])/g, function (_, p1, p2) { return p1 + p2.toUpperCase(); });
    }
    return z;
  }

  const ETIQUETAS_LOGISTICA = [
    // Prioridad y etapas
    { id: 'etapa1_all',        grupo: 'prioridad', tono: 'teal', label: 'Etapa 1 + Urgente',             fn: function (v) { return !v.cerrada && esEtapa1(v); } },
    { id: 'venc_prioritarias', grupo: 'prioridad', tono: 'bad',  label: 'Vencidas prioritarias (Urgente)', fn: function (v) { return v.vencida && esUrgente(v); } },
    { id: 'urgentes_todas',    grupo: 'prioridad', tono: 'warn', label: 'Etapa 1 - Urgente (todas)',     fn: function (v) { return !v.cerrada && esUrgente(v); } },
    { id: 'vencidas_todas',    grupo: 'prioridad', tono: 'bad',  label: 'Todas las vencidas (col. R)',   fn: function (v) { return v.vencida; } },
    { id: 'sin_programar',     grupo: 'prioridad', tono: 'sin',  label: 'Sin programar',                 fn: function (v) { return v.estado === ESTADOS.SIN_AGENDAR || v.estado === ESTADOS.FALLIDA_REPROGRAMAR; } },
    { id: 'vence_mes',         grupo: 'prioridad', tono: 'warn', label: 'Vencen mes actual',             fn: function (v) { return v.catVenc === 'mes_actual'; } },
    { id: 'vence_prox',        grupo: 'prioridad', tono: 'ag',   label: 'Vencen mes próximo',            fn: function (v, hoy) { return !v.cerrada && mesDe(v.fechaMax) === sumarMeses(mesDe(hoy || hoyISO()), 1); } },
    // Críticas vencidas por tipo de tarea (col. R)
    { id: 'at_ep_venc',        grupo: 'tareas',    tono: 'bad',  label: 'AT / EP vencidas',              fn: function (v) { return v.vencida && esATEP(v.tareas); } },
    { id: 'pese_363_venc',     grupo: 'tareas',    tono: 'bad',  label: 'PESE / 363 / PRS vencidas',     fn: function (v) { return v.vencida && esPese363(v.tareas); } },
    { id: 'obras_venc',        grupo: 'tareas',    tono: 'bad',  label: 'Obras vencidas',                fn: function (v) { return v.vencida && esObra(v.tareas); } },
    { id: 'rgrl_venc',         grupo: 'tareas',    tono: 'warn', label: 'Verosim. / RGRL vencidas',      fn: function (v) { return v.vencida && esRgrlVerosim(v.tareas); } },
    { id: 'cap_venc',          grupo: 'tareas',    tono: 'warn', label: 'Capacitación vencidas',         fn: function (v) { return v.vencida && esCapacitacion(v.tareas); } },
    { id: 'tec_venc',          grupo: 'tareas',    tono: 'ag',   label: 'Visita Técnica vencidas',       fn: function (v) { return v.vencida && esTecnica(v.tareas); } }
  ];

  function resumenEtiquetas(visitas, hoy) {
    hoy = hoy || hoyISO();
    const arr = visitas || [];
    return ETIQUETAS_LOGISTICA.map(function (et) {
      let n = 0;
      arr.forEach(function (v) { if (et.fn(v, hoy)) n++; });
      return { id: et.id, grupo: et.grupo, tono: et.tono, label: et.label, count: n };
    });
  }

  function filtrarPorEtiqueta(visitas, etiquetaId, hoy) {
    hoy = hoy || hoyISO();
    const arr = visitas || [];
    if (!etiquetaId) return arr;
    const et = ETIQUETAS_LOGISTICA.find(function (x) { return x.id === etiquetaId; });
    if (!et) return arr;
    return arr.filter(function (v) { return et.fn(v, hoy); });
  }

  /**
   * Agrupa visitas por Ámbito (normalizado) y por Ámbito + Departamento/Localidad
   * con métricas logísticas (total, establecimientos únicos, vencidas, urgentes, críticas y agenda).
   */
  function agruparLogistica(visitas) {
    const mapAmb = {};
    const mapZona = {};
    function init(o, extra) {
      return Object.assign({
        total: 0, vencidas: 0, urgentes: 0, etapa1: 0,
        atEp: 0, pese363: 0, obras: 0,
        sinProgramar: 0, programadas: 0, cerradas: 0,
        _estabs: {}
      }, extra || {});
    }
    function sumar(acc, v) {
      acc.total++;
      if (v.vencida) acc.vencidas++;
      if (!v.cerrada && esUrgente(v)) acc.urgentes++;
      if (!v.cerrada && esEtapa1(v)) acc.etapa1++;
      if (!v.cerrada && esATEP(v.tareas)) acc.atEp++;
      if (!v.cerrada && esPese363(v.tareas)) acc.pese363++;
      if (!v.cerrada && esObra(v.tareas)) acc.obras++;
      if (v.cerrada) acc.cerradas++;
      else if (v.estado === ESTADOS.AGENDADA) acc.programadas++;
      else acc.sinProgramar++;
      const ce = String(v.cuit || '').trim() + '|' + String(v.nroEstab || '').trim();
      acc._estabs[ce] = true;
    }

    (visitas || []).forEach(function (v) {
      const amb = normAmbito(v.ambito || v.provincia);
      const ambKey = sinTildes(amb).toLowerCase();
      if (!mapAmb[ambKey]) mapAmb[ambKey] = init(null, { key: ambKey, ambito: amb });
      sumar(mapAmb[ambKey], v);

      const zona = zonaVisita(v);
      const zonaKey = ambKey + '|' + sinTildes(zona).toLowerCase();
      if (!mapZona[zonaKey]) {
        mapZona[zonaKey] = init(null, {
          key: zonaKey, ambKey: ambKey, ambito: amb, zona: zona,
          esDepto: !!v.departamento
        });
      }
      sumar(mapZona[zonaKey], v);
    });

    function cerrarLista(mapa) {
      return Object.values(mapa).map(function (x) {
        const estabUnicos = Object.keys(x._estabs).length;
        const out = Object.assign({}, x, { estabUnicos: estabUnicos });
        delete out._estabs;
        return out;
      }).sort(function (a, b) {
        return (b.total - a.total) || (b.urgentes - a.urgentes) || (b.vencidas - a.vencidas) || a.ambito.localeCompare(b.ambito);
      });
    }

    return {
      ambitos: cerrarLista(mapAmb),
      zonas: cerrarLista(mapZona)
    };
  }

  /** Puntuación de prioridad logística (menor = más urgente de atender). */
  function prioridadLogistica(v) {
    if (v.vencida && esATEP(v.tareas)) return 1;
    if (v.vencida && esPese363(v.tareas)) return 2;
    if (v.vencida && esUrgente(v)) return 3;
    if (v.vencida && esObra(v.tareas)) return 4;
    if (v.vencida && esEtapa1(v)) return 5;
    if (v.vencida) return 6;
    if (!v.cerrada && esUrgente(v)) return 7;
    if (!v.cerrada && esEtapa1(v)) return 8;
    return 9;
  }
  function subtareasNorm(tareas) {
    return String(tareas || '').split('//').map(function (x) { return sinTildes(x).toLowerCase().trim(); }).filter(Boolean);
  }

  /**
   * Extrae las subtareas limpias de una fila (separadas por '//').
   * Omite códigos numéricos puros de siniestros y agrupa 'INV. AT <nro>' bajo 'INV. AT'.
   */
  function subtareasLimpias(tareas) {
    const out = [];
    const vistos = {};
    String(tareas || '').split('//').forEach(function (raw) {
      let s = raw.trim();
      if (!s || /^\d+$/.test(s)) return;
      if (/^inv\.?\s*at\s+\d+/i.test(s)) s = 'INV. AT';
      const k = sinTildes(s).toLowerCase();
      if (!vistos[k]) {
        vistos[k] = true;
        out.push({ key: k, label: s });
      }
    });
    return out;
  }

  /** Catálogo de tareas únicas con totales, cerradas, pendientes y vencidas (ordenado por cantidad desc). */
  function catalogoTareas(visitas) {
    const mapa = {};
    (visitas || []).forEach(function (v) {
      subtareasLimpias(v.tareas).forEach(function (t) {
        let item = mapa[t.key];
        if (!item) {
          item = mapa[t.key] = { key: t.key, label: t.label, total: 0, cerradas: 0, pendientes: 0, vencidas: 0 };
        }
        item.total++;
        if (v.cerrada) item.cerradas++; else item.pendientes++;
        if (v.vencida) item.vencidas++;
      });
    });
    return Object.values(mapa).sort(function (a, b) {
      return (b.total - a.total) || a.label.localeCompare(b.label);
    });
  }

  /** Verifica si una visita incluye la tarea seleccionada (comparación sin tildes ni mayúsculas). */
  function coincideTarea(v, tareaFiltro) {
    if (!tareaFiltro) return true;
    const target = sinTildes(tareaFiltro).toLowerCase().trim();
    return subtareasLimpias(v && v.tareas).some(function (t) { return t.key === target; });
  }

  /**
   * Detecta filas con errores / a revisar (excluye obras):
   * 1) misma_tarea_anios: mismo CUIT + Nro Estab (col. M) comparte al menos una tarea entre año pasado y año actual.
   * 2) duplicada_fecha: mismo CUIT + Nro Estab (col. M) + mismas tareas exactas con fechas máximas distintas.
   */
  function detectarErroresVisitas(visitas, hoy) {
    hoy = hoy || hoyISO();
    const anioAct = String(parseInt(hoy.slice(0, 4), 10));
    const anioPrev = String(parseInt(hoy.slice(0, 4), 10) - 1);
    const out = {}; // id -> { tipos: Set/Array, tareasComunes: [], etiqueta: '' }
    function marcar(id, tipo, comunes) {
      const o = out[id] = out[id] || { tipos: [], tareasComunes: [] };
      if (o.tipos.indexOf(tipo) < 0) o.tipos.push(tipo);
      (comunes || []).forEach(function (t) { if (o.tareasComunes.indexOf(t) < 0) o.tareasComunes.push(t); });
    }

    const porCE = {};
    const porCET = {};
    (visitas || []).forEach(function (v) {
      if (v.esObra || esObra(v.tareas)) return;
      const ce = String(v.cuit || '').trim() + '|' + String(v.nroEstab || '').trim();
      (porCE[ce] = porCE[ce] || []).push(v);
      const cet = ce + '|' + sinTildes(v.tareas).toLowerCase().trim();
      (porCET[cet] = porCET[cet] || []).push(v);
    });

    // Regla 1: misma tarea año pasado y este año para mismo CUIT + Estab
    Object.keys(porCE).forEach(function (k) {
      const g = porCE[k];
      if (g.length < 2) return;
      const prev = g.filter(function (v) { return (v.fechaMax || '').slice(0, 4) === anioPrev; });
      const act = g.filter(function (v) { return (v.fechaMax || '').slice(0, 4) === anioAct; });
      if (!prev.length || !act.length) return;
      const setPrev = {};
      prev.forEach(function (v) { subtareasNorm(v.tareas).forEach(function (t) { setPrev[t] = true; }); });
      const comunes = [];
      act.forEach(function (v) {
        subtareasNorm(v.tareas).forEach(function (t) {
          if (setPrev[t] && comunes.indexOf(t) < 0) comunes.push(t);
        });
      });
      if (!comunes.length) return;
      prev.concat(act).forEach(function (v) {
        const hit = subtareasNorm(v.tareas).filter(function (t) { return comunes.indexOf(t) >= 0; });
        if (hit.length) marcar(v.id, 'misma_tarea_anios', hit);
      });
    });

    // Regla 2: mismas tareas exactas con distinta fecha máxima
    Object.keys(porCET).forEach(function (k) {
      const g = porCET[k];
      if (g.length < 2) return;
      const fechas = {};
      g.forEach(function (v) { if (v.fechaMax) fechas[v.fechaMax] = true; });
      if (Object.keys(fechas).length > 1) {
        g.forEach(function (v) { marcar(v.id, 'duplicada_fecha', []); });
      }
    });

    return out;
  }

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
    const fMax = (v && (v.fechaMax || v.plazo)) || '';
    if (v.cerrada || !fMax) return 'cerrada';
    if (fMax < hoy) return 'vencida';
    if (mesDe(fMax) === mesDe(hoy)) return 'mes_actual';
    return 'otro_mes';
  }

  /** Fecha máxima de la visita = columna R de la planilla ('Fecha Programada' en origen, que es la fecha máxima). */
  function plazoVisita(v) {
    return (v && v.fechaMax) || '';
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
    if (it.fechaAgendada && !aISO(it.fechaAgendada)) err.push('Fecha programada inválida');
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

  /** Combina visitas base + intentos por id + cruce opcional con PDFs de octubre + detección de errores. */
  function armarVisitas(base, intentosPorId, hoy, historico) {
    hoy = hoy || hoyISO();
    const mapaOct = historico ? indexarCruceOctubre(historico) : {};
    const mapaErr = detectarErroresVisitas(base, hoy);
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
      const errInfo = mapaErr[b.id] || null;
      const errTipos = errInfo ? errInfo.tipos : (b.revisarDuplicada ? ['duplicada_fecha'] : []);
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
        cruceOct: cruceOct,
        revisarDuplicada: errTipos.length > 0,
        errores: errTipos,
        tareasRepetidasAnio: errInfo ? errInfo.tareasComunes : []
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

  const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  function labelMes(ym) {
    if (!ym || ym.indexOf('<') === 0) return ym || '';
    const y = ym.slice(2, 4), m = parseInt(ym.slice(5, 7), 10) - 1;
    return (MESES_CORTOS[m] || ym) + ' ' + y;
  }
  /** Etiqueta corta de mes para 'Visitas emergentes mensuales' (ej: '2026-11-24' => 'nov26'). */
  function mesEmergenteActual(hoy) {
    const iso = hoy || hoyISO();
    const m = parseInt(iso.slice(5, 7), 10) - 1;
    const y = iso.slice(2, 4);
    return (MESES_CORTOS[m] ? MESES_CORTOS[m].toLowerCase() : iso.slice(5, 7)) + y;
  }

  /**
   * Indicadores "Cumplimiento en Plazo vs Vencidas" y "Participación Fallidas vs Efectivas"
   * para cualquiera de los 3 universos: 'consolidado' | 'emergentes' | 'residuales'.
   */
  function cumplimientoYParticipacion(visitas, historico, scope, hoy) {
    hoy = hoy || hoyISO();
    const M = CONFIG.METAS;
    const incluirHist = (scope === 'emergentes' || scope === 'consolidado');
    const filtrarScope = function (v) {
      if (scope === 'emergentes') return v.cohorte === 'Emergente';
      if (scope === 'residuales') return v.cohorte === 'Residual';
      return true;
    };
    const arr = (visitas || []).filter(filtrarScope);
    const ini = scope === 'residuales' ? M.RESIDUAL_INICIO : M.EMERGENTE_INICIO;
    const fin = scope === 'emergentes' ? sumarMeses(M.EMERGENTE_INICIO, 11) : M.ETAPA2_FIN.slice(0, 7);
    const nMes = diffMeses(ini, fin) + 1;
    const timeline = [];
    for (let i = 0; i < nMes; i++) timeline.push(sumarMeses(ini, i));

    const prevKey = '< ' + labelMes(ini);
    const buckets = {};
    function getB(k) { return (buckets[k] = buckets[k] || { key: k, label: k === prevKey ? prevKey : labelMes(k), enTermino: 0, vencidas: 0, efectivas: 0, fallidas: 0 }); }
    timeline.forEach(getB);

    function keyParaMes(ym) {
      if (!ym) return prevKey;
      if (ym < ini) return prevKey;
      if (!buckets[ym]) getB(ym);
      return ym;
    }

    // 1. Histórico con PDF válido (Sep–Oct = Emergentes ejecutadas en término)
    if (incluirHist) {
      (historico || []).forEach(function (h) {
        if (!esLinkValido(h.documentoAdjunto)) return;
        const ym = mesDe(aISO(h.fechaRealizada));
        const b = getB(keyParaMes(ym));
        b.enTermino++;
        if (h.resultadoVisita === 'Efectiva') b.efectivas++; else b.fallidas++;
      });
    }

    // 2. Visitas de la tabla nueva
    let fallidasReprog = 0;
    arr.forEach(function (v) {
      if (v.estado === ESTADOS.FALLIDA_REPROGRAMAR) fallidasReprog++;
      if (v.cerradaPorCruceOct) return; // ya contabilizado en histórico sin doble conteo
      if (v.cuentaObjetivo) {
        const u = ultimoIntento(v.intentos);
        const fReal = u ? aISO(u.fechaReal) : '';
        const ym = mesDe(fReal);
        const b = getB(keyParaMes(ym));
        if (v.plazo && fReal && fReal > v.plazo) b.vencidas++;
        else b.enTermino++;
        if (u && u.resultado === 'Efectiva') b.efectivas++; else b.fallidas++;
      } else if (v.vencida) {
        const ym = mesDe(v.plazo);
        getB(keyParaMes(ym)).vencidas++;
      }
    });

    const series = [];
    if (buckets[prevKey] && (buckets[prevKey].enTermino + buckets[prevKey].vencidas) > 0) {
      series.push(buckets[prevKey]);
    }
    timeline.forEach(function (m) { series.push(buckets[m]); });
    Object.keys(buckets).sort().forEach(function (k) {
      if (k !== prevKey && timeline.indexOf(k) < 0 && (buckets[k].enTermino + buckets[k].vencidas) > 0) series.push(buckets[k]);
    });

    const totEnTermino = series.reduce((s, x) => s + x.enTermino, 0);
    const totVencidas = series.reduce((s, x) => s + x.vencidas, 0);
    const totEf = series.reduce((s, x) => s + x.efectivas, 0);
    const totFa = series.reduce((s, x) => s + x.fallidas, 0);
    const mesesConActividad = series.filter(x => (x.efectivas + x.fallidas) > 0);

    return {
      scope: scope,
      series: series,
      enTermino: totEnTermino,
      vencidas: totVencidas,
      pctEnTermino: (totEnTermino + totVencidas) ? totEnTermino / (totEnTermino + totVencidas) : 1,
      efectivas: totEf,
      fallidas: totFa,
      totalCerradas: totEf + totFa,
      pctEfectivas: (totEf + totFa) ? totEf / (totEf + totFa) : 0,
      pctFallidas: (totEf + totFa) ? totFa / (totEf + totFa) : 0,
      fallidasReprog: fallidasReprog,
      mesesActivos: mesesConActividad
    };
  }

  /* ---------- VALIDADOR DE COLUMNAS Y ACTUALIZACIÓN DE PADRÓN ---------- */
  function letraCol(i) {
    let s = '', n = i + 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function normHeader(s) {
    return sinTildes(String(s == null ? '' : s)).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function similitudTexto(a, b) {
    const ta = normHeader(a).split(' ').filter(Boolean);
    const tb = normHeader(b).split(' ').filter(Boolean);
    if (!ta.length || !tb.length) return 0;
    let hits = 0;
    ta.forEach(function (w) {
      if (tb.some(function (x) { return x === w || (w.length >= 4 && x.indexOf(w) >= 0) || (x.length >= 4 && w.indexOf(x) >= 0); })) hits++;
    });
    return hits / Math.max(ta.length, tb.length);
  }

  /**
   * Valida encabezados de un Excel/CSV contra el esquema estándar A..W.
   * Detecta: coincidencias exactas, cambios de tildes/mayúsculas, cambios de posición,
   * columnas faltantes/renombradas (con sugerencias), columnas nuevas agregadas y encabezados duplicados.
   */
  function validarColumnasPadron(headers, mapeoManual) {
    mapeoManual = mapeoManual || {};
    const raw = (headers || []).map(function (h) { return String(h == null ? '' : h).trim(); });
    const auxSet = {};
    COLUMNAS_AUXILIARES.forEach(function (c) { auxSet[normHeader(c)] = c; });

    // Detectar encabezados duplicados (ignorando celdas vacías al final)
    const conteo = {};
    const duplicadas = [];
    raw.forEach(function (h, i) {
      if (!h) return;
      const k = normHeader(h);
      if (conteo[k] != null) {
        duplicadas.push({ nombre: h, letra: letraCol(i), primeraLetra: letraCol(conteo[k]), idx: i });
      } else {
        conteo[k] = i;
      }
    });

    const usados = {};
    const coincidencias = [];
    const faltantes = [];
    const indice = {};

    // Paso 1: mapeo manual explícito
    COLUMNAS_PADRON.forEach(function (esp, posEsp) {
      const mIdx = mapeoManual[esp];
      if (mIdx != null && mIdx !== '' && Number.isInteger(+mIdx) && +mIdx >= 0 && +mIdx < raw.length) {
        const idx = +mIdx;
        usados[idx] = esp;
        indice[esp] = idx;
        coincidencias.push({
          esperada: esp, encontrada: raw[idx] || '(sin título)', idx: idx,
          letra: letraCol(idx), letraEsperada: letraCol(posEsp),
          estado: 'remapeada', cambioPosicion: idx !== posEsp
        });
      }
    });

    // Paso 2: coincidencia exacta o normalizada (primera aparición gana)
    COLUMNAS_PADRON.forEach(function (esp, posEsp) {
      if (esp in indice) return;
      let idx = -1, estado = '';
      for (let i = 0; i < raw.length; i++) {
        if (usados[i]) continue;
        if (raw[i] === esp) { idx = i; estado = 'exacta'; break; }
      }
      if (idx < 0) {
        const ne = normHeader(esp);
        for (let i = 0; i < raw.length; i++) {
          if (usados[i]) continue;
          if (raw[i] && normHeader(raw[i]) === ne) { idx = i; estado = 'formato'; break; }
        }
      }
      if (idx >= 0) {
        usados[idx] = esp;
        indice[esp] = idx;
        coincidencias.push({
          esperada: esp, encontrada: raw[idx], idx: idx,
          letra: letraCol(idx), letraEsperada: letraCol(posEsp),
          estado: estado, cambioPosicion: idx !== posEsp
        });
      } else {
        faltantes.push({
          esperada: esp,
          obligatoria: COLUMNAS_OBLIGATORIAS.indexOf(esp) >= 0,
          posEsperada: posEsp,
          letraEsperada: letraCol(posEsp),
          sugerencias: []
        });
      }
    });

    // Columnas no usadas => agregadas / nuevas o posibles renombradas (excluyendo encabezados duplicados)
    const dupIdxSet = {};
    duplicadas.forEach(function (d) { dupIdxSet[d.idx] = true; });
    const agregadas = [];
    const indiceAux = {};
    raw.forEach(function (h, i) {
      if (usados[i] || !h || dupIdxSet[i]) return;
      const nh = normHeader(h);
      const auxNombre = auxSet[nh] || '';
      if (auxNombre && !(auxNombre in indiceAux)) indiceAux[auxNombre] = i;
      agregadas.push({
        idx: i, letra: letraCol(i), nombre: h,
        esAuxiliarConocida: !!auxNombre, auxiliarNombre: auxNombre
      });
    });

    // Sugerir posibles renombramientos para cada faltante (misma columna A..W o texto similar)
    faltantes.forEach(function (f) {
      const sugs = [];
      agregadas.forEach(function (ag) {
        const sim = similitudTexto(f.esperada, ag.nombre);
        const mismaPos = ag.idx === f.posEsperada;
        if (mismaPos || sim >= 0.4) {
          sugs.push({
            idx: ag.idx, letra: ag.letra, nombre: ag.nombre,
            score: (mismaPos ? 1 : 0) + sim,
            motivo: mismaPos ? ('misma posición (' + ag.letra + ')') : 'nombre parecido'
          });
        }
      });
      sugs.sort(function (a, b) { return b.score - a.score; });
      f.sugerencias = sugs;
    });

    const faltantesObligatorias = faltantes.filter(function (f) { return f.obligatoria; });
    const nuevasDesconocidas = agregadas.filter(function (a) { return !a.esAuxiliarConocida; });
    const cambiosFormato = coincidencias.filter(function (c) { return c.estado === 'formato'; });
    const cambiosPosicion = coincidencias.filter(function (c) { return c.cambioPosicion; });

    return {
      ok: faltantesObligatorias.length === 0,
      headers: raw,
      coincidencias: coincidencias,
      faltantes: faltantes,
      faltantesObligatorias: faltantesObligatorias,
      agregadas: agregadas,
      nuevasDesconocidas: nuevasDesconocidas,
      cambiosFormato: cambiosFormato,
      cambiosPosicion: cambiosPosicion,
      duplicadas: duplicadas,
      indice: indice,
      indiceAux: indiceAux
    };
  }

  /** Convierte filas crudas (matriz 2D con encabezado en fila 0) en visitas normalizadas usando una validación OK. */
  function parsearFilasPadron(rows, validacion, actuales) {
    if (!rows || rows.length < 2 || !validacion || !validacion.ok) {
      return { visitas: [], duplicadosOmitidos: [], filasSinFecha: 0, filasRaw: [] };
    }
    const idx = validacion.indice;
    const idxAux = validacion.indiceAux || {};
    function cel(r, col) {
      const i = idx[col];
      if (i == null || i >= r.length || r[i] == null) return '';
      const v = r[i];
      if (v instanceof Date) return aDMY(aISO(v));
      return String(v).trim();
    }
    function celAux(r, col) {
      const i = idxAux[col];
      if (i == null || i >= r.length || r[i] == null) return '';
      return String(r[i]).trim();
    }
    function normNum(v) {
      const s = String(v == null ? '' : v).trim();
      return /^\d+\.0+$/.test(s) ? s.replace(/\.0+$/, '') : s;
    }

    // Índices rápidos de las visitas actuales para heredar Planificación / Ámbito / Depto / mesEmergente
    const prevPorId = {};
    const prevPorCET = {};
    (actuales || []).forEach(function (v) {
      prevPorId[v.id] = v;
      const k = [v.cuit, v.nroEstab, sinTildes(v.tareas).toLowerCase()].join('|');
      if (!prevPorCET[k]) prevPorCET[k] = v;
    });

    const visitas = [];
    const filasRaw = [];
    const vistos = {};
    const duplicadosOmitidos = [];
    let filasSinFecha = 0;

    for (let rIdx = 1; rIdx < rows.length; rIdx++) {
      const r = rows[rIdx] || [];
      const cuit = normNum(cel(r, 'Cuit')).replace(/[^\d]/g, '');
      if (!cuit) continue;
      const nroEstab = normNum(cel(r, 'Nro Estab Intercambio'));
      const nroEstabIAPART = normNum(cel(r, 'Nro Estab IAPART'));
      const contrato = normNum(cel(r, 'Contrato IAPART'));
      const trabajadores = normNum(cel(r, 'CantidadTrabajadoresCUIT'));
      const tareas = cel(r, 'Tareas');
      const rawFecha = (idx['Fecha Programada'] != null && idx['Fecha Programada'] < r.length) ? r[idx['Fecha Programada']] : '';
      const fecha = aISO(rawFecha);
      if (!fecha) filasSinFecha++;

      const base = [cuit, nroEstab, sinTildes(tareas).toLowerCase(), fecha].join('|');
      const n = (vistos[base] || 0) + 1;
      vistos[base] = n;
      const obra = esObra(tareas);
      if (n > 1 && !obra) {
        duplicadosOmitidos.push({ fila: rIdx + 1, cuit: cuit, empleador: cel(r, 'Empleador'), nroEstab: nroEstab, tareas: tareas, fechaMax: fecha });
        continue;
      }
      const vid = base + (n > 1 ? ('#' + n) : '');
      const cet = [cuit, nroEstab, sinTildes(tareas).toLowerCase()].join('|');
      const prev = prevPorId[vid] || prevPorCET[cet] || null;
      const prov = cel(r, 'Provincia');

      const vObj = {
        id: vid,
        cuit: cuit,
        empleador: cel(r, 'Empleador'),
        contrato: contrato,
        establecimiento: cel(r, 'Establecimiento'),
        localidad: cel(r, 'Localidad'),
        provincia: prov,
        cp: normNum(cel(r, 'CP')),
        domicilio: cel(r, 'Domicilio estab.'),
        responsable: cel(r, 'Responsable'),
        telefono: cel(r, 'Telefono'),
        email: cel(r, 'E-mail'),
        nroEstabIAPART: nroEstabIAPART,
        nroEstab: nroEstab,
        programa: cel(r, 'Programa'),
        trabajadores: trabajadores,
        preventor: cel(r, 'Preventor Asignado'),
        tareas: tareas,
        esObra: obra,
        fechaMax: fecha,
        planificacion: celAux(r, 'Planificacion') || (prev ? prev.planificacion : ''),
        ambito: celAux(r, 'Ambito') || (prev ? prev.ambito : prov),
        departamento: celAux(r, 'Departamento') || (prev ? prev.departamento : ''),
        obsCS: cel(r, 'Observaciones CS'),
        obsIAPSER: cel(r, 'Observaciones IAPSER'),
        cohorte: cohorte(fecha),
        mesEmergente: prev ? (prev.mesEmergente || '') : '',
        revisarDuplicada: false
      };
      visitas.push(vObj);

      // Fila A..W normalizada para sincronizar con Google Sheets
      filasRaw.push({
        id: vid,
        cet: cet,
        colsAW: COLUMNAS_PADRON.map(function (col) {
          if (col === 'Cuit') return cuit;
          if (col === 'Contrato IAPART') return contrato;
          if (col === 'CP') return vObj.cp;
          if (col === 'Nro Estab IAPART') return nroEstabIAPART;
          if (col === 'Nro Estab Intercambio') return nroEstab;
          if (col === 'CantidadTrabajadoresCUIT') return trabajadores;
          if (col === 'Fecha Programada') return fecha ? aDMY(fecha) : '';
          return cel(r, col);
        })
      });
    }

    return { visitas: visitas, duplicadosOmitidos: duplicadosOmitidos, filasSinFecha: filasSinFecha, filasRaw: filasRaw };
  }

  /** Compara padrón actual vs nuevo y clasifica en sinCambios, modificadas, altas y bajas (detectando si tienen gestión). */
  function compararPadron(actuales, nuevas, intentosPorId, cruceOctMapa) {
    intentosPorId = intentosPorId || {};
    cruceOctMapa = cruceOctMapa || {};
    const CAMPOS_CMP = [
      ['empleador', 'Empleador'],
      ['contrato', 'Contrato'],
      ['establecimiento', 'Establecimiento'],
      ['localidad', 'Localidad'],
      ['provincia', 'Provincia'],
      ['domicilio', 'Domicilio'],
      ['programa', 'Programa'],
      ['trabajadores', 'Trabajadores'],
      ['preventor', 'Preventor'],
      ['tareas', 'Tareas'],
      ['fechaMax', 'Fecha máx. (R)'],
      ['obsCS', 'Obs. CS'],
      ['obsIAPSER', 'Obs. IAPSER']
    ];

    function diffs(a, b) {
      const out = [];
      CAMPOS_CMP.forEach(function (par) {
        const k = par[0], lbl = par[1];
        const va = String(a[k] == null ? '' : a[k]).trim();
        const vb = String(b[k] == null ? '' : b[k]).trim();
        if (va !== vb) out.push({ campo: lbl, key: k, antes: va, despues: vb });
      });
      return out;
    }

    const mapAct = {};
    (actuales || []).forEach(function (v) { mapAct[v.id] = v; });

    const matchedAct = {};
    const matchedNew = {};
    const sinCambios = [];
    const modificadas = [];

    // 1. Emparejar por ID exacto
    (nuevas || []).forEach(function (nv, ni) {
      const av = mapAct[nv.id];
      if (!av) return;
      matchedAct[av.id] = true;
      matchedNew[ni] = true;
      const d = diffs(av, nv);
      if (d.length) modificadas.push({ anterior: av, nueva: nv, cambios: d, cambioId: false });
      else sinCambios.push(nv);
    });

    // 2. Emparejar remanentes 1-a-1 por CUIT|Estab|Tareas (detecta cuando cambió la Fecha máx. col. R)
    const remActPorCET = {};
    (actuales || []).forEach(function (av) {
      if (matchedAct[av.id]) return;
      const k = [av.cuit, av.nroEstab, sinTildes(av.tareas).toLowerCase()].join('|');
      (remActPorCET[k] = remActPorCET[k] || []).push(av);
    });

    const altas = [];
    (nuevas || []).forEach(function (nv, ni) {
      if (matchedNew[ni]) return;
      const k = [nv.cuit, nv.nroEstab, sinTildes(nv.tareas).toLowerCase()].join('|');
      const cola = remActPorCET[k];
      if (cola && cola.length) {
        const av = cola.shift();
        matchedAct[av.id] = true;
        matchedNew[ni] = true;
        modificadas.push({ anterior: av, nueva: nv, cambios: diffs(av, nv), cambioId: true });
      } else {
        altas.push(nv);
      }
    });

    // 3. Remanentes de actuales => Bajas (verificando si ya tienen intentos o cruce PDF Oct)
    const bajas = [];
    (actuales || []).forEach(function (av) {
      if (matchedAct[av.id]) return;
      const ints = intentosPorId[av.id] || [];
      const ceKey = String(av.cuit || '').trim() + '|' + String(av.nroEstab || '').trim();
      const tieneOct = av.cohorte === 'Emergente' && !!(cruceOctMapa[ceKey] && cruceOctMapa[ceKey].length);
      bajas.push({
        visita: av,
        tieneGestion: ints.length > 0 || tieneOct,
        cantIntentos: ints.length,
        tieneCruceOct: tieneOct
      });
    });

    return {
      sinCambios: sinCambios,
      modificadas: modificadas,
      altas: altas,
      bajas: bajas,
      bajasConGestion: bajas.filter(function (b) { return b.tieneGestion; })
    };
  }

  const API = {
    CONFIG, ESTADOS, COLUMNAS_PADRON, COLUMNAS_OBLIGATORIAS, COLUMNAS_AUXILIARES, ETIQUETAS_LOGISTICA,
    aISO, aDMY, mesDe, hoyISO, sumarMeses, diffMeses, sinTildes, labelMes, mesEmergenteActual, letraCol,
    cohorte, esObra, esTecnica, esATEP, esPese363, esRgrlVerosim, esCapacitacion, esUrgente, esEtapa1,
    normAmbito, zonaVisita, resumenEtiquetas, filtrarPorEtiqueta, agruparLogistica, prioridadLogistica,
    subtareasNorm, subtareasLimpias, catalogoTareas, coincideTarea, detectarErroresVisitas,
    esMayo2027OAdelante, filtrarCorteFuturo, categoriaVencimiento,
    plazoVisita, ultimoIntento, estadoVisita,
    cuentaObjetivo, estaCerrada, validarIntento, requiereAdjunto, esPDF,
    indexarCruceOctubre, armarVisitas, agendadasPorMes, cerradasPorMes,
    metaConsolidadaMes, tablero, cumplimientoYParticipacion,
    validarColumnasPadron, parsearFilasPadron, compararPadron
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SegCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
