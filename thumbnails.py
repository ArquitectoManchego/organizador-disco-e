import os
import hashlib
from pathlib import Path
from typing import Optional
from PIL import Image, ImageOps

try:
    import cv2
except ImportError:
    cv2 = None

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        fitz = None

CACHE_DIR = Path(__file__).parent / ".cache" / "thumbnails"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff', '.tif', '.ico'}
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'}
PDF_EXTENSIONS = {'.pdf'}

def get_cache_key(path: str, mtime: float = 0, size: int = 0) -> str:
    key_str = f"{path}_{mtime}_{size}"
    return hashlib.md5(key_str.encode('utf-8', errors='ignore')).hexdigest()

def get_cached_thumbnail_path(cache_key: str) -> Path:
    return CACHE_DIR / f"{cache_key}.webp"

def generate_image_thumbnail(file_path: Path, output_path: Path, size=(256, 256)) -> bool:
    try:
        with Image.open(file_path) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGBA")
            else:
                img = img.convert("RGB")
            img.thumbnail(size, Image.Resampling.LANCZOS)
            img.save(output_path, "WEBP", quality=85)
            return True
    except Exception as e:
        # print(f"Error thumbnail image {file_path}: {e}")
        return False

def generate_video_thumbnail(file_path: Path, output_path: Path, size=(256, 256)) -> bool:
    if cv2 is None:
        return False
    try:
        cap = cv2.VideoCapture(str(file_path))
        if not cap.isOpened():
            return False
        
        # Try to jump to 1.5 seconds or 10%
        fps = cap.get(cv2.CAP_PROP_FPS) or 24
        total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 100
        target_frame = min(int(fps * 1.5), int(total_frames * 0.1), max(0, int(total_frames - 1)))
        
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        success, frame = cap.read()
        if not success:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            success, frame = cap.read()
            
        cap.release()
        if not success or frame is None:
            return False

        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb_frame)
        img.thumbnail(size, Image.Resampling.LANCZOS)
        img.save(output_path, "WEBP", quality=85)
        return True
    except Exception as e:
        # print(f"Error video thumb {file_path}: {e}")
        return False

def generate_pdf_thumbnail(file_path: Path, output_path: Path, size=(256, 256)) -> bool:
    if fitz is None:
        return False
    try:
        doc = fitz.open(str(file_path))
        if len(doc) == 0:
            doc.close()
            return False
        page = doc.load_page(0)
        pix = page.get_pixmap(dpi=100)
        doc.close()
        
        mode = "RGBA" if pix.alpha else "RGB"
        img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
        img.thumbnail(size, Image.Resampling.LANCZOS)
        img.save(output_path, "WEBP", quality=85)
        return True
    except Exception as e:
        # print(f"Error pdf thumb {file_path}: {e}")
        return False

def get_or_create_thumbnail(file_path_str: str) -> Optional[Path]:
    p = Path(file_path_str)
    if not p.exists():
        return None

    try:
        stat = p.stat()
        mtime = stat.st_mtime
        size = stat.st_size
    except Exception:
        mtime = 0
        size = 0

    cache_key = get_cache_key(str(p), mtime, size)
    cached_file = get_cached_thumbnail_path(cache_key)
    if cached_file.exists():
        return cached_file

    # If it is a directory, look for the first previewable image/video inside
    if p.is_dir():
        found = False
        try:
            for entry in p.iterdir():
                if entry.is_file():
                    ext = entry.suffix.lower()
                    if ext in IMAGE_EXTENSIONS or ext in VIDEO_EXTENSIONS:
                        sub_thumb = get_or_create_thumbnail(str(entry))
                        if sub_thumb and sub_thumb.exists():
                            return sub_thumb
        except Exception:
            pass
        return None

    ext = p.suffix.lower()
    success = False
    if ext in IMAGE_EXTENSIONS:
        success = generate_image_thumbnail(p, cached_file)
    elif ext in VIDEO_EXTENSIONS:
        success = generate_video_thumbnail(p, cached_file)
    elif ext in PDF_EXTENSIONS:
        success = generate_pdf_thumbnail(p, cached_file)

    if success and cached_file.exists():
        return cached_file
    return None
