import os
import sqlite3
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

    # Filter out 0 or negative values and sort descending
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

    # Normalize values to total canvas area
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
            # Layout current row and shrink remaining canvas
            curr_x, curr_y, curr_w, curr_h = layout_row(row, curr_x, curr_y, curr_w, curr_h, horizontal)
            row = []

    if row:
        horizontal = curr_w >= curr_h
        layout_row(row, curr_x, curr_y, curr_w, curr_h, horizontal)

    return results

def get_folder_treemap(parent_path: str = "E:\\", canvas_w: float = 1200, canvas_h: float = 700) -> Dict[str, Any]:
    """
    Returns Treemap blocks for direct children of parent_path or deep exploration.
    Includes tags, file counts, and sizes.
    """
    conn = get_connection()
    cursor = conn.cursor()

    norm_parent = parent_path.rstrip("\\")

    # Fetch subfolders
    cursor.execute("""
    SELECT f.path, f.name, f.depth, f.size_bytes, f.file_count, f.subfolder_count, 
           f.category, f.status, f.owner
    FROM folders f
    WHERE (f.parent_path = ? OR f.parent_path = ?) AND f.path != ?
    """, (norm_parent, norm_parent + "\\", parent_path))
    folder_rows = [dict(r) for r in cursor.fetchall()]

    # Fetch direct files
    cursor.execute("""
    SELECT f.path, f.name, f.size_bytes, f.extension, f.category, f.status, f.owner
    FROM files f
    WHERE f.folder_path = ?
    """, (parent_path,))
    file_rows = [dict(r) for r in cursor.fetchall()]

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
    conn.close()

    items = []
    # If folder has subfolders, prepare folder nodes
    for f in folder_rows:
        val = f["size_bytes"]
        # If folder size_bytes in DB is 0 or low, fallback to weighted metric based on file_count or 10MB dummy
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

    # Add direct files if any
    for f in file_rows:
        val = max(f["size_bytes"], 1024)
        t_list = tag_map.get(f["path"], [])
        items.append({
            "id": f["path"],
            "path": f["path"],
            "name": f["name"],
            "type": "file",
            "value": val,
            "raw_size": f["size_bytes"],
            "extension": f["extension"],
            "category": f["category"] or "Sin Categoría",
            "status": f["status"] or "Sin Estado",
            "owner": f["owner"] or "Alex",
            "tags": t_list,
            "tag_count": len(t_list)
        })

    treemap_nodes = compute_squarified_treemap(items, 0, 0, canvas_w, canvas_h)
    
    total_bytes = sum(it["value"] for it in items)
    return {
        "parent_path": parent_path,
        "total_items": len(items),
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

    # 1. Total tags usage & aggregate size
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
    ORDER BY (folder_count + file_count) DESC, t.name ASC;
    """)
    tag_rows = [dict(r) for r in cursor.fetchall()]

    # 2. Unique vs Mixed Tags classification
    # Find items and how many tags they have
    cursor.execute("""
    SELECT item_path, item_type, COUNT(tag_id) as tag_count
    FROM item_tags
    GROUP BY item_path, item_type
    """)
    item_tag_counts = cursor.fetchall()
    
    unique_items_count = sum(1 for r in item_tag_counts if r["tag_count"] == 1)
    mixed_items_count = sum(1 for r in item_tag_counts if r["tag_count"] > 1)

    # 3. Untagged items
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

    # 4. Grouped space for Treemap of Tags
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

if __name__ == "__main__":
    res = get_folder_treemap("E:\\")
    print(f"Generated {len(res['nodes'])} treemap tiles for E:\\.")
    dist = get_tag_space_distribution()
    print(f"Found {len(dist['tags_summary'])} tags in distribution.")
