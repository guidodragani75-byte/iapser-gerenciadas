import json
import csv

# Load existing final analysis
with open('analisis_105_pdfs_final.json', 'r', encoding='utf-8') as f:
    records = json.load(f)

# Fallida specifications dictionary by filename prefix / contract & name
# 15 fallidas:
fallidas_specs = {
    "12938": {
        "resultado": "Fallida",
        "observacion_fallida": "Establecimiento no encontrado en la dirección indicada (en su lugar se encuentra la Comisaría Nº 7 de Plottier). Sin firma de la empresa ni entrevistado. Cuenta con registro fotográfico de fachada adjunto."
    },
    "20353": {
        "resultado": "Fallida",
        "observacion_fallida": "Establecimiento cerrado; no se encontró personal para recibir la auditoría preventiva. Sin firma de la empresa ni entrevistado. Cuenta con registro fotográfico de fachada cerrado adjunto."
    },
    "21095": {
        "resultado": "Fallida",
        "observacion_fallida": "Servicio no activo; preventor registra visita fallida y 'N/A' en entrevistado. Sin firma de recepción de la empresa. Cuenta con registro fotográfico exterior adjunto."
    },
    "20706": {
        "resultado": "Fallida",
        "observacion_fallida": "No recibido; en el domicilio consultan por la asegurada y manifiestan desconocerla. Sin firma de la empresa ni entrevistado. Adjunta fotografía en página 4 con cartel 'SE ALQUILA'."
    },
    "20984": {
        "resultado": "Fallida",
        "observacion_fallida": "Establecimiento cerrado con cartel de venta en puerta; sin personal en el lugar. Sin firma de la empresa ni entrevistado. Adjunta fotografía en página 4 con cartel 'VENTA BODEGA COMERCIAL'."
    },
    "21152": {
        "resultado": "Fallida",
        "observacion_fallida": "Domicilio particular sin personal en el lugar; el portero manifiesta desconocer a la empresa. Sin firma de la empresa ni entrevistado. Adjunta fotografía respaldatoria en página 4."
    },
    "20955": {
        "resultado": "Fallida",
        "observacion_fallida": "Establecimiento no encontrado en la dirección registrada; preventor asienta explícitamente 'Visita FALLIDA'. Sin firma de recepción de la empresa ni entrevistado."
    },
    "20704": {
        "resultado": "Fallida",
        "observacion_fallida": "Ingreso no permitido; la encargada no autoriza el acceso al establecimiento por órdenes del propietario. Preventor asienta 'Visita FALLIDA'. Sin firma de la empresa."
    },
    "20850": {
        "resultado": "Fallida",
        "observacion_fallida": "La persona entrevistada manifiesta no haber contratado el servicio de ART y niega la toma de fotografías del establecimiento. Preventor asienta 'Visita FALLIDA'. Sin firma de la empresa."
    },
    "16024": {
        "resultado": "Fallida",
        "observacion_fallida": "Establecimiento no encontrado en el lugar al momento de la visita; preventor asienta 'Visita fallida'. Sin firma de recepción de la empresa ni entrevistado."
    },
    "20586": {
        "resultado": "Fallida",
        "observacion_fallida": "Dirección establecida no encontrada al momento de la visita; preventor asienta 'Visita fallida'. Sin firma de recepción de la empresa ni entrevistado."
    },
    "20163 - MALVICINI SRL (AV. P. GRAL. ROCA 95": {
        "resultado": "Fallida",
        "observacion_fallida": "Establecimiento no encontrado en la dirección al momento de la visita; preventor asienta 'Visita fallida'. Sin firma de recepción de la empresa ni entrevistado."
    },
    "20163 - MALVICINI SRL (VILLEGAS 247": {
        "resultado": "Fallida",
        "observacion_fallida": "Establecimiento cerrado en remodelación por cese/cierre informado por el empleador vía telefónica. Sin firma de recepción de la empresa ni entrevistado."
    },
    "4975 - ALAIS MARCELO JORGE (ZONA RURAL 0. EST 1": {
        "resultado": "Fallida",
        "observacion_fallida": "No fue posible encontrar la dirección establecida en zona rural; preventor asienta 'Fallida'. Sin firma de recepción de la empresa ni entrevistado."
    },
    "4975 - ALAIS MARCELO JORGE (ZONA RURAL 0. EST 2": {
        "resultado": "Fallida",
        "observacion_fallida": "No fue posible encontrar la dirección establecida en zona rural; preventor asienta 'Visita fallida'. Sin firma de recepción de la empresa ni entrevistado."
    }
}

updated_records = []
fallidas_count = 0
efectivas_count = 0

for r in records:
    fname = r['nombre_archivo']
    is_fallida = False
    
    # Check matching key
    for k, spec in fallidas_specs.items():
        if k in fname:
            r['resultado'] = spec['resultado']
            r['observacion_fallida'] = spec['observacion_fallida']
            is_fallida = True
            break
            
    if not is_fallida:
        r['resultado'] = "Efectiva"
        r['observacion_fallida'] = ""
        efectivas_count += 1
    else:
        fallidas_count += 1
        
    updated_records.append(r)

print(f"Total: {len(updated_records)} | Efectivas: {efectivas_count} | Fallidas: {fallidas_count}")

# Save JSON
with open('analisis_105_pdfs_final.json', 'w', encoding='utf-8') as f:
    json.dump(updated_records, f, ensure_ascii=False, indent=2)

# Save CSV
fieldnames = [
    "nombre_archivo",
    "cuit",
    "razon_social",
    "nro_establecimiento",
    "fecha_visita",
    "resultado",
    "observacion_fallida",
    "link_documento"
]

with open('analisis_105_pdfs_final.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for row in updated_records:
        writer.writerow({
            "nombre_archivo": row.get("nombre_archivo", ""),
            "cuit": row.get("cuit", ""),
            "razon_social": row.get("razon_social", ""),
            "nro_establecimiento": row.get("nro_establecimiento", ""),
            "fecha_visita": row.get("fecha_visita", ""),
            "resultado": row.get("resultado", ""),
            "observacion_fallida": row.get("observacion_fallida", ""),
            "link_documento": row.get("link_documento", "")
        })

print("Updated JSON and CSV saved successfully!")
