import os
import sys
import time
import sqlite3
import threading
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from database import get_connection

def compute_squarified_treemap(items: List[Dict[str, Any]], x: float, y: float, w: float, h: float) -> List[Dict[str, Any]]:
    """
    Standard Squarified Treemap Layout Algorithm (Bruls, Huizing, van Wijk).
    Subdivides rectangle (x, y, w, h) into tiles proportional to item['value'].
    """
    if not items or w <= 0 or h <= 0:
        return []

    valid_items = [it for it in items if it.get("value", 0) > 0]
    if not valid_items:
        return []

    valid_items.sort(key=lambda it: it["value"], reverse=True)
    total_val = sum(it["value"] for it in valid_items)
    if total_val <= 0:
        return []

    results = []

    def worst_aspect_ratio(row: List[float], side: float) -> float:
        s = sum(row)
        if s == 0 or side == 0:
            return float('inf')
        max_v = max(row)
        min_v = min(row)
        return max((side**2 * max_v) / (s**2), (s**2) / (side**2 * min_v))

    def layout_row(row_items: List[Dict[str, Any]], rx: float, ry: float, rw: float, rh: float, horizontal: bool) -> Tuple[float, float, float, float]:
        row_sum = sum(it["norm_val"] for it in row_items)
        if horizontal:
            row_width = row_sum / rh if rh > 0 else 0
            cur_y = ry
            for it in row_items:
                item_h = (it["norm_val"] / row_sum) * rh if row_sum > 0 else 0
                results.append({
                    **it,
                    "rect": {
                        "x": round(rx, 2),
                        "y": round(cur_y, 2),
                        "w": round(row_width, 2),
                        "h": round(item_h, 2)
                    }
                })
                cur_y += item_h
            return rx + row_width, ry, rw - row_width, rh
        else:
            row_height = row_sum / rw if rw > 0 else 0
            cur_x = rx
            for it in row_items:
                item_w = (it["norm_val"] / row_sum) * rw if row_sum > 0 else 0
                results.append({
                    **it,
                    "rect": {
                        "x": round(cur_x, 2),
                        "y": round(ry, 2),
                        "w": round(item_w, 2),
                        "h": round(row_height, 2)
                    }
                })
                cur_x += item_w
            return rx, ry + row_height, rw, rh - row_height

    total_area = w * h
    for it in valid_items:
        it["norm_val"] = (it["value"] / total_val) * total_area

    curr_x, curr_y, curr_w, curr_h = x, y, w, h
    row: List[Dict[str, Any]] = []

    remaining = list(valid_items)
    while remaining:
        horizontal = curr_w >= curr_h
        side = curr_h if horizontal else curr_w

        it = remaining[0]
        new_row_vals = [r["norm_val"] for r in row] + [it["norm_val"]]

        if not row:
            row.append(remaining.pop(0))
        elif worst_aspect_ratio(new_row_vals, side) <= worst_aspect_ratio([r["norm_val"] for r in row], side):
            row.append(remaining.pop(0))
        else:
            curr_x, curr_y, curr_w, curr_h = layout_row(row, curr_x, curr_y, curr_w, curr_h, horizontal)
            row = []

    if row:
        horizontal = curr_w >= curr_h
        layout_row(row, curr_x, curr_y, curr_w, curr_h, horizontal)

    return results

def get_nested_treemap(parent_path: str = "E:\\", canvas_w: float = 1200, canvas_h: float = 700, 
                       max_nesting_depth: int = 4) -> Dict[str, Any]:
    """
    Genuine Hierarchical Nested Treemap (FolderSizes Space Map equivalent):
    Recursively subdivides folders into their subfolders and files.
    Each nesting level is framed with graded gray borders and distinct depth headers:
    - Level 1: Darkest gray/charcoal (#0f172a, 2.5px solid)
    - Level 2: Medium-dark slate (#334155, 2px solid)
    - Level 3: Soft slate (#475569, 1.5px solid)
    - Level 4: Light slate (#64748b, 1px solid)
    Leaf files and terminal items are filled colorful cushions with category/extension colors.
    """
    conn = get_connection()
    cursor = conn.cursor()

    norm_parent = parent_path.rstrip("\\")
    is_root = (parent_path in ["E:\\", "E:", "E:/", ""])

    # Preload all active folders
    cursor.execute("""
    SELECT path, name, parent_path, depth, size_bytes, file_count, subfolder_count, category, status, owner 
    FROM folders WHERE size_bytes > 0;
    """)
    folders_by_parent: Dict[str, List[Dict[str, Any]]] = {}
    folder_dict: Dict[str, Dict[str, Any]] = {}
    for r in cursor.fetchall():
        d = dict(r)
        folder_dict[d["path"]] = d
        p = d["parent_path"].rstrip("\\")
        folders_by_parent.setdefault(p, []).append(d)

    # Preload top files per folder (> 10KB)
    cursor.execute("""
    SELECT path, name, folder_path, extension, size_bytes, category, status, owner, mtime
    FROM files 
    WHERE size_bytes > 10240
    ORDER BY size_bytes DESC;
    """)
    files_by_folder: Dict[str, List[Dict[str, Any]]] = {}
    for r in cursor.fetchall():
        d = dict(r)
        p = d["folder_path"].rstrip("\\")
        if len(files_by_folder.setdefault(p, [])) < 30:
            files_by_folder[p].append(d)

    # Preload tags
    cursor.execute("""
    SELECT it.item_path, it.item_type, t.id, t.name, t.color, t.tag_type
    FROM item_tags it
    JOIN tags t ON it.tag_id = t.id
    """)
    tag_map: Dict[str, List[Dict[str, Any]]] = {}
    for r in cursor.fetchall():
        p = r["item_path"]
        tag_map.setdefault(p, []).append({
            "id": r["id"],
            "name": r["name"],
            "color": r["color"],
            "type": r["tag_type"]
        })

    conn.close()

    def build_nested_node(path: str, name: str, item_type: str, size_bytes: int,
                          x: float, y: float, w: float, h: float, level: int = 1) -> Dict[str, Any]:
        norm_p = path.rstrip("\\")
        subfolders = folders_by_parent.get(norm_p, [])
        child_files = files_by_folder.get(norm_p, [])

        children_items = []
        for sf in subfolders:
            val = sf["size_bytes"]
            if val > 0:
                children_items.append({
                    "id": sf["path"],
                    "path": sf["path"],
                    "name": sf["name"],
                    "type": "folder",
                    "value": val,
                    "category": sf.get("category") or "Sin Categoría",
                    "status": sf.get("status") or "Por Revisar",
                    "owner": sf.get("owner") or "Alex",
                    "subfolder_count": sf.get("subfolder_count", 0),
                    "file_count": sf.get("file_count", 0),
                    "tags": tag_map.get(sf["path"], [])
                })

        for cf in child_files:
            val = cf["size_bytes"]
            if val > 0:
                children_items.append({
                    "id": cf["path"],
                    "path": cf["path"],
                    "name": cf["name"],
                    "folder_path": cf.get("folder_path", ""),
                    "type": "file",
                    "value": val,
                    "extension": cf.get("extension", ""),
                    "category": cf.get("category") or "Otros Archivos",
                    "status": cf.get("status") or "Por Revisar",
                    "owner": cf.get("owner") or "Alex",
                    "mtime": cf.get("mtime", 0),
                    "tags": tag_map.get(cf["path"], [])
                })

        can_subdivide = (level < max_nesting_depth and len(children_items) > 0 and w >= 45 and h >= 36)

        node = {
            "id": path,
            "path": path,
            "name": name,
            "type": item_type,
            "level": level,
            "size_bytes": size_bytes,
            "value": size_bytes,
            "rect": {"x": round(x, 1), "y": round(y, 1), "w": round(w, 1), "h": round(h, 1)},
            "is_container": can_subdivide,
            "children": []
        }

        if can_subdivide:
            header_h = 20 if level == 1 else (16 if level == 2 else 14)
            pad = 3.5 if level == 1 else (2.5 if level == 2 else 1.5)
            inner_x = x + pad
            inner_y = y + header_h + pad
            inner_w = max(0.0, w - 2 * pad)
            inner_h = max(0.0, h - header_h - 2 * pad)

            if inner_w >= 15 and inner_h >= 15:
                layout_children = compute_squarified_treemap(children_items, inner_x, inner_y, inner_w, inner_h)
                for c_lay in layout_children:
                    cr = c_lay["rect"]
                    child_node = build_nested_node(
                        c_lay["path"], c_lay["name"], c_lay["type"], c_lay["value"],
                        cr["x"], cr["y"], cr["w"], cr["h"], level=level + 1
                    )
                    child_node["category"] = c_lay.get("category", "Sin Categoría")
                    child_node["status"] = c_lay.get("status", "Por Revisar")
                    child_node["owner"] = c_lay.get("owner", "Alex")
                    child_node["tags"] = c_lay.get("tags", [])
                    if c_lay["type"] == "file":
                        child_node["extension"] = c_lay.get("extension", "")
                        child_node["mtime"] = c_lay.get("mtime", 0)
                    node["children"].append(child_node)

        return node

    # Start from root or parent_path
    if is_root:
        root_children = folders_by_parent.get("E:", [])
        if not root_children:
            root_children = [f for f in folder_dict.values() if f.get("depth") == 1]
    else:
        root_children = folders_by_parent.get(norm_parent, [])

    root_items = []
    for f in root_children:
        if f["size_bytes"] > 0:
            root_items.append({
                "id": f["path"],
                "path": f["path"],
                "name": f["name"],
                "type": "folder",
                "value": f["size_bytes"],
                "category": f.get("category", "Sin Categoría"),
                "status": f.get("status", "Por Revisar"),
                "owner": f.get("owner", "Alex"),
                "subfolder_count": f.get("subfolder_count", 0),
                "file_count": f.get("file_count", 0),
                "tags": tag_map.get(f["path"], [])
            })

    if not is_root:
        for cf in files_by_folder.get(norm_parent, []):
            if cf["size_bytes"] > 0:
                root_items.append({
                    "id": cf["path"],
                    "path": cf["path"],
                    "name": cf["name"],
                    "type": "file",
                    "value": cf["size_bytes"],
                    "extension": cf.get("extension", ""),
                    "category": cf.get("category", "Otros Archivos"),
                    "status": cf.get("status", "Por Revisar"),
                    "owner": cf.get("owner", "Alex"),
                    "mtime": cf.get("mtime", 0),
                    "tags": tag_map.get(cf["path"], [])
                })

    root_layout = compute_squarified_treemap(root_items, 0, 0, canvas_w, canvas_h)
    nested_roots = []
    total_bytes = 0

    for r in root_layout:
        rect = r["rect"]
        n = build_nested_node(
            r["path"], r["name"], r["type"], r["value"],
            rect["x"], rect["y"], rect["w"], rect["h"], level=1
        )
        n["category"] = r.get("category", "Sin Categoría")
        n["status"] = r.get("status", "Por Revisar")
        n["owner"] = r.get("owner", "Alex")
        n["tags"] = r.get("tags", [])
        if r["type"] == "file":
            n["extension"] = r.get("extension", "")
        nested_roots.append(n)
        total_bytes += r["value"]

    return {
        "parent_path": parent_path,
        "view_mode": "nested",
        "canvas_w": canvas_w,
        "canvas_h": canvas_h,
        "total_items": len(nested_roots),
        "total_bytes": total_bytes,
        "nodes": nested_roots
    }

def get_folder_treemap(parent_path: str = "E:\\", canvas_w: float = 1200, canvas_h: float = 700, 
                       view_mode: str = "nested", top_files_limit: int = 150) -> Dict[str, Any]:
    """
    Returns Treemap blocks supporting:
    - view_mode = 'nested' or 'both' (Genuine FolderSizes Nested Treemap with Subdivisions & Graded Gray Borders)
    - view_mode = 'files' (Top largest files directly)
    - view_mode = 'folders' (Folders only single-level)
    """
    if view_mode in ["nested", "both"]:
        return get_nested_treemap(parent_path=parent_path, canvas_w=canvas_w, canvas_h=canvas_h)

    conn = get_connection()
    cursor = conn.cursor()

    norm_parent = parent_path.rstrip("\\")
    is_root = (parent_path in ["E:\\", "E:", "E:/", ""])

    folder_rows = []
    file_rows = []

    # Fetch tag associations
    cursor.execute("""
    SELECT it.item_path, it.item_type, t.id, t.name, t.color, t.tag_type
    FROM item_tags it
    JOIN tags t ON it.tag_id = t.id
    """)
    tag_map: Dict[str, List[Dict[str, Any]]] = {}
    for r in cursor.fetchall():
        p = r["item_path"]
        if p not in tag_map:
            tag_map[p] = []
        tag_map[p].append({
            "id": r["id"],
            "name": r["name"],
            "color": r["color"],
            "type": r["tag_type"]
        })

    # Subfolders
    if view_mode in ["folders", "both"]:
        if is_root:
            cursor.execute("""
            SELECT f.path, f.name, f.depth, f.size_bytes, f.file_count, f.subfolder_count, 
                   f.category, f.status, f.owner
            FROM folders f
            WHERE f.depth = 1
            ORDER BY f.size_bytes DESC;
            """)
        else:
            cursor.execute("""
            SELECT f.path, f.name, f.depth, f.size_bytes, f.file_count, f.subfolder_count, 
                   f.category, f.status, f.owner
            FROM folders f
            WHERE (f.parent_path = ? OR f.parent_path = ?) AND f.path != ?
            ORDER BY f.size_bytes DESC;
            """, (norm_parent, norm_parent + "\\", parent_path))
        folder_rows = [dict(r) for r in cursor.fetchall()]

    # Files
    if view_mode in ["files", "both"]:
        if view_mode == "files":
            # Return top largest files across the entire scope
            if is_root:
                cursor.execute("""
                SELECT f.path, f.name, f.folder_path, f.size_bytes, f.extension, f.category, f.status, f.owner, f.mtime
                FROM files f
                ORDER BY f.size_bytes DESC
                LIMIT ?;
                """, (top_files_limit,))
            else:
                cursor.execute("""
                SELECT f.path, f.name, f.folder_path, f.size_bytes, f.extension, f.category, f.status, f.owner, f.mtime
                FROM files f
                WHERE f.folder_path LIKE ? OR f.folder_path = ?
                ORDER BY f.size_bytes DESC
                LIMIT ?;
                """, (norm_parent + "%", parent_path, top_files_limit))
        else:
            # In 'both' mode: direct files in this folder
            cursor.execute("""
            SELECT f.path, f.name, f.folder_path, f.size_bytes, f.extension, f.category, f.status, f.owner, f.mtime
            FROM files f
            WHERE f.folder_path = ? OR f.folder_path = ?
            ORDER BY f.size_bytes DESC
            LIMIT ?;
            """, (norm_parent, norm_parent + "\\", top_files_limit))
            
            # If folder has no direct files but is root, include top files from drive
            direct_files = cursor.fetchall()
            if not direct_files and is_root:
                cursor.execute("""
                SELECT f.path, f.name, f.folder_path, f.size_bytes, f.extension, f.category, f.status, f.owner, f.mtime
                FROM files f
                ORDER BY f.size_bytes DESC
                LIMIT 50;
                """)
                direct_files = cursor.fetchall()
            file_rows = [dict(r) for r in direct_files]

        if view_mode == "files":
            file_rows = [dict(r) for r in cursor.fetchall()]

    conn.close()

    items = []
    # Folder nodes
    for f in folder_rows:
        val = f["size_bytes"]
        if val <= 0:
            val = max(f["file_count"] * 1024 * 1024, 1024 * 1024)

        t_list = tag_map.get(f["path"], [])
        items.append({
            "id": f["path"],
            "path": f["path"],
            "name": f["name"],
            "type": "folder",
            "value": val,
            "raw_size": f["size_bytes"],
            "file_count": f["file_count"],
            "subfolder_count": f["subfolder_count"],
            "category": f["category"] or "Sin Categoría",
            "status": f["status"] or "Por Revisar",
            "owner": f["owner"] or "Alex",
            "tags": t_list,
            "tag_count": len(t_list)
        })

    # File nodes
    for f in file_rows:
        val = max(f["size_bytes"], 1024)
        t_list = tag_map.get(f["path"], [])
        items.append({
            "id": f["path"],
            "path": f["path"],
            "name": f["name"],
            "folder_path": f.get("folder_path", ""),
            "type": "file",
            "value": val,
            "raw_size": f["size_bytes"],
            "extension": f.get("extension", ""),
            "category": f.get("category") or "Otros Archivos",
            "status": f.get("status") or "Por Revisar",
            "owner": f.get("owner") or "Alex",
            "mtime": f.get("mtime", 0),
            "tags": t_list,
            "tag_count": len(t_list)
        })

    treemap_nodes = compute_squarified_treemap(items, 0, 0, canvas_w, canvas_h)
    total_bytes = sum(it["value"] for it in items)

    return {
        "parent_path": parent_path,
        "view_mode": view_mode,
        "total_items": len(items),
        "total_folders": len(folder_rows),
        "total_files": len(file_rows),
        "total_bytes": total_bytes,
        "nodes": treemap_nodes
    }

def get_tag_space_distribution() -> Dict[str, Any]:
    """
    Computes disk space and count distribution by tags, differentiating:
    - Folder Tags vs File Tags
    - Unique Tags (items with exactly 1 tag) vs Mixed Tags (items with 2+ tags) vs Untagged.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT t.id, t.name, t.tag_type, t.color,
           COUNT(DISTINCT CASE WHEN it.item_type = 'folder' THEN it.item_path END) as folder_count,
           COUNT(DISTINCT CASE WHEN it.item_type = 'file' THEN it.item_path END) as file_count,
           COALESCE(SUM(CASE WHEN it.item_type = 'folder' THEN f.size_bytes ELSE 0 END), 0) as folder_bytes,
           COALESCE(SUM(CASE WHEN it.item_type = 'file' THEN fi.size_bytes ELSE 0 END), 0) as file_bytes
    FROM tags t
    LEFT JOIN item_tags it ON t.id = it.tag_id
    LEFT JOIN folders f ON it.item_path = f.path AND it.item_type = 'folder'
    LEFT JOIN files fi ON it.item_path = fi.path AND it.item_type = 'file'
    GROUP BY t.id
    ORDER BY (folder_bytes + file_bytes) DESC, t.name ASC;
    """)
    tag_rows = [dict(r) for r in cursor.fetchall()]

    cursor.execute("""
    SELECT item_path, item_type, COUNT(tag_id) as tag_count
    FROM item_tags
    GROUP BY item_path, item_type
    """)
    item_tag_counts = cursor.fetchall()
    
    unique_items_count = sum(1 for r in item_tag_counts if r["tag_count"] == 1)
    mixed_items_count = sum(1 for r in item_tag_counts if r["tag_count"] > 1)

    cursor.execute("""
    SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_bytes
    FROM folders
    WHERE path NOT IN (SELECT item_path FROM item_tags WHERE item_type = 'folder')
      AND path != 'E:\\';
    """)
    untagged_folders = dict(cursor.fetchone())

    cursor.execute("""
    SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_bytes
    FROM files
    WHERE path NOT IN (SELECT item_path FROM item_tags WHERE item_type = 'file');
    """)
    untagged_files = dict(cursor.fetchone())

    tag_treemap_items = []
    for tr in tag_rows:
        total_items = tr["folder_count"] + tr["file_count"]
        val = tr["folder_bytes"] + tr["file_bytes"]
        if val <= 0:
            val = max(total_items * 1024 * 1024, 1024)
        if total_items > 0:
            tag_treemap_items.append({
                "id": f"tag_{tr['id']}",
                "tag_id": tr["id"],
                "name": tr["name"],
                "tag_type": tr["tag_type"],
                "color": tr["color"],
                "folder_count": tr["folder_count"],
                "file_count": tr["file_count"],
                "value": val,
                "type": "tag_group"
            })

    tag_treemap_nodes = compute_squarified_treemap(tag_treemap_items, 0, 0, 1200, 700)
    conn.close()

    return {
        "tags_summary": tag_rows,
        "unique_tags_items_count": unique_items_count,
        "mixed_tags_items_count": mixed_items_count,
        "untagged": {
            "folders": untagged_folders,
            "files": untagged_files
        },
        "tag_treemap": tag_treemap_nodes
    }

def get_files_analysis(parent_path: Optional[str] = None, limit_largest: int = 100) -> Dict[str, Any]:
    """
    FolderSizes deep file analysis suite:
    1. Largest Files report (top N files with path, size, date, category, tags)
    2. File Types / Extensions breakdown (count, total bytes, % space, avg size)
    3. File Size distribution brackets (>1GB, 100MB-1GB, 10-100MB, 1-10MB, 100KB-1MB, <100KB)
    4. File Age / Date distribution brackets (<30 days, 1-6m, 6-12m, 1-3y, >3y)
    5. File Tag space partition (Unique, Mixed, Untagged)
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Base filters
    where_clause = ""
    params: List[Any] = []
    if parent_path and parent_path not in ["E:\\", "E:", "E:/", ""]:
        norm_parent = parent_path.rstrip("\\")
        where_clause = "WHERE f.folder_path LIKE ? OR f.folder_path = ?"
        params = [norm_parent + "%", norm_parent]

    # Global total
    cursor.execute(f"SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM files f {where_clause};", params)
    total_files_count, total_files_bytes = cursor.fetchone()
    if total_files_bytes <= 0:
        total_files_bytes = 1

    # 1. Largest Files
    cursor.execute(f"""
    SELECT f.path, f.name, f.folder_path, f.extension, f.size_bytes, f.mtime, f.category, f.status, f.owner
    FROM files f
    {where_clause}
    ORDER BY f.size_bytes DESC
    LIMIT ?;
    """, params + [limit_largest])
    largest_raw = [dict(r) for r in cursor.fetchall()]

    # Fetch tags for largest files
    largest_paths = [r["path"] for r in largest_raw]
    tag_lookup: Dict[str, List[Dict[str, Any]]] = {}
    if largest_paths:
        placeholders = ",".join("?" for _ in largest_paths)
        cursor.execute(f"""
        SELECT it.item_path, t.id, t.name, t.color, t.tag_type
        FROM item_tags it
        JOIN tags t ON it.tag_id = t.id
        WHERE it.item_path IN ({placeholders}) AND it.item_type = 'file'
        """, largest_paths)
        for r in cursor.fetchall():
            p = r["item_path"]
            if p not in tag_lookup:
                tag_lookup[p] = []
            tag_lookup[p].append({
                "id": r["id"],
                "name": r["name"],
                "color": r["color"],
                "type": r["tag_type"]
            })

    largest_files = []
    for r in largest_raw:
        pct = (r["size_bytes"] / total_files_bytes) * 100 if total_files_bytes > 0 else 0
        largest_files.append({
            **r,
            "percentage": round(pct, 2),
            "tags": tag_lookup.get(r["path"], [])
        })

    # 2. File Types / Extensions Breakdown
    cursor.execute(f"""
    SELECT 
        CASE WHEN f.extension = '' THEN '(sin extensión)' ELSE LOWER(f.extension) END as ext,
        COUNT(*) as count,
        SUM(f.size_bytes) as total_bytes,
        AVG(f.size_bytes) as avg_bytes,
        f.category
    FROM files f
    {where_clause}
    GROUP BY ext
    ORDER BY total_bytes DESC
    LIMIT 30;
    """, params)
    file_types = []
    for r in cursor.fetchall():
        ext_bytes = r["total_bytes"] or 0
        pct = (ext_bytes / total_files_bytes) * 100 if total_files_bytes > 0 else 0
        file_types.append({
            "extension": r["ext"],
            "count": r["count"],
            "total_bytes": ext_bytes,
            "avg_bytes": round(r["avg_bytes"] or 0),
            "percentage": round(pct, 2),
            "category": r["category"]
        })

    # 3. File Size Distribution Brackets
    cursor.execute(f"""
    SELECT
        COUNT(CASE WHEN size_bytes >= 1073741824 THEN 1 END) as giga_count,
        COALESCE(SUM(CASE WHEN size_bytes >= 1073741824 THEN size_bytes END), 0) as giga_bytes,

        COUNT(CASE WHEN size_bytes >= 104857600 AND size_bytes < 1073741824 THEN 1 END) as very_large_count,
        COALESCE(SUM(CASE WHEN size_bytes >= 104857600 AND size_bytes < 1073741824 THEN size_bytes END), 0) as very_large_bytes,

        COUNT(CASE WHEN size_bytes >= 10485760 AND size_bytes < 104857600 THEN 1 END) as large_count,
        COALESCE(SUM(CASE WHEN size_bytes >= 10485760 AND size_bytes < 104857600 THEN size_bytes END), 0) as large_bytes,

        COUNT(CASE WHEN size_bytes >= 1048576 AND size_bytes < 10485760 THEN 1 END) as medium_count,
        COALESCE(SUM(CASE WHEN size_bytes >= 1048576 AND size_bytes < 10485760 THEN size_bytes END), 0) as medium_bytes,

        COUNT(CASE WHEN size_bytes >= 102400 AND size_bytes < 1048576 THEN 1 END) as small_count,
        COALESCE(SUM(CASE WHEN size_bytes >= 102400 AND size_bytes < 1048576 THEN size_bytes END), 0) as small_bytes,

        COUNT(CASE WHEN size_bytes < 102400 THEN 1 END) as tiny_count,
        COALESCE(SUM(CASE WHEN size_bytes < 102400 THEN size_bytes END), 0) as tiny_bytes
    FROM files f
    {where_clause};
    """, params)
    sz = dict(cursor.fetchone())

    size_brackets = [
        {"name": "Gigantesco (> 1 GB)", "code": "gigantic", "count": sz["giga_count"], "bytes": sz["giga_bytes"], "color": "#ef4444"},
        {"name": "Muy Grande (100 MB – 1 GB)", "code": "very_large", "count": sz["very_large_count"], "bytes": sz["very_large_bytes"], "color": "#f97316"},
        {"name": "Grande (10 MB – 100 MB)", "code": "large", "count": sz["large_count"], "bytes": sz["large_bytes"], "color": "#f59e0b"},
        {"name": "Mediano (1 MB – 10 MB)", "code": "medium", "count": sz["medium_count"], "bytes": sz["medium_bytes"], "color": "#10b981"},
        {"name": "Pequeño (100 KB – 1 MB)", "code": "small", "count": sz["small_count"], "bytes": sz["small_bytes"], "color": "#06b6d4"},
        {"name": "Diminuto (< 100 KB)", "code": "tiny", "count": sz["tiny_count"], "bytes": sz["tiny_bytes"], "color": "#6366f1"}
    ]
    for b in size_brackets:
        b["percentage_bytes"] = round((b["bytes"] / total_files_bytes) * 100, 2) if total_files_bytes > 0 else 0
        b["percentage_count"] = round((b["count"] / total_files_count) * 100, 2) if total_files_count > 0 else 0

    # 4. File Age / Date Distribution Brackets
    now = time.time()
    day = 86400
    cursor.execute(f"""
    SELECT
        COUNT(CASE WHEN mtime >= {now - 30*day} THEN 1 END) as recent_count,
        COALESCE(SUM(CASE WHEN mtime >= {now - 30*day} THEN size_bytes END), 0) as recent_bytes,

        COUNT(CASE WHEN mtime >= {now - 180*day} AND mtime < {now - 30*day} THEN 1 END) as m1_6_count,
        COALESCE(SUM(CASE WHEN mtime >= {now - 180*day} AND mtime < {now - 30*day} THEN size_bytes END), 0) as m1_6_bytes,

        COUNT(CASE WHEN mtime >= {now - 365*day} AND mtime < {now - 180*day} THEN 1 END) as m6_12_count,
        COALESCE(SUM(CASE WHEN mtime >= {now - 365*day} AND mtime < {now - 180*day} THEN size_bytes END), 0) as m6_12_bytes,

        COUNT(CASE WHEN mtime >= {now - 3*365*day} AND mtime < {now - 365*day} THEN 1 END) as y1_3_count,
        COALESCE(SUM(CASE WHEN mtime >= {now - 3*365*day} AND mtime < {now - 365*day} THEN size_bytes END), 0) as y1_3_bytes,

        COUNT(CASE WHEN mtime < {now - 3*365*day} THEN 1 END) as y3_plus_count,
        COALESCE(SUM(CASE WHEN mtime < {now - 3*365*day} THEN size_bytes END), 0) as y3_plus_bytes
    FROM files f
    {where_clause};
    """, params)
    ag = dict(cursor.fetchone())

    age_brackets = [
        {"name": "Recientes (< 30 días)", "count": ag["recent_count"], "bytes": ag["recent_bytes"], "color": "#10b981"},
        {"name": "1 a 6 meses", "count": ag["m1_6_count"], "bytes": ag["m1_6_bytes"], "color": "#06b6d4"},
        {"name": "6 a 12 meses", "count": ag["m6_12_count"], "bytes": ag["m6_12_bytes"], "color": "#f59e0b"},
        {"name": "1 a 3 años", "count": ag["y1_3_count"], "bytes": ag["y1_3_bytes"], "color": "#f97316"},
        {"name": "Antiguos (> 3 años)", "count": ag["y3_plus_count"], "bytes": ag["y3_plus_bytes"], "color": "#64748b"}
    ]
    for b in age_brackets:
        b["percentage_bytes"] = round((b["bytes"] / total_files_bytes) * 100, 2) if total_files_bytes > 0 else 0
        b["percentage_count"] = round((b["count"] / total_files_count) * 100, 2) if total_files_count > 0 else 0

    # 5. File Tags Breakdown
    cursor.execute("""
    SELECT 
        COUNT(DISTINCT it.item_path) as tagged_files_count,
        COALESCE(SUM(f.size_bytes), 0) as tagged_files_bytes
    FROM item_tags it
    JOIN files f ON it.item_path = f.path
    WHERE it.item_type = 'file';
    """)
    t_summary = dict(cursor.fetchone())

    conn.close()

    return {
        "parent_path": parent_path or "E:\\",
        "total_files": total_files_count,
        "total_bytes": total_files_bytes,
        "largest_files": largest_files,
        "file_types": file_types,
        "size_brackets": size_brackets,
        "age_brackets": age_brackets,
        "tags_summary": {
            "tagged_count": t_summary["tagged_files_count"],
            "tagged_bytes": t_summary["tagged_files_bytes"],
            "untagged_count": max(0, total_files_count - t_summary["tagged_files_count"]),
            "untagged_bytes": max(0, total_files_bytes - t_summary["tagged_files_bytes"])
        }
    }

class FileAnalysisManager:
    """
    Background worker that runs the full disk scan and file analysis on PC Local.
    Allows remote triggering from Vercel / Phone with real-time status.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self.is_running = False
        self.status = "idle"
        self.files_scanned = 0
        self.total_bytes = 0
        self.current_folder = ""
        self.start_time = 0.0
        self.elapsed_seconds = 0.0
        self.last_completed_at = 0.0
        self.error_message = ""
        self.thread: Optional[threading.Thread] = None

    def start_analysis(self, root_dir: str = "E:\\") -> Dict[str, Any]:
        with self._lock:
            if self.is_running:
                return {"status": "already_running", "files_scanned": self.files_scanned}

            self.is_running = True
            self.status = "running"
            self.files_scanned = 0
            self.total_bytes = 0
            self.current_folder = root_dir
            self.start_time = time.time()
            self.elapsed_seconds = 0.0
            self.error_message = ""

            self.thread = threading.Thread(target=self._run_scan_worker, args=(root_dir,), daemon=True)
            self.thread.start()
            return {"status": "started", "root_dir": root_dir}

    def _get_ext_category(self, ext: str) -> Tuple[str, List[str]]:
        ext = ext.lower()
        if ext in {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.raw', '.cr2', '.nef', '.heic', '.gif', '.tiff', '.psd'}:
            return 'Fotografía & Álbumes', ['Fotos Personales']
        elif ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.flv', '.webm'}:
            return 'Videos & Ejercicio', ['Grabaciones & Videos']
        elif ext in {'.exe', '.msi', '.iso', '.dmg', '.pkg', '.apk', '.bin'}:
            return 'Software & Instaladores', ['Instaladores & ISO']
        elif ext in {'.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'}:
            return 'Archivos Comprimidos', ['Archivos Comprimidos']
        elif ext in {'.max', '.skp', '.fbx', '.obj', '.blend', '.dwg', '.dxf', '.rvt', '.3ds', '.c4d'}:
            return 'Arquitectura & 3D (Work)', ['Renders & Modelos 3D']
        elif ext in {'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'}:
            return 'Documentos & Facturas', ['Documentos & Facturas']
        elif ext in {'.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'}:
            return 'Música & Audio', ['Música & Audio']
        return 'Otros Archivos', []

    def _run_scan_worker(self, root_dir: str):
        try:
            conn = get_connection()
            cursor = conn.cursor()

            cursor.execute("SELECT id, name FROM tags;")
            tag_map = {r['name']: r['id'] for r in cursor.fetchall()}

            queue = [root_dir]
            batch_files = []
            batch_tags = []

            while queue:
                current = queue.pop(0)
                self.current_folder = current
                self.elapsed_seconds = time.time() - self.start_time

                try:
                    with os.scandir(current) as it:
                        subdirs = []
                        for entry in it:
                            if entry.name.startswith('$') or entry.name == 'System Volume Information':
                                continue
                            try:
                                if entry.is_dir(follow_symlinks=False):
                                    subdirs.append(entry.path)
                                elif entry.is_file(follow_symlinks=False):
                                    self.files_scanned += 1
                                    st = entry.stat(follow_symlinks=False)
                                    self.total_bytes += st.st_size
                                    ext = Path(entry.name).suffix.lower()
                                    cat, suggested = self._get_ext_category(ext)

                                    batch_files.append((
                                        entry.path, entry.name, current, ext,
                                        st.st_size, st.st_mtime, cat, 'Por Revisar', 'Alex', '', time.time()
                                    ))
                                    for t_name in suggested:
                                        if t_name in tag_map:
                                            batch_tags.append((entry.path, 'file', tag_map[t_name]))
                            except Exception:
                                pass
                        queue.extend(subdirs)
                except Exception:
                    pass

                if len(batch_files) >= 2000:
                    cursor.executemany("""
                    INSERT INTO files (path, name, folder_path, extension, size_bytes, mtime, category, status, owner, notes, indexed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(path) DO UPDATE SET
                        size_bytes=excluded.size_bytes,
                        mtime=excluded.mtime,
                        category=excluded.category,
                        indexed_at=excluded.indexed_at
                    """, batch_files)
                    cursor.executemany("""
                    INSERT OR IGNORE INTO item_tags (item_path, item_type, tag_id)
                    VALUES (?, ?, ?)
                    """, batch_tags)
                    conn.commit()
                    batch_files.clear()
                    batch_tags.clear()

            if batch_files:
                cursor.executemany("""
                INSERT INTO files (path, name, folder_path, extension, size_bytes, mtime, category, status, owner, notes, indexed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    size_bytes=excluded.size_bytes,
                    mtime=excluded.mtime,
                    category=excluded.category,
                    indexed_at=excluded.indexed_at
                """, batch_files)
                cursor.executemany("""
                INSERT OR IGNORE INTO item_tags (item_path, item_type, tag_id)
                VALUES (?, ?, ?)
                """, batch_tags)
                conn.commit()

            # Update folders summary
            cursor.execute("""
            UPDATE folders
            SET 
                size_bytes = COALESCE((SELECT SUM(size_bytes) FROM files WHERE folder_path = folders.path), 0),
                file_count = COALESCE((SELECT COUNT(*) FROM files WHERE folder_path = folders.path), 0);
            """)
            conn.commit()
            conn.close()

            with self._lock:
                self.is_running = False
                self.status = "completed"
                self.elapsed_seconds = time.time() - self.start_time
                self.last_completed_at = time.time()

        except Exception as e:
            with self._lock:
                self.is_running = False
                self.status = "error"
                self.error_message = str(e)

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "status": self.status,
                "is_running": self.is_running,
                "files_scanned": self.files_scanned,
                "total_bytes": self.total_bytes,
                "current_folder": self.current_folder,
                "elapsed_seconds": round(self.elapsed_seconds if not self.is_running else time.time() - self.start_time, 1),
                "last_completed_at": self.last_completed_at,
                "error_message": self.error_message
            }

analysis_manager = FileAnalysisManager()
