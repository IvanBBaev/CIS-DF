/* ===== CIS-DF Practice Exam — application logic ===== */
(() => {
  "use strict";

  const LS = {
    stats: "cisdf.stats",
    session: "cisdf.session",
    theme: "cisdf.theme",
  };

  /** @type {Array} full question bank */
  let BANK = [];

  /** runtime session state */
  let S = null;
  let timerInt = null;

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    // Buttons default to type="submit"; force "button" so a click can never
    // trigger an implicit form submission / page reload.
    if (tag === "button") e.type = "button";
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const fmtTime = (sec) => {
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };
  const sameSet = (a, b) =>
    a.length === b.length && a.every((x) => b.includes(x));

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove("show"), 1800);
  }

  // ---------- persistence ----------
  const loadStats = () => {
    try { return JSON.parse(localStorage.getItem(LS.stats)) || {}; }
    catch { return {}; }
  };
  const saveStats = (s) => localStorage.setItem(LS.stats, JSON.stringify(s));

  const saveSession = () => {
    if (!S || S.finished) return;
    const slim = {
      mode: S.mode, order: S.order, answers: S.answers,
      flagged: [...S.flagged], revealed: [...S.revealed], idx: S.idx,
      elapsed: S.elapsed, shuffleMap: S.shuffleMap,
    };
    localStorage.setItem(LS.session, JSON.stringify(slim));
  };
  const clearSession = () => localStorage.removeItem(LS.session);
  const peekSession = () => {
    try { return JSON.parse(localStorage.getItem(LS.session)); }
    catch { return null; }
  };

  // ---------- theme ----------
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    $("themeBtn").firstChild.textContent = t === "dark" ? "🌙 " : "☀️ ";
    localStorage.setItem(LS.theme, t);
  }
  $("themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  // ---------- start screen wiring ----------
  const settings = { mode: "practice", count: "all" };

  function wireSeg(segId, key, cb) {
    $(segId).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      [...$(segId).children].forEach((c) => c.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      settings[key] = b.dataset[key];
      if (cb) cb();
    });
  }
  wireSeg("modeSeg", "mode");
  wireSeg("countSeg", "count");

  function refreshStartStats() {
    const st = loadStats();
    $("statTotal").textContent = BANK.length;
    $("qCount").textContent = BANK.length;
    $("statBest").textContent = st.best != null ? st.best + "%" : "–";
    $("statAttempts").textContent = st.attempts || 0;
    const sess = peekSession();
    if (sess) {
      const answered = Object.keys(sess.answers || {}).length;
      $("statResume").textContent = `${answered}/${sess.order.length}`;
      $("resumeRow").classList.remove("hidden");
    } else {
      $("statResume").textContent = "–";
      $("resumeRow").classList.add("hidden");
    }
  }

  // ---------- build session ----------
  function buildOrder() {
    const types = [];
    if ($("incSingle").checked) types.push("single");
    if ($("incMulti").checked) types.push("multi");
    if ($("incDrag").checked) types.push("drag");
    let pool = BANK.filter((q) => types.includes(q.type));
    if (!pool.length) { toast("Select at least one question type"); return null; }

    if ($("shuffleQ").checked) pool = shuffle(pool);
    if (settings.count !== "all") {
      const n = parseInt(settings.count, 10);
      pool = pool.slice(0, n);
    }
    const order = pool.map((q) => q.id);

    // per-question option shuffle map
    const shuffleMap = {};
    if ($("shuffleO").checked) {
      pool.forEach((q) => {
        if (q.options.length) shuffleMap[q.id] = shuffle(q.options.map((_, i) => i));
      });
    }
    return { order, shuffleMap };
  }

  function startSession(restore) {
    if (restore) {
      S = {
        mode: restore.mode, order: restore.order, answers: restore.answers || {},
        flagged: new Set(restore.flagged || []), idx: restore.idx || 0,
        elapsed: restore.elapsed || 0, shuffleMap: restore.shuffleMap || {},
        finished: false,
        revealed: new Set(restore.revealed || Object.keys(restore.answers || {}).map(Number)),
      };
    } else {
      const built = buildOrder();
      if (!built) return;
      S = {
        mode: settings.mode, order: built.order, answers: {},
        flagged: new Set(), idx: 0, elapsed: 0, shuffleMap: built.shuffleMap,
        finished: false, revealed: new Set(),
      };
    }
    show("quiz");
    startTimer();
    renderQuestion();
    saveSession();
  }

  // ---------- timer ----------
  function startTimer() {
    stopTimer();
    timerInt = setInterval(() => {
      S.elapsed++;
      $("timer").textContent = fmtTime(S.elapsed);
      if (S.elapsed % 5 === 0) saveSession();
    }, 1000);
    $("timer").textContent = fmtTime(S.elapsed);
  }
  const stopTimer = () => { if (timerInt) clearInterval(timerInt); timerInt = null; };

  // ---------- question access ----------
  const qById = (id) => BANK.find((q) => q.id === id);
  const curQ = () => qById(S.order[S.idx]);

  function orderedOptions(q) {
    const map = S.shuffleMap[q.id];
    if (!map) return q.options;
    return map.map((i) => q.options[i]);
  }

  // ---------- render question ----------
  function renderQuestion() {
    const q = curQ();
    const total = S.order.length;

    $("progLabel").textContent = `Question ${S.idx + 1} of ${total}`;
    const answered = Object.keys(S.answers).length;
    $("answeredLabel").textContent = `${answered} answered`;
    $("progBar").style.width = `${((S.idx + 1) / total) * 100}%`;

    // badges
    const badges = $("qBadges");
    badges.innerHTML = "";
    badges.appendChild(el("span", "badge", `#${q.id}`));
    const typeLabel = { single: "Single choice", multi: "Multiple answers", drag: "Drag &amp; drop" }[q.type];
    badges.appendChild(el("span", `badge ${q.type}`, typeLabel));
    if (S.flagged.has(q.id)) badges.appendChild(el("span", "badge flag", "⚑ Flagged"));

    $("qText").innerHTML = escapeHtml(q.text);

    // drag handling
    const dragNote = $("dragNote"), dragImgs = $("dragImgs");
    dragImgs.innerHTML = "";
    if (q.type === "drag") {
      dragNote.classList.remove("hidden");
      dragNote.innerHTML =
        "Match each item to a slot — drag it, or tap an item then a slot. " +
        (S.mode === "practice" ? "Then “Check answer” to grade it." : "It’s graded when you finish.");
      renderDrag(q, dragImgs);
    } else {
      dragNote.classList.add("hidden");
    }

    renderOptions(q);
    renderFeedback(q);

    // flag button
    $("flagBtn").setAttribute("aria-pressed", S.flagged.has(q.id) ? "true" : "false");

    // nav button labels
    $("prevBtn").disabled = S.idx === 0;
    $("nextBtn").textContent = S.idx === total - 1 ? "Finish ✓" : "Next →";

    if (!$("gridPanel").classList.contains("hidden")) renderGrid();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- interactive drag & drop ----------
  function renderDrag(q, container) {
    const nTargets = q.targets.length;
    let placed = S.answers[q.id];
    if (!Array.isArray(placed) || placed.length !== nTargets) {
      placed = new Array(nTargets).fill(null);
    }
    let selected = null; // item text chosen via tap

    const persist = () => {
      if (placed.some(Boolean)) S.answers[q.id] = placed.slice();
      else delete S.answers[q.id];
      saveSession();
      updateAnsweredLabel();
    };

    const board = el("div", "drag-board");
    const bank = el("div", "drag-bank");
    const targetsCol = el("div", "drag-targets");
    board.appendChild(bank);
    board.appendChild(targetsCol);
    container.appendChild(board);

    function placeItem(text, slotIndex) {
      for (let k = 0; k < placed.length; k++) if (placed[k] === text) placed[k] = null;
      placed[slotIndex] = text; // overwriting returns any occupant to the bank
      selected = null;
      persist(); rerender();
    }

    const graded = () => S.revealed.has(q.id);

    function makeChip(text, fromSlot) {
      const chip = el("div", "drag-chip", escapeHtml(text));
      if (graded()) return chip; // locked: not draggable / not clickable
      chip.draggable = true;
      if (selected === text) chip.classList.add("selected");
      chip.ondragstart = (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ text, fromSlot }));
        chip.classList.add("dragging");
      };
      chip.ondragend = () => chip.classList.remove("dragging");
      chip.onclick = (e) => {
        e.stopPropagation();
        if (fromSlot >= 0) { placed[fromSlot] = null; selected = null; persist(); rerender(); }
        else { selected = (selected === text) ? null : text; rerender(); }
      };
      return chip;
    }

    const parseDT = (e) => {
      try { return JSON.parse(e.dataTransfer.getData("text/plain")); }
      catch { return null; }
    };

    function rerender() {
      const lock = graded();
      bank.innerHTML = "";
      bank.appendChild(el("div", "drag-col-label", "Items"));
      const used = new Set(placed.filter(Boolean));
      q.items.forEach((it) => { if (!used.has(it)) bank.appendChild(makeChip(it, -1)); });
      if (!lock) {
        bank.ondragover = (e) => { e.preventDefault(); bank.classList.add("over"); };
        bank.ondragleave = () => bank.classList.remove("over");
        bank.ondrop = (e) => {
          e.preventDefault(); bank.classList.remove("over");
          const d = parseDT(e); if (d && d.fromSlot >= 0) { placed[d.fromSlot] = null; persist(); rerender(); }
        };
      }

      targetsCol.innerHTML = "";
      q.targets.forEach((desc, i) => {
        const row = el("div", "drag-target");
        const slot = el("div", "drop-slot");
        slot.dataset.slot = i;
        if (placed[i]) slot.appendChild(makeChip(placed[i], i));
        else slot.appendChild(el("span", "slot-empty", "drop / tap"));
        if (lock) {
          const ok = placed[i] === q.answer[i];
          slot.classList.add(ok ? "correct" : "wrong");
          if (!ok) {
            // show the correct item under the slot
            const corr = el("div", "slot-correct", `✓ ${escapeHtml(q.answer[i])}`);
            slot.appendChild(corr);
          }
        } else {
          slot.ondragover = (e) => { e.preventDefault(); slot.classList.add("over"); };
          slot.ondragleave = () => slot.classList.remove("over");
          slot.ondrop = (e) => {
            e.preventDefault(); slot.classList.remove("over");
            const d = parseDT(e); if (d) placeItem(d.text, i);
          };
          slot.onclick = () => { if (selected) placeItem(selected, i); };
        }
        row.appendChild(slot);
        row.appendChild(el("div", "target-desc", escapeHtml(desc)));
        targetsCol.appendChild(row);
      });
    }
    rerender();

    // ---- check: grade the placement + reveal the official answer image ----
    const summary = el("div", "drag-summary");
    const ansWrap = el("div", "drag-answer");
    const reveal = () => {
      S.revealed.add(q.id);
      const r = dragResult(q);
      const all = r.correctCount === r.total;
      summary.className = "drag-summary " + (all ? "ok" : "no");
      summary.innerHTML = all
        ? `<b>✓ All correct!</b> ${r.correctCount}/${r.total}`
        : `<b>${r.correctCount}/${r.total} correct.</b> Correct matches are shown on each slot; full key below.`;
      ansWrap.innerHTML = "";
      ansWrap.appendChild(el("div", "drag-answer-label", "Official answer"));
      q.images.forEach((src) => {
        const img = el("img", "drag-img"); img.src = src; img.alt = `Question ${q.id} answer`;
        ansWrap.appendChild(img);
      });
      if (checkBtn) checkBtn.remove();
      rerender();        // re-render slots with correct/wrong colours, locked
      saveSession();
      updateAnsweredLabel();
    };
    let checkBtn = null;
    if (S.mode === "practice") {
      checkBtn = el("button", "btn-primary check-drag", "✓ Check answer");
      checkBtn.style.width = "auto";
      checkBtn.onclick = reveal;
      container.appendChild(checkBtn);
    }
    container.appendChild(summary);
    container.appendChild(ansWrap);
    if (graded()) reveal();
  }

  function renderOptions(q) {
    const box = $("qOptions");
    box.innerHTML = "";
    if (q.type === "drag") return;

    const sel = S.answers[q.id] || [];
    const reveal = S.mode === "practice" && S.revealed.has(q.id);

    orderedOptions(q).forEach((o) => {
      const btn = el("button", "opt");
      btn.dataset.letter = o.letter;
      const isSel = sel.includes(o.letter);
      const isCorrect = q.correct.includes(o.letter);

      if (reveal) {
        btn.disabled = true;
        if (isCorrect) btn.classList.add("correct");
        else if (isSel) btn.classList.add("wrong");
        if (isSel || isCorrect) btn.classList.add("revealed");
      } else if (isSel) {
        btn.classList.add("selected");
      }

      const mark = reveal
        ? (isCorrect ? '<span class="mark">✓</span>' : (isSel ? '<span class="mark">✗</span>' : ""))
        : "";

      btn.innerHTML =
        `<span class="letter">${o.letter}</span><span class="otext">${escapeHtml(o.text)}</span>${mark}`;
      btn.onclick = () => selectOption(q, o.letter);
      box.appendChild(btn);
    });
  }

  function selectOption(q, letter) {
    if (S.mode === "practice" && S.revealed.has(q.id)) return; // locked after reveal
    let sel = S.answers[q.id] ? S.answers[q.id].slice() : [];

    if (q.type === "multi") {
      if (sel.includes(letter)) sel = sel.filter((l) => l !== letter);
      else sel.push(letter);
      if (sel.length) S.answers[q.id] = sel;
      else delete S.answers[q.id]; // empty selection = unanswered
      renderOptions(q);
      renderFeedback(q); // refresh the "Check answer" affordance
    } else {
      sel = [letter];
      S.answers[q.id] = sel;
      if (S.mode === "practice") {
        S.revealed.add(q.id);
        renderOptions(q);
        renderFeedback(q);
      } else {
        renderOptions(q);
      }
    }
    updateAnsweredLabel();
    saveSession();
  }

  function updateAnsweredLabel() {
    $("answeredLabel").textContent = `${Object.keys(S.answers).length} answered`;
  }

  function renderFeedback(q) {
    const fb = $("feedback");
    if (S.mode !== "practice" || !S.revealed.has(q.id) || q.type === "drag") {
      fb.classList.add("hidden");
      // In practice + multi, offer a "check" button
      if (S.mode === "practice" && q.type === "multi" && !S.revealed.has(q.id) && (S.answers[q.id] || []).length) {
        fb.classList.remove("hidden");
        fb.className = "feedback";
        fb.innerHTML = "";
        const need = q.correct.length;
        const btn = el("button", "btn-primary", `Check answer (${need} expected)`);
        btn.style.width = "auto";
        btn.onclick = () => { S.revealed.add(q.id); renderOptions(q); renderFeedback(q); saveSession(); };
        fb.appendChild(btn);
      }
      return;
    }
    const sel = S.answers[q.id] || [];
    const ok = sameSet(sel, q.correct);
    fb.classList.remove("hidden");
    fb.className = "feedback " + (ok ? "ok" : "no");
    const correctText = q.correct.join(", ");
    fb.innerHTML = ok
      ? `<b>✓ Correct!</b> Answer: <b>${correctText}</b>`
      : `<b>✗ Incorrect.</b> Correct answer: <b>${correctText}</b>` +
        (sel.length ? ` · You chose: ${sel.join(", ")}` : " · (no selection)");
  }

  // ---------- navigation ----------
  function go(delta) {
    const n = S.idx + delta;
    if (n < 0 || n >= S.order.length) return;
    S.idx = n;
    renderQuestion();
    saveSession();
  }
  $("prevBtn").onclick = () => go(-1);
  $("nextBtn").onclick = () => {
    if (S.idx === S.order.length - 1) finish();
    else go(1);
  };
  $("flagBtn").onclick = () => {
    const q = curQ();
    if (S.flagged.has(q.id)) S.flagged.delete(q.id);
    else S.flagged.add(q.id);
    renderQuestion();
    saveSession();
  };
  $("gridToggle").onclick = () => {
    const p = $("gridPanel");
    p.classList.toggle("hidden");
    if (!p.classList.contains("hidden")) { renderGrid(); p.scrollIntoView({ behavior: "smooth" }); }
  };
  $("finishBtn").onclick = () => finish();

  function renderGrid() {
    const g = $("grid");
    g.innerHTML = "";
    S.order.forEach((id, i) => {
      const c = el("button", "gcell", String(i + 1));
      if (S.answers[id]) c.classList.add("answered");
      if (S.flagged.has(id)) c.classList.add("flagged");
      if (i === S.idx) c.classList.add("current");
      c.onclick = () => { S.idx = i; renderQuestion(); window.scrollTo({ top: 0, behavior: "smooth" }); };
      g.appendChild(c);
    });
  }

  // ---------- finish & score ----------
  function dragResult(q) {
    // returns { placed, correctCount } for a drag question
    const placed = Array.isArray(S.answers[q.id]) ? S.answers[q.id] : [];
    let correctCount = 0;
    q.answer.forEach((a, i) => { if (placed[i] === a) correctCount++; });
    return { placed, correctCount, total: q.answer.length };
  }
  function gradeOne(q) {
    if (q.type === "drag") {
      const placed = S.answers[q.id];
      if (!Array.isArray(placed) || !placed.some(Boolean)) return "skip";
      return q.answer.every((a, i) => placed[i] === a) ? "correct" : "wrong";
    }
    const sel = S.answers[q.id];
    if (!sel || !sel.length) return "skip";
    return sameSet(sel, q.correct) ? "correct" : "wrong";
  }

  function finish() {
    const unanswered = S.order.filter((id) => {
      const q = qById(id);
      if (q.type === "drag") return !Array.isArray(S.answers[id]) || !S.answers[id].some(Boolean);
      return !S.answers[id] || !S.answers[id].length;
    });
    if (unanswered.length && S.mode === "exam") {
      if (!confirm(`${unanswered.length} question(s) unanswered. Finish anyway?`)) return;
    }
    S.finished = true;
    stopTimer();

    let correct = 0, wrong = 0, skip = 0;
    S.order.forEach((id) => {
      const r = gradeOne(qById(id));
      if (r === "correct") correct++;
      else if (r === "wrong") wrong++;
      else skip++;
    });
    const graded = correct + wrong;
    const pct = graded ? Math.round((correct / graded) * 100) : 0;

    // persist stats
    const st = loadStats();
    st.attempts = (st.attempts || 0) + 1;
    st.best = Math.max(st.best || 0, pct);
    st.lastPct = pct;
    saveStats(st);
    clearSession();

    showResults({ correct, wrong, skip, pct });
  }

  function showResults({ correct, wrong, skip, pct }) {
    show("results");
    $("ring").style.setProperty("--p", pct);
    $("scorePct").textContent = pct + "%";
    $("rCorrect").textContent = correct;
    $("rWrong").textContent = wrong;
    $("rSkipped").textContent = skip;
    $("rTime").textContent = fmtTime(S.elapsed);

    let verdict, color;
    if (pct >= 80) { verdict = "🎉 Pass-ready! Excellent work."; color = "var(--green)"; }
    else if (pct >= 65) { verdict = "👍 Almost there — review the misses."; color = "var(--amber)"; }
    else { verdict = "📖 Keep studying — focus on weak areas."; color = "var(--red)"; }
    const v = $("verdict"); v.textContent = verdict; v.style.color = color;
    $("ring").style.background =
      `conic-gradient(${color} calc(var(--p)*1%), var(--bg-elev2) 0)`;

    buildReview();
  }

  function buildReview() {
    const list = $("reviewList");
    list.innerHTML = "";
    const wrongs = S.order.filter((id) => gradeOne(qById(id)) === "wrong");
    const skips = S.order.filter((id) => gradeOne(qById(id)) === "skip");

    if (wrongs.length) {
      const card = el("div", "card");
      card.appendChild(el("div", "section-title", `✗ Incorrect (${wrongs.length})`));
      wrongs.forEach((id) => card.appendChild(reviewItem(qById(id))));
      list.appendChild(card);
    }
    if (skips.length) {
      const card = el("div", "card");
      card.appendChild(el("div", "section-title", `– Skipped / unanswered (${skips.length})`));
      skips.forEach((id) => card.appendChild(reviewItem(qById(id))));
      list.appendChild(card);
    }
    if (!wrongs.length && !skips.length) {
      const card = el("div", "card");
      card.innerHTML = "<div class='section-title'>Perfect — every graded question correct! 🏆</div>";
      list.appendChild(card);
    }
  }

  function reviewItem(q) {
    const wrap = el("div", "review-item");
    wrap.appendChild(el("div", "review-q", `#${q.id} · ${escapeHtml(q.text)}`));
    if (q.type === "drag") {
      const placed = Array.isArray(S.answers[q.id]) ? S.answers[q.id] : [];
      q.targets.forEach((desc, i) => {
        const yours = placed[i];
        const corr = q.answer[i];
        const ok = yours === corr;
        const line = el("div", "review-line");
        const shortDesc = desc.length > 60 ? desc.slice(0, 58) + "…" : desc;
        line.innerHTML = `<span class="${ok ? "tag-ok" : "tag-no"}">${ok ? "✓" : "✗"}</span> `
          + `<span class="muted">${escapeHtml(shortDesc)}</span> → <b>${escapeHtml(corr)}</b>`
          + (ok || !yours ? "" : ` <span class="tag-no">(you: ${escapeHtml(yours)})</span>`);
        wrap.appendChild(line);
      });
      q.images.forEach((src) => {
        const img = el("img", "drag-img"); img.src = src; img.loading = "lazy";
        wrap.appendChild(img);
      });
      return wrap;
    }
    const sel = S.answers[q.id] || [];
    const correctTxt = q.correct
      .map((l) => `${l}) ${escapeHtml((q.options.find((o) => o.letter === l) || {}).text || "")}`)
      .join("  ·  ");
    wrap.appendChild(el("div", "review-line", `<span class="tag-ok">Correct:</span> ${correctTxt}`));
    if (sel.length) {
      const yourTxt = sel
        .map((l) => `${l}) ${escapeHtml((q.options.find((o) => o.letter === l) || {}).text || "")}`)
        .join("  ·  ");
      wrap.appendChild(el("div", "review-line", `<span class="tag-no">Your answer:</span> ${yourTxt}`));
    } else {
      wrap.appendChild(el("div", "review-line muted", "Not answered"));
    }
    return wrap;
  }

  // ---------- results actions ----------
  $("retryWrongBtn").onclick = () => {
    const wrongs = S.order.filter((id) => gradeOne(qById(id)) === "wrong");
    if (!wrongs.length) { toast("No wrong answers to retry 🎉"); return; }
    S = {
      mode: S.mode, order: shuffle(wrongs), answers: {}, flagged: new Set(),
      idx: 0, elapsed: 0, shuffleMap: {}, finished: false, revealed: new Set(),
    };
    show("quiz"); startTimer(); renderQuestion(); saveSession();
  };
  $("reviewBtn").onclick = () => $("reviewList").scrollIntoView({ behavior: "smooth" });
  $("newBtn").onclick = () => { clearSession(); refreshStartStats(); show("start"); };

  // ---------- start buttons ----------
  $("startBtn").onclick = () => { clearSession(); startSession(null); };
  $("resumeBtn").onclick = () => {
    const sess = peekSession();
    if (sess) startSession(sess);
  };
  $("homeBrand").onclick = () => {
    if (S && !S.finished && Object.keys(S.answers).length) saveSession();
    stopTimer(); refreshStartStats(); show("start");
  };

  // ---------- keyboard ----------
  document.addEventListener("keydown", (e) => {
    if ($("screen-quiz").classList.contains("hidden")) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    const q = curQ();
    const k = e.key.toUpperCase();
    if (/^[A-H]$/.test(k) && q.type !== "drag") {
      const opt = q.options.find((o) => o.letter === k);
      if (opt) { selectOption(q, k); e.preventDefault(); }
    } else if (e.key === "ArrowRight" || e.key === "Enter") {
      $("nextBtn").click(); e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      go(-1); e.preventDefault();
    } else if (k === "F") {
      $("flagBtn").click(); e.preventDefault();
    }
  });

  // ---------- screen switch ----------
  function show(name) {
    ["start", "quiz", "results"].forEach((s) =>
      $("screen-" + s).classList.toggle("hidden", s !== name)
    );
  }

  // ---------- boot ----------
  applyTheme(localStorage.getItem(LS.theme) || "dark");
  fetch("questions.json")
    .then((r) => r.json())
    .then((data) => { BANK = data; refreshStartStats(); })
    .catch((err) => {
      $("screen-start").innerHTML =
        `<div class="card"><h2>Could not load questions</h2><p class="muted">Serve this folder over HTTP (e.g. <span class="kbd">python3 -m http.server</span>) rather than opening the file directly.<br><br>${escapeHtml(err.message)}</p></div>`;
    });

  // warn before accidental close mid-session
  window.addEventListener("beforeunload", () => { if (S && !S.finished) saveSession(); });
})();
