"""Compare hybrid, old single-pass, and production outputs against Pillow Lanczos."""
import json
import math
import os
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

root = Path(__file__).resolve().parents[1]
photo = root.parents[1] / 'docs/images/garden-5120.jpg'
evidence = Path(os.environ.get('LEAN_EVIDENCE', root / 'evidence'))
reference = Image.open(photo).convert('RGB')
rows = []
for browser in os.environ.get('LEAN_BROWSERS', 'chromium,firefox,webkit').split(','):
    direct_file = evidence / f'{browser}-downsample-direct.png'
    if not direct_file.exists():
        raise FileNotFoundError(direct_file)
    size = Image.open(direct_file).size
    lanczos = reference.resize(size, Image.Resampling.LANCZOS)
    lanczos.save(evidence / f'{browser}-downsample-pillow.png')
    production = Image.open(evidence / f'{browser}-downsample-production.png').convert('RGB')
    for method in ['direct', 'hybrid', 'production']:
        actual = Image.open(evidence / f'{browser}-downsample-{method}.png').convert('RGB')
        stats = ImageStat.Stat(ImageChops.difference(actual, lanczos))
        mse = sum(v * v for v in stats.rms) / 3
        production_error = ImageStat.Stat(ImageChops.difference(actual, production))
        rows.append({'browser': browser, 'method': method, 'width': size[0], 'height': size[1],
                     'meanAbsoluteRGB': sum(stats.mean) / 3, 'PSNRdB': 10 * math.log10(255 * 255 / mse) if mse else None,
                     'meanErrorToProduction': sum(production_error.mean) / 3})
    sheet = Image.new('RGB', (size[0] * 4, size[1]), 'white')
    for n, im in enumerate([lanczos, Image.open(direct_file), Image.open(evidence / f'{browser}-downsample-hybrid.png'), production]):
        sheet.paste(im, (size[0] * n, 0))
    sheet.save(evidence / f'{browser}-downsample-comparison.png')
text = json.dumps({'source': 'docs/images/garden-5120.jpg', 'reference': 'Left to right: Pillow Lanczos, old single-pass, hybrid, actual production exporter. No reference scratch canvases are reset.',
                   'caution': 'One photo, one output size, local browser builds; not a production quality certification or performance result.', 'results': rows}, indent=2)
(evidence / 'quality-results.json').write_text(text + '\n')
print(text)
