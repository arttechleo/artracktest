#!/usr/bin/env python3
"""
AprilTag generator for stage AR anchoring.

Generates individual AprilTag PNGs, a combined printable board, and (in
stage-mode) a 4-corner + center anchor layout for a live AR theater install.

Runs fully offline. No ROS. No OpenCV required for output (moms-apriltag pulls
in cv2 only for its detector code paths, unused here).

Examples:
    python generate_tags.py --family tag36h11 --rows 4 --cols 6 --size 50
    python generate_tags.py --stage-mode --size 200 --pdf
    python generate_tags.py --rows 2 --cols 3 --svg --qr
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import imageio.v2 as imageio
import moms_apriltag as apriltag

# ------------------------------------------------------------------ constants
SUPPORTED_FAMILIES = ["tag16h5", "tag25h9", "tag36h10", "tag36h11"]
DEFAULT_DPI = 300          # print resolution floor
MM_PER_INCH = 25.4

# stage-mode explicit ID assignment (tracking system contract)
STAGE_IDS = {"TL": 0, "TR": 1, "BL": 2, "BR": 3, "CENTER": 4}

OUT_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
OUT_TAGS = os.path.join(OUT_ROOT, "tags")
OUT_BOARDS = os.path.join(OUT_ROOT, "boards")
OUT_STAGE = os.path.join(OUT_ROOT, "stage_layout")


# ------------------------------------------------------------------ helpers
def mm_to_px(mm: float, dpi: int) -> int:
    """Physical mm -> pixel count at given DPI."""
    return max(1, int(round(mm / MM_PER_INCH * dpi)))


def make_tag_bits(family: str, tag_id: int) -> np.ndarray:
    """Raw tag bitmap: uint8 0/255, includes 1-module black border.

    Shape is (N, N) where N = family data size + 2 (e.g. 8 for tag36h11).
    """
    gen = apriltag.TagGenerator2(family)
    if tag_id < 0 or tag_id > gen.max_id:
        raise ValueError(
            f"id {tag_id} out of range for {family} (0..{gen.max_id})"
        )
    return gen.generate(tag_id)


def render_tag_png(
    bits: np.ndarray, size_mm: float, dpi: int, quiet_modules: int
) -> np.ndarray:
    """Upscale raw bits to print resolution + add white quiet zone.

    size_mm refers to the outer black border (the standard AprilTag size).
    Returns uint8 grayscale (0/255), exact square, nearest-neighbour so module
    edges stay razor sharp.
    """
    n = bits.shape[0]                      # modules across black border box
    px_per_module = max(1, mm_to_px(size_mm, dpi) // n)
    # nearest-neighbour upscale -> crisp B/W squares, no anti-alias grey
    tag = np.kron(bits, np.ones((px_per_module, px_per_module), dtype=np.uint8))
    quiet_px = quiet_modules * px_per_module
    if quiet_px:
        tag = np.pad(tag, quiet_px, mode="constant", constant_values=255)
    return tag


def overlay_qr(tag_img: np.ndarray, payload: str) -> np.ndarray:
    """Stamp a small QR code in the white quiet zone (hybrid fallback).

    QR is placed bottom-right inside the margin so it never touches tag data.
    Silently no-ops if `qrcode` is not installed.
    """
    try:
        import qrcode
    except ImportError:
        print("  ! qrcode not installed, skipping QR overlay", file=sys.stderr)
        return tag_img
    qr = qrcode.QRCode(border=1, box_size=2)
    qr.add_data(payload)
    qr.make(fit=True)
    qr_img = np.array(
        qr.make_image(fill_color="black", back_color="white").convert("L"),
        dtype=np.uint8,
    )
    side = tag_img.shape[0]
    qr_side = min(qr_img.shape[0], side // 5)
    qr_small = qr_img[:qr_side, :qr_side] if qr_img.shape[0] > qr_side else qr_img
    qs = qr_small.shape[0]
    pad = max(2, side // 100)
    out = tag_img.copy()
    out[side - qs - pad:side - pad, side - qs - pad:side - pad] = qr_small
    return out


def save_png(path: str, img: np.ndarray, dpi: int) -> None:
    imageio.imwrite(path, img, dpi=(dpi, dpi))


def save_svg(path: str, bits: np.ndarray, quiet_modules: int) -> None:
    """Vector SVG: 1 unit per module. White bg + black rects. Print-scalable."""
    n = bits.shape[0]
    full = n + 2 * quiet_modules
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{full}" '
        f'height="{full}" viewBox="0 0 {full} {full}" shape-rendering="crispEdges">',
        f'<rect width="{full}" height="{full}" fill="#fff"/>',
    ]
    for r in range(n):
        for c in range(n):
            if bits[r, c] == 0:  # black module
                x = c + quiet_modules
                y = r + quiet_modules
                parts.append(
                    f'<rect x="{x}" y="{y}" width="1" height="1" fill="#000"/>'
                )
    parts.append("</svg>")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


# ------------------------------------------------------------------ board
def build_board(
    family: str,
    ids: list[int],
    rows: int,
    cols: int,
    size_mm: float,
    dpi: int,
    quiet_modules: int,
    qr: bool,
) -> np.ndarray:
    """Tile rendered tags into one rows x cols printable sheet."""
    tiles = []
    for tag_id in ids:
        bits = make_tag_bits(family, tag_id)
        img = render_tag_png(bits, size_mm, dpi, quiet_modules)
        if qr:
            img = overlay_qr(img, f"{family}:{tag_id}")
        tiles.append(img)
    cell = tiles[0].shape[0]
    sheet = np.full((rows * cell, cols * cell), 255, dtype=np.uint8)
    for idx, tile in enumerate(tiles):
        r, c = divmod(idx, cols)
        sheet[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = tile
    return sheet


def save_board_pdf(path: str, sheet: np.ndarray, size_mm: float, cols: int,
                   rows: int, quiet_modules: int, family: str) -> None:
    """One-page PDF sized to the real board for stage-crew printing."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    cell_mm = size_mm * (1 + 2 * quiet_modules / _border_modules(family))
    w_in = cols * cell_mm / MM_PER_INCH
    h_in = rows * cell_mm / MM_PER_INCH
    fig = plt.figure(figsize=(w_in, h_in), dpi=DEFAULT_DPI)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(sheet, cmap="gray", vmin=0, vmax=255, interpolation="nearest")
    ax.axis("off")
    fig.savefig(path, dpi=DEFAULT_DPI, format="pdf")
    plt.close(fig)


def _border_modules(family: str) -> int:
    return apriltag.TagGenerator2(family).size + 2


# ------------------------------------------------------------------ stage mode
def run_stage_mode(args) -> None:
    """4 corner anchors + 1 center reference, with explicit IDs + layout."""
    print(f"[stage-mode] family={args.family} size={args.size}mm "
          f"dpi={args.dpi}")
    rendered = {}
    for name, tag_id in STAGE_IDS.items():
        bits = make_tag_bits(args.family, tag_id)
        img = render_tag_png(bits, args.size, args.dpi, args.quiet)
        if args.qr:
            img = overlay_qr(img, f"{name}:{args.family}:{tag_id}")
        png = os.path.join(OUT_STAGE, f"stage_{name}_id{tag_id}.png")
        save_png(png, img, args.dpi)
        if args.svg:
            save_svg(os.path.join(OUT_STAGE, f"stage_{name}_id{tag_id}.svg"),
                     bits, args.quiet)
        rendered[name] = img
        print(f"  {name:<6} id={tag_id} -> {os.path.relpath(png, OUT_ROOT)}")

    _save_stage_diagram_png(rendered)
    _write_stage_diagram_ascii(args.family)
    if args.pdf:
        _save_stage_pdf(rendered, args)
    print(f"[stage-mode] done -> {os.path.relpath(OUT_STAGE)}")


def _save_stage_diagram_png(rendered: dict) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(8, 6), dpi=150)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 8)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.add_patch(plt.Rectangle((1, 1), 8, 6, fill=False, lw=2, ec="black"))
    ax.text(5, 7.4, "STAGE  (audience side = bottom)", ha="center",
            fontsize=12, weight="bold")
    pos = {"TL": (1, 7), "TR": (9, 7), "BL": (1, 1), "BR": (9, 1),
           "CENTER": (5, 4)}
    for name, (x, y) in pos.items():
        ax.imshow(rendered[name], cmap="gray", vmin=0, vmax=255,
                  extent=(x - 0.7, x + 0.7, y - 0.7, y + 0.7), zorder=5)
        ax.text(x, y - 0.95, f"{name} (id {STAGE_IDS[name]})", ha="center",
                fontsize=9, zorder=6)
    out = os.path.join(OUT_STAGE, "stage_layout_diagram.png")
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  diagram -> {os.path.relpath(out, OUT_ROOT)}")


def _write_stage_diagram_ascii(family: str) -> None:
    art = f"""\
STAGE LAYOUT  (AprilTag {family})
audience views from the BOTTOM edge.

  +---------------------------------------------+
  | [TL id0]                          [TR id1]  |
  |                                             |
  |                                             |
  |                 [CENTER id4]                |
  |                                             |
  |                                             |
  | [BL id2]                          [BR id3]  |
  +---------------------------------------------+
                  audience / front

ID contract: TL=0  TR=1  BL=2  BR=3  CENTER=4
"""
    out = os.path.join(OUT_STAGE, "stage_layout_diagram.txt")
    with open(out, "w", encoding="utf-8") as f:
        f.write(art)
    print(art)
    print(f"  ascii -> {os.path.relpath(out, OUT_ROOT)}")


def _save_stage_pdf(rendered: dict, args) -> None:
    """One tag per page, labelled, for crew to print + mount."""
    import matplotlib
    matplotlib.use("Agg")
    from matplotlib.backends.backend_pdf import PdfPages

    out = os.path.join(OUT_STAGE, "stage_tags_print.pdf")
    side_in = args.size / MM_PER_INCH
    with PdfPages(out) as pdf:
        import matplotlib.pyplot as plt
        for name, tag_id in STAGE_IDS.items():
            fig = plt.figure(figsize=(side_in + 1, side_in + 1.5),
                             dpi=DEFAULT_DPI)
            ax = fig.add_axes([0.05, 0.1, 0.9, 0.8])
            ax.imshow(rendered[name], cmap="gray", vmin=0, vmax=255,
                      interpolation="nearest")
            ax.axis("off")
            fig.text(0.5, 0.95, f"{name}  (id {tag_id})  {args.family}",
                     ha="center", fontsize=14, weight="bold")
            fig.text(0.5, 0.04, f"print at {args.size} mm border",
                     ha="center", fontsize=9)
            pdf.savefig(fig)
            plt.close(fig)
    print(f"  pdf -> {os.path.relpath(out, OUT_ROOT)}")


# ------------------------------------------------------------------ explicit ids
def save_tag_pdf(path: str, img: np.ndarray, family: str, tag_id: int,
                 size_mm: float) -> None:
    """One tag on one page, labelled, for crew to print + mount."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    side_in = size_mm / MM_PER_INCH
    fig = plt.figure(figsize=(side_in + 1, side_in + 1.5), dpi=DEFAULT_DPI)
    ax = fig.add_axes([0.05, 0.1, 0.9, 0.8])
    ax.imshow(img, cmap="gray", vmin=0, vmax=255, interpolation="nearest")
    ax.axis("off")
    fig.text(0.5, 0.95, f"id {tag_id}  {family}", ha="center",
             fontsize=14, weight="bold")
    fig.text(0.5, 0.04, f"print at {size_mm} mm border", ha="center", fontsize=9)
    fig.savefig(path, dpi=DEFAULT_DPI, format="pdf")
    plt.close(fig)


def run_ids_mode(args) -> None:
    """Render each explicit ID as an individual PNG (+ optional PDF/SVG)."""
    print(f"[ids] family={args.family} ids={args.ids} size={args.size}mm "
          f"dpi={args.dpi}")
    for tag_id in args.ids:
        bits = make_tag_bits(args.family, tag_id)
        img = render_tag_png(bits, args.size, args.dpi, args.quiet)
        if args.qr:
            img = overlay_qr(img, f"{args.family}:{tag_id}")
        png = os.path.join(OUT_TAGS, f"{args.family}_id{tag_id:03d}.png")
        save_png(png, img, args.dpi)
        print(f"  png -> {os.path.relpath(png)}")
        if args.svg:
            svg = os.path.join(OUT_TAGS, f"{args.family}_id{tag_id:03d}.svg")
            save_svg(svg, bits, args.quiet)
            print(f"  svg -> {os.path.relpath(svg)}")
        if args.pdf:
            pdf = os.path.join(OUT_TAGS, f"{args.family}_id{tag_id:03d}.pdf")
            save_tag_pdf(pdf, img, args.family, tag_id, args.size)
            print(f"  pdf -> {os.path.relpath(pdf)}")


# ------------------------------------------------------------------ normal mode
def run_grid_mode(args) -> None:
    n_tags = args.num if args.num else args.rows * args.cols
    ids = list(range(n_tags))
    print(f"[grid] family={args.family} {args.rows}x{args.cols} "
          f"n={n_tags} size={args.size}mm dpi={args.dpi}")

    for tag_id in ids:
        bits = make_tag_bits(args.family, tag_id)
        img = render_tag_png(bits, args.size, args.dpi, args.quiet)
        if args.qr:
            img = overlay_qr(img, f"{args.family}:{tag_id}")
        png = os.path.join(OUT_TAGS, f"{args.family}_id{tag_id:03d}.png")
        save_png(png, img, args.dpi)
        if args.svg:
            save_svg(os.path.join(OUT_TAGS, f"{args.family}_id{tag_id:03d}.svg"),
                     bits, args.quiet)
    print(f"  {len(ids)} tag(s) -> {os.path.relpath(OUT_TAGS)}")

    sheet = build_board(args.family, ids, args.rows, args.cols, args.size,
                        args.dpi, args.quiet, args.qr)
    board_png = os.path.join(OUT_BOARDS,
                             f"board_{args.family}_{args.rows}x{args.cols}.png")
    save_png(board_png, sheet, args.dpi)
    print(f"  board -> {os.path.relpath(board_png)}")
    if args.pdf:
        board_pdf = board_png.replace(".png", ".pdf")
        save_board_pdf(board_pdf, sheet, args.size, args.cols, args.rows,
                       args.quiet, args.family)
        print(f"  pdf   -> {os.path.relpath(board_pdf)}")


# ------------------------------------------------------------------ cli
def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Generate printable AprilTags for stage AR anchoring.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--family", default="tag36h11", choices=SUPPORTED_FAMILIES)
    p.add_argument("--rows", type=int, default=4)
    p.add_argument("--cols", type=int, default=6)
    p.add_argument("--num", type=int, default=0,
                   help="explicit tag count (overrides rows*cols if set)")
    p.add_argument("--ids", type=int, nargs="+", default=None,
                   help="explicit tag IDs to render individually (PNG + per-tag "
                        "PDF), no board. e.g. --ids 6 7 8")
    p.add_argument("--size", type=float, default=50.0,
                   help="tag black-border size in mm")
    p.add_argument("--dpi", type=int, default=DEFAULT_DPI,
                   help=f"print DPI (min {DEFAULT_DPI})")
    p.add_argument("--quiet", type=int, default=2,
                   help="white quiet-zone width in modules (print margin)")
    p.add_argument("--svg", action="store_true", help="also export SVG vector")
    p.add_argument("--pdf", action="store_true", help="also export print PDF")
    p.add_argument("--qr", action="store_true",
                   help="overlay QR fallback in quiet zone")
    p.add_argument("--stage-mode", action="store_true",
                   help="4 corner + 1 center anchor set with fixed IDs")
    args = p.parse_args(argv)
    if args.dpi < DEFAULT_DPI:
        print(f"! raising dpi {args.dpi} -> {DEFAULT_DPI} (print floor)",
              file=sys.stderr)
        args.dpi = DEFAULT_DPI
    return args


def main(argv=None):
    args = parse_args(argv)
    for d in (OUT_TAGS, OUT_BOARDS, OUT_STAGE):
        os.makedirs(d, exist_ok=True)
    if args.stage_mode:
        run_stage_mode(args)
    elif args.ids:
        run_ids_mode(args)
    else:
        run_grid_mode(args)


if __name__ == "__main__":
    main()
