"""Report, do not certify, single-pass and progressive Canvas vs Pillow Lanczos."""
import json
import math
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

root = Path(__file__).resolve().parents[1]
photo = root.parents[1] / 'docs/images/garden-5120.jpg'
evidence = root / 'evidence'
reference = Image.open(photo).convert('RGB')
rows = []
for browser in ['chromium', 'firefox', 'webkit']:
    direct_file = evidence / f'{browser}-downsample-direct.png'
    if not direct_file.exists():
        continue
    size = Image.open(direct_file).size
    lanczos = reference.resize(size, Image.Resampling.LANCZOS)
    lanczos.save(evidence / f'{browser}-downsample-pillow.png')
    for method in ['direct', 'progressive']:
        actual = Image.open(evidence / f'{browser}-downsample-{method}.png').convert('RGB')
        stats = ImageStat.Stat(ImageChops.difference(actual, lanczos))
        mse = sum(v * v for v in stats.rms) / 3
        rows.append({'browser': browser, 'method': method, 'width': size[0], 'height': size[1],
                     'meanAbsoluteRGB': sum(stats.mean) / 3, 'PSNRdB': 10 * math.log10(255 * 255 / mse) if mse else None})
    sheet = Image.new('RGB', (size[0] * 3, size[1]), 'white')
    for n, im in enumerate([lanczos, Image.open(direct_file), Image.open(evidence / f'{browser}-downsample-progressive.png')]):
        sheet.paste(im, (size[0] * n, 0))
    sheet.save(evidence / f'{browser}-downsample-comparison.png')
text = json.dumps({'source': 'docs/images/garden-5120.jpg', 'reference': 'Pillow Lanczos; left/reference, middle/direct, right/progressive in comparison PNGs',
                   'caution': 'One photo, one output size, local browser builds; not a production quality certification or performance result.', 'results': rows}, indent=2)
(evidence / 'quality-results.json').write_text(text + '\n')
print(text)
