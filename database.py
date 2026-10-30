import sqlite3
import os
from pathlib import Path
from typing import List, Dict, Any, Optional

DB_PATH = Path(__file__).parent / "organizador_e.db"

def get_connection():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for high concurrency & speed
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Folders table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS folders (
        path TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_path TEXT NOT NULL,
        depth INTEGER NOT NULL DEFAULT 0,
        subfolder_count INTEGER DEFAULT 0,
        file_count INTEGER DEFAULT 0,
        size_bytes INTEGER DEFAULT 0,
        category TEXT DEFAULT 'Sin Categoría',
        status TEXT DEFAULT 'Por Revisar',
        owner TEXT DEFAULT 'General',
        notes TEXT DEFAULT '',
        mtime REAL DEFAULT 0,
        last_scanned REAL DEFAULT 0
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_path);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_folders_category ON folders(category);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_folders_status ON folders(status);")

    # Files table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        folder_path TEXT NOT NULL,
        extension TEXT NOT NULL,
        size_bytes INTEGER DEFAULT 0,
        mtime REAL DEFAULT 0,
        category TEXT DEFAULT 'Sin Categoría',
        status TEXT DEFAULT 'Sin Estado',
        owner TEXT DEFAULT 'General',
        notes TEXT DEFAULT '',
        indexed_at REAL DEFAULT 0
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_path);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_ext ON files(extension);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_category ON files(category);")

    # Tags table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        tag_type TEXT NOT NULL, -- 'category', 'status', 'owner', 'content', 'custom'
        color TEXT NOT NULL,    -- Hex color or CSS class
        icon TEXT DEFAULT 'tag'
    );
    """)

    # Item Tags association table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS item_tags (
        item_path TEXT NOT NULL,
        item_type TEXT NOT NULL, -- 'folder' or 'file'
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (item_path, tag_id),
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_item_tags_path ON item_tags(item_path);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);")

    # Seed default tags
    default_tags = [
        # Categorías principales
        ("Arquitectura & 3D (Work)", "category", "#0ea5e9", "box"),
        ("Software & Instaladores", "category", "#8b5cf6", "cpu"),
        ("Respaldos Celular", "category", "#10b981", "smartphone"),
        ("Fotografía & Álbumes", "category", "#ec4899", "camera"),
        ("Respaldos de Equipos / Personas", "category", "#f59e0b", "hard-drive"),
        ("Descargas Masivas", "category", "#64748b", "download"),
        ("Videos & Ejercicio", "category", "#ef4444", "film"),
        ("Cursos, Ebooks & Salud", "category", "#14b8a6", "book-open"),
        
        # Estados de organización
        ("Organizado", "status", "#22c55e", "check-circle"),
        ("Por Revisar", "status", "#eab308", "alert-circle"),
        ("Duplicado / Posible Basura", "status", "#ef4444", "trash-2"),
        ("Importante / Crítico", "status", "#a855f7", "star"),
        ("Archivado", "status", "#6b7280", "archive"),

        # Propietarios / Origen
        ("Alex", "owner", "#3b82f6", "user"),
        ("Natalia", "owner", "#ec4899", "user"),
        ("Luis", "owner", "#14b8a6", "user"),
        ("Tienda", "owner", "#f97316", "shopping-bag"),
        ("Internet / Web", "owner", "#6366f1", "globe"),
        ("iPhone", "owner", "#a855f7", "smartphone"),
        ("Oppo Reno", "owner", "#06b6d4", "smartphone"),
        ("Samsung J6", "owner", "#84cc16", "smartphone"),

        # Tipos de contenido
        ("Renders & Modelos 3D", "content", "#0284c7", "layers"),
        ("Fotos Personales", "content", "#f43f5e", "image"),
        ("Grabaciones & Videos", "content", "#d97706", "video"),
        ("Instaladores & ISO", "content", "#7c3aed", "disc"),
        ("Planos & DWG", "content", "#059669", "file-text"),
        ("Documentos & Facturas", "content", "#4b5563", "file-text"),
        ("Fuentes & Gráficos", "content", "#db2777", "type")
    ]

    for name, tag_type, color, icon in default_tags:
        cursor.execute("""
        INSERT OR IGNORE INTO tags (name, tag_type, color, icon)
        VALUES (?, ?, ?, ?)
        """, (name, tag_type, color, icon))

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at", DB_PATH)
