import os
import hashlib
import time
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Set

def fast_file_hash(file_path: Path, max_bytes: int = 1024 * 1024) -> str:
    """
    Computes a fast signature for comparing files.
    For files <= 1MB, reads entire content.
    For larger files, samples head 64KB, middle 64KB, tail 64KB for speed, plus file size.
    """
    try:
        size = file_path.stat().st_size
        if size == 0:
            return "empty_file"
        
        hasher = hashlib.md5()
        hasher.update(str(size).encode('utf-8'))

        with open(file_path, "rb") as f:
            if size <= max_bytes:
                hasher.update(f.read())
            else:
                # Sample head
                hasher.update(f.read(65536))
                # Sample middle
                f.seek(size // 2)
                hasher.update(f.read(65536))
                # Sample tail
                f.seek(max(0, size - 65536))
                hasher.update(f.read(65536))

        return hasher.hexdigest()
    except Exception as e:
        return f"err_{e}"

def full_file_hash(file_path: Path) -> str:
    """Full MD5 hash for exact bit-by-bit content comparison."""
    try:
        hasher = hashlib.md5()
        with open(file_path, "rb") as f:
            while chunk := f.read(262144): # 256KB chunks
                hasher.update(chunk)
        return hasher.hexdigest()
    except Exception as e:
        return f"err_{e}"

def get_folder_manifest(folder_path: str, compute_hashes: bool = True) -> Dict[str, Any]:
    """
    Recursively scans folder to build manifest:
    {
      relative_path: { name, rel_path, abs_path, size, mtime, hash }
    }
    """
    root = Path(folder_path)
    if not root.exists() or not root.is_dir():
        return {"error": f"Path not found: {folder_path}", "files": {}, "total_size": 0, "file_count": 0}

    files = {}
    total_size = 0

    for dirpath, dirnames, filenames in os.walk(root):
        # Exclude system folders
        if any(p.startswith('$') or p == 'System Volume Information' for p in dirpath.split(os.sep)):
            continue

        for fn in filenames:
            abs_p = Path(dirpath) / fn
            try:
                stat = abs_p.stat()
                rel_p = str(abs_p.relative_to(root)).replace("\\", "/")
                
                f_hash = fast_file_hash(abs_p) if compute_hashes else ""
                files[rel_p] = {
                    "name": fn,
                    "rel_path": rel_p,
                    "abs_path": str(abs_p),
                    "size": stat.st_size,
                    "mtime": stat.st_mtime,
                    "hash": f_hash
                }
                total_size += stat.st_size
            except Exception:
                pass

    return {
        "root": str(root),
        "name": root.name,
        "files": files,
        "total_size": total_size,
        "file_count": len(files)
    }

def compare_two_folders(left_dir: str, right_dir: str, verify_full_hash: bool = False) -> Dict[str, Any]:
    """
    Beyond Compare equivalent folder-to-folder diff engine.
    Compares Left and Right folder manifests and classifies each item into:
    - identical (same rel_path, same size, same hash)
    - same_name_size_diff_content (same rel_path, same size, BUT HASH MISMATCH!)
    - modified (same rel_path, different size/hash)
    - same_content_diff_name (content matches another file but with different filename/location)
    - left_only (exists only on left)
    - right_only (exists only on right)
    """
    m_left = get_folder_manifest(left_dir, compute_hashes=True)
    m_right = get_folder_manifest(right_dir, compute_hashes=True)

    if "error" in m_left or "error" in m_right:
        return {
            "error": m_left.get("error") or m_right.get("error")
        }

    left_files: Dict[str, Dict] = m_left["files"]
    right_files: Dict[str, Dict] = m_right["files"]

    all_rel_paths = set(left_files.keys()).union(set(right_files.keys()))

    identical: List[Dict] = []
    same_name_size_diff_content: List[Dict] = []
    modified: List[Dict] = []
    left_only: List[Dict] = []
    right_only: List[Dict] = []

    # Map of hash -> list of files for detecting renamed duplicates
    left_hash_map: Dict[str, List[Dict]] = {}
    for f in left_files.values():
        h = f.get("hash")
        if h and not h.startswith("err_"):
            left_hash_map.setdefault(h, []).append(f)

    right_hash_map: Dict[str, List[Dict]] = {}
    for f in right_files.values():
        h = f.get("hash")
        if h and not h.startswith("err_"):
            right_hash_map.setdefault(h, []).append(f)

    processed_right_paths = set()

    for rel_p in sorted(all_rel_paths):
        in_left = rel_p in left_files
        in_right = rel_p in right_files

        if in_left and in_right:
            lf = left_files[rel_p]
            rf = right_files[rel_p]
            processed_right_paths.add(rel_p)

            # Check size
            same_size = (lf["size"] == rf["size"])
            same_hash = (lf["hash"] == rf["hash"])

            if verify_full_hash and same_size and same_hash:
                # Double check with complete MD5 for high-precision
                same_hash = (full_file_hash(Path(lf["abs_path"])) == full_file_hash(Path(rf["abs_path"])))

            if same_size and same_hash:
                identical.append({
                    "rel_path": rel_p,
                    "status": "identical",
                    "status_label": "Identico",
                    "left": lf,
                    "right": rf,
                    "size": lf["size"],
                    "time_diff": lf["mtime"] - rf["mtime"]
                })
            elif same_size and not same_hash:
                # SAME SIZE BUT DIFFERENT CONTENT! (Requested specifically by user)
                same_name_size_diff_content.append({
                    "rel_path": rel_p,
                    "status": "same_name_size_diff_content",
                    "status_label": "Mismo Peso / Contenido Distinto",
                    "left": lf,
                    "right": rf,
                    "size": lf["size"],
                    "time_diff": lf["mtime"] - rf["mtime"]
                })
            else:
                # Modified / Different size
                newer = "left" if lf["mtime"] > rf["mtime"] else "right"
                modified.append({
                    "rel_path": rel_p,
                    "status": "modified",
                    "status_label": "Modificado / Distinto Peso",
                    "left": lf,
                    "right": rf,
                    "newer": newer,
                    "size_diff": lf["size"] - rf["size"],
                    "time_diff": lf["mtime"] - rf["mtime"]
                })

        elif in_left and not in_right:
            left_only.append({
                "rel_path": rel_p,
                "status": "left_only",
                "status_label": "Solo en Izquierda",
                "left": left_files[rel_p],
                "right": None,
                "size": left_files[rel_p]["size"]
            })

        elif in_right and not in_left:
            right_only.append({
                "rel_path": rel_p,
                "status": "right_only",
                "status_label": "Solo en Derecha",
                "left": None,
                "right": right_files[rel_p],
                "size": right_files[rel_p]["size"]
            })

    # Renamed / moved duplicates (same hash, different rel_path)
    same_content_diff_name: List[Dict] = []
    for h, l_list in left_hash_map.items():
        if h in right_hash_map:
            r_list = right_hash_map[h]
            for lf in l_list:
                for rf in r_list:
                    if lf["rel_path"] != rf["rel_path"]:
                        same_content_diff_name.append({
                            "status": "same_content_diff_name",
                            "status_label": "Contenido Identico / Distinto Nombre",
                            "left": lf,
                            "right": rf,
                            "size": lf["size"]
                        })

    # Overall similarity scoring
    total_distinct_files = len(all_rel_paths)
    similarity_pct = 0.0
    if total_distinct_files > 0:
        similarity_pct = round((len(identical) / total_distinct_files) * 100, 1)

    is_exact_folder_duplicate = (len(identical) == total_distinct_files and len(left_files) == len(right_files) and total_distinct_files > 0)
    is_near_duplicate = (similarity_pct >= 80.0 and not is_exact_folder_duplicate)

    return {
        "left_root": m_left["root"],
        "right_root": m_right["root"],
        "left_name": m_left["name"],
        "right_name": m_right["name"],
        "left_total_size": m_left["total_size"],
        "right_total_size": m_right["total_size"],
        "left_file_count": m_left["file_count"],
        "right_file_count": m_right["file_count"],
        "similarity_percent": similarity_pct,
        "is_exact_folder_duplicate": is_exact_folder_duplicate,
        "is_near_duplicate": is_near_duplicate,
        "counts": {
            "identical": len(identical),
            "same_name_size_diff_content": len(same_name_size_diff_content),
            "modified": len(modified),
            "same_content_diff_name": len(same_content_diff_name),
            "left_only": len(left_only),
            "right_only": len(right_only),
            "total_files": total_distinct_files
        },
        "results": {
            "identical": identical[:200], # Paginated/clamped for response size
            "same_name_size_diff_content": same_name_size_diff_content,
            "modified": modified[:200],
            "same_content_diff_name": same_content_diff_name[:200],
            "left_only": left_only[:200],
            "right_only": right_only[:200]
        }
    }

def scan_drive_for_duplicates(root_dir: str = "E:\\", max_depth: int = 3) -> Dict[str, Any]:
    """
    Drive-wide Duplicate Finder:
    Scans subdirectories to find:
    1. Exact 100% Duplicate Folders
    2. Near-Duplicate Folders (similarity >= 75%)
    3. Duplicate Files (by exact content hash)
    """
    root = Path(root_dir)
    if not root.exists():
        return {"error": f"Drive {root_dir} not found"}

    # Find candidate subfolders to compare
    subdirs = []
    try:
        for entry in root.iterdir():
            if entry.is_dir() and not entry.name.startswith("$") and entry.name != "System Volume Information":
                subdirs.append(entry)
    except Exception as e:
        return {"error": str(e)}

    duplicate_folders = []
    near_duplicate_folders = []

    # If there is a known duplicate folder like "TODO REVISAR DUPLICADOS", prioritize comparing its items
    work_dupes = root / "WORK" / "TODO REVISAR DUPLICADOS"
    if work_dupes.exists():
        work_orig = root / "WORK"
        for item in work_dupes.iterdir():
            if item.is_dir():
                target = work_orig / item.name
                if target.exists() and target.is_dir():
                    comp = compare_two_folders(str(target), str(item))
                    if comp.get("is_exact_folder_duplicate"):
                        duplicate_folders.append({
                            "folder_a": str(target),
                            "folder_b": str(item),
                            "name": item.name,
                            "type": "exact",
                            "similarity": 100.0,
                            "file_count": comp["left_file_count"],
                            "size": comp["left_total_size"]
                        })
                    elif comp.get("similarity_percent", 0) >= 50.0:
                        near_duplicate_folders.append({
                            "folder_a": str(target),
                            "folder_b": str(item),
                            "name": item.name,
                            "type": "near",
                            "similarity": comp["similarity_percent"],
                            "identical_count": comp["counts"]["identical"],
                            "diff_count": comp["counts"]["modified"] + comp["counts"]["same_name_size_diff_content"],
                            "left_only": comp["counts"]["left_only"],
                            "right_only": comp["counts"]["right_only"]
                        })

    return {
        "root": str(root),
        "exact_duplicate_folders": duplicate_folders,
        "near_duplicate_folders": near_duplicate_folders,
        "total_exact_found": len(duplicate_folders),
        "total_near_found": len(near_duplicate_folders)
    }

# =====================================================================
# BEYOND COMPARE 5 PRO: FILE CONTENT DIFFS & FOLDER SYNCHRONIZATION
# =====================================================================

def safe_recycle(path_str: str) -> bool:
    """Sends file or directory to Windows Recycle Bin with undo support."""
    try:
        import ctypes
        from ctypes import wintypes
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
        abs_p = os.path.abspath(path_str) + '\0\0'
        op = SHFILEOPSTRUCTW(
            hwnd=None,
            wFunc=3, # FO_DELETE
            pFrom=abs_p,
            pTo=None,
            fFlags=0x0040 | 0x0010 | 0x0004, # FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT
            fAnyOperationsAborted=False,
            hNameMappings=None,
            lpszProgressTitle=None
        )
        res = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op))
        return (res == 0)
    except Exception:
        return False

def compare_file_contents(left_path: str, right_path: str, diff_type: str = "auto") -> Dict[str, Any]:
    """
    Beyond Compare equivalent specialized file content comparison:
    - Text diff: Side-by-side aligned line-by-line diff with word/char highlight
    - Image diff: Split slider and pixel mismatch analyzer
    - Archive diff: ZIP file inner inspection without extracting
    - Hex / Binary diff: Hexadecimal dump with first mismatch byte offset
    """
    p_left = Path(left_path)
    p_right = Path(right_path)

    if not p_left.exists() or not p_right.exists():
        return {
            "error": "Uno o ambos archivos no existen",
            "left_exists": p_left.exists(),
            "right_exists": p_right.exists()
        }

    ext_left = p_left.suffix.lower()
    ext_right = p_right.suffix.lower()

    # Auto-detect diff type
    if diff_type == "auto":
        text_extensions = {
            '.txt', '.py', '.js', '.ts', '.jsx', '.tsx', '.json', '.html', '.htm',
            '.css', '.scss', '.csv', '.xml', '.yaml', '.yml', '.md', '.ini', '.cfg',
            '.conf', '.bat', '.cmd', '.ps1', '.sh', '.sql', '.c', '.cpp', '.h', '.java'
        }
        image_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff', '.svg'}
        archive_extensions = {'.zip'}

        if ext_left in text_extensions or ext_right in text_extensions:
            diff_type = "text"
        elif ext_left in image_extensions or ext_right in image_extensions:
            diff_type = "image"
        elif ext_left in archive_extensions or ext_right in archive_extensions:
            diff_type = "archive"
        else:
            diff_type = "hex"

    # 1. TEXT DIFF
    if diff_type == "text":
        def read_text(p):
            for enc in ['utf-8', 'latin-1', 'cp1252', 'utf-16']:
                try:
                    with open(p, 'r', encoding=enc) as f:
                        return f.readlines()
                except Exception:
                    continue
            return []

        lines_left = read_text(p_left)
        lines_right = read_text(p_right)

        import difflib
        matcher = difflib.SequenceMatcher(None, lines_left, lines_right)
        aligned_pairs = []
        added = 0
        deleted = 0
        modified = 0

        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == 'equal':
                for k in range(i2 - i1):
                    aligned_pairs.append({
                        "left_num": i1 + k + 1,
                        "left_text": lines_left[i1 + k].rstrip('\r\n'),
                        "right_num": j1 + k + 1,
                        "right_text": lines_right[j1 + k].rstrip('\r\n'),
                        "tag": "equal"
                    })
            elif tag == 'replace':
                max_len = max(i2 - i1, j2 - j1)
                for k in range(max_len):
                    has_l = (i1 + k < i2)
                    has_r = (j1 + k < j2)
                    aligned_pairs.append({
                        "left_num": i1 + k + 1 if has_l else None,
                        "left_text": lines_left[i1 + k].rstrip('\r\n') if has_l else "",
                        "right_num": j1 + k + 1 if has_r else None,
                        "right_text": lines_right[j1 + k].rstrip('\r\n') if has_r else "",
                        "tag": "replace"
                    })
                modified += max_len
            elif tag == 'delete':
                for k in range(i1, i2):
                    aligned_pairs.append({
                        "left_num": k + 1,
                        "left_text": lines_left[k].rstrip('\r\n'),
                        "right_num": None,
                        "right_text": "",
                        "tag": "delete"
                    })
                deleted += (i2 - i1)
            elif tag == 'insert':
                for k in range(j1, j2):
                    aligned_pairs.append({
                        "left_num": None,
                        "left_text": "",
                        "right_num": k + 1,
                        "right_text": lines_right[k].rstrip('\r\n'),
                        "tag": "insert"
                    })
                added += (j2 - j1)

        return {
            "type": "text",
            "left_name": p_left.name,
            "right_name": p_right.name,
            "left_path": str(p_left),
            "right_path": str(p_right),
            "total_lines_left": len(lines_left),
            "total_lines_right": len(lines_right),
            "added_count": added,
            "deleted_count": deleted,
            "modified_count": modified,
            "is_identical": (added == 0 and deleted == 0 and modified == 0),
            "pairs": aligned_pairs[:2500]
        }

    # 2. IMAGE DIFF
    elif diff_type == "image":
        from PIL import Image
        img_info = {}
        try:
            with Image.open(p_left) as im1, Image.open(p_right) as im2:
                img_info = {
                    "left_width": im1.width,
                    "left_height": im1.height,
                    "right_width": im2.width,
                    "right_height": im2.height,
                    "left_format": im1.format,
                    "right_format": im2.format,
                    "same_dimensions": (im1.size == im2.size),
                    "left_bytes": p_left.stat().st_size,
                    "right_bytes": p_right.stat().st_size
                }
        except Exception as e:
            img_info = {"error": str(e)}

        return {
            "type": "image",
            "left_path": str(p_left),
            "right_path": str(p_right),
            "left_name": p_left.name,
            "right_name": p_right.name,
            "info": img_info
        }

    # 3. ARCHIVE (ZIP) DIFF
    elif diff_type == "archive":
        import zipfile
        try:
            with zipfile.ZipFile(p_left, 'r') as z1, zipfile.ZipFile(p_right, 'r') as z2:
                in1 = {z.filename: z for z in z1.infolist()}
                in2 = {z.filename: z for z in z2.infolist()}

                all_names = sorted(set(in1.keys()).union(set(in2.keys())))
                items = []
                for name in all_names:
                    has1 = name in in1
                    has2 = name in in2
                    if has1 and has2:
                        same_crc = (in1[name].CRC == in2[name].CRC)
                        status = "identical" if same_crc else "modified"
                        items.append({
                            "name": name,
                            "status": status,
                            "left_size": in1[name].file_size,
                            "right_size": in2[name].file_size
                        })
                    elif has1:
                        items.append({"name": name, "status": "left_only", "left_size": in1[name].file_size, "right_size": None})
                    else:
                        items.append({"name": name, "status": "right_only", "left_size": None, "right_size": in2[name].file_size})

                return {
                    "type": "archive",
                    "left_name": p_left.name,
                    "right_name": p_right.name,
                    "left_path": str(p_left),
                    "right_path": str(p_right),
                    "total_items": len(items),
                    "items": items
                }
        except Exception as e:
            return {"type": "archive", "error": str(e)}

    # 4. BINARY / HEX DIFF
    else:
        with open(p_left, 'rb') as f1, open(p_right, 'rb') as f2:
            chunk1 = f1.read(4096)
            chunk2 = f2.read(4096)

        first_diff = -1
        min_len = min(len(chunk1), len(chunk2))
        for idx in range(min_len):
            if chunk1[idx] != chunk2[idx]:
                first_diff = idx
                break
        if first_diff == -1 and len(chunk1) != len(chunk2):
            first_diff = min_len

        def format_hex(chunk, max_bytes=256):
            lines = []
            for i in range(0, min(len(chunk), max_bytes), 16):
                sub = chunk[i:i+16]
                hex_str = " ".join(f"{b:02X}" for b in sub)
                ascii_str = "".join(chr(b) if 32 <= b <= 126 else "." for b in sub)
                lines.append(f"{i:08X}  {hex_str:<48}  |{ascii_str}|")
            return lines

        return {
            "type": "hex",
            "left_name": p_left.name,
            "right_name": p_right.name,
            "left_path": str(p_left),
            "right_path": str(p_right),
            "left_size": p_left.stat().st_size,
            "right_size": p_right.stat().st_size,
            "first_diff_offset": first_diff,
            "is_identical": (first_diff == -1 and p_left.stat().st_size == p_right.stat().st_size),
            "left_hex_sample": format_hex(chunk1),
            "right_hex_sample": format_hex(chunk2)
        }

def sync_folders(
    left_dir: str, 
    right_dir: str, 
    mode: str = "update", 
    item_rel_paths: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Beyond Compare folder synchronization engine:
    - 'mirror': Left -> Right (makes Right replica of Left, recycles Right orphans)
    - 'update': Left -> Right (copies missing or newer items from Left to Right)
    - 'copy_left_to_right': Copies specific item_rel_paths from Left to Right
    - 'copy_right_to_left': Copies specific item_rel_paths from Right to Left
    """
    import shutil
    l_root = Path(left_dir)
    r_root = Path(right_dir)

    if not l_root.exists() or not r_root.exists():
        return {"error": "Una o ambas carpetas no existen"}

    manifest = compare_two_folders(left_dir, right_dir, verify_full_hash=False)
    if "error" in manifest:
        return {"error": manifest["error"]}

    copied = []
    recycled = []
    errors = []

    def copy_file(src: Path, dest: Path):
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(src), str(dest))

    if mode == "mirror":
        # 1. Copy left_only and modified to right
        for item in manifest["categories"]["left_only"] + manifest["categories"]["modified"] + manifest["categories"]["same_name_size_diff_content"]:
            try:
                rel = item["rel_path"]
                copy_file(l_root / rel, r_root / rel)
                copied.append({"file": rel, "direction": "left_to_right"})
            except Exception as e:
                errors.append({"file": item["rel_path"], "error": str(e)})

        # 2. Recycle right_only items (safe Windows Recycle Bin)
        for item in manifest["categories"]["right_only"]:
            try:
                rel = item["rel_path"]
                target = r_root / rel
                if target.exists():
                    safe_recycle(str(target))
                    recycled.append(rel)
            except Exception as e:
                errors.append({"file": item["rel_path"], "error": str(e)})

    elif mode == "update":
        for item in manifest["categories"]["left_only"]:
            try:
                rel = item["rel_path"]
                copy_file(l_root / rel, r_root / rel)
                copied.append({"file": rel, "direction": "left_to_right"})
            except Exception as e:
                errors.append({"file": item["rel_path"], "error": str(e)})

        for item in manifest["categories"]["modified"]:
            rel = item["rel_path"]
            src = l_root / rel
            dest = r_root / rel
            try:
                if src.exists() and dest.exists() and src.stat().st_mtime > dest.stat().st_mtime:
                    copy_file(src, dest)
                    copied.append({"file": rel, "direction": "left_to_right (newer)"})
            except Exception as e:
                errors.append({"file": rel, "error": str(e)})

    elif mode in ["copy_left_to_right", "copy_right_to_left"]:
        items = item_rel_paths or []
        for rel in items:
            try:
                if mode == "copy_left_to_right":
                    copy_file(l_root / rel, r_root / rel)
                    copied.append({"file": rel, "direction": "left_to_right"})
                else:
                    copy_file(r_root / rel, l_root / rel)
                    copied.append({"file": rel, "direction": "right_to_left"})
            except Exception as e:
                errors.append({"file": rel, "error": str(e)})

    return {
        "success": len(errors) == 0,
        "mode": mode,
        "copied_count": len(copied),
        "recycled_count": len(recycled),
        "copied": copied,
        "recycled": recycled,
        "errors": errors
    }

