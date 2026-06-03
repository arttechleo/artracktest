"""
Prepares optimized WebXR tracking images.
Applies CLAHE contrast enhancement + sharpening to maximize
feature detection confidence in both day and night conditions.
"""
import cv2, glob, shutil, os
import numpy as np
from PIL import Image
from pathlib import Path

OUT = Path('public/targets')
OUT.mkdir(parents=True, exist_ok=True)

def optimize(img_path, out_path, target_width=1024):
    img = cv2.imread(str(img_path))
    assert img is not None, f"Could not read {img_path}"

    # Resize to optimal tracking resolution
    h, w = img.shape[:2]
    scale = target_width / w
    img = cv2.resize(img, (target_width, int(h * scale)), interpolation=cv2.INTER_LANCZOS4)

    # CLAHE — adaptive contrast, makes features visible in both dark + bright images
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    # Unsharp mask — sharpens edges = more keypoints for tracker
    blur = cv2.GaussianBlur(img, (0, 0), 3)
    img = cv2.addWeighted(img, 1.5, blur, -0.5, 0)

    # Score image quality — count detectable keypoints
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    sift = cv2.SIFT_create()
    kps = sift.detect(gray, None)
    print(f"  {out_path.name}: {len(kps)} keypoints detected")
    assert len(kps) >= 200, f"Too few keypoints ({len(kps)}) — image won't track reliably"

    cv2.imwrite(str(out_path), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return len(kps)

print("=== Optimizing panel targets ===")
panels = {
    'panel_sun':    'trackimages/panels/panel_sun.jpg',
    'panel_roses':  'trackimages/panels/panel_roses.jpg',
    'panel_flower': 'trackimages/panels/panel_flower.jpg',
    'panel_lotus':  'trackimages/panels/panel_lotus.jpg',
}
for name, src in panels.items():
    if os.path.exists(src):
        optimize(Path(src), OUT / f'{name}.jpg')
    else:
        print(f"  MISSING: {src}")

print("\n=== Selecting best coffin target ===")
coffin_imgs = glob.glob('trackimages/day/*.jpg') + glob.glob('trackimages/night/*.jpg')

# Rank by keypoint count — most keypoints = most trackable
def score(path):
    img = cv2.imread(path)
    if img is None: return 0
    # Resize to score at standard size
    img = cv2.resize(img, (1024, int(img.shape[0] * 1024 / img.shape[1])))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    kps = cv2.SIFT_create().detect(gray, None)
    return len(kps)

print(f"  Scoring {len(coffin_imgs)} coffin images...")
scored = sorted(coffin_imgs, key=score, reverse=True)

print(f"\n  Top 5 most trackable coffin images:")
for p in scored[:5]:
    print(f"    {score(p):4d} kp — {p}")

best = scored[0]
print(f"\n  Selected: {best}")
kps = optimize(Path(best), OUT / 'coffin_front.jpg')
print(f"  Coffin target ready: {kps} keypoints")

print("\n=== Summary ===")
for f in sorted(OUT.glob('*.jpg')):
    size = f.stat().st_size / 1024
    img = cv2.imread(str(f))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    kps = cv2.SIFT_create().detect(gray, None)
    print(f"  {f.name}: {size:.0f}KB, {len(kps)} keypoints")

print("\nAll targets ready. Run: node build.js && git push")
