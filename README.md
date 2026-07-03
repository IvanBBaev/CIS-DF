# CIS-DF Practice Exam — interactive web app

A dynamic, browser-based quiz built from the `cis-df.pdf` SecExams question dump
(ServiceNow **Certified Implementation Specialist — Discovery & Service Mapping**).

192 questions: 134 single-answer, 44 multi-answer ("choose two/three"), and
14 interactive drag-and-drop items. Any type can be toggled off on the start
screen.

## Features

- **Practice mode** — instant per-question feedback (correct answer highlighted).
- **Exam mode** — answer everything, then get scored.
- Single- and multi-answer grading (exact-match).
- **Interactive, auto-graded drag-and-drop**: drag items into slots (or tap an
  item then a slot), then "Check answer" grades each slot (green/red, with the
  correct item shown on misses) and reveals the official answer diagram. Drag
  questions count toward the score (correct only when every slot matches).
- Configurable session: number of questions, included types, shuffle questions /
  options.
- Question **overview grid**, **flag for review**, prev/next navigation, timer.
- **Score screen** with verdict, per-question review, and "retry wrong only".
- Progress, best score and attempt count persisted in `localStorage`
  (resume an interrupted session).
- Keyboard shortcuts: `A–H` select · `→`/`Enter` next · `←` back · `F` flag.
- Light/dark theme.

Everything is client-side (vanilla HTML/CSS/JS + a static `questions.json`);
there is no backend or build step.

## Run

The app fetches `questions.json`, so it must be served over HTTP (opening
`index.html` from the filesystem is blocked by the browser's `file://` policy):

```bash
cd site
python3 -m http.server 8765
# open http://localhost:8765/
```

## Files

```
site/
  index.html        app shell
  styles.css        styling (dark/light)
  app.js            quiz engine (incl. interactive drag & drop)
  questions.json    192 parsed questions (generated)
  img/drag-*.jpg    official-answer image per drag-and-drop question
build-questions.py  rebuilds questions.json from cis-df.pdf + drag-content.json
build-drag-answers.py rebuilds the drag answer images from the PDF
drag-content.json   drag items/targets, transcribed by hand from the images
cis-df.pdf          source question dump
```

## Regenerating the data

Requires `poppler` (`brew install poppler`) for `pdftotext`/`pdftoppm`, and
Pillow (`pip install pillow`) for the drag answer images.

```bash
python3 build-questions.py      # -> site/questions.json
python3 build-drag-answers.py   # -> site/img/drag-*.jpg
```

The drag-and-drop items/targets/answers can't be extracted from the PDF (it
renders them as graphics), so they are transcribed by hand in `drag-content.json`
(`answer[i]` = the correct item for target `i`, read from the answer diagrams).
The app grades against that key and also shows the official answer image.

## Support

This app is built and maintained in my own time. If it's useful to you, please
consider supporting its continued development — every tip is genuinely appreciated.

- **[GitHub Sponsors](https://github.com/sponsors/IvanBBaev)** — one-off or
  recurring, with no platform fee taken out (the preferred option).
- **[Ko-fi](https://ko-fi.com/ivanbbaev)** — quick one-off support; it also
  accepts **PayPal**, so it's the fallback for anyone without a GitHub account.
- **[Donate (Donatree)](https://donatr.ee/ivanbbaev/)** — a no-account donation
  page (card, PayPal and more) for a one-off tip.

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?style=flat-square&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/IvanBBaev)
[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-Support-ff5e5b?style=flat-square&logo=kofi&logoColor=white)](https://ko-fi.com/ivanbbaev)
[![Donate via Donatree](https://img.shields.io/badge/Donate-Donatree-22c55e?style=flat-square&logo=liberapay&logoColor=white)](https://donatr.ee/ivanbbaev/)
