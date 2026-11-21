#!/usr/bin/env python3
"""Genera seguimiento/datos.js a partir de la planilla CS (indexado POR NOMBRE de columna).

Uso:
  python build_data.py --detalle detalle.csv --emergentes emergentes.csv
  python build_data.py            # descarga los CSV de la planilla (requiere link publico de lectura)

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
    for i, h in enumerate(enc):
        idx.setdefault(h, i)  # primera aparicion gana (hay encabezados repetidos pasada la col. W)
    return idx, filas[1:]


def validar_encabezados(idx, nombre, columnas):
    faltan = [c for c in columnas if c not in idx]
    if faltan:
        sys.exit('ERROR: en "%s" faltan columnas fijas (A..W): %s' % (nombre, faltan))


def descargar(hoja):
    url = 'https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&sheet=%s' % (SHEET_ID, urllib.parse.quote(hoja))
    with urllib.request.urlopen(url) as r:
        return r.read().decode('utf-8')


def get(fila, idx, col):
    i = idx.get(col)
    return (fila[i].strip() if i is not None and i < len(fila) else '')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--detalle')
    ap.add_argument('--emergentes')
    ap.add_argument('--salida', default=os.path.join(HERE, 'datos.js'))
    a = ap.parse_args()

    t_det = open(a.detalle, encoding='utf-8').read() if a.detalle else descargar(HOJA_DETALLE)
    t_em = open(a.emergentes, encoding='utf-8').read() if a.emergentes else descargar(HOJA_EMERG)
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
            'domicilio': get(f, idx, 'Domicilio estab.'),
            'nroEstabIAPART': get(f, idx, 'Nro Estab IAPART'),
            'nroEstab': get(f, idx, 'Nro Estab Intercambio'),
            'programa': get(f, idx, 'Programa'),
            'trabajadores': get(f, idx, 'CantidadTrabajadoresCUIT'),
            'preventor': get(f, idx, 'Preventor Asignado'),
            'tareas': tareas, 'esObra': es_obra,
            'fechaMax': fecha,
            'planificacion': get(f, idx, 'Planificacion'),
            'ambito': get(f, idx, 'Ambito'), 'departamento': get(f, idx, 'Departamento'),
            'obsCS': get(f, idx, 'Observaciones CS'), 'obsIAPSER': get(f, idx, 'Observaciones IAPSER'),
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

    # historico Sep/Oct (modelo anterior)
    js = subprocess.check_output(['node', '-e',
        "global.window={};require('./datos_precargados.js');console.log(JSON.stringify(window.DATOS_INICIALES_IAPSER))"],
        cwd=ROOT)
    campos = ['rowId', 'cuit', 'empleador', 'contrato', 'establecimiento', 'nroEstab', 'nroEstabIntercambio',
              'localidad', 'tarea', 'fechaRealizada', 'resultadoVisita', 'observaciones', 'documentoAdjunto', 'origenPlan']
    hist = [{c: r.get(c, '') for c in campos} for r in json.loads(js) if r.get('origenPlan') != 'Residual 2026']

    datos = {'generado': datetime.now().strftime('%Y-%m-%d %H:%M'), 'visitas': visitas, 'historico': hist}
    with open(a.salida, 'w', encoding='utf-8') as fh:
        fh.write('window.SEG_DATA = ' + json.dumps(datos, ensure_ascii=False) + ';\n')
    print('visitas:', len(visitas), '| historico:', len(hist), '| a revisar (fechas distintas):', n_rev)
    print('residual:', sum(v['cohorte'] == 'Residual' for v in visitas),
          '| emergente:', sum(v['cohorte'] == 'Emergente' for v in visitas),
          '| en hoja emergentes:', sum(bool(v['mesEmergente']) for v in visitas))


if __name__ == '__main__':
    main()
