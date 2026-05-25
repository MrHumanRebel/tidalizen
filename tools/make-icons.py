#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
src = Path('app/assets/tidalizen-logo.png')
img = Image.open(src).convert('RGBA')
w, h = img.size
m = min(w, h)
img = img.crop(((w-m)//2, (h-m)//2, (w-m)//2 + m, (h-m)//2 + m))
for size in (64, 117, 128, 256, 512):
    img.resize((size, size), Image.LANCZOS).save(f'app/assets/icons/icon-{size}.png')
img.resize((512, 512), Image.LANCZOS).save('app/icon.png')
print('icons generated')
