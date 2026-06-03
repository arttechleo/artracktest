# apriltag-generator

Offline AprilTag generator for the live AR theater stage. Makes printable
markers + a 4-corner/center anchor set for tracking. No ROS, no OpenCV needed
for output.

## Setup

```bash
py -3.12 -m venv venv
venv\Scripts\python -m pip install -r requirements.txt   # Windows
# source venv/bin/activate; pip install -r requirements.txt   # Mac/Linux
```

## Usage

```bash
# 4x6 board of tag36h11, 50 mm each
python generate_tags.py --family tag36h11 --rows 4 --cols 6 --size 50

# stage anchors: 4 corners + center, 200 mm, with print PDF
python generate_tags.py --stage-mode --size 200 --pdf

# extras: SVG vector, QR fallback overlay
python generate_tags.py --rows 2 --cols 3 --svg --qr
```

## Flags

| flag | default | meaning |
|------|---------|---------|
| `--family` | tag36h11 | tag16h5 / tag25h9 / tag36h10 / tag36h11 |
| `--rows --cols` | 4 6 | board grid (also tag count) |
| `--num` | 0 | explicit tag count, overrides rows*cols |
| `--size` | 50 | black-border size in mm |
| `--dpi` | 300 | print DPI (300 floor enforced) |
| `--quiet` | 2 | white quiet-zone modules (print margin) |
| `--svg` | off | also export vector SVG |
| `--pdf` | off | also export print PDF |
| `--qr` | off | QR fallback in quiet zone |
| `--stage-mode` | off | 4 corner + 1 center fixed-ID set |

## Stage ID contract

`TL=0  TR=1  BL=2  BR=3  CENTER=4` — audience views from the bottom edge.
Tracking system relies on these IDs; do not reassign.

## Output

```
output/
  tags/         individual PNG (+SVG) tags
  boards/       combined printable sheet (+PDF)
  stage_layout/ corner/center tags, diagram (PNG+ASCII), print PDF
```

tag36h11 recommended for stage: 587 unique IDs, high Hamming distance =
robust under stage lighting changes. Use the largest `--size` your mount
allows; bigger marker = longer detection range.
