"""Pin and vendor device frames; turn binary screen masks into canvas alpha masks."""
import concurrent.futures
import io
import json
from pathlib import Path
import urllib.request
from PIL import Image

REVISION = '551098a1f40ce33e6376ab9fdcad2d0756d5a47c'
BASE = f'https://raw.githubusercontent.com/jonnyjackson26/device-frames-media/{REVISION}/'
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist' / 'assets' / 'frames'
OUT.mkdir(parents=True, exist_ok=True)
ORDER = ['16-pro-max', '16-pro', '16-plus', '16', '15-pro-max', '15', '14-pro-max', '13', '13-mini', '12-pro-max', '11-pro-max', '11-pro', '11']
LABELS = {'black-titanium':'Titan đen','natural-titanium':'Titan tự nhiên','white-titanium':'Titan trắng','desert-titanium':'Titan sa mạc','blue-titanium':'Titan xanh','black':'Đen','white':'Trắng','pink':'Hồng','teal':'Xanh mòng két','ultramarine':'Xanh ultramarine','yellow':'Vàng','deep-purple':'Tím đậm','gold':'Vàng','silver':'Bạc','space-black':'Đen không gian','midnight':'Đêm','starlight':'Ánh sao','red':'Đỏ','product-red':'Đỏ','blue':'Xanh','graphite':'Than chì','pacific-blue':'Xanh Thái Bình Dương'}

def read(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()

index = json.loads(read(BASE + 'device-frames-output/index.json'))['apple-iphone']
models = []
jobs = []
for model in ORDER:
    variants = []
    for key, data in index[model].items():
        if 'shadow' in key:
            continue
        stem = f'{model}-{key}'
        variants.append({'key':key,'name':LABELS.get(key,key.title()),'color':data['hexColor'],'frame':f'assets/frames/{stem}.webp','mask':f'assets/frames/{stem}-mask.png','screen':data['screen'],'frameSize':data['frameSize']})
        jobs.append((stem, data))
    variants.sort(key=lambda v: (v['key'] != 'natural-titanium', v['key'] != 'black', v['key']))
    models.append({'key':model,'name':'iPhone '+model.replace('-', ' ').replace('pro','Pro').replace('max','Max').replace('plus','Plus'),'variants':variants})

def download(job):
    stem, data = job
    frame_url = data['frame'].replace('/main/', f'/{REVISION}/')
    mask_url = data['mask'].replace('/main/', f'/{REVISION}/')
    frame = Image.open(io.BytesIO(read(frame_url))).convert('RGBA')
    frame.save(OUT / f'{stem}.webp', 'WEBP', lossless=True)
    mask = Image.open(io.BytesIO(read(mask_url))).convert('L')
    alpha = Image.new('RGBA', mask.size, (255,255,255,0))
    alpha.putalpha(mask)
    alpha.save(OUT / f'{stem}-mask.png', optimize=True)
    return stem

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for name in pool.map(download, jobs):
        print(name, flush=True)
(ROOT/'src'/'frames.json').write_text(json.dumps(models, ensure_ascii=False, indent=2))
(ROOT/'dist'/'assets'/'frames'/'SOURCE.txt').write_text(f'Device artwork: Apple Design Resources and upstream device-frame contributors.\nSource: https://github.com/jonnyjackson26/device-frames-media/tree/{REVISION}\nSee upstream frame provenance and Apple Design Resources terms: https://developer.apple.com/design/resources/\nImages are device presentation assets; Apple and iPhone are trademarks of Apple Inc.\n')
print(f'Vendored {len(models)} models, {len(jobs)} frames')
