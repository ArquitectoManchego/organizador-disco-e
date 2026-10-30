import os
import sys
from pathlib import Path
import json

if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

root = Path("E:/")
categories_map = {
    "Arquitectura & 3D (Work)": [],
    "Software & Instaladores": [],
    "Respaldos Celular": [],
    "Fotografía & Álbumes": [],
    "Respaldos de Equipos / Personas": [],
    "Descargas Masivas": [],
    "Videos & Ejercicio": [],
    "Cursos, Ebooks & Salud": [],
    "Otros / Por Clasificar": []
}

classification_rules = [
    # Top-level direct mappings
    ("WORK", "Arquitectura & 3D (Work)", "Trabajos profesionales, renders, 3ds Max, SketchUp y planos de clientes"),
    ("Warez Common", "Software & Instaladores", "Instaladores de software 3D, arquitectura, Adobe y utilidades"),
    ("downloaded nuevo", "Software & Instaladores", "Paquetes de software 3D (Marvelous Designer, CLO3D, cursos)"),
    ("RESPALDOS CELULAR", "Respaldos Celular", "Copias de seguridad de teléfonos (Samsung J6, Oppo Reno 5 Lite)"),
    ("Iphone", "Respaldos Celular", "Respaldos y fotos de iPhone / iCloud"),
    ("FOTOS", "Fotografía & Álbumes", "Álbumes familiares y eventos (Bautizo Diana, etc.)"),
    ("RESPALDOS", "Respaldos de Equipos / Personas", "Copias de seguridad de usuarios y computadoras (LUIS, MEST, SIMO)"),
    ("nataalia", "Respaldos de Equipos / Personas", "Documentos personales y OneDrive de Natalia"),
    ("Dropbox Viejo", "Respaldos de Equipos / Personas", "Archivo histórico de Dropbox, finanzas, proyectos 3D Sapiens"),
    ("Downloads Tienda", "Descargas Masivas", "Descargas acumuladas del equipo de la tienda (dOWNLOADS aLEX)"),
    ("EJERCICIO", "Videos & Ejercicio", "Rutinas y videos completos de entrenamiento físico (P90X)"),
]

for item in sorted(root.iterdir()):
    if item.name.startswith("$") or item.name == "System Volume Information":
        continue
    if not item.is_dir():
        continue
    
    # Check if item is Downloaded - subfolders have distinct categories
    if item.name.lower() == "downloaded":
        for sub in item.iterdir():
            if not sub.is_dir():
                continue
            sub_name = sub.name.upper()
            if "MOVIES" in sub_name:
                categories_map["Videos & Ejercicio"].append((str(sub), "Películas y videos descargados"))
            elif any(k in sub_name for k in ["EBOOKS", "HEALTH", "MEDICINA", "PARENTING", "ADULT HABILITIES"]):
                categories_map["Cursos, Ebooks & Salud"].append((str(sub), f"Contenido temático ({sub.name})"))
            elif "DOWNLOADS" in sub_name:
                categories_map["Descargas Masivas"].append((str(sub), "Descargas generales de internet"))
            else:
                categories_map["Descargas Masivas"].append((str(sub), f"Recursos ({sub.name})"))
        continue

    matched = False
    for folder_name, cat, desc in classification_rules:
        if item.name.lower() == folder_name.lower():
            categories_map[cat].append((str(item), desc))
            matched = True
            break
    if not matched:
        categories_map["Otros / Por Clasificar"].append((str(item), "Sin clasificar"))

print("=== REPORTE DE CATEGORIZACIÓN DE E: ===\n")
for cat, items in categories_map.items():
    if items:
        print(f"[{cat}] ({len(items)} entradas)")
        for path, desc in items[:6]:
            print(f"  * {Path(path).name} -> {desc}")
        if len(items) > 6:
            print(f"  ... y {len(items)-6} más.")
        print()
