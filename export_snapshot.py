import json
import sqlite3
from pathlib import Path
from database import get_connection
import foldersizes_engine
import compare_engine

def export_all():
    out_file = Path(__file__).parent / "static" / "data_snapshot.json"
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Drive info
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

    drive_info = {
        "drive": "E:\\",
        "total_gb": 3726.02,
        "used_gb": 1491.36,
        "free_gb": 2234.66,
        "used_percent": 40.0,
        "folders_count": folders_count,
        "files_count": files_count,
        "categories": categories,
        "statuses": statuses
    }

    # 2. Tags
    cursor.execute("""
    SELECT t.id, t.name, t.tag_type, t.color, t.icon, COUNT(it.item_path) as usage_count
    FROM tags t
    LEFT JOIN item_tags it ON t.id = it.tag_id
    GROUP BY t.id
    ORDER BY t.tag_type, usage_count DESC, t.name ASC;
    """)
    tag_rows = [dict(r) for r in cursor.fetchall()]
    tags_grouped = {}
    for r in tag_rows:
        t_type = r["tag_type"]
        tags_grouped.setdefault(t_type, []).append(r)

    # 3. Organigram nodes
    cursor.execute("""
    SELECT f.path, f.name, f.parent_path, f.depth, f.subfolder_count, f.file_count, 
           f.size_bytes, f.category, f.status, f.owner
    FROM folders f
    WHERE f.depth <= 3
    ORDER BY f.depth ASC, f.name ASC;
    """)
    folder_rows = [dict(r) for r in cursor.fetchall()]

    cursor.execute("""
    SELECT it.item_path, t.id, t.name, t.tag_type, t.color, t.icon
    FROM item_tags it
    JOIN tags t ON it.tag_id = t.id
    WHERE it.item_type = 'folder';
    """)
    tag_associations = cursor.fetchall()
    tags_by_folder = {}
    for tr in tag_associations:
        p = tr["item_path"]
        tags_by_folder.setdefault(p, []).append({
            "id": tr["id"],
            "name": tr["name"],
            "tag_type": tr["tag_type"],
            "color": tr["color"],
            "icon": tr["icon"]
        })

    for f in folder_rows:
        f["tags"] = tags_by_folder.get(f["path"], [])

    organigram_data = {
        "root": "E:\\",
        "nodes": folder_rows
    }

    # 4. Folder Sizes Treemap for root & Tag Space
    fs_treemap = foldersizes_engine.get_folder_treemap("E:\\", 1200, 700, view_mode="both")
    fs_treemap_files = foldersizes_engine.get_folder_treemap("E:\\", 1200, 700, view_mode="files")
    tag_space = foldersizes_engine.get_tag_space_distribution()
    files_analysis = foldersizes_engine.get_files_analysis(parent_path=None, limit_largest=150)

    # 5. Drive Duplicates
    drive_dupes = compare_engine.scan_drive_for_duplicates("E:\\")

    # 6. Preload explore items for root E:\ and major subfolders
    explored_cache = {}
    paths_to_cache = ["E:\\"] + [f["path"] for f in folder_rows if f["depth"] == 1]
    for p in paths_to_cache:
        norm = p.rstrip("\\")
        cursor.execute("""
        SELECT f.*, 
               GROUP_CONCAT(t.name || '::' || t.color || '::' || t.tag_type || '::' || t.id, ';;') as tags_str
        FROM folders f
        LEFT JOIN item_tags it ON f.path = it.item_path AND it.item_type = 'folder'
        LEFT JOIN tags t ON it.tag_id = t.id
        WHERE f.parent_path = ? OR f.parent_path = ?
        GROUP BY f.path
        ORDER BY f.name COLLATE NOCASE ASC;
        """, (norm, norm + "\\"))
        sub_rows = cursor.fetchall()
        subfolders = []
        for r in sub_rows:
            it = dict(r)
            tags_raw = it.pop("tags_str", None)
            it["tags"] = []
            if tags_raw:
                for t_chunk in tags_raw.split(";;"):
                    parts = t_chunk.split("::")
                    if len(parts) == 4:
                        it["tags"].append({
                            "name": parts[0],
                            "color": parts[1],
                            "tag_type": parts[2],
                            "id": int(parts[3])
                        })
            subfolders.append(it)

        cursor.execute("""
        SELECT f.*,
               GROUP_CONCAT(t.name || '::' || t.color || '::' || t.tag_type || '::' || t.id, ';;') as tags_str
        FROM files f
        LEFT JOIN item_tags it ON f.path = it.item_path AND it.item_type = 'file'
        LEFT JOIN tags t ON it.tag_id = t.id
        WHERE f.folder_path = ?
        GROUP BY f.path
        ORDER BY f.name COLLATE NOCASE ASC;
        """, (p,))
        f_rows = cursor.fetchall()
        files = []
        for r in f_rows:
            it = dict(r)
            tags_raw = it.pop("tags_str", None)
            it["tags"] = []
            if tags_raw:
                for t_chunk in tags_raw.split(";;"):
                    parts = t_chunk.split("::")
                    if len(parts) == 4:
                        it["tags"].append({
                            "name": parts[0],
                            "color": parts[1],
                            "tag_type": parts[2],
                            "id": int(parts[3])
                        })
            files.append(it)

        explored_cache[p] = {
            "current_folder": {"path": p, "name": Path(p).name or "E:\\", "category": "General", "status": "Por Revisar"},
            "breadcrumbs": [{"name": Path(p).name or "E:\\", "path": p}],
            "subfolders": subfolders,
            "files": files,
            "total_subfolders": len(subfolders),
            "total_files": len(files)
        }

    # 7. Recycle bin items
    cursor.execute("""
    SELECT id, path, name, original_folder, size_bytes, extension, deleted_at, restored
    FROM app_recycle_bin
    ORDER BY deleted_at DESC
    LIMIT 200;
    """)
    rb_items = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM app_recycle_bin WHERE restored = 0;")
    rb_count, rb_bytes = cursor.fetchone()
    recycle_bin_data = {
        "items": rb_items,
        "total_files": rb_count,
        "total_bytes": rb_bytes
    }
    conn.close()

    # 8. FolderSizes Pro Specialized Reports
    print("Exporting FolderSizes Pro reports...")
    empty_folders = foldersizes_engine.get_empty_folders("E:\\")
    oldest_files = foldersizes_engine.get_oldest_files("E:\\", limit=100)
    newest_files = foldersizes_engine.get_newest_files("E:\\", limit=100)
    junk_files = foldersizes_engine.get_junk_files("E:\\", limit=150)
    long_paths = foldersizes_engine.get_long_paths(min_len=240, limit=100)
    depth_analysis = foldersizes_engine.get_depth_analysis(max_depth=6)
    sunburst = foldersizes_engine.get_sunburst_data("E:\\", max_depth=3)

    # 9. Beyond Compare Sample Comparison
    print("Exporting Beyond Compare sample comparison...")
    sample_comparison = compare_engine.compare_two_folders(
        "E:\\WORK\\Leslie Carrillo - Entrega 28 Mayo", 
        "E:\\WORK\\TODO REVISAR DUPLICADOS\\Leslie Carrillo - Entrega 28 Mayo"
    )

    snapshot = {
        "drive_info": drive_info,
        "tags": tags_grouped,
        "organigram": organigram_data,
        "foldersizes_treemap": fs_treemap,
        "foldersizes_treemap_files": fs_treemap_files,
        "files_analysis": files_analysis,
        "tag_space": tag_space,
        "drive_duplicates": drive_dupes,
        "recycle_bin": recycle_bin_data,
        "explore_cache": explored_cache,
        "empty_folders": empty_folders,
        "oldest_files": oldest_files,
        "newest_files": newest_files,
        "junk_files": junk_files,
        "long_paths": long_paths,
        "depth_analysis": depth_analysis,
        "sunburst": sunburst,
        "sample_comparison": sample_comparison
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)

    print(f"Snapshot exported successfully to {out_file} ({out_file.stat().st_size / 1024:.1f} KB)")

if __name__ == "__main__":
    export_all()
