"""Independent screenshot/export and Pillow EXIF-reference comparisons."""
import json
import sys
from PIL import Image, ImageChops, ImageStat, ImageFilter

manifest = json.load(open(sys.argv[1]))
results = []
failed = False
for case in manifest:
    a = Image.open(case['actual']).convert('RGB')
    b = Image.open(case['expected']).convert('RGB')
    if a.size != b.size:
        results.append({'name': case['name'], 'passed': False, 'sizes': [a.size, b.size]})
        failed = True
        continue
    diff = ImageChops.difference(a, b)
    mean = sum(ImageStat.Stat(diff).mean) / 3
    # Fraction of pixels with any channel differing by more than 20 / 255.
    large = sum(1 for pixel in diff.getdata() if max(pixel) > 20) / (a.width * a.height)
    # CSS compositing and high-quality Canvas filtering differ at subpixel edges.
    # Check geometry separately: blur removes filter sharpness, and flat interiors
    # must have no >20-channel errors outside a 2px edge band. EXIF/detail references
    # retain their strict independent thresholds and are not relaxed by this check.
    mask = ImageChops.lighter(a.filter(ImageFilter.FIND_EDGES), b.filter(ImageFilter.FIND_EDGES)).convert('L')
    mask = mask.point(lambda n: 255 if n > 1 else 0).filter(ImageFilter.MaxFilter(5))
    off_edge_errors = sum(1 for pixel, edge in zip(diff.getdata(), mask.getdata()) if not edge and max(pixel) > 20)
    blurred = ImageChops.difference(a.filter(ImageFilter.GaussianBlur(1)), b.filter(ImageFilter.GaussianBlur(1)))
    blur_mean = sum(ImageStat.Stat(blurred).mean) / 3
    passed = mean <= case.get('maxMean', 2.5) and large <= case.get('maxLarge', 0.06) and blur_mean < .8 and off_edge_errors == 0
    results.append({'name': case['name'], 'passed': passed, 'meanAbsoluteRGB': mean, 'fractionOver20': large,
                    'blurredMeanAbsoluteRGB': blur_mean, 'offEdgeErrors': off_edge_errors, 'pixels': a.width * a.height})
    failed |= not passed
print(json.dumps(results, indent=2))
sys.exit(1 if failed else 0)
