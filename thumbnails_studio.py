import os
import time
import threading
from pathlib import Path
from typing import Dict, List, Any, Optional
from thumbnails import get_or_create_thumbnail, CACHE_DIR, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, PDF_EXTENSIONS

class ThumbnailStudioManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.worker_thread: Optional[threading.Thread] = None
        self.stop_requested = False
        self.pause_requested = False
        
        self.state = {
            "status": "idle", # 'idle', 'running', 'paused', 'completed', 'stopped'
            "target_dir": "E:\\",
            "current_file": "",
            "total_files": 0,
            "processed": 0,
            "generated": 0,
            "skipped": 0,
            "failed": 0,
            "percent": 0.0,
            "start_time": 0.0,
            "elapsed_seconds": 0.0,
            "eta_seconds": 0.0,
            "recent_generated": [] # List of { name, path, thumb_url, type }
        }

    def get_cache_stats(self) -> Dict[str, Any]:
        """Returns statistics on current disk cache for thumbnails."""
        total_files = 0
        total_bytes = 0
        if CACHE_DIR.exists():
            for entry in CACHE_DIR.iterdir():
                if entry.is_file():
                    total_files += 1
                    try:
                        total_bytes += entry.stat().st_size
                    except Exception:
                        pass
        return {
            "cache_dir": str(CACHE_DIR),
            "total_cached": total_files,
            "cache_size_mb": round(total_bytes / (1024 * 1024), 2),
            "cache_size_bytes": total_bytes
        }

    def clear_cache(self) -> int:
        """Empties the thumbnail cache folder."""
        deleted = 0
        if CACHE_DIR.exists():
            for entry in CACHE_DIR.iterdir():
                if entry.is_file():
                    try:
                        entry.unlink()
                        deleted += 1
                    except Exception:
                        pass
        return deleted

    def start_batch_generation(self, target_dir: str = "E:\\", recursive: bool = True, max_files: int = 5000):
        with self.lock:
            if self.worker_thread and self.worker_thread.is_alive():
                return {"success": False, "message": "Ya hay un proceso de generación en ejecución."}

            self.stop_requested = False
            self.pause_requested = False
            self.state["status"] = "running"
            self.state["target_dir"] = target_dir
            self.state["current_file"] = ""
            self.state["total_files"] = 0
            self.state["processed"] = 0
            self.state["generated"] = 0
            self.state["skipped"] = 0
            self.state["failed"] = 0
            self.state["percent"] = 0.0
            self.state["start_time"] = time.time()
            self.state["elapsed_seconds"] = 0.0
            self.state["eta_seconds"] = 0.0

            self.worker_thread = threading.Thread(
                target=self._worker_loop,
                args=(target_dir, recursive, max_files),
                daemon=True
            )
            self.worker_thread.start()
            return {"success": True, "message": "Proceso de thumbnails iniciado"}

    def pause_generation(self):
        with self.lock:
            self.pause_requested = True
            self.state["status"] = "paused"
            return {"success": True}

    def resume_generation(self):
        with self.lock:
            self.pause_requested = False
            self.state["status"] = "running"
            return {"success": True}

    def stop_generation(self):
        with self.lock:
            self.stop_requested = True
            self.state["status"] = "stopped"
            return {"success": True}

    def get_status(self) -> Dict[str, Any]:
        with self.lock:
            if self.state["status"] == "running":
                elapsed = time.time() - self.state["start_time"]
                self.state["elapsed_seconds"] = round(elapsed, 1)
                processed = self.state["processed"]
                total = self.state["total_files"]
                if processed > 0 and total > 0:
                    rate = processed / elapsed if elapsed > 0 else 1
                    remaining = total - processed
                    self.state["eta_seconds"] = round(remaining / rate, 1) if rate > 0 else 0
                    self.state["percent"] = round((processed / total) * 100, 1)
            
            cache_info = self.get_cache_stats()
            return {
                **self.state,
                "cache_stats": cache_info
            }

    def _worker_loop(self, target_dir: str, recursive: bool, max_files: int):
        root = Path(target_dir)
        if not root.exists():
            with self.lock:
                self.state["status"] = "idle"
                self.state["current_file"] = f"Error: {target_dir} no existe"
            return

        # 1. Discover all candidate media files
        all_media = []
        all_exts = IMAGE_EXTENSIONS.union(VIDEO_EXTENSIONS).union(PDF_EXTENSIONS)

        if recursive:
            for dirpath, dirnames, filenames in os.walk(root):
                if any(p.startswith('$') or p == 'System Volume Information' for p in dirpath.split(os.sep)):
                    continue
                for fn in filenames:
                    ext = Path(fn).suffix.lower()
                    if ext in all_exts:
                        all_media.append(Path(dirpath) / fn)
                        if len(all_media) >= max_files:
                            break
                if len(all_media) >= max_files:
                    break
        else:
            try:
                for entry in root.iterdir():
                    if entry.is_file() and entry.suffix.lower() in all_exts:
                        all_media.append(entry)
            except Exception:
                pass

        with self.lock:
            self.state["total_files"] = len(all_media)

        # 2. Process each file
        for idx, file_p in enumerate(all_media):
            if self.stop_requested:
                break

            while self.pause_requested:
                time.sleep(0.5)
                if self.stop_requested:
                    break

            with self.lock:
                self.state["current_file"] = file_p.name
                self.state["processed"] = idx + 1

            try:
                ext = file_p.suffix.lower()
                m_type = "image" if ext in IMAGE_EXTENSIONS else ("video" if ext in VIDEO_EXTENSIONS else "pdf")
                
                # Generate thumbnail
                thumb = get_or_create_thumbnail(str(file_p))
                
                with self.lock:
                    if thumb and thumb.exists():
                        self.state["generated"] += 1
                        recent_entry = {
                            "name": file_p.name,
                            "path": str(file_p),
                            "thumb_path": str(thumb),
                            "type": m_type,
                            "size": file_p.stat().st_size
                        }
                        self.state["recent_generated"].insert(0, recent_entry)
                        if len(self.state["recent_generated"]) > 40:
                            self.state["recent_generated"].pop()
                    else:
                        self.state["failed"] += 1
            except Exception:
                with self.lock:
                    self.state["failed"] += 1

            # Brief pause to keep disk I/O smooth
            time.sleep(0.01)

        with self.lock:
            self.state["status"] = "completed" if not self.stop_requested else "stopped"
            self.state["current_file"] = "Finalizado"

studio_manager = ThumbnailStudioManager()

if __name__ == "__main__":
    print("Testing ThumbnailStudioManager...")
    stats = studio_manager.get_cache_stats()
    print("Current cache stats:", stats)
