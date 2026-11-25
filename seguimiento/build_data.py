#!/usr/bin/env python3
"""Genera seguimiento/datos.js a partir de la planilla CS (indexado POR NOMBRE de columna).

Uso:
  python build_data.py --detalle detalle.csv --emergentes emergentes.csv   # CSV exportados de la planilla
  python build_data.py            # descarga directo (solo si la planilla esta compartida por enlace)

Las columnas A..W no pueden cambiar de nombre: si falta alguna, el script falla.
"""
import argparse, csv, io, json, os, re, subprocess, sys, unicodedata, urllib.parse, urllib.request
from datetime import datetime

SHEET_ID = '1x2w2zY5BmxWJ29hh6pNiy1qLXv22RFkOx5DidNOx8_E'
HOJA_DETALLE = 'Detalle Visitas con Tareas CS (10-11-26)(General)'
HOJA_EMERG = 'Visitas emergentes mensuales'

# Columnas A..W (orden y nombres fijos)
COLUMNAS_FIJAS = ['Cuit', 'Empleador', 'Contrato IAPART', 'Establecimiento', 'Localidad', 'Provincia', 'CP',
                  'Domicilio estab.', 'Responsable', 'Telefono', 'E-mail', 'Nro Estab IAPART', 'Nro Estab Intercambio',
                  'Programa', 'CantidadTrabajadoresCUIT', 'Preventor Asignado', 'Tareas', 'Fecha Programada',
                  'Fecha Vencimiento', 'Tarea Cargada', 'Fecha Carga', 'Observaciones CS', 'Observaciones IAPSER']
CORTE_RESIDUAL = '2026-10-01'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def sin_tildes(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn')


def a_iso(s):
    s = (s or '').strip()
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', s)
    if m:
        return '%s-%02d-%02d' % (m.group(3), int(m.group(2)), int(m.group(1)))
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', s)
    return m.group(0) if m else ''


def leer_csv(texto):
    filas = list(csv.reader(io.StringIO(texto)))
    enc = [h.strip() for h in filas[0]]
    idx = {}
    idx_all = {}
    for i, h in enumerate(enc):
        idx.setdefault(h, i)  # primera aparicion para columnas fijas A..W
        idx_all.setdefault(h, []).append(i)
    idx['_all'] = idx_all
    return idx, filas[1:]


def validar_encabezados(idx, nombre, columnas):
    faltan = [c for c in columnas if c not in idx]
    if faltan:
        sys.exit('ERROR: en "%s" faltan columnas fijas (A..W): %s' % (nombre, faltan))


def descargar(hoja):
    url = 'https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&sheet=%s' % (SHEET_ID, urllib.parse.quote(hoja))
    try:
        with urllib.request.urlopen(url) as r:
            return r.read().decode('utf-8')
    except Exception as e:
        sys.exit('ERROR: no se pudo descargar la planilla (%s). Si no esta compartida por enlace, exporta las hojas a CSV y usa --detalle y --emergentes.' % e)


def get(fila, idx, col):
    i = idx.get(col)
    return (fila[i].strip() if i is not None and i < len(fila) else '')


def get_pref_last(fila, idx, col):
    """Para columnas enriquecidas repetidas a la derecha (Responsable, Telefono, E-mail), toma el último valor no vacío."""
    posiciones = idx.get('_all', {}).get(col, [])
    for i in reversed(posiciones):
        if i < len(fila) and fila[i].strip():
            return fila[i].strip()
    return get(fila, idx, col)


def leer_archivo_texto(ruta):
    raw = open(ruta, 'rb').read()
    try:
        return raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        return raw.decode('cp1252', errors='replace')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--detalle')
    ap.add_argument('--emergentes')
    ap.add_argument('--hoja1', help='CSV de Hoja 1 (Prioridad mes vencido): col A+I=clave, F=fecha, AB=resultado, AE=link')
    ap.add_argument('--hoja1-links', help='JSON de read-links de col AE de Hoja 1 (hipervinculos embebidos)')
    ap.add_argument('--sin-abm', action='store_true', help='No generar nuevo lote en historialABM al regenerar datos.js')
    ap.add_argument('--usuario', default='Script build_data')
    ap.add_argument('--salida', default=os.path.join(HERE, 'datos.js'))
    a = ap.parse_args()

    t_det = leer_archivo_texto(a.detalle) if a.detalle else descargar(HOJA_DETALLE)
    t_em = leer_archivo_texto(a.emergentes) if a.emergentes else descargar(HOJA_EMERG)
    idx, filas = leer_csv(t_det)
    validar_encabezados(idx, HOJA_DETALLE, COLUMNAS_FIJAS)
    idx_e, filas_e = leer_csv(t_em)
    validar_encabezados(idx_e, HOJA_EMERG, COLUMNAS_FIJAS[1:])
    for c in ('Mes',):
        if c not in idx_e:
            sys.exit('ERROR: falta la columna Mes en emergentes')

    def clave_fila(f, ix):
        return '|'.join([get(f, ix, 'Contrato IAPART'), get(f, ix, 'Nro Estab Intercambio'),
                         sin_tildes(get(f, ix, 'Tareas')).lower(), a_iso(get(f, ix, 'Fecha Programada'))])

    emerg = {}
    for f in filas_e:
        emerg.setdefault(clave_fila(f, idx_e), get(f, idx_e, 'Mes'))

    visitas, vistos = [], {}
    for f in filas:
        if not get(f, idx, 'Cuit'):
            continue
        fecha = a_iso(get(f, idx, 'Fecha Programada'))
        base = '|'.join([get(f, idx, 'Cuit'), get(f, idx, 'Nro Estab Intercambio'),
                         sin_tildes(get(f, idx, 'Tareas')).lower(), fecha])
        n = vistos.get(base, 0) + 1
        vistos[base] = n
        tareas = get(f, idx, 'Tareas')
        es_obra = 'obra' in sin_tildes(tareas).lower()
        if n > 1 and not es_obra:
            # repetido exacto fuera de obras = error de la planilla: se omite y se informa
            print('AVISO duplicado exacto omitido:', base)
            continue
        vid = base + ('#%d' % n if n > 1 else '')
        k = clave_fila(f, idx)
        visitas.append({
            'id': vid,
            'cuit': get(f, idx, 'Cuit'), 'empleador': get(f, idx, 'Empleador'),
            'contrato': get(f, idx, 'Contrato IAPART'), 'establecimiento': get(f, idx, 'Establecimiento'),
            'localidad': get(f, idx, 'Localidad'), 'provincia': get(f, idx, 'Provincia'),
            'cp': get(f, idx, 'CP'),
            'domicilio': get(f, idx, 'Domicilio estab.'),
            'responsable': get_pref_last(f, idx, 'Responsable'),
            'telefono': get_pref_last(f, idx, 'Telefono'),
            'email': get_pref_last(f, idx, 'E-mail'),
            'nroEstabIAPART': get(f, idx, 'Nro Estab IAPART'),
            'nroEstab': get(f, idx, 'Nro Estab Intercambio'),
            'programa': get(f, idx, 'Programa'),
            'trabajadores': get(f, idx, 'CantidadTrabajadoresCUIT'),
            'preventor': get(f, idx, 'Preventor Asignado'),
            'tareas': tareas, 'esObra': es_obra,
            'fechaMax': fecha,
            'planificacion': get(f, idx, 'Planificacion'),
            'ambito': get(f, idx, 'Ambito'), 'departamento': get(f, idx, 'Departamento'),
            'obsCS': get(f, idx, 'Observaciones CS'),
            'obsIAPSER': get(f, idx, 'Observaciones IAPSER'),
            'obs': get(f, idx, 'Observaciones'),
            'cohorte': 'Residual' if fecha and fecha < CORTE_RESIDUAL else 'Emergente',
            'mesEmergente': emerg.get(k, ''),
            'revisarDuplicada': False,
        })

    # misma tarea+estab con fechas distintas => revisar (las obras pueden repetirse)
    grupos = {}
    for v in visitas:
        if v['esObra']:
            continue
        g = '|'.join([v['contrato'], v['nroEstab'], sin_tildes(v['tareas']).lower()])
        grupos.setdefault(g, []).append(v)
    n_rev = 0
    for g in grupos.values():
        if len({v['fechaMax'] for v in g}) > 1:
            for v in g:
                v['revisarDuplicada'] = True
                n_rev += 1

    # historico Sep/Oct (desde Hoja 1 directa: col A=Cuit, I=Nro Estab Intercambio, F=Fecha Realizada, AB=Resultado, AE=Link)
    def extraer_url(celda):
        s = (celda or '').strip()
        m = re.search(r'\((https?://[^)]+)\)', s)
        if m:
            return m.group(1)
        m = re.search(r'https?://\S+', s)
        return m.group(0) if m else ''

    if a.hoja1:
        h_rows = list(csv.reader(open(a.hoja1, encoding='utf-8')))
        h_links = []
        if a.hoja1_links:
            raw_b = open(a.hoja1_links, 'rb').read()
            txt_l = raw_b.decode('utf-16') if raw_b.startswith((b'\xff\xfe', b'\xfe\xff')) else raw_b.decode('utf-8-sig')
            h_links = json.loads(txt_l)
        hist = []
        for idx_r, r in enumerate(h_rows[1:], start=1):
            # col A(0)=Cuit, B(1)=Empleador, C(2)=Contrato, D(3)=Estab, F(5)=Fecha Realizada, G(6)=Localidad,
            # H(7)=Nro Estab IAPART, I(8)=Nro Estab Intercambio, X(23)=Tarea, Y(24)=Origen Plan,
            # AB(27)=Resultado Visita, AD(29)=Observaciones, AE(30)=Documento Adjunto
            f_real = r[5].strip() if len(r) > 5 else ''
            if not a_iso(f_real):
                continue
            ae_lnk = h_links[idx_r][0] if idx_r < len(h_links) and h_links[idx_r] else ''
            ae_csv = r[30].strip() if len(r) > 30 else ''
            hist.append({
                'rowId': idx_r + 1,
                'cuit': r[0].strip() if len(r) > 0 else '',
                'empleador': r[1].strip() if len(r) > 1 else '',
                'contrato': r[2].strip() if len(r) > 2 else '',
                'establecimiento': r[3].strip() if len(r) > 3 else '',
                'localidad': r[6].strip() if len(r) > 6 else '',
                'nroEstab': r[7].strip() if len(r) > 7 else '',
                'nroEstabIntercambio': r[8].strip() if len(r) > 8 else '',
                'tarea': r[23].strip() if len(r) > 23 else '',
                'origenPlan': r[24].strip() if len(r) > 24 else '',
                'fechaRealizada': f_real,
                'resultadoVisita': r[27].strip() if len(r) > 27 else '',
                'observaciones': r[29].strip() if len(r) > 29 else '',
                'documentoAdjunto': extraer_url(ae_lnk) or extraer_url(ae_csv)
            })
    else:
        js = subprocess.check_output(['node', '-e',
            "global.window={};require('./datos_precargados.js');console.log(JSON.stringify(window.DATOS_INICIALES_IAPSER))"],
            cwd=ROOT)
        campos = ['rowId', 'cuit', 'empleador', 'contrato', 'establecimiento', 'nroEstab', 'nroEstabIntercambio',
                  'localidad', 'tarea', 'fechaRealizada', 'resultadoVisita', 'observaciones', 'documentoAdjunto', 'origenPlan']
        hist = [{c: r.get(c, '') for c in campos} for r in json.loads(js) if r.get('origenPlan') != 'Residual 2026']

    gen_ts = datetime.now().strftime('%Y-%m-%d %H:%M')
    prev_visitas = []
    hist_abm = []
    if os.path.exists(a.salida):
        try:
            raw_prev = open(a.salida, encoding='utf-8').read()
            eq = raw_prev.find('=')
            if eq >= 0:
                prev_obj = json.loads(raw_prev[eq + 1:].strip().rstrip(';'))
                prev_visitas = prev_obj.get('visitas', []) or []
                hist_abm = prev_obj.get('historialABM', []) or []
        except Exception as e_prev:
            print('AVISO: no se pudo leer historialABM previo:', e_prev)

    if prev_visitas and not a.sin_abm:
        try:
            payload_cmp = json.dumps({
                'actuales': prev_visitas,
                'nuevas': visitas,
                'historico': hist,
                'meta': {
                    'fechaABM': gen_ts,
                    'archivo': os.path.basename(a.detalle) if a.detalle else HOJA_DETALLE,
                    'usuario': a.usuario
                }
            }, ensure_ascii=False).encode('utf-8')
            node_cmd = (
                "const fs=require('fs'),C=require('./seguimiento/core.js');"
                "const p=JSON.parse(fs.readFileSync(0,'utf8'));"
                "const d=C.compararPadron(p.actuales,p.nuevas,{},C.indexarCruceOctubre(p.historico));"
                "const l=C.construirLoteABM(d,p.meta);"
                "process.stdout.write(JSON.stringify(l));"
            )
            out_lote = subprocess.check_output(['node', '-e', node_cmd], input=payload_cmp, cwd=ROOT)
            lote = json.loads(out_lote.decode('utf-8'))
            if lote.get('movimientos'):
                hist_abm.extend(lote['movimientos'])
                r_abm = lote.get('resumen', {})
                print('ABM registrado (%s): +%d altas | -%d bajas | %d cambios de tareas | %d otros' % (
                    gen_ts, r_abm.get('altas', 0), r_abm.get('bajas', 0),
                    r_abm.get('cambiosTareas', 0), r_abm.get('otrasModificadas', 0)))
        except Exception as e_abm:
            print('AVISO: no se pudo calcular diff ABM:', e_abm)

    datos = {'generado': gen_ts, 'visitas': visitas, 'historico': hist, 'historialABM': hist_abm}
    with open(a.salida, 'w', encoding='utf-8') as fh:
        fh.write('window.SEG_DATA = ' + json.dumps(datos, ensure_ascii=False) + ';\n')
    print('visitas:', len(visitas), '| historico:', len(hist), '| a revisar (fechas distintas):', n_rev)
    print('residual:', sum(v['cohorte'] == 'Residual' for v in visitas),
          '| emergente:', sum(v['cohorte'] == 'Emergente' for v in visitas),
          '| en hoja emergentes:', sum(bool(v['mesEmergente']) for v in visitas))


if __name__ == '__main__':
    main()
