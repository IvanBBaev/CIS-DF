#!/usr/bin/env python3
"""Parse the SecExams CIS-DF PDF text into structured JSON of questions."""
import json
import os
import re
import subprocess

# Drag-and-drop items/targets, transcribed by hand from the answer images
# (the PDF renders these as graphics, so no text is extractable). Keyed by id.
DRAG = {}
if os.path.exists("drag-content.json"):
    with open("drag-content.json") as f:
        DRAG = json.load(f)

# Extract plain text (no -layout: cleaner line flow for prose)
txt = subprocess.run(
    ["pdftotext", "cis-df.pdf", "-"], capture_output=True, text=True
).stdout

# Normalise line endings
lines = txt.split("\n")

# Remove obvious page furniture
noise_patterns = [
    re.compile(r"^\s*Page \d+ of \d+\s*$"),
    re.compile(r"^\s*ServiceNow.* - CIS-DF Practice Questions - SecExams\.com\s*$"),
    re.compile(r"^\s*Community Discussion\s*$"),
    re.compile(r"^\s*Questions List\s*$"),
]
cleaned = []
for ln in lines:
    if any(p.match(ln) for p in noise_patterns):
        continue
    cleaned.append(ln)
txt = "\n".join(cleaned)

# Split on "Question #N" headers (keep number)
parts = re.split(r"^Question #(\d+)\s*$", txt, flags=re.MULTILINE)
# parts = [preamble, num1, body1, num2, body2, ...]
segments = {}  # num -> list of bodies
it = iter(parts[1:])
for num, body in zip(it, it):
    n = int(num)
    segments.setdefault(n, []).append(body)

questions = []
opt_re = re.compile(r"^([A-H])\)\s*(.*)$")

for n in sorted(segments):
    bodies = segments[n]
    # The real body is the longest segment (TOC entry is just a page number)
    body = max(bodies, key=len)

    # Split off explanation / correct-answer block
    # Body layout: <question text> <options...> Explanation Correct Answer: XYZ ...
    raw = body.strip("\n")

    # Find the "Correct Answer:" marker line
    ca_match = re.search(r"Correct Answer:\s*([A-H ]*)\??", raw)
    correct_letters = ""
    if ca_match:
        correct_letters = re.sub(r"[^A-H]", "", ca_match.group(1).upper())

    # Everything before "Explanation" is the question + options
    qpart = re.split(r"\n\s*Explanation\s*\n", raw)[0]
    qlines = [l for l in qpart.split("\n")]

    # Walk lines: accumulate question text until first option line, then options
    qtext_lines = []
    options = []  # list of (letter, text)
    in_options = False
    for l in qlines:
        m = opt_re.match(l.strip())
        if m:
            in_options = True
            letter = m.group(1)
            otext = m.group(2)
            # strip the "(Correct Answer)" inline marker
            otext = re.sub(r"\s*\(Correct Answer\)\s*", "", otext).strip()
            options.append([letter, otext])
        elif in_options:
            # continuation of previous option (wrapped line) — but skip blanks
            if l.strip() and options:
                # avoid swallowing stray page numbers
                if not re.match(r"^\d+$", l.strip()):
                    options[-1][1] = (options[-1][1] + " " + l.strip()).strip()
        else:
            if l.strip():
                qtext_lines.append(l.strip())

    # Detect inline "(Correct Answer)" markers as fallback for correct set
    inline_correct = set()
    for letter, _ in options:
        pass
    # re-scan original qpart for "(Correct Answer)" attached to options
    for m in re.finditer(r"^([A-H])\).*\(Correct Answer\)", qpart, flags=re.MULTILINE):
        inline_correct.add(m.group(1))

    qtext = " ".join(qtext_lines).strip()
    # clean leftover bare page numbers at edges
    qtext = re.sub(r"\s+\d+\s*$", "", qtext).strip()

    is_drag = "DRAG DROP" in qtext.upper() or "DRAG AND DROP" in qtext.upper()
    if is_drag:
        # The "DRAG DROP -" lead-in is redundant with the type badge in the UI.
        qtext = re.sub(r"^\s*DRAG\s+(AND\s+)?DROP\s*-?\s*", "", qtext, flags=re.I).strip()
    choose_match = re.search(r"Choose (two|three|TWO|THREE)", qtext, re.IGNORECASE)

    correct_set = set(correct_letters)
    if inline_correct:
        correct_set |= inline_correct

    # Final cleanup of option text: drop any "(Correct Answer)" marker
    # (incl. fragments split across wrapped lines) and tidy whitespace.
    for opt in options:
        opt[1] = re.sub(r"\s*\(\s*Correct Answer\s*\)\s*", " ", opt[1])
        opt[1] = re.sub(r"\s+", " ", opt[1]).strip()

    # Determine type
    if is_drag or not options:
        qtype = "drag" if is_drag else "info"
    elif len(correct_set) > 1 or choose_match:
        qtype = "multi"
    else:
        qtype = "single"

    entry = {
        "id": n,
        "type": qtype,
        "text": qtext,
        "options": [{"letter": l, "text": t} for l, t in options],
        "correct": sorted(correct_set),
    }

    if qtype == "drag":
        # Interactive items/targets + correct mapping + answer image (for review).
        entry["images"] = [f"img/drag-{n}.jpg"]
        meta = DRAG.get(str(n))
        if meta:
            entry["items"] = meta["items"]
            entry["targets"] = meta["targets"]
            entry["answer"] = meta.get("answer", [])

    questions.append(entry)

with open("site/questions.json", "w") as f:
    json.dump(questions, f, indent=2, ensure_ascii=False)

# Stats
no_correct = [q["id"] for q in questions if not q["correct"] and q["type"] != "drag"]
drag = [q["id"] for q in questions if q["type"] == "drag"]
print(f"total questions: {len(questions)}")
print(f"single: {sum(1 for q in questions if q['type']=='single')}")
print(f"multi:  {sum(1 for q in questions if q['type']=='multi')}")
print(f"drag:   {len(drag)} -> {drag}")
print(f"missing correct (non-drag): {no_correct}")
