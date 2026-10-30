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
folders_data = []

print("Analyzing drive E:/...")
for item in sorted(root.iterdir()):
    if item.name.startswith("$") or item.name == "System Volume Information":
        continue
    if not item.is_dir():
        continue
    
    subdirs = []
    file_count = 0
    extensions = {}
    total_size = 0
    try:
        for entry in item.iterdir():
            if entry.is_dir():
                subdirs.append(entry.name)
            elif entry.is_file():
                file_count += 1
                ext = entry.suffix.lower()
                extensions[ext] = extensions.get(ext, 0) + 1
                try:
                    total_size += entry.stat().st_size
                except:
                    pass
    except Exception as e:
        print(f"Error reading {item.name}: {e}")
        continue

    folders_data.append({
        "name": item.name,
        "path": str(item),
        "subdirs_count": len(subdirs),
        "subdirs_sample": subdirs[:10],
        "top_files_count": file_count,
        "extensions_sample": extensions,
        "top_size_mb": round(total_size / (1024*1024), 2)
    })

print(f"\nFound {len(folders_data)} main root folders on E:/:\n")
for f in folders_data:
    print(f"📁 [{f['name']}]")
    print(f"   Subcarpetas ({f['subdirs_count']}): {', '.join(f['subdirs_sample'][:6])}{'...' if f['subdirs_count']>6 else ''}")
    print(f"   Archivos en raíz de carpeta: {f['top_files_count']}")
    if f['extensions_sample']:
        ext_str = ", ".join(f"{k}: {v}" for k, v in list(f['extensions_sample'].items())[:5])
        print(f"   Extensiones: {ext_str}")
    print()
