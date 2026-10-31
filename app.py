import os
import sys
import time
import subprocess
import shutil
import ctypes
from ctypes import wintypes
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import get_connection, init_db
from thumbnails import get_or_create_thumbnail
import scanner
import foldersizes_engine
import compare_engine
from thumbnails_studio import studio_manager

# Windows Shell Recycle Bin structure (SHFileOperationW)
class SHFILEOPSTRUCTW(ctypes.Structure):
    _fields_ = [
        ('hwnd', wintypes.HWND),
        ('wFunc', wintypes.UINT),
        ('pFrom', wintypes.LPCWSTR),
        ('pTo', wintypes.LPCWSTR),
        ('fFlags', wintypes.WORD),
        ('fAnyOperationsAborted', wintypes.BOOL),
        ('hNameMappings', wintypes.LPVOID),
        ('lpszProgressTitle', wintypes.LPCWSTR)
    ]

FO_DELETE = 3
FOF_ALLOWUNDO = 0x0040
FOF_NOCONFIRMATION = 0x0010
FOF_SILENT = 0x0004

def send_to_recycle_bin(path_str: str) -> bool:
    """Sends file to Windows Recycle Bin with undo capability, avoiding permanent deletion."""
    try:
        abs_p = os.path.abspath(path_str) + '\0\0'
        op = SHFILEOPSTRUCTW(
            hwnd=None,
            wFunc=FO_DELETE,
            pFrom=abs_p,
            pTo=None,
            fFlags=FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT,
            fAnyOperationsAborted=False,
            hNameMappings=None,
            lpszProgressTitle=None
        )
        res = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op))
        return (res == 0)
    except Exception as e:
        print(f"Error in send_to_recycle_bin: {e}")
        return False

app = FastAPI(title="SwipeDrive", version="2.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/", response_class=HTMLResponse)
def get_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return HTMLResponse("<h1>Organizador de Disco E:</h1><p>Cargando interfaz...</p>")

@app.get("/api/drive/info")
def get_drive_info():
    total_gb, used_gb, free_gb = 0, 0, 0
    try:
        total, used, free = shutil.disk_usage("E:\\")
        total_gb = round(total / (1024**3), 2)
        used_gb = round(used / (1024**3), 2)
        free_gb = round(free / (1024**3), 2)
    except Exception:
        pass

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as count FROM folders WHERE path != 'E:\\';")
    folders_count = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) as count FROM files;")
    files_count = cursor.fetchone()["count"]

    cursor.execute("""
    SELECT category, COUNT(*) as count 
    FROM folders 
    WHERE path != 'E:\\' AND category IS NOT NULL 
    GROUP BY category 
    ORDER BY count DESC;
    """)
    categories = [dict(row) for row in cursor.fetchall()]

    cursor.execute("""
    SELECT status, COUNT(*) as count 
    FROM folders 
    WHERE path != 'E:\\' AND status IS NOT NULL 
    GROUP BY status 
    ORDER BY count DESC;
    """)
    statuses = [dict(row) for row in cursor.fetchall()]

    conn.close()

    return {
        "drive": "E:\\",
        "total_gb": total_gb,
        "used_gb": used_gb,
        "free_gb": free_gb,
        "used_percent": round((used_gb / total_gb * 100), 1) if total_gb else 0,
        "folders_count": folders_count,
        "files_count": files_count,
        "categories": categories,
        "statuses": statuses
    }

@app.get("/api/tags")
def get_tags():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT t.id, t.name, t.tag_type, t.color, t.icon, COUNT(it.item_path) as usage_count
    FROM tags t
    LEFT JOIN item_tags it ON t.id = it.tag_id
    GROUP BY t.id
    ORDER BY t.tag_type, usage_count DESC, t.name ASC;
    """)
    rows = cursor.fetchall()
    conn.close()

    grouped = {}
    for r in rows:
        t_type = r["tag_type"]
        if t_type not in grouped:
            grouped[t_type] = []
        grouped[t_type].append(dict(r))

    return grouped

class CreateTagRequest(BaseModel):
    name: str
    tag_type: str = "custom"
    color: str = "#6366f1"
    icon: str = "tag"

@app.post("/api/tags")
def create_tag(req: CreateTagRequest):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT INTO tags (name, tag_type, color, icon)
        VALUES (?, ?, ?, ?)
        """, (req.name.strip(), req.tag_type, req.color, req.icon))
        conn.commit()
        tag_id = cursor.lastrowid
        conn.close()
        return {"success": True, "id": tag_id, "name": req.name}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=f"No se pudo crear etiqueta: {e}")

@app.delete("/api/tags/{tag_id}")
def delete_tag(tag_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
    cursor.execute("DELETE FROM item_tags WHERE tag_id = ?", (tag_id,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/api/organigram")
def get_organigram(max_depth: int = 4):
    """Returns folder hierarchy tree for the visual organigram."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT f.path, f.name, f.parent_path, f.depth, f.subfolder_count, f.file_count, 
           f.size_bytes, f.category, f.status, f.owner
    FROM folders f
    WHERE f.depth <= ?
    ORDER BY f.depth ASC, f.name ASC;
    """, (max_depth,))
    folder_rows = [dict(r) for r in cursor.fetchall()]

    # Fetch all tags associated with these folders
    cursor.execute("""
    SELECT it.item_path, t.id, t.name, t.tag_type, t.color, t.icon
    FROM item_tags it
    JOIN tags t ON it.tag_id = t.id
    WHERE it.item_type = 'folder';
    """)
    tag_rows = cursor.fetchall()
    conn.close()

    tags_by_folder = {}
    for tr in tag_rows:
        p = tr["item_path"]
        if p not in tags_by_folder:
            tags_by_folder[p] = []
        tags_by_folder[p].append({
            "id": tr["id"],
            "name": tr["name"],
            "tag_type": tr["tag_type"],
            "color": tr["color"],
            "icon": tr["icon"]
        })

    for f in folder_rows:
        f["tags"] = tags_by_folder.get(f["path"], [])

    return {
        "root": "E:\\",
        "nodes": folder_rows
    }

@app.get("/api/explore")
def explore_folder(
    path: str = Query("E:\\"),
    category: Optional[str] = None,
    status: Optional[str] = None,
    tag_id: Optional[int] = None,
    search: Optional[str] = None,
    sort_by: str = "name",
    sort_order: str = "asc"
):
    """Explore subfolders and files inside a directory with search, filter, and metadata."""
    folder_path = Path(path)
    if not folder_path.exists():
        raise HTTPException(status_code=404, detail=f"Ruta no existe: {path}")

    # Build breadcrumbs
    breadcrumbs = []
    curr = folder_path
    while True:
        name = curr.name if curr.name else str(curr)
        breadcrumbs.insert(0, {"name": name, "path": str(curr)})
        if curr.parent == curr:
            break
        curr = curr.parent

    # Index files on demand if needed
    scanner.scan_files_in_folder(str(folder_path))

    conn = get_connection()
    cursor = conn.cursor()

    # Get current folder metadata
    cursor.execute("SELECT * FROM folders WHERE path = ?", (str(folder_path),))
    curr_meta = cursor.fetchone()
    current_folder = dict(curr_meta) if curr_meta else {
        "path": str(folder_path),
        "name": folder_path.name or "E:\\",
        "category": "Sin Categoría",
        "status": "Por Revisar",
        "owner": "Alex"
    }

    # Fetch subfolders
    norm_path = str(folder_path).rstrip("\\")
    cursor.execute("""
    SELECT f.*, 
           GROUP_CONCAT(t.name || '::' || t.color || '::' || t.tag_type || '::' || t.id, ';;') as tags_str
    FROM folders f
    LEFT JOIN item_tags it ON f.path = it.item_path AND it.item_type = 'folder'
    LEFT JOIN tags t ON it.tag_id = t.id
    WHERE f.parent_path = ? OR f.parent_path = ?
    GROUP BY f.path
    ORDER BY f.name COLLATE NOCASE ASC;
    """, (norm_path, norm_path + "\\"))
    
    subfolder_rows = cursor.fetchall()
    subfolders = []
    for r in subfolder_rows:
        item = dict(r)
        tags_raw = item.pop("tags_str", None)
        item["tags"] = []
        if tags_raw:
            for t_chunk in tags_raw.split(";;"):
                parts = t_chunk.split("::")
                if len(parts) == 4:
                    item["tags"].append({
                        "name": parts[0],
                        "color": parts[1],
                        "tag_type": parts[2],
                        "id": int(parts[3])
                    })
        
        # Apply filters
        if category and item.get("category") != category:
            continue
        if status and item.get("status") != status:
            continue
        if tag_id and not any(t["id"] == tag_id for t in item["tags"]):
            continue
        if search and search.lower() not in item["name"].lower():
            continue
        subfolders.append(item)

    # Fetch files
    cursor.execute("""
    SELECT f.*,
           GROUP_CONCAT(t.name || '::' || t.color || '::' || t.tag_type || '::' || t.id, ';;') as tags_str
    FROM files f
    LEFT JOIN item_tags it ON f.path = it.item_path AND it.item_type = 'file'
    LEFT JOIN tags t ON it.tag_id = t.id
    WHERE f.folder_path = ?
    GROUP BY f.path
    ORDER BY f.name COLLATE NOCASE ASC;
    """, (str(folder_path),))

    file_rows = cursor.fetchall()
    files = []
    for r in file_rows:
        item = dict(r)
        tags_raw = item.pop("tags_str", None)
        item["tags"] = []
        if tags_raw:
            for t_chunk in tags_raw.split(";;"):
                parts = t_chunk.split("::")
                if len(parts) == 4:
                    item["tags"].append({
                        "name": parts[0],
                        "color": parts[1],
                        "tag_type": parts[2],
                        "id": int(parts[3])
                    })

        # Apply filters
        if category and item.get("category") != category:
            continue
        if status and item.get("status") != status:
            continue
        if tag_id and not any(t["id"] == tag_id for t in item["tags"]):
            continue
        if search and search.lower() not in item["name"].lower():
            continue
        files.append(item)

    conn.close()

    # Sort files
    reverse = (sort_order.lower() == "desc")
    if sort_by == "size":
        files.sort(key=lambda x: x.get("size_bytes", 0), reverse=reverse)
    elif sort_by == "date":
        files.sort(key=lambda x: x.get("mtime", 0), reverse=reverse)
    else:
        files.sort(key=lambda x: x.get("name", "").lower(), reverse=reverse)

    return {
        "current_folder": current_folder,
        "breadcrumbs": breadcrumbs,
        "subfolders": subfolders,
        "files": files,
        "total_subfolders": len(subfolders),
        "total_files": len(files)
    }

@app.get("/api/thumbnail")
def get_thumbnail(path: str = Query(...)):
    """Generates and serves cached WebP thumbnail for images, videos, PDFs, and folders."""
    p = Path(path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    thumb_file = get_or_create_thumbnail(str(p))
    if thumb_file and thumb_file.exists():
        return FileResponse(
            str(thumb_file),
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=86400"}
        )

    # If no thumbnail could be created, return 204 or transparent 1x1 png
    return Response(status_code=204)

@app.get("/api/preview")
def get_preview_file(path: str = Query(...)):
    """Serves full file for image preview or video playback."""
    p = Path(path)
    if not p.exists() or p.is_dir():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(str(p))

class BatchTagRequest(BaseModel):
    paths: List[str]
    item_type: str = "folder" # 'folder' or 'file'
    add_tag_ids: List[int] = []
    remove_tag_ids: List[int] = []

@app.post("/api/batch/tag")
def batch_tag(req: BatchTagRequest):
    conn = get_connection()
    cursor = conn.cursor()

    for path in req.paths:
        for tag_id in req.add_tag_ids:
            cursor.execute("""
            INSERT OR IGNORE INTO item_tags (item_path, item_type, tag_id)
            VALUES (?, ?, ?)
            """, (path, req.item_type, tag_id))

        for tag_id in req.remove_tag_ids:
            cursor.execute("""
            DELETE FROM item_tags 
            WHERE item_path = ? AND tag_id = ?
            """, (path, tag_id))

    conn.commit()
    conn.close()
    return {"success": True, "affected": len(req.paths)}

class BatchUpdatePropertyRequest(BaseModel):
    paths: List[str]
    item_type: str = "folder" # 'folder' or 'file'
    field: str # 'category' or 'status' or 'owner'
    value: str

@app.post("/api/batch/update")
def batch_update_property(req: BatchUpdatePropertyRequest):
    if req.field not in ("category", "status", "owner"):
        raise HTTPException(status_code=400, detail="Campo inválido")

    conn = get_connection()
    cursor = conn.cursor()
    table = "folders" if req.item_type == "folder" else "files"

    cursor.executemany(f"""
    UPDATE {table} SET {req.field} = ? WHERE path = ?
    """, [(req.value, p) for p in req.paths])

    conn.commit()
    conn.close()
    return {"success": True, "affected": len(req.paths)}

class OpenInExplorerRequest(BaseModel):
    path: str

@app.post("/api/open-in-explorer")
def open_in_explorer(req: OpenInExplorerRequest):
    p = Path(req.path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Ruta no existe")

    try:
        if p.is_dir():
            os.startfile(str(p))
        else:
            # Select file in explorer
            subprocess.run(f'explorer.exe /select,"{p}"', shell=True)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# SWIPEDRIVE: TINDER SWIPE & RECYCLE BIN
# ==========================================

class RecycleFileRequest(BaseModel):
    path: str

@app.post("/api/files/recycle")
def recycle_file_endpoint(req: RecycleFileRequest):
    """
    Sends file to Windows Recycle Bin (NOT permanent deletion)
    and records an index entry in app_recycle_bin.
    """
    p = Path(req.path)
    if not p.exists() or p.is_dir():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    try:
        stat = p.stat()
        file_size = stat.st_size
        file_name = p.name
        ext = p.suffix.lower()
        original_folder = str(p.parent)

        # 1. Send to Windows Recycle Bin
        success = send_to_recycle_bin(str(p))
        if not success:
            raise HTTPException(status_code=500, detail="No se pudo enviar el archivo a la papelera de Windows")

        # 2. Record index entry in SQLite
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO app_recycle_bin (path, name, original_folder, size_bytes, extension, deleted_at, restored)
        VALUES (?, ?, ?, ?, ?, ?, 0);
        """, (str(p), file_name, original_folder, file_size, ext, time.time()))

        # 3. Remove from active files & item_tags
        cursor.execute("DELETE FROM files WHERE path = ?;", (str(p),))
        cursor.execute("DELETE FROM item_tags WHERE item_path = ? AND item_type = 'file';", (str(p),))

        # 4. Decrement folder file count and size if present
        cursor.execute("""
        UPDATE folders 
        SET file_count = MAX(0, file_count - 1),
            size_bytes = MAX(0, size_bytes - ?)
        WHERE path = ?;
        """, (file_size, original_folder))

        conn.commit()
        conn.close()

        return {
            "success": True,
            "name": file_name,
            "path": str(p),
            "size_bytes": file_size
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recycle-bin")
def get_recycle_bin_endpoint():
    """Returns the index of all files sent to recycle bin through SwipeDrive."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, path, name, original_folder, size_bytes, extension, deleted_at, restored
    FROM app_recycle_bin
    ORDER BY deleted_at DESC
    LIMIT 200;
    """)
    items = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM app_recycle_bin WHERE restored = 0;")
    tot_count, tot_bytes = cursor.fetchone()

    conn.close()
    return {
        "items": items,
        "total_files": tot_count,
        "total_bytes": tot_bytes
    }

@app.post("/api/recycle-bin/clear-history")
def clear_recycle_bin_history():
    """Clears our app's recycle bin index (does not affect Windows Recycle Bin)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM app_recycle_bin;")
    conn.commit()
    conn.close()
    return {"success": True}

class MoveFileRequest(BaseModel):
    src_path: str
    dest_folder: str

@app.post("/api/files/move")
def move_file_endpoint(req: MoveFileRequest):
    """
    Moves a file to a destination folder and updates its record in SQLite.
    """
    src = Path(req.src_path)
    if not src.exists() or src.is_dir():
        raise HTTPException(status_code=404, detail="Archivo de origen no existe")

    dest_dir = Path(req.dest_folder)
    dest_dir.mkdir(parents=True, exist_ok=True)

    target_file = dest_dir / src.name
    # Handle name collision
    counter = 1
    while target_file.exists() and target_file != src:
        target_file = dest_dir / f"{src.stem}_{counter}{src.suffix}"
        counter += 1

    try:
        shutil.move(str(src), str(target_file))

        # Update SQLite records
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
        UPDATE files 
        SET path = ?, folder_path = ?
        WHERE path = ?;
        """, (str(target_file), str(dest_dir), str(src)))

        cursor.execute("""
        UPDATE item_tags
        SET item_path = ?
        WHERE item_path = ? AND item_type = 'file';
        """, (str(target_file), str(src)))

        conn.commit()
        conn.close()

        return {
            "success": True,
            "old_path": str(src),
            "new_path": str(target_file),
            "name": target_file.name,
            "dest_folder": str(dest_dir)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al mover archivo: {e}")

class TagFileRequest(BaseModel):
    path: str
    tag_id: int

@app.post("/api/files/tag")
def tag_file_endpoint(req: TagFileRequest):
    """Applies a tag to a file."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT OR IGNORE INTO item_tags (item_path, item_type, tag_id)
    VALUES (?, 'file', ?);
    """, (req.path, req.tag_id))

    cursor.execute("""
    SELECT t.id, t.name, t.color, t.tag_type, t.icon
    FROM item_tags it
    JOIN tags t ON it.tag_id = t.id
    WHERE it.item_path = ? AND it.item_type = 'file';
    """, (req.path,))
    tags = [dict(r) for r in cursor.fetchall()]

    conn.commit()
    conn.close()
    return {"success": True, "tags": tags}

@app.get("/api/folders/picker")
def get_folders_picker(search: Optional[str] = None):
    """Returns search or top folders for the Move setup picker."""
    conn = get_connection()
    cursor = conn.cursor()
    if search:
        cursor.execute("""
        SELECT path, name, depth, size_bytes, file_count, category
        FROM folders
        WHERE name LIKE ? OR path LIKE ?
        ORDER BY depth ASC, name ASC
        LIMIT 30;
        """, (f"%{search}%", f"%{search}%"))
    else:
        cursor.execute("""
        SELECT path, name, depth, size_bytes, file_count, category
        FROM folders
        WHERE depth <= 2
        ORDER BY depth ASC, size_bytes DESC
        LIMIT 40;
        """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"folders": rows}

@app.post("/api/auto-categorize")
def trigger_auto_categorize():
    """Runs auto-categorization heuristics on all folders currently in database."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, name FROM tags;")
    tag_map = {row["name"]: row["id"] for row in cursor.fetchall()}

    cursor.execute("SELECT path FROM folders WHERE path != 'E:\\';")
    paths = [row["path"] for row in cursor.fetchall()]

    updated_count = 0
    tag_inserts = []
    
    for path in paths:
        meta = scanner.classify_path(path)
        cursor.execute("""
        UPDATE folders 
        SET category = ?, status = ?, owner = ?
        WHERE path = ?
        """, (meta["category"], meta["status"], meta["owner"], path))
        updated_count += 1

        for t_name in meta["suggested_tags"]:
            if t_name in tag_map:
                tag_inserts.append((path, "folder", tag_map[t_name]))

    if tag_inserts:
        cursor.executemany("""
        INSERT OR IGNORE INTO item_tags (item_path, item_type, tag_id)
        VALUES (?, ?, ?)
        """, tag_inserts)

    conn.commit()
    conn.close()
    return {"success": True, "updated_folders": updated_count}

@app.post("/api/scan")
def trigger_scan(background_tasks: BackgroundTasks, max_depth: int = 4):
    background_tasks.add_task(scanner.scan_folders, max_depth=max_depth)
    return {"success": True, "message": f"Escaneo en segundo plano iniciado (profundidad {max_depth})"}

# ==========================================
# MODULE 1: FOLDER SIZES & FILE ANALYSIS TREEMAP
# ==========================================

@app.get("/api/foldersizes/treemap")
def get_foldersizes_treemap(
    path: str = Query("E:\\"),
    canvas_w: float = Query(1200),
    canvas_h: float = Query(700),
    view_mode: str = Query("both"),
    top_files_limit: int = Query(150)
):
    try:
        return foldersizes_engine.get_folder_treemap(
            parent_path=path,
            canvas_w=canvas_w,
            canvas_h=canvas_h,
            view_mode=view_mode,
            top_files_limit=top_files_limit
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/foldersizes/files-analysis")
def get_files_analysis_endpoint(
    path: Optional[str] = Query(None),
    limit: int = Query(100)
):
    """
    FolderSizes deep file analysis: Largest Files, File Types breakdown, 
    File Size distribution brackets, File Age brackets, and Tag partitions.
    """
    try:
        return foldersizes_engine.get_files_analysis(parent_path=path, limit_largest=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class AnalyzeFilesRequest(BaseModel):
    root_dir: str = "E:\\"

@app.post("/api/foldersizes/analyze-files")
def trigger_analyze_files(req: Optional[AnalyzeFilesRequest] = None):
    """
    Triggers local background scanning and indexing of all files across the drive.
    Callable remotely from Vercel / mobile phone to update PC information.
    """
    root = req.root_dir if req and req.root_dir else "E:\\"
    res = foldersizes_engine.analysis_manager.start_analysis(root_dir=root)
    return res

@app.get("/api/foldersizes/analysis-status")
def get_analyze_files_status():
    """Returns real-time file indexing status, progress count, elapsed seconds, and metrics."""
    return foldersizes_engine.analysis_manager.get_status()

@app.get("/api/foldersizes/tag-space")
def get_tag_space_analytics():
    try:
        return foldersizes_engine.get_tag_space_distribution()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# MODULE 2: BEYOND COMPARE & DUPLICATE FINDER
# ==========================================

class CompareFoldersRequest(BaseModel):
    left_path: str
    right_path: str
    verify_full_hash: bool = False

@app.post("/api/compare/folders")
def compare_folders_endpoint(req: CompareFoldersRequest):
    try:
        res = compare_engine.compare_two_folders(
            left_dir=req.left_path,
            right_dir=req.right_path,
            verify_full_hash=req.verify_full_hash
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/compare/drive-duplicates")
def get_drive_duplicates(root: str = Query("E:\\")):
    try:
        return compare_engine.scan_drive_for_duplicates(root_dir=root)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class MarkDuplicateRequest(BaseModel):
    path: str
    item_type: str = "folder" # 'folder' or 'file'

@app.post("/api/compare/mark-duplicate")
def mark_as_duplicate(req: MarkDuplicateRequest):
    conn = get_connection()
    cursor = conn.cursor()

    table = "folders" if req.item_type == "folder" else "files"
    cursor.execute(f"UPDATE {table} SET status = 'Duplicado / Posible Basura' WHERE path = ?", (req.path,))

    # Find tag id for 'Duplicado / Posible Basura'
    cursor.execute("SELECT id FROM tags WHERE name = 'Duplicado / Posible Basura';")
    tag_row = cursor.fetchone()
    if tag_row:
        cursor.execute("""
        INSERT OR IGNORE INTO item_tags (item_path, item_type, tag_id)
        VALUES (?, ?, ?)
        """, (req.path, req.item_type, tag_row["id"]))

    conn.commit()
    conn.close()
    return {"success": True, "path": req.path}

class DeleteItemRequest(BaseModel):
    path: str
    confirm: bool = False

@app.post("/api/compare/delete-item")
def delete_item(req: DeleteItemRequest):
    if not req.confirm:
        raise HTTPException(status_code=400, detail="Se requiere confirm=True para eliminar")

    p = Path(req.path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="El archivo o carpeta no existe")

    # Safety check: Prevent deleting root E:\
    if str(p).rstrip("\\/").lower() in ["e:", "e:\\", "c:", "c:\\"]:
        raise HTTPException(status_code=403, detail="Operación no permitida en la raíz del disco")

    try:
        if p.is_dir():
            shutil.rmtree(str(p))
            table = "folders"
        else:
            p.unlink()
            table = "files"

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(f"DELETE FROM {table} WHERE path = ?", (str(p),))
        cursor.execute("DELETE FROM item_tags WHERE item_path = ?", (str(p),))
        conn.commit()
        conn.close()

        return {"success": True, "deleted": str(p)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar: {e}")

# ==========================================
# MODULE 3: THUMBNAILS STUDIO & GENERATOR
# ==========================================

@app.get("/api/thumbnails/status")
def get_thumbnails_status():
    return studio_manager.get_status()

class ThumbnailsStartRequest(BaseModel):
    target_dir: str = "E:\\"
    recursive: bool = True
    max_files: int = 5000

@app.post("/api/thumbnails/start")
def start_thumbnails(req: ThumbnailsStartRequest):
    return studio_manager.start_batch_generation(
        target_dir=req.target_dir,
        recursive=req.recursive,
        max_files=req.max_files
    )

@app.post("/api/thumbnails/pause")
def pause_thumbnails():
    return studio_manager.pause_generation()

@app.post("/api/thumbnails/resume")
def resume_thumbnails():
    return studio_manager.resume_generation()

@app.post("/api/thumbnails/stop")
def stop_thumbnails():
    return studio_manager.stop_generation()

@app.post("/api/thumbnails/clear-cache")
def clear_thumbnails_cache():
    deleted = studio_manager.clear_cache()
    return {"success": True, "deleted_count": deleted}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8765, reload=False)
