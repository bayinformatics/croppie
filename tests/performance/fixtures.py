"""Generate repeatable workload images outside the tracked tree (requires Pillow)."""

from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[2]
destination = root / ".cache/performance/images"
destination.mkdir(parents=True, exist_ok=True)
with Image.open(root / "docs/images/garden-5120.jpg") as original:
    for name, size in [("photo-12mp.jpg", (4000, 3000)), ("photo-48mp.jpg", (8000, 6000))]:
        # Rescaled repository photograph, not a claim of real 48 MP camera detail.
        ImageOps.fit(original, size, method=Image.Resampling.LANCZOS).save(
            destination / name, quality=92
        )
image = Image.new("RGBA", (1600, 1200), (0, 0, 0, 0))
image.paste((220, 45, 30, 255), (100, 100, 800, 600))
image.paste((20, 130, 220, 180), (800, 600, 1500, 1100))
image.save(destination / "transparent.png")
print(destination)
