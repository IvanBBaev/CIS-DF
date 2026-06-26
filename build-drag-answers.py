#!/usr/bin/env python3
"""Render a clean "correct answer" image for each drag-and-drop question.

The answer diagram lives in the PDF between the "Correct Answer:" label and the
following "Community Discussion". We locate those with `pdftotext -bbox`, then
crop that region with `pdftoppm` (stitching across a page break when needed).
"""
import os
import subprocess
import re
import glob
from PIL import Image

PDF = "cis-df.pdf"
DPI = int(os.environ.get("DRAG_DPI", "150"))
OUTDIR = os.environ.get("DRAG_OUTDIR", "site/img")
PT2PX = DPI / 72.0

# drag question id -> page where its "Question #N" header starts
START = {2: 10, 25: 25, 30: 28, 46: 37, 47: 38, 51: 41, 63: 47, 74: 53,
         102: 70, 126: 84, 127: 86, 174: 113, 175: 114, 176: 115}


PAGE_RE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)
WORD_RE = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>',
    re.S)


def load_bbox():
    """Return list (index 0 == PDF page 1) of (width, height, [words])."""
    out = subprocess.run(["pdftotext", "-bbox", PDF, "-"],
                         capture_output=True, text=True).stdout
    pages = []
    for m in PAGE_RE.finditer(out):
        w, h, body = float(m.group(1)), float(m.group(2)), m.group(3)
        words = []
        for wm in WORD_RE.finditer(body):
            text = re.sub(r"&amp;", "&", wm.group(5)).strip()
            words.append((float(wm.group(1)), float(wm.group(2)),
                          float(wm.group(3)), float(wm.group(4)), text))
        pages.append((w, h, words))
    return pages


def find_region(pages, qid, start_pg):
    """Return (page, top_pt, bottom_pt) list of slices for the answer box."""
    # Flatten words of start page and the next, tagged with 1-based page no.
    words = []
    for pg in (start_pg, start_pg + 1):
        if pg - 1 < len(pages):
            for w in pages[pg - 1][2]:
                words.append((pg,) + w)

    # 1) header "Question #<id>"
    hi = None
    for i in range(len(words) - 1):
        if words[i][5] == "Question" and words[i + 1][5] == f"#{qid}":
            hi = i; break
    if hi is None:
        raise RuntimeError(f"header not found for #{qid}")

    # 2) first "Explanation" heading after the header (sits just above the box;
    #    more reliable than "Correct Answer:", whose position varies per layout)
    ci = None
    for i in range(hi, len(words)):
        if words[i][5] == "Explanation":
            ci = i; break
    if ci is None:
        raise RuntimeError(f"'Explanation' not found for #{qid}")

    # 3) first "Community" after that
    ei = None
    for i in range(ci, len(words)):
        if words[i][5] == "Community":
            ei = i; break
    if ei is None:
        raise RuntimeError(f"'Community' not found for #{qid}")

    start_page = words[ci][0]
    start_top = words[ci][2]   # yMin of "Explanation" (just above the answer box)
    end_page = words[ei][0]
    end_bottom = words[ei][2]  # yMin of "Community" (just below the box)

    pad = 10
    if start_page == end_page:
        return [(start_page, start_top - pad, end_bottom - 4)]
    # spans two pages
    ph = pages[start_page - 1][1]
    return [(start_page, start_top - pad, ph), (end_page, 0, end_bottom - 4)]


def render_slice(page, top_pt, bottom_pt, w_pt, out):
    x = 0
    y = int(top_pt * PT2PX)
    w = int(w_pt * PT2PX)
    h = int((bottom_pt - top_pt) * PT2PX)
    subprocess.run(["pdftoppm", "-png", "-r", str(DPI), "-f", str(page), "-l", str(page),
                    "-x", str(x), "-y", str(y), "-W", str(w), "-H", str(h), PDF, out],
                   check=True, capture_output=True)
    # pdftoppm appends -NN; find the produced file
    import glob
    files = sorted(glob.glob(out + "*.png"))
    return files[-1]


def main():
    pages = load_bbox()
    for qid, start_pg in START.items():
        slices = find_region(pages, qid, start_pg)
        w_pt = pages[slices[0][0] - 1][0]
        parts = []
        for j, (pg, top, bot) in enumerate(slices):
            f = render_slice(pg, top, bot, w_pt, f"/tmp/slice_{qid}_{j}")
            parts.append(Image.open(f).convert("RGB"))
        if len(parts) == 1:
            combined = parts[0]
        else:
            W = max(p.width for p in parts)
            H = sum(p.height for p in parts)
            combined = Image.new("RGB", (W, H), "white")
            y = 0
            for p in parts:
                combined.paste(p, (0, y)); y += p.height
        combined.save(f"{OUTDIR}/drag-{qid}.jpg", "JPEG", quality=85)
        print(f"#{qid}: {combined.width}x{combined.height} ({len(slices)} slice(s))")


if __name__ == "__main__":
    main()
