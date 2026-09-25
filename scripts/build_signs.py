"""Extract GPS + date from HEIC photos and write web JPEGs + signs.json."""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ExifTags, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "images"
WEB_DIR = ROOT / "images" / "web"
DATA_PATH = ROOT / "data" / "signs.json"
MAX_EDGE = 1200
JPEG_QUALITY = 82
# Sign IDs (photo stems) to leave off the map
HIDDEN_IDS = {"IMG_0511"}


def dms_to_decimal(dms, ref: str) -> float:
    degrees, minutes, seconds = (float(x) for x in dms)
    value = degrees + minutes / 60 + seconds / 3600
    if ref in ("S", "W"):
        value = -value
    return value


def read_gps(exif) -> tuple[float, float] | None:
    gps = exif.get_ifd(0x8825)
    if not gps or 2 not in gps or 4 not in gps:
        return None
    lat = dms_to_decimal(gps[2], gps.get(1, "N"))
    lon = dms_to_decimal(gps[4], gps.get(3, "E"))
    if not (math.isfinite(lat) and math.isfinite(lon)):
        return None
    return lat, lon


def read_date(exif) -> str | None:
    tag_names = {v: k for k, v in ExifTags.TAGS.items()}
    for name in ("DateTimeOriginal", "DateTime", "DateTimeDigitized"):
        tag = tag_names.get(name)
        if tag is None:
            continue
        raw = exif.get(tag)
        if raw:
            # EXIF: "2026:07:31 17:14:47" -> "2026-07-31"
            return str(raw).split(" ")[0].replace(":", "-", 2)
    return None


def convert_to_web_jpeg(src: Path, dest: Path) -> None:
    with Image.open(src) as img:
        img = ImageOps.exif_transpose(img) or img
        img.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True)


def main() -> None:
    WEB_DIR.mkdir(parents=True, exist_ok=True)
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)

    signs = []
    skipped = []

    patterns = ("*.HEIC", "*.heic", "*.JPG", "*.jpg", "*.JPEG", "*.jpeg")
    seen: set[str] = set()
    sources: list[Path] = []
    for pattern in patterns:
        for src in SRC_DIR.glob(pattern):
            key = src.name.lower()
            if key in seen or src.parent.name == "web":
                continue
            seen.add(key)
            sources.append(src)
    sources.sort(key=lambda p: p.name.lower())

    for src in sources:
        if src.stem in HIDDEN_IDS:
            print(f"{src.name} -> hidden")
            continue

        with Image.open(src) as img:
            exif = img.getexif()
            gps = read_gps(exif)
            taken = read_date(exif)

        if not gps:
            skipped.append(src.name)
            continue

        web_name = src.stem + ".jpg"
        dest = WEB_DIR / web_name
        convert_to_web_jpeg(src, dest)

        lat, lon = gps
        signs.append(
            {
                "id": src.stem,
                "lat": round(lat, 7),
                "lon": round(lon, 7),
                "date": taken or "2026-07-31",
                "image": f"images/web/{web_name}",
                "filename": src.name,
            }
        )
        print(f"{src.name} -> {lat:.6f},{lon:.6f} ({taken})")

    signs.sort(key=lambda s: s["id"])
    DATA_PATH.write_text(json.dumps(signs, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote {len(signs)} signs to {DATA_PATH.relative_to(ROOT)}")
    if skipped:
        print(f"Skipped (no GPS): {', '.join(skipped)}")


if __name__ == "__main__":
    main()
