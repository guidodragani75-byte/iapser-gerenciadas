import os
import sys
import json
import re
import time
import urllib.request
import urllib.parse
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
import pypdf
import pdfplumber

FOLDER_ID = '1DIfp2CDO3Z_1uaxFpWJmysDuPaZdlKuk'
TOKEN_FILE = 'drive_readonly_token.json'
PDF_DIR = '_temp_pdfs'

def get_credentials():
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
            t = json.load(f)
        creds = Credentials(
            token=t['access_token'],
            refresh_token=t.get('refresh_token'),
            token_uri=t.get('token_uri', 'https://oauth2.googleapis.com/token'),
            client_id=t.get('client_id'),
            client_secret=t.get('client_secret'),
            scopes=t.get('scopes', ['https://www.googleapis.com/auth/drive.readonly'])
        )
        if creds.expired and creds.refresh_token:
            from google.auth.transport.requests import Request
            creds.refresh(Request())
            # save updated
            t['access_token'] = creds.token
            with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
                json.dump(t, f, indent=2)
        return creds

    # Otherwise initiate flow
    clasprc_path = os.path.expanduser('~/.clasprc.json')
    with open(clasprc_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    tok = data['tokens']['default']

    client_config = {
        "installed": {
            "client_id": tok['client_id'],
            "client_secret": tok['client_secret'],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost:8901/"]
        }
    }

    flow = InstalledAppFlow.from_client_config(
        client_config,
        scopes=['https://www.googleapis.com/auth/drive.readonly']
    )
    print("Awaiting browser OAuth authorization on port 8901...")
    creds = flow.run_local_server(port=8901, prompt='consent')
    token_data = {
        'access_token': creds.token,
        'refresh_token': creds.refresh_token,
        'token_uri': creds.token_uri,
        'client_id': creds.client_id,
        'client_secret': creds.client_secret,
        'scopes': creds.scopes
    }
    with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
        json.dump(token_data, f, indent=2)
    return creds

def download_file(file_id, dest_path, access_token):
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {access_token}'})
    with urllib.request.urlopen(req) as resp, open(dest_path, 'wb') as out:
        out.write(resp.read())

def extract_pdf_data(pdf_path, file_meta):
    text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages[:5]:
                t = page.extract_text()
                if t:
                    text += t + "\n"
    except Exception:
        try:
            reader = pypdf.PdfReader(pdf_path)
            for page in reader.pages[:5]:
                t = page.extract_text()
                if t:
                    text += t + "\n"
        except Exception as e:
            text = f"Error reading PDF: {e}"

    filename = file_meta['name']
    web_link = file_meta.get('webViewLink', f"https://drive.google.com/file/d/{file_meta['id']}/view?usp=drivesdk")

    # Combine text and filename
    corpus = text + "\n" + filename

    # 1. CUIT
    cuit = ""
    # Look for CUIT labels first: CUIT: 30-12345678-9 or C.U.I.T.
    cuit_match = re.search(r'(?:CUIT|C\.U\.I\.T\.?|C\.U\.I\.L\.?)[\s:]*([0-9]{2}[-\s]?[0-9]{8}[-\s]?[0-9])', text, re.IGNORECASE)
    if cuit_match:
        cuit = re.sub(r'\D', '', cuit_match.group(1))
    else:
        # Regex general for CUIT format
        all_cuits = re.findall(r'\b(20|23|24|27|30|33|34)[-]?([0-9]{8})[-]?([0-9])\b', text)
        if all_cuits:
            cuit = "".join(all_cuits[0])
        else:
            # Check filename for CUIT (11 digits)
            fn_cuit = re.search(r'\b(20|23|24|27|30|33|34)[0-9]{9}\b', filename)
            if fn_cuit:
                cuit = fn_cuit.group(0)

    # 2. Razón Social (RS)
    rs = ""
    # Try filename first as it has clean naming: e.g. "22211 - AGRO IND. CLNIA 25 DE MAYO DE RESP LIMITADA (...)"
    fn_m = re.match(r'^\d+\s*-\s*(?:[0-9]{11}\.\s*)?([^\(]+?)(?:\s*\(|$)', filename)
    if fn_m:
        rs = fn_m.group(1).strip()
    if not rs:
        # Try finding in text: Razón Social: ... or Empleador: ...
        rs_m = re.search(r'(?:Raz[oó]n\s+Social|Empleador|Empresa)[\s:]+([^\r\n]+)', text, re.IGNORECASE)
        if rs_m:
            rs = rs_m.group(1).strip()

    # 3. Nro de Establecimiento
    estab = ""
    # Check filename: "EST. 2", "EST 1", "ESTABLECIMIENTO 3", "OBRA 1"
    fn_est = re.search(r'\b(?:EST\.?|ESTAB\.?|ESTABLECIMIENTO|OBRA)\s*([0-9]+)\b', filename, re.IGNORECASE)
    if fn_est:
        estab = fn_est.group(1)
    else:
        # Check text
        est_m = re.search(r'(?:Establecimiento|N[°o]\s*Estab(?:lecimiento)?|Planta\s*N[°o]?)[\s:]*([0-9]+)', text, re.IGNORECASE)
        if est_m:
            estab = est_m.group(1)
        else:
            estab = "1"

    # 4. Fecha de visita
    fecha = ""
    # Search for date labels in text: Fecha de Visita: DD/MM/YYYY, Fecha: DD/MM/YYYY, etc.
    f_patterns = [
        r'(?:Fecha\s+de\s+(?:la\s+)?visita|Fecha\s+visita|Fecha\s+realizaci[oó]n|Fecha\s+de\s+inspecci[oó]n)[\s:]*([0-3]?[0-9][\/\-\.][0-1]?[0-9][\/\-\.](?:20)?[2-3][0-9])',
        r'(?:San\s+Juan|Paran[aá]|Neuqu[eé]n|Cutral\s*Co|Rosario|Buenos\s+Aires)[,\s]+([0-3]?[0-9])\s+de\s+([a-zA-Z]+)\s+de\s+(202[4-7])',
        r'\b([0-3]?[0-9][\/\-\.][0-1]?[0-9][\/\-\.]202[4-7])\b'
    ]
    for fp in f_patterns:
        fm = re.search(fp, text, re.IGNORECASE)
        if fm:
            if len(fm.groups()) == 3: # Month name format
                meses = {'enero':'01','febrero':'02','marzo':'03','abril':'04','mayo':'05','junio':'06','julio':'07','agosto':'08','septiembre':'09','setiembre':'09','octubre':'10','noviembre':'11','diciembre':'12'}
                dia = fm.group(1).zfill(2)
                mes = meses.get(fm.group(2).lower(), '01')
                anio = fm.group(3)
                fecha = f"{dia}/{mes}/{anio}"
            else:
                raw_d = fm.group(1).replace('-', '/').replace('.', '/')
                parts = raw_d.split('/')
                if len(parts) == 3:
                    d, m, y = parts
                    if len(y) == 2: y = "20" + y
                    fecha = f"{d.zfill(2)}/{m.zfill(2)}/{y}"
            break
            
    if not fecha:
        # Check filename for date like 04 09 2026 or 04/09/2026
        fn_date = re.search(r'\b([0-3]?[0-9])[\s\/\-\.](0?[1-9]|1[0-2])[\s\/\-\.](202[4-7])\b', filename)
        if fn_date:
            fecha = f"{fn_date.group(1).zfill(2)}/{fn_date.group(2).zfill(2)}/{fn_date.group(3)}"

    # 5. Resultado: Efectiva vs Fallida
    es_fallida = False
    obs_fallida = ""
    fallida_keywords = [
        'VISITA FALLIDA', 'FALLIDA', 'NO SE PUDO REALIZAR', 'MOTIVOS DE NO REALIZACION',
        'NO SE PUDO EFECTIVIZAR', 'CERRADO', 'SIN ACTIVIDAD', 'NO HUBO CONTACTO',
        'OBRA FINALIZADA', 'NO PERMITIERON EL INGRESO', 'IMPEDIMENTO'
    ]
    
    # Check filename first
    if 'FALLIDA' in filename.upper() or 'VISITA FALLIDA' in filename.upper():
        es_fallida = True

    # Check text
    for kw in fallida_keywords:
        if kw in corpus.upper():
            es_fallida = True
            break

    # 6. Observación si es fallida
    if es_fallida:
        # Extract explanation / observations
        obs_m = re.search(r'(?:Motivo(?:s)?(?:\s+de\s+visita\s+fallida)?|Observaci[oó]n(?:es)?|Causa)[\s:]*([^\r\n]{10,250})', text, re.IGNORECASE)
        if obs_m:
            obs_fallida = obs_m.group(1).strip()
        else:
            # Look around "fallida"
            m_ctx = re.search(r'([^\.\n]*fallida[^\.\n]*)', text, re.IGNORECASE)
            if m_ctx:
                obs_fallida = m_ctx.group(1).strip()
            elif 'FALLIDA' in filename.upper():
                obs_fallida = "Constancia de visita fallida adjunta en el documento."
    
    resultado = "Fallida" if es_fallida else "Efectiva"

    return {
        "nombre_archivo": filename,
        "cuit": cuit,
        "rs": rs,
        "nro_establecimiento": estab,
        "fecha_visita": fecha,
        "resultado": resultado,
        "observacion_fallida": obs_fallida if es_fallida else "",
        "link_doc": web_link
    }

def main():
    creds = get_credentials()
    access_token = creds.token
    os.makedirs(PDF_DIR, exist_ok=True)

    with open('all_pdfs_list.json', 'r', encoding='utf-8') as f:
        files = json.load(f)

    print(f"Total files to process: {len(files)}")
    results = []

    for i, f in enumerate(files):
        fid = f['id']
        name = f['name']
        pdf_path = os.path.join(PDF_DIR, f"{fid}.pdf")
        
        print(f"[{i+1}/{len(files)}] Downloading {name}...")
        try:
            if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
                download_file(fid, pdf_path, access_token)
            
            data = extract_pdf_data(pdf_path, f)
            results.append(data)
            print(f"  -> CUIT: {data['cuit']} | RS: {data['rs']} | Estab: {data['nro_establecimiento']} | Fecha: {data['fecha_visita']} | Res: {data['resultado']}")
        except Exception as e:
            print(f"  Error processing {name}: {e}")
            results.append({
                "nombre_archivo": name,
                "cuit": "",
                "rs": "",
                "nro_establecimiento": "",
                "fecha_visita": "",
                "resultado": "Error al procesar",
                "observacion_fallida": str(e),
                "link_doc": f.get('webViewLink', '')
            })

    # Save output to JSON and CSV
    with open('analisis_pdfs_completo.json', 'w', encoding='utf-8') as out_j:
        json.dump(results, out_j, indent=2, ensure_ascii=False)

    import csv
    with open('analisis_pdfs_completo.csv', 'w', newline='', encoding='utf-8-sig') as out_c:
        writer = csv.DictWriter(out_c, fieldnames=[
            "nombre_archivo", "cuit", "rs", "nro_establecimiento",
            "fecha_visita", "resultado", "observacion_fallida", "link_doc"
        ])
        writer.writeheader()
        writer.writerows(results)

    print(f"\nProcessing complete! Processed {len(results)} files. Saved to analisis_pdfs_completo.json and analisis_pdfs_completo.csv")

if __name__ == '__main__':
    main()
