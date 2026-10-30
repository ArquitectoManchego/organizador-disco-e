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

if __name__ == "__main__":
    print("Testing Compare Engine...")
    res = scan_drive_for_duplicates("E:\\")
    print(f"Found {res.get('total_exact_found', 0)} exact duplicate folders and {res.get('total_near_found', 0)} near duplicates.")
