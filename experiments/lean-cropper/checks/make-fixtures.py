"""Original, deterministic test artwork. Pillow is test tooling, never shipped."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

root = Path(__file__).parent / 'fixtures'
root.mkdir(exist_ok=True)
image = Image.new('RGB', (640, 480), '#f3efe4')
draw = ImageDraw.Draw(image)
colors = ['#dc3548', '#22a788', '#3865c9', '#e9bc2b']
for y in range(0, 480, 80):
    for x in range(0, 640, 80):
        draw.rectangle((x, y, x + 79, y + 79), fill=colors[(x // 80 + 2 * (y // 80)) % 4])
        draw.line((x, y, x + 79, y + 79), fill='white', width=5)
        draw.text((x + 12, y + 14), f'{x},{y}', fill='black')
draw.ellipse((210, 130, 410, 330), fill='#ec71d8', outline='black', width=7)
draw.rectangle((320, 238, 500, 242), fill='black')
image.save(root / 'landmarks.png')
quad = Image.new('RGB', (240, 160))
draw = ImageDraw.Draw(quad)
for box, color, label in zip([(0, 0, 119, 79), (120, 0, 239, 79), (0, 80, 119, 159), (120, 80, 239, 159)], colors, ['TL', 'TR', 'BL', 'BR']):
    draw.rectangle(box, fill=color)
    draw.text((box[0] + 30, box[1] + 30), label, fill='white')
for orientation in range(1, 9):
    exif = Image.Exif()
    exif[274] = orientation
    file = root / f'orientation-{orientation}.jpg'
    quad.save(file, quality=95, subsampling=0, exif=exif)
    with Image.open(file) as source:
        ImageOps.exif_transpose(source).save(root / f'orientation-{orientation}-expected.png')
detail = Image.new('RGB', (2400, 1600), 'white')
draw = ImageDraw.Draw(detail)
for x in range(0, 2400, 2):
    draw.line((x, 0, x, 1599), fill='black')
draw.rectangle((1000, 400, 1200, 800), fill='#dc3548')
detail.save(root / 'detail.png')
print(f'Created landmarks, 8 EXIF/independent reference pairs, and 3.84MP detail fixture in {root}')
