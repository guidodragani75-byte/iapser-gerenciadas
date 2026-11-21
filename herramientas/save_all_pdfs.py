import json
from list_pdfs import list_folder_files

files = list_folder_files('1DIfp2CDO3Z_1uaxFpWJmysDuPaZdlKuk')
pdf_files = [f for f in files if f['mimeType'] == 'application/pdf']
with open('all_pdfs_list.json', 'w', encoding='utf-8') as f:
    json.dump(pdf_files, f, indent=2, ensure_ascii=False)

print(f"Total PDF files: {len(pdf_files)}")
for i, f in enumerate(pdf_files):
    print(f"{i+1:3d} | {f['id']} | {f['name']}")
