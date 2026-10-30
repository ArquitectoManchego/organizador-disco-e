import os
import sys
import time
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any
from database import get_connection, init_db

DRIVE_ROOT = "E:\\"

def classify_path(path_str: str) -> Dict[str, Any]:
    norm = path_str.replace("/", "\\").lower()
    parts = [p.lower() for p in Path(norm).parts]
    
    category = "Descargas Masivas"
    status = "Por Revisar"
    owner = "Alex"
    suggested_tags = []

    # Owner detection
    if "nataalia" in parts:
        owner = "Natalia"
        suggested_tags.append("Natalia")
    elif "luis" in parts:
        owner = "Luis"
        suggested_tags.append("Luis")
    elif "tienda" in norm:
        owner = "Tienda"
        suggested_tags.append("Tienda")
    elif "iphone" in parts:
        owner = "Alex"
        suggested_tags.append("iPhone")
    elif "oppo" in norm:
        owner = "Alex"
        suggested_tags.append("Oppo Reno")
    elif "j6" in norm:
        owner = "Alex"
        suggested_tags.append("Samsung J6")
    else:
        owner = "Alex"

    # Status & Duplicates
    if "duplicado" in norm or "todo revisar duplicados" in norm:
        status = "Duplicado / Posible Basura"
        suggested_tags.append("Duplicado / Posible Basura")
    elif "dropbox viejo" in norm:
        status = "Archivado"
        suggested_tags.append("Archivado")
    elif any(k in norm for k in ["bautizo", "fotos 202", "portafolios"]):
        status = "Organizado"
        suggested_tags.append("Organizado")

    # Categories
    if any(k in norm for k in ["\\work", "\\work\\"]):
        category = "Arquitectura & 3D (Work)"
        suggested_tags.append("Arquitectura & 3D (Work)")
        if any(k in norm for k in ["render", "renders"]):
            suggested_tags.append("Renders & Modelos 3D")
        if "sketchup" in norm or "3dsmax" in norm or "3ds" in norm:
            suggested_tags.append("Renders & Modelos 3D")
        if "presupuesto" in norm:
            suggested_tags.append("Documentos & Facturas")

    elif any(k in norm for k in ["warez common", "downloaded nuevo"]):
        category = "Software & Instaladores"
        suggested_tags.append("Software & Instaladores")
        suggested_tags.append("Instaladores & ISO")

    elif any(k in norm for k in ["respaldos celular", "\\iphone", "\\iphone\\"]):
        category = "Respaldos Celular"
        suggested_tags.append("Respaldos Celular")
        if any(k in norm for k in ["icloud", "dcim", "pictures", "fotos"]):
            suggested_tags.append("Fotos Personales")

    elif any(k in norm for k in ["\\fotos", "\\fotos\\"]):
        category = "Fotografía & Álbumes"
        suggested_tags.append("Fotografía & Álbumes")
        suggested_tags.append("Fotos Personales")
        status = "Organizado"

    elif any(k in norm for k in ["\\respaldos", "\\nataalia", "dropbox viejo"]):
        category = "Respaldos de Equipos / Personas"
        suggested_tags.append("Respaldos de Equipos / Personas")

    elif any(k in norm for k in ["ejercicio", "p90x"]):
        category = "Videos & Ejercicio"
        suggested_tags.append("Videos & Ejercicio")
        suggested_tags.append("Grabaciones & Videos")
        status = "Organizado"

    elif "\\movies" in norm:
        category = "Videos & Ejercicio"
        suggested_tags.append("Videos & Ejercicio")
        suggested_tags.append("Grabaciones & Videos")

    elif any(k in norm for k in ["ebooks", "health", "medicina", "parenting", "adult habilities"]):
        category = "Cursos, Ebooks & Salud"
        suggested_tags.append("Cursos, Ebooks & Salud")

    elif any(k in norm for k in ["downloads tienda", "downloads alex", "downloaded\\downloads"]):
        category = "Descargas Masivas"
        suggested_tags.append("Descargas Masivas")
        status = "Por Revisar"

    elif any(k in norm for k in ["libraries", "textures", "sketchup documents"]):
        category = "Arquitectura & 3D (Work)"
        suggested_tags.append("Arquitectura & 3D (Work)")
        suggested_tags.append("Renders & Modelos 3D")

    return {
        "category": category,
        "status": status,
        "owner": owner,
        "suggested_tags": list(set(suggested_tags))
    }

def scan_folders(root_dir: str = DRIVE_ROOT, max_depth: int = 5, progress_callback = None) -> int:
    init_db()
    conn = get_connection()
    cursor = conn.cursor()

    # Preload tag name to id map
    cursor.execute("SELECT id, name FROM tags;")
    tag_map = {row["name"]: row["id"] for row in cursor.fetchall()}

    root_path = Path(root_dir)
    if not root_path.exists():
        print(f"Error: Drive {root_dir} does not exist.")
        return 0

    # Ensure root is recorded
    root_norm = str(root_path).rstrip("\\") + "\\"
    cursor.execute("""
    INSERT INTO folders (path, name, parent_path, depth, subfolder_count, file_count, size_bytes, category, status, owner, mtime, last_scanned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET last_scanned=excluded.last_scanned
    """, (
        root_norm, "Disco Externo (E:)", "", 0, 0, 0, 0, "Raíz", "Organizado", "Alex", time.time(), time.time()
    ))
    conn.commit()

    folder_count = 0
    batch_folders = []
    batch_tags = []

    print(f"Scanning directory hierarchy for {root_dir} (up to depth {max_depth})...")

    # Queue of folders to explore: (path_obj, depth)
    queue = [(root_path, 0)]
    
    while queue:
        current_dir, depth = queue.pop(0)
        
        try:
            with os.scandir(current_dir) as it:
                subdirs = []
                file_count = 0
                dir_size = 0
                mtime = 0

                for entry in it:
                    try:
                        # Skip system & trash
                        if entry.name.startswith("$") or entry.name == "System Volume Information":
                            continue

                        if entry.is_dir(follow_symlinks=False):
                            subdirs.append(Path(entry.path))
                        elif entry.is_file(follow_symlinks=False):
                            file_count += 1
                            stat = entry.stat()
                            dir_size += stat.st_size
                            if stat.st_mtime > mtime:
                                mtime = stat.st_mtime
                    except Exception:
                        pass
        except PermissionError:
            continue
        except Exception as e:
            continue

        # If not root, save this folder
        if depth > 0:
            folder_count += 1
            path_str = str(current_dir)
            parent_str = str(current_dir.parent)
            if depth == 1:
                parent_str = root_norm

            meta = classify_path(path_str)
            
            batch_folders.append((
                path_str,
                current_dir.name,
                parent_str,
                depth,
                len(subdirs),
                file_count,
                dir_size,
                meta["category"],
                meta["status"],
                meta["owner"],
                mtime,
                time.time()
            ))

            for t_name in meta["suggested_tags"]:
                if t_name in tag_map:
                    batch_tags.append((path_str, "folder", tag_map[t_name]))

            if len(batch_folders) >= 100:
                cursor.executemany("""
                INSERT INTO folders (path, name, parent_path, depth, subfolder_count, file_count, size_bytes, category, status, owner, mtime, last_scanned)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    subfolder_count=excluded.subfolder_count,
                    file_count=excluded.file_count,
                    size_bytes=excluded.size_bytes,
                    mtime=excluded.mtime,
                    last_scanned=excluded.last_scanned
                """, batch_folders)

                cursor.executemany("""
                INSERT OR IGNORE INTO item_tags (item_path, item_type, tag_id)
                VALUES (?, ?, ?)
                """, batch_tags)
                conn.commit()
                batch_folders.clear()
                batch_tags.clear()

                if progress_callback:
                    progress_callback(folder_count)

        # Enqueue children if depth < max_depth
        if depth < max_depth:
            for sub in sorted(subdirs, key=lambda x: x.name.lower()):
                queue.append((sub, depth + 1))

    # Commit remaining
    if batch_folders:
        cursor.executemany("""
        INSERT INTO folders (path, name, parent_path, depth, subfolder_count, file_count, size_bytes, category, status, owner, mtime, last_scanned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
            subfolder_count=excluded.subfolder_count,
            file_count=excluded.file_count,
            size_bytes=excluded.size_bytes,
            mtime=excluded.mtime,
            last_scanned=excluded.last_scanned
        """, batch_folders)

    if batch_tags:
        cursor.executemany("""
        INSERT OR IGNORE INTO item_tags (item_path, item_type, tag_id)
        VALUES (?, ?, ?)
        """, batch_tags)
        
    conn.commit()
    conn.close()

    print(f"Scan finished. Successfully indexed {folder_count} folders.")
    return folder_count

def scan_files_in_folder(folder_path_str: str) -> List[Dict]:
    """Scan and index all direct files in a specific folder into SQLite."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, name FROM tags;")
    tag_map = {row["name"]: row["id"] for row in cursor.fetchall()}

    folder_path = Path(folder_path_str)
    if not folder_path.exists() or not folder_path.is_dir():
        conn.close()
        return []

    # Get folder's category, status, owner
    cursor.execute("SELECT category, status, owner FROM folders WHERE path = ?", (folder_path_str,))
    f_row = cursor.fetchone()
    base_cat = f_row["category"] if f_row else "Sin Categoría"
    base_status = f_row["status"] if f_row else "Sin Estado"
    base_owner = f_row["owner"] if f_row else "Alex"

    files_data = []
    batch_files = []
    batch_tags = []

    try:
        with os.scandir(folder_path) as it:
            for entry in it:
                if entry.is_file(follow_symlinks=False):
                    ext = Path(entry.name).suffix.lower()
                    stat = entry.stat()
                    f_cat = base_cat
                    file_tags = []

                    # Heuristic by extension
                    if ext in {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.raw', '.cr2', '.nef', '.heic'}:
                        file_tags.append("Fotos Personales")
                        if base_cat == "Sin Categoría":
                            f_cat = "Fotografía & Álbumes"
                    elif ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v'}:
                        file_tags.append("Grabaciones & Videos")
                        if base_cat == "Sin Categoría":
                            f_cat = "Videos & Ejercicio"
                    elif ext in {'.exe', '.msi', '.iso'}:
                        file_tags.append("Instaladores & ISO")
                        if base_cat == "Sin Categoría":
                            f_cat = "Software & Instaladores"
                    elif ext in {'.max', '.skp', '.fbx', '.obj', '.blend', '.dwg', '.dxf'}:
                        file_tags.append("Renders & Modelos 3D")
                        if ext in {'.dwg', '.dxf'}:
                            file_tags.append("Planos & DWG")
                        if base_cat == "Sin Categoría":
                            f_cat = "Arquitectura & 3D (Work)"
                    elif ext in {'.pdf', '.doc', '.docx', '.xls', '.xlsx'}:
                        file_tags.append("Documentos & Facturas")

                    file_info = {
                        "path": entry.path,
                        "name": entry.name,
                        "folder_path": folder_path_str,
                        "extension": ext,
                        "size_bytes": stat.st_size,
                        "mtime": stat.st_mtime,
                        "category": f_cat,
                        "status": base_status,
                        "owner": base_owner
                    }
                    files_data.append(file_info)

                    batch_files.append((
                        entry.path, entry.name, folder_path_str, ext,
                        stat.st_size, stat.st_mtime, f_cat, base_status, base_owner, time.time()
                    ))

                    for t_name in file_tags:
                        if t_name in tag_map:
                            batch_tags.append((entry.path, "file", tag_map[t_name]))
    except Exception as e:
        print(f"Error scanning files in {folder_path_str}: {e}")

    if batch_files:
        cursor.executemany("""
        INSERT INTO files (path, name, folder_path, extension, size_bytes, mtime, category, status, owner, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
            size_bytes=excluded.size_bytes,
            mtime=excluded.mtime,
            indexed_at=excluded.indexed_at
        """, batch_files)

    if batch_tags:
        cursor.executemany("""
        INSERT OR IGNORE INTO item_tags (item_path, item_type, tag_id)
        VALUES (?, ?, ?)
        """, batch_tags)

    conn.commit()
    conn.close()
    return files_data

if __name__ == "__main__":
    scan_folders(max_depth=3)
