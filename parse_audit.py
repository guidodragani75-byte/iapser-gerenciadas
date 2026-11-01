import json

with open('audit_reception_raw.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f'Total records: {len(data)}')

keywords = ['FALLIDA', 'CERRAD', 'NO ATEND', 'NO SE ENCONTR', 'SIN ACTIVIDAD', 'NO RESPON', 'IMPED', 'SE RETIRA', 'NO HUBO', 'NO PERMIT', 'DESHABITAD', 'MUDAD', 'AUSENTE']

flagged = []
for item in data:
    fname = item['fname'].upper()
    plumber = item['plumber_text'].upper()
    obs = ' '.join(item['obs_lines']).upper()
    ent = ' '.join(item['ent_lines']).upper()
    
    reasons = []
    if item['companion_img']:
        reasons.append('Companion image exists')
    if 'FALLIDA' in fname:
        reasons.append('FALLIDA in filename')
        
    for kw in keywords:
        if kw in obs:
            reasons.append('Obs: ' + kw)
        if kw in fname and 'FALLIDA' not in kw:
            reasons.append('Fname: ' + kw)
        if kw in ent:
            reasons.append('Entrevistado: ' + kw)
            
    if reasons:
        flagged.append((item, reasons))

print(f'Flagged with keywords/companion images: {len(flagged)}')
for item, reasons in flagged:
    idx = item["idx"]
    fn = item["fname"]
    print('----------------------------------------')
    print(f'[{idx}] {fn}')
    print(f'Reasons: {reasons}')
    print(f'Obs: {item["obs_lines"]}')
    print(f'Entrevistado: {item["ent_lines"]}')
    print(f'Pages: {item["pages"]}, Capacitacion: {item["has_capacitacion"]}, Dark1: {item["dark1"]}, Dark3: {item["dark3"]}')
