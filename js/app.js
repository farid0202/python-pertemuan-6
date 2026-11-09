(function () {
  "use strict";

  /* ---------- Utilitas ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pyFloat(v) { if (Number.isInteger(v) && Math.abs(v) < 1e16) return v.toFixed(1); return String(v); }

  /* ---------- Penyorot sintaks Python sederhana ---------- */
  var TOK = /(#[^\n]*)|("""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(True|False|None)\b|\b(def|return|if|elif|else|and|or|not|for|in|while|match|case)\b|\b([A-Za-z_][A-Za-z0-9_]*)\b(?=\s*\()|\b(0x[0-9A-Fa-f]+|0o[0-7]+|\d+(?:\.\d*)?(?:[eE]-?\d+)?)\b/g;
  function hl(src) {
    var out = "", last = 0, m;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(src))) {
      out += esc(src.slice(last, m.index));
      var cls = m[1] ? "tk-com" : m[2] ? "tk-str" : m[3] ? "tk-bool" : m[4] ? "tk-kw" : m[5] ? "tk-fn" : "tk-num";
      out += '<span class="' + cls + '">' + esc(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    return out + esc(src.slice(last));
  }
  $$("pre.code").forEach(function (p) { if (!p.classList.contains("output")) p.innerHTML = hl(p.textContent); });

  /* ---------- SCORM & status ---------- */
  var state = { cur: 0, max: 0, best: null, quizDone: false, completed: false };
  var lmsOn = SCORM.init();
  if (lmsOn) {
    try {
      var sd = SCORM.get("cmi.suspend_data");
      if (sd) { var o = JSON.parse(sd); state.max = o.m || 0; if (typeof o.s === "number") { state.best = o.s; state.quizDone = true; } }
    } catch (e) {}
    var loc = parseInt(SCORM.get("cmi.core.lesson_location"), 10);
    if (!isNaN(loc)) state.cur = Math.min(loc, state.max);
    var st = SCORM.get("cmi.core.lesson_status");
    if (st === "completed" || st === "passed") state.completed = true;
  }
  function save() {
    if (!lmsOn) return;
    SCORM.set("cmi.core.lesson_location", state.cur);
    SCORM.set("cmi.suspend_data", JSON.stringify({ m: state.max, s: state.best }));
    SCORM.commit();
  }
  function markComplete() {
    if (state.completed) return;
    state.completed = true;
    if (lmsOn) { SCORM.set("cmi.core.lesson_status", "completed"); SCORM.commit(); }
  }
  window.addEventListener("beforeunload", function () { save(); SCORM.finish(); });
  window.addEventListener("pagehide", function () { save(); SCORM.finish(); });

  /* ---------- Navigasi tab ---------- */
  var panels = $$(".panel");
  var N = panels.length;
  var tabbar = $("#tabbar");
  panels.forEach(function (p, i) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "tab-btn";
    b.innerHTML = '<span class="num">' + (i + 1) + "</span>" + p.getAttribute("data-title");
    b.addEventListener("click", function () { if (i <= state.max) go(i); });
    tabbar.appendChild(b);
  });
  var tabBtns = $$(".tab-btn", tabbar);
  var QUIZ = N - 2, LAST = N - 1;

  function go(i) {
    state.cur = i;
    if (i > state.max) state.max = i;
    panels.forEach(function (p, k) { p.classList.toggle("active", k === i); });
    tabBtns.forEach(function (b, k) {
      b.classList.toggle("active", k === i);
      b.classList.toggle("done", k < state.max || (k === state.max && k !== i));
      b.disabled = k > state.max;
    });
    var tb = tabBtns[i]; tabbar.scrollLeft = tb.offsetLeft - (tabbar.clientWidth - tb.offsetWidth) / 2;
    $("#progressBar").style.width = ((i + 1) / N * 100) + "%";
    updateNav();
    if (i === LAST) { renderWrapScore(); if (state.quizDone) markComplete(); }
    save();
    window.scrollTo(0, 0);
  }
  function updateNav() {
    var i = state.cur, prev = $("#btnPrev"), next = $("#btnNext"), hint = $("#navHint");
    prev.disabled = i === 0;
    $("#navPos").innerHTML = "<b>" + (i + 1) + "</b> / " + N + " · " + panels[i].getAttribute("data-title");
    hint.textContent = "";
    if (i === LAST) { next.innerHTML = 'Selesai <span class="arrow">✓</span>'; next.disabled = false; }
    else {
      next.innerHTML = 'Aku paham <span class="arrow">→</span>';
      next.disabled = false;
      if (i === QUIZ && !state.quizDone) { next.disabled = true; hint.textContent = "Selesaikan kuis dulu, ya!"; }
    }
  }
  $("#btnPrev").addEventListener("click", function () { if (state.cur > 0) go(state.cur - 1); });
  $("#btnNext").addEventListener("click", function () {
    if (state.cur < LAST) go(state.cur + 1);
    else {
      if (state.quizDone) markComplete();
      var h = $("#navHint");
      h.style.color = state.quizDone ? "var(--green)" : "var(--warn)";
      h.textContent = state.quizDone ? "Materi selesai. Kamu boleh menutup jendela ini." : "Kerjakan kuis di Tab 7 dulu supaya materi tercatat selesai.";
    }
  });

  /* ---------- Kartu balik & tombol jawaban ---------- */
  $$(".flip").forEach(function (c) { c.addEventListener("click", function () { c.classList.toggle("flipped"); }); });
  $$("[data-reveal]").forEach(function (b) {
    b.addEventListener("click", function () {
      var body = b.parentNode.querySelector(".reveal-body");
      var on = body.classList.toggle("show");
      b.textContent = on ? "Sembunyikan jawaban" : "Lihat contoh jawaban";
    });
  });

  /* ---------- Komponen: Drill ---------- */
  function Drill(el, cfg) {
    var items, idx, score, res;
    function start() { items = shuffle(cfg.items); idx = 0; score = 0; res = []; render(); }
    function isOk(it, v) { return Array.isArray(it.a) ? it.a.indexOf(v) >= 0 : it.a === v; }
    function render() {
      if (idx >= items.length) return end();
      var it = items[idx], opts = it.opts || cfg.opts;
      var dots = items.map(function (_, k) { return "<i class='" + (res[k] === true ? "ok" : res[k] === false ? "no" : k === idx ? "cur" : "") + "'></i>"; }).join("");
      var multi = !it.text && it.q.indexOf("\n") >= 0;
      el.innerHTML =
        '<div class="drill-stage"><div class="drill-top"><span>Soal ' + (idx + 1) + " dari " + items.length + " · Skor: <b>" + score + '</b></span><span class="drill-dots">' + dots + "</span></div>" +
        (it.prompt || cfg.prompt ? '<p class="drill-prompt">' + (it.prompt || cfg.prompt) + "</p>" : "") +
        '<div class="drill-q' + (it.text ? " text" : "") + (multi ? " small" : "") + '">' + (it.text ? it.q : hl(it.q)) + "</div>" +
        '<div class="drill-opts">' + opts.map(function (o) { return '<button type="button" class="opt' + (cfg.mono || it.mono ? " mono" : "") + '" data-v="' + esc(o) + '">' + esc(o) + "</button>"; }).join("") + "</div>" +
        '<div class="feedback"></div><div class="row" style="margin-top:10px;justify-content:flex-end"><button type="button" class="btn btn-primary btn-sm nx" hidden>Lanjut →</button></div></div>';
      $$(".opt", el).forEach(function (b) {
        b.addEventListener("click", function () {
          var v = b.getAttribute("data-v"), ok = isOk(it, v);
          $$(".opt", el).forEach(function (x) { x.disabled = true; if (isOk(it, x.getAttribute("data-v"))) x.classList.add("correct"); });
          if (!ok) b.classList.add("wrong");
          res[idx] = ok; if (ok) score++;
          var fb = $(".feedback", el);
          fb.className = "feedback show " + (ok ? "ok" : "no");
          fb.innerHTML = "<b>" + (ok ? "Tepat! " : "Belum tepat. ") + "</b>" + (it.why || "");
          var nx = $(".nx", el); nx.hidden = false; nx.textContent = idx === items.length - 1 ? "Lihat hasil →" : "Lanjut →"; nx.focus();
          nx.onclick = function () { idx++; render(); };
        });
      });
    }
    function end() {
      var pct = Math.round(score / items.length * 100);
      var msg = pct === 100 ? "Sempurna! 🎉" : pct >= 70 ? "Bagus! Ulangi sekali lagi supaya makin lancar." : "Tidak apa-apa. Baca lagi materinya, lalu coba ulang.";
      el.innerHTML = '<div class="drill-stage drill-end"><div class="big">' + score + " / " + items.length + "</div><p>" + msg + '</p><button type="button" class="btn btn-ghost btn-sm">↺ Ulangi latihan</button></div>';
      $("button", el).addEventListener("click", start);
    }
    start();
  }

  /* ---------- Komponen: Match ---------- */
  function Match(el, pairs) {
    var sel = null, done = 0;
    function start() {
      sel = null; done = 0;
      var right = shuffle(pairs.map(function (p, i) { return { t: p[1], k: i }; }));
      var left = shuffle(pairs.map(function (p, i) { return { t: p[0], k: i }; }));
      el.innerHTML = '<div class="match"><div class="match-col">' +
        left.map(function (x) { return '<button type="button" class="m-item sym" data-side="L" data-k="' + x.k + '">' + esc(x.t) + "</button>"; }).join("") +
        '</div><div class="match-col">' +
        right.map(function (x) { return '<button type="button" class="m-item" data-side="R" data-k="' + x.k + '">' + esc(x.t) + "</button>"; }).join("") +
        '</div></div><div class="row" style="margin-top:12px;justify-content:space-between"><span class="match-status">0 / ' + pairs.length + ' pasangan</span><button type="button" class="btn btn-ghost btn-sm rs">↺ Acak ulang</button></div>';
      $(".rs", el).addEventListener("click", start);
      $$(".m-item", el).forEach(function (b) { b.addEventListener("click", function () { pick(b); }); });
    }
    function pick(b) {
      if (b.classList.contains("done")) return;
      if (!sel || sel.getAttribute("data-side") === b.getAttribute("data-side")) {
        if (sel) sel.classList.remove("sel");
        sel = b; b.classList.add("sel"); return;
      }
      if (sel.getAttribute("data-k") === b.getAttribute("data-k")) {
        [sel, b].forEach(function (x) { x.classList.remove("sel"); x.classList.add("done"); x.disabled = true; });
        done++;
        $(".match-status", el).textContent = done === pairs.length ? "Semua pasangan benar! 🎉" : done + " / " + pairs.length + " pasangan";
      } else {
        var a = sel;
        [a, b].forEach(function (x) { x.classList.remove("sel"); x.classList.add("shake"); });
        setTimeout(function () { a.classList.remove("shake"); b.classList.remove("shake"); }, 400);
      }
      sel = null;
    }
    start();
  }

  /* ---------- Komponen: Parsons (susun baris) ---------- */
  function Parsons(el, P, opt) {
    opt = opt || {};
    var cur = 0, pool = [], ans = [], solved = [];
    el.innerHTML = (P.length > 1 ? '<div class="subtabs"></div>' : "") + '<div class="ps-desc"></div>' +
      '<div class="parsons"><div class="p-zone"><h4>' + (opt.pseudo ? "Potongan algoritma" : "Potongan kode") + '</h4><div class="ps-pool"></div></div>' +
      '<div class="p-zone p-answer"><h4>' + (opt.pseudo ? "Algoritmamu" : "Programmu") + '</h4><div class="ps-ans"></div></div></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn btn-primary btn-sm ps-check" type="button">Periksa</button><button class="btn btn-ghost btn-sm ps-reset" type="button">↺ Ulang</button></div><div class="feedback ps-fb"></div>';
    var tabs = $(".subtabs", el), fb = $(".ps-fb", el);
    if (tabs) P.forEach(function (p, i) {
      var b = document.createElement("button"); b.type = "button"; b.className = "subtab"; b.textContent = p.title;
      b.addEventListener("click", function () { load(i); }); tabs.appendChild(b);
    });
    function load(i) {
      cur = i; var p = P[i];
      if (tabs) $$(".subtab", tabs).forEach(function (b, k) { b.classList.toggle("active", k === i); b.classList.toggle("solved", !!solved[k]); });
      $(".ps-desc", el).innerHTML = (p.desc ? '<div class="story" style="margin-bottom:8px">' + p.desc + "</div>" : "") + (p.algo ? '<pre class="algo">' + p.algo + "</pre>" : "");
      pool = shuffle(p.lines.concat(p.bad.map(function (x) { return x.t; }))); ans = [];
      fb.className = "feedback ps-fb"; draw();
    }
    function mk(t) {
      var b = document.createElement("button"); b.type = "button"; b.className = "p-line" + (opt.pseudo ? " algo-line" : "");
      b.innerHTML = opt.pseudo ? esc(t) : hl(t); return b;
    }
    function draw() {
      var po = $(".ps-pool", el), an = $(".ps-ans", el);
      po.innerHTML = pool.length ? "" : '<div class="p-empty">Semua baris sudah dipakai.</div>';
      an.innerHTML = ans.length ? "" : '<div class="p-empty">Klik baris di sebelah kiri untuk menyusun.</div>';
      pool.forEach(function (t, i) { var b = mk(t); b.addEventListener("click", function () { ans.push(pool.splice(i, 1)[0]); fb.className = "feedback ps-fb"; draw(); }); po.appendChild(b); });
      ans.forEach(function (t, i) { var b = mk(t); b.addEventListener("click", function () { pool.push(ans.splice(i, 1)[0]); fb.className = "feedback ps-fb"; draw(); }); an.appendChild(b); });
    }
    $(".ps-check", el).addEventListener("click", function () {
      var p = P[cur];
      $$(".ps-ans .p-line", el).forEach(function (b, i) { b.classList.remove("good", "bad"); b.classList.add(p.lines[i] === ans[i] ? "good" : "bad"); });
      var ok = ans.length === p.lines.length && ans.every(function (t, i) { return t === p.lines[i]; });
      fb.className = "feedback ps-fb show " + (ok ? "ok" : "no");
      if (ok) {
        solved[cur] = true; if (tabs) $$(".subtab", tabs)[cur].classList.add("solved");
        var nextI = -1; for (var k = 0; k < P.length; k++) if (!solved[k]) { nextI = k; break; }
        fb.innerHTML = "<b>" + (opt.okMsg || "Benar! 🎉 Susunanmu tepat.") + "</b>" + (nextI >= 0 && P.length > 1 ? ' <button type="button" class="btn btn-primary btn-sm ps-next" style="margin-left:8px">Soal berikutnya →</button>' : "");
        var nb = $(".ps-next", el); if (nb) nb.addEventListener("click", function () { load(nextI); });
        if (opt.onSolve) opt.onSolve();
        return;
      }
      var trap = p.bad.filter(function (x) { return ans.indexOf(x.t) >= 0; });
      if (trap.length) fb.innerHTML = "<b>Ada baris jebakan!</b><br>" + trap.map(function (x) { return "<code>" + esc(x.t.trim()) + "</code>: " + x.h; }).join("<br>");
      else if (ans.length < p.lines.length) fb.innerHTML = "<b>Belum lengkap.</b> Masih ada baris yang belum dipakai.";
      else fb.innerHTML = "<b>Urutannya belum sesuai.</b> " + (opt.pseudo ? "Ingat: FUNCTION … ENDFUNCTION ditulis dulu, lalu program utama START … END." : "Fungsi dibuat dulu (def …), baru program utama yang meminta data, memanggil fungsi, dan menampilkan hasil.");
    });
    $(".ps-reset", el).addEventListener("click", function () { load(cur); });
    load(0);
  }

  /* ---------- Komponen: Fill (isian dropdown) ---------- */
  function Fill(el, F) {
    var cur = 0, solved = [];
    el.innerHTML = (F.length > 1 ? '<div class="subtabs"></div>' : "") + '<div class="fl-wrap"></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn btn-primary btn-sm fl-check" type="button">Periksa</button><button class="btn btn-ghost btn-sm fl-reset" type="button">↺ Ulang</button></div><div class="feedback fl-fb"></div>';
    var tabs = $(".subtabs", el), wrap = $(".fl-wrap", el), fb = $(".fl-fb", el);
    if (tabs) F.forEach(function (p, i) {
      var b = document.createElement("button"); b.type = "button"; b.className = "subtab"; b.textContent = p.title;
      b.addEventListener("click", function () { load(i); }); tabs.appendChild(b);
    });
    function load(i) {
      cur = i; var p = F[i];
      if (tabs) $$(".subtab", tabs).forEach(function (b, k) { b.classList.toggle("active", k === i); b.classList.toggle("solved", !!solved[k]); });
      var html = "", last = 0, re = /\{\{([^}]+)\}\}/g, m;
      while ((m = re.exec(p.code))) {
        html += esc(p.code.slice(last, m.index));
        var opts = m[1].split("~");
        html += '<select data-a="' + esc(opts[0]) + '" aria-label="pilihan"><option value="">?</option>' +
          shuffle(opts).map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") + "</select>";
        last = m.index + m[0].length;
      }
      html += esc(p.code.slice(last));
      wrap.innerHTML = (p.desc ? '<div class="story" style="margin-bottom:10px">' + p.desc + "</div>" : "") + '<div class="fill">' + html + "</div>";
      $$("select", wrap).forEach(function (s) { s.addEventListener("change", function () { s.classList.remove("ok", "no"); }); });
      fb.className = "feedback fl-fb";
    }
    $(".fl-check", el).addEventListener("click", function () {
      var sels = $$("select", wrap), right = 0, empty = 0;
      sels.forEach(function (s) {
        s.classList.remove("ok", "no");
        if (!s.value) { empty++; return; }
        var ok = s.value === s.getAttribute("data-a"); s.classList.add(ok ? "ok" : "no"); if (ok) right++;
      });
      var all = right === sels.length;
      fb.className = "feedback fl-fb show " + (all ? "ok" : "no");
      if (all) {
        solved[cur] = true; if (tabs) $$(".subtab", tabs)[cur].classList.add("solved");
        var nextI = -1; for (var k = 0; k < F.length; k++) if (!solved[k]) { nextI = k; break; }
        fb.innerHTML = "<b>Semua benar! 🎉</b> " + (F[cur].ok || "Kodemu sudah valid.") + (nextI >= 0 ? ' <button type="button" class="btn btn-primary btn-sm fl-next" style="margin-left:8px">Soal berikutnya →</button>' : "");
        var nb = $(".fl-next", el); if (nb) nb.addEventListener("click", function () { load(nextI); });
      } else {
        fb.innerHTML = "<b>" + right + " dari " + sels.length + " kotak benar.</b> " + (empty ? "Masih ada " + empty + " kotak kosong. " : "") + F[cur].tip;
      }
    });
    $(".fl-reset", el).addEventListener("click", function () { load(cur); });
    load(0);
  }

  /* ---------- Komponen: Tracer (jalankan baris demi baris) ---------- */
  function T(b) { return b ? "True" : "False"; }
  function q(s) { return '"' + s + '"'; }
  function mod(a, b) { return ((a % b) + b) % b; }
  function pyNum(x) { return Number.isInteger(x) ? String(x) : String(x); }
  function Rec() {
    var r = { steps: [], v: {} };
    r.set = function (k, val) { r.v[k] = String(val); return r; };
    r.step = function (l, n, o, w) { r.steps.push({ l: l, n: n || "", o: o || [], v: JSON.parse(JSON.stringify(r.v)), w: !!w }); return r; };
    return r;
  }
  function Tracer(el, S) {
    var cur = 0, prog = null, idx = -1, vals = {};
    el.innerHTML = (S.length > 1 ? '<div class="subtabs"></div>' : "") + '<div class="tr-desc"></div><div class="tr-inputs"></div>' +
      '<div class="sim"><div><div class="code-lines tr-code"></div><div class="row" style="margin-top:10px"><button type="button" class="btn btn-primary btn-sm tr-step">▶ Langkah</button><button type="button" class="btn btn-ghost btn-sm tr-all">⏩ Sampai selesai</button><button type="button" class="btn btn-ghost btn-sm tr-reset">↺ Ulang</button><span class="tr-count"></span></div></div>' +
      '<div><div class="console tr-con" aria-live="polite"></div><div class="memory"><h4>🧠 Variabel</h4><div class="tr-vars"></div></div></div></div><div class="tr-note"></div>';
    var tabs = $(".subtabs", el);
    if (tabs) S.forEach(function (s, i) {
      var b = document.createElement("button"); b.type = "button"; b.className = "subtab"; b.textContent = s.title;
      b.addEventListener("click", function () { load(i); }); tabs.appendChild(b);
    });
    function load(i) {
      cur = i; var s = S[i]; vals = {};
      if (tabs) $$(".subtab", tabs).forEach(function (b, k) { b.classList.toggle("active", k === i); });
      $(".tr-desc", el).innerHTML = s.desc ? '<p class="i-desc" style="margin:0 0 4px">' + s.desc + "</p>" : "";
      var box = $(".tr-inputs", el); box.innerHTML = "";
      (s.inputs || []).forEach(function (inp) {
        vals[inp.id] = inp.value;
        var lab = document.createElement("label"); lab.textContent = inp.label + " ";
        var f;
        if (inp.type === "select") {
          f = document.createElement("select");
          inp.options.forEach(function (o) { var op = document.createElement("option"); op.value = o; op.textContent = o; f.appendChild(op); });
        } else { f = document.createElement("input"); f.type = inp.type; if (inp.max) f.maxLength = inp.max; }
        f.value = inp.value;
        f.addEventListener(inp.type === "select" ? "change" : "input", function () { vals[inp.id] = f.value; build(); });
        lab.appendChild(f); box.appendChild(lab);
      });
      box.style.display = (s.inputs || []).length ? "" : "none";
      build();
    }
    function build() { prog = S[cur].build(vals); idx = -1; draw(); }
    function draw() {
      var st = prog.steps, seen = {};
      for (var k = 0; k <= idx; k++) seen[st[k].l] = true;
      $(".tr-code", el).innerHTML = prog.lines.map(function (l, i) {
        var c = idx >= 0 && st[idx].l === i ? "now" : seen[i] ? "run" : "";
        return '<span class="ln ' + c + '" data-n="' + (i + 1) + '">' + (l ? hl(l) : " ") + "</span>";
      }).join("");
      var con = $(".tr-con", el), out = [];
      for (k = 0; k <= idx; k++) out = out.concat(st[k].o);
      con.innerHTML = idx < 0 ? '<div class="cl muted">Tekan ▶ Langkah untuk mulai.</div>' : out.length ? out.map(function (o) { return '<div class="cl">' + (o === "" ? " " : esc(o)) + "</div>"; }).join("") : '<div class="cl muted">(belum ada yang tampil)</div>';
      var v = idx >= 0 ? st[idx].v : {}, pv = idx > 0 ? st[idx - 1].v : {}, keys = Object.keys(v);
      $(".tr-vars", el).innerHTML = keys.length ? '<table class="vars">' + keys.map(function (key) { return '<tr class="' + (pv[key] !== v[key] ? "chg" : "") + '"><td>' + esc(key) + "</td><td>" + esc(v[key]) + "</td></tr>"; }).join("") + "</table>" : '<div class="p-empty">Belum ada variabel.</div>';
      var note = $(".tr-note", el);
      note.className = "tr-note" + (idx >= 0 && st[idx].w ? " warn" : "");
      note.innerHTML = idx >= 0 ? st[idx].n : "";
      $(".tr-count", el).textContent = idx >= 0 ? "Langkah " + (idx + 1) + " / " + st.length : "";
      $(".tr-step", el).disabled = idx >= st.length - 1;
      $(".tr-all", el).disabled = idx >= st.length - 1;
    }
    $(".tr-step", el).addEventListener("click", function () { if (idx < prog.steps.length - 1) { idx++; draw(); } });
    $(".tr-all", el).addEventListener("click", function () { idx = prog.steps.length - 1; draw(); });
    $(".tr-reset", el).addEventListener("click", function () { idx = -1; draw(); });
    load(0);
  }

  /* ---------- Komponen: Studio (masalah → pseudocode → kode) ---------- */
  function Studio(el, P) {
    el.innerHTML = (P.length > 1 ? '<div class="subtabs"></div>' : "") + '<div class="st-root"></div>';
    var tabs = $(".subtabs", el), root = $(".st-root", el);
    if (tabs) P.forEach(function (p, i) {
      var b = document.createElement("button"); b.type = "button"; b.className = "subtab"; b.textContent = p.title;
      b.addEventListener("click", function () { load(i); }); tabs.appendChild(b);
    });
    function load(i) {
      var p = P[i];
      if (tabs) $$(".subtab", tabs).forEach(function (b, k) { b.classList.toggle("active", k === i); });
      root.innerHTML = '<div class="story">📌 ' + p.story + "</div>" +
        '<div class="step-title"><span class="n">1</span><h4>Susun pseudocode-nya</h4></div><div class="st-algo"></div>' +
        '<div class="step-title"><span class="n">2</span><h4>Terjemahkan menjadi kode Python</h4></div><div class="st-code"></div>';
      Parsons($(".st-algo", root), [{ title: "", lines: p.algo.lines, bad: p.algo.bad }], { pseudo: true, okMsg: "Pseudocode benar! 🎉 Lanjut ke langkah 2." });
      Parsons($(".st-code", root), [{ title: "", lines: p.code.lines, bad: p.code.bad }], { okMsg: "Program benar! 🎉 Dari masalah, kamu berhasil membuat pseudocode dan kodenya." });
    }
    load(0);
  }

  /* =================== TAB 1 =================== */
  Drill($("#drillKonsep"), {
    opts: ["Keputusan (if)", "Perulangan for", "Perulangan while"],
    prompt: "Perintah kendali apa yang paling cocok?",
    items: [
      { text: true, q: "Kalau hujan bawa payung, kalau tidak pakai topi.", a: "Keputusan (if)", why: "Ada kondisi (hujan atau tidak) yang menentukan pilihan." },
      { text: true, q: "Memanggil setiap nama mahasiswa di daftar hadir.", a: "Perulangan for", why: "Diulang untuk setiap item di koleksi (daftar hadir)." },
      { text: true, q: "Terus menimba air sampai bak mandi penuh.", a: "Perulangan while", why: "Diulang <b>selama</b> bak belum penuh; jumlah ember tidak diketahui di awal." },
      { text: true, q: "Lampu merah berhenti, kuning hati-hati, hijau jalan.", a: "Keputusan (if)", why: "Memilih tindakan berdasarkan kondisi (warna lampu)." },
      { text: true, q: "Mengirim ucapan ulang tahun ke setiap teman di grup.", a: "Perulangan for", why: "Satu kali untuk setiap anggota grup." },
      { text: true, q: "Meminta PIN ATM lagi selama PIN yang dimasukkan salah.", a: "Perulangan while", why: "Berapa kali salah tidak bisa diketahui di awal; ulangi selama kondisi \"PIN salah\" True." },
      { text: true, q: "Gratis ongkir jika total belanja minimal Rp50.000.", a: "Keputusan (if)", why: "Ada syarat (total >= 50000) yang menentukan ongkir." },
      { text: true, q: "Mengaduk adonan sampai kalis.", a: "Perulangan while", why: "Diulang selama adonan belum kalis." },
      { text: true, q: "Push-up tepat 20 kali.", a: "Perulangan for", why: "Jumlahnya sudah pasti: <code>for i in range(20)</code>." }
    ]
  });

  /* =================== TAB 2 =================== */
  Tracer($("#trIf"), [
    { title: "if: Lulus", desc: "Contoh dari modul. Coba nilai di atas dan di bawah 50.",
      inputs: [{ id: "n", label: "nilai =", type: "number", value: "70" }],
      build: function (v) {
        var n = parseInt(v.n, 10) || 0, R = Rec(), c = n > 50;
        R.set("nilai", n).step(0, "Simpan " + n + " ke variabel <code>nilai</code>.");
        R.step(1, "Cek kondisi: <code>" + n + " &gt; 50</code> → <b>" + T(c) + "</b>" + (c ? ". Masuk ke blok if." : ". Blok if dilewati."));
        if (c) R.step(2, "Baris menjorok ini adalah blok if, dijalankan karena kondisi True.", ["Selamat anda telah lulus"]);
        R.step(3, "Baris ini tidak menjorok, jadi di luar if dan <b>selalu</b> dijalankan.", ["Program selesai"]);
        return { lines: ["nilai = " + n, "if nilai > 50:", '    print("Selamat anda telah lulus")', 'print("Program selesai")'], steps: R.steps };
      } },
    { title: "if-else: Genap/ganjil",
      inputs: [{ id: "a", label: "pengguna mengetik", type: "number", value: "9" }],
      build: function (v) {
        var a = parseInt(v.a, 10) || 0, R = Rec(), m = mod(a, 2), c = m === 0;
        R.set("a", a).step(0, "Pengguna mengetik " + a + ", diubah menjadi int dan disimpan di <code>a</code>.", ["Masukkan angka: " + a]);
        R.step(1, "<code>" + a + " % 2 == 0</code> → <code>" + m + " == 0</code> → <b>" + T(c) + "</b>");
        if (c) R.step(2, "Kondisi True → blok if dijalankan, blok else dilewati.", [a + " adalah bilangan genap"]);
        else { R.step(3, "Kondisi False → lompat ke <code>else</code>."); R.step(4, "Blok else dijalankan.", [a + " adalah bilangan ganjil"]); }
        R.step(5, "Perintah if-else selesai. Lanjut ke baris berikutnya.", ["Program selesai"]);
        return { lines: ['a = int(input("Masukkan angka: "))', "if a % 2 == 0:", '    print(a, "adalah bilangan genap")', "else:", '    print(a, "adalah bilangan ganjil")', 'print("Program selesai")'], steps: R.steps };
      } },
    { title: "in: Cek spam", desc: "Coba tulis kata <b>gratis</b>, <b>Gratis</b>, atau tanpa kata itu.",
      inputs: [{ id: "t", label: "isi email", type: "text", value: "Dapatkan hadiah gratis sekarang!", max: 60 }],
      build: function (v) {
        var t = v.t, R = Rec(), c = t.indexOf("gratis") >= 0;
        R.set("teks_email", q(t)).step(0, "Isi email disimpan sebagai string.", ["Isi email: " + t]);
        var extra = !c && t.toLowerCase().indexOf("gratis") >= 0 ? " Perhatikan: huruf besar dan kecil dianggap berbeda, jadi \"Gratis\" tidak sama dengan \"gratis\"." : "";
        R.step(1, "<code>\"gratis\" in teks_email</code> → <b>" + T(c) + "</b>." + extra);
        if (c) R.step(2, "Kondisi True.", ["Berpotensi spam!"]);
        else { R.step(3, "Kondisi False → ke else."); R.step(4, "", ["Email aman"]); }
        return { lines: ['teks_email = input("Isi email: ")', 'if "gratis" in teks_email:', '    print("Berpotensi spam!")', "else:", '    print("Email aman")'], steps: R.steps };
      } },
    { title: "Diskon Barakah", desc: "Latihan dari modul: dua <code>if</code> terpisah, sehingga diskon bisa bertambah dua kali.",
      inputs: [{ id: "n", label: "nama", type: "text", value: "Agus Salim", max: 30 }, { id: "l", label: "lahir", type: "text", value: "2005-08-17", max: 10 }],
      build: function (v) {
        var n = v.n, l = v.l, R = Rec(), d = 5, bln = l.slice(5, 7);
        R.set("nama", q(n)).step(0, "", ["Masukkan nama pelanggan: " + n]);
        R.set("lahir", q(l)).step(1, "", ["Masukkan tanggal lahir (yyyy-mm-dd): " + l]);
        R.set("diskon", d).step(2, "Semua pelanggan mendapat diskon 5.");
        var c1 = n.indexOf("Agus") >= 0;
        R.step(3, "<code>\"Agus\" in nama</code> → <b>" + T(c1) + "</b>");
        if (c1) { d += 5; R.set("diskon", d).step(4, "Diskon bertambah 5."); }
        var c2 = bln === "08";
        R.step(5, "<code>lahir[5:7]</code> adalah <code>\"" + esc(bln) + "\"</code>. <code>\"" + esc(bln) + "\" == \"08\"</code> → <b>" + T(c2) + "</b>. If ini tetap diperiksa, apa pun hasil if sebelumnya.");
        if (c2) { d += 5; R.set("diskon", d).step(6, "Diskon bertambah 5 lagi."); }
        R.step(7, "", ["Diskon Anda: " + d + " %"]);
        return { lines: ['nama = input("Masukkan nama pelanggan: ")', 'lahir = input("Masukkan tanggal lahir (yyyy-mm-dd): ")', "diskon = 5", 'if "Agus" in nama:', "    diskon = diskon + 5", 'if lahir[5:7] == "08":', "    diskon = diskon + 5", 'print("Diskon Anda:", diskon, "%")'], steps: R.steps };
      } }
  ]);

  Drill($("#drillIf"), {
    prompt: "Apa yang tampil di layar?", mono: true,
    items: [
      { q: 'nilai = 45\nif nilai > 50:\n    print("Lulus")\nprint("Selesai")', opts: ["Lulus\nSelesai", "Selesai", "Lulus", "(layar kosong)"], a: "Selesai", why: "45 > 50 False, blok if dilewati. Baris terakhir di luar if, jadi tetap tampil." },
      { q: 'a = 10\nif a % 2 == 0:\n    print("Genap")\nelse:\n    print("Ganjil")', opts: ["Genap", "Ganjil", "Genap\nGanjil"], a: "Genap", why: "10 % 2 = 0, kondisi True. Hanya satu cabang yang dijalankan." },
      { q: "print('s' in 'komputer')", opts: ["True", "False", "Error"], a: "False", why: "Tidak ada huruf s di \"komputer\"." },
      { q: 'belanja = ["tepung", "minyak"]\nif "telur" in belanja:\n    print("Sudah ada")\nelse:\n    print("Beli telur")', opts: ["Sudah ada", "Beli telur", "Error"], a: "Beli telur", why: "\"telur\" bukan anggota list, jadi kondisi False." },
      { q: 'x = 0\nif x:\n    print("A")\nelse:\n    print("B")', opts: ["A", "B", "Error"], a: "B", why: "Python menganggap 0 sebagai False." },
      { q: 'umur = 17\nif umur >= 17:\n    print("Boleh membuat KTP")', opts: ["Boleh membuat KTP", "(layar kosong)", "Error"], a: "Boleh membuat KTP", why: "<code>&gt;=</code> mencakup nilai yang sama: 17 >= 17 True." },
      { q: 'nilai = 40\nif nilai > 50:\n    print("Lulus")\n    print("Selamat!")\nprint("Selesai")', opts: ["Selamat!\nSelesai", "Selesai", "Lulus\nSelamat!\nSelesai"], a: "Selesai", why: "Kedua baris yang menjorok adalah blok if, jadi keduanya dilewati." },
      { q: 'x = 5\nif x > 3 and x < 4:\n    print("Ya")\nelse:\n    print("Tidak")', opts: ["Ya", "Tidak", "Ya\nTidak"], a: "Tidak", why: "5 > 3 True, tapi 5 < 4 False. True and False = False." },
      { q: 'nama = "Agus Salim"\nif "agus" in nama:\n    print("Dapat bonus")\nelse:\n    print("Tanpa bonus")', opts: ["Dapat bonus", "Tanpa bonus", "Error"], a: "Tanpa bonus", why: "\"agus\" (huruf kecil) berbeda dengan \"Agus\"." },
      { q: 'n = 7\nif n > 5\n    print("Besar")', opts: ["Besar", "(layar kosong)", "Error"], a: "Error", why: "SyntaxError: baris if lupa diakhiri titik dua." }
    ]
  });

  Studio($("#studioIf"), [
    { title: "A · Tiket bioskop",
      story: "Film di bioskop berlabel <b>13+</b>. Penjaga menanyakan umur penonton. Jika umurnya 13 tahun ke atas, tampilkan \"Silakan masuk\". Jika tidak, tampilkan \"Maaf, belum cukup umur\".",
      algo: { lines: ["START", "   INPUT umur", "   IF umur >= 13 THEN", '      OUTPUT "Silakan masuk"', "   ELSE", '      OUTPUT "Maaf, belum cukup umur"', "   ENDIF", "END"],
        bad: [{ t: "   IF umur > 13 THEN", h: "penonton berumur tepat 13 tahun juga boleh masuk, jadi pakai >=." }, { t: "   INPUT judul_film", h: "judul film tidak dibutuhkan untuk keputusan ini." }] },
      code: { lines: ['umur = int(input("Umur: "))', "if umur >= 13:", '    print("Silakan masuk")', "else:", '    print("Maaf, belum cukup umur")'],
        bad: [{ t: "if umur >= 13", h: "baris if harus diakhiri titik dua." }, { t: 'umur = input("Umur: ")', h: "hasil input() berupa str. Membandingkan str dengan int memakai >= menyebabkan error." }] } },
    { title: "B · Huruf vokal",
      story: "Buat program yang meminta <b>satu huruf kecil</b>. Jika huruf itu vokal (a, i, u, e, o), tampilkan \"Vokal\". Jika tidak, tampilkan \"Konsonan\".",
      algo: { lines: ["START", "   INPUT huruf", '   IF huruf ada di dalam "aiueo" THEN', '      OUTPUT "Vokal"', "   ELSE", '      OUTPUT "Konsonan"', "   ENDIF", "END"],
        bad: [{ t: '   IF huruf == "aiueo" THEN', h: "satu huruf tidak akan pernah sama dengan string \"aiueo\". Yang dicek adalah keanggotaan." }, { t: '   WHILE huruf ada di dalam "aiueo" DO', h: "ini bukan perulangan; cukup satu keputusan IF." }] },
      code: { lines: ['huruf = input("Masukkan satu huruf: ")', 'if huruf in "aiueo":', '    print("Vokal")', "else:", '    print("Konsonan")'],
        bad: [{ t: 'if huruf == "aiueo":', h: "gunakan operator in untuk cek keanggotaan." }, { t: 'else huruf not in "aiueo":', h: "else tidak boleh diberi kondisi." }] } },
    { title: "C · Diskon Barakah",
      story: "Supermarket Barakah memberi semua pelanggan diskon <b>5%</b>. Jika nama pelanggan mengandung \"Agus\", diskon <b>ditambah 5%</b>. Jika lahir di bulan Agustus, diskon <b>ditambah 5% lagi</b>. Tanggal lahir ditulis dalam format yyyy-mm-dd, misalnya \"2005-08-17\".",
      algo: { lines: ["START", "   INPUT nama, lahir", "   diskon ← 5", '   IF "Agus" ada di dalam nama THEN', "      diskon ← diskon + 5", "   ENDIF", '   IF bulan lahir == "08" THEN', "      diskon ← diskon + 5", "   ENDIF", "   OUTPUT diskon", "END"],
        bad: [{ t: '   ELSE IF bulan lahir == "08" THEN', h: "kedua diskon berdiri sendiri. Pelanggan bisa mendapat keduanya, jadi pakai dua IF terpisah." }, { t: "   diskon ← 0", h: "semua pelanggan sudah mendapat diskon 5." }] },
      code: { lines: ['nama = input("Masukkan nama pelanggan: ")', 'lahir = input("Masukkan tanggal lahir (yyyy-mm-dd): ")', "diskon = 5", 'if "Agus" in nama:', "    diskon = diskon + 5", 'if lahir[5:7] == "08":', "    diskon = diskon + 5", 'print("Diskon Anda:", diskon, "%")'],
        bad: [{ t: 'elif lahir[5:7] == "08":', h: "dengan elif, bulan lahir tidak diperiksa jika nama sudah mengandung \"Agus\"." }, { t: "if lahir[5:7] == 8:", h: "lahir[5:7] menghasilkan string \"08\", yang tidak sama dengan int 8." }] } }
  ]);

  /* =================== TAB 3 =================== */
  (function () {
    var K1 = { lines: ["if nilai >= 0:", '    print("Nilai D")', "elif nilai >= 50:", '    print("Nilai C")', "elif nilai >= 70:", '    print("Nilai B")', "else:", '    print("Nilai A")'], c: [[0, 0, "D"], [2, 50, "C"], [4, 70, "B"]], e: "A" };
    var K2 = { lines: ["if nilai >= 90:", '    print("Nilai A")', "elif nilai >= 70:", '    print("Nilai B")', "elif nilai >= 50:", '    print("Nilai C")', "else:", '    print("Nilai D")'], c: [[0, 90, "A"], [2, 70, "B"], [4, 50, "C"]], e: "D" };
    function expect(n) { return n >= 90 ? "A" : n >= 70 ? "B" : n >= 50 ? "C" : "D"; }
    function render(K, n, codeEl, vEl) {
      var st = K.lines.map(function () { return "skip"; }), ev = {}, hit = null;
      K.c.forEach(function (c) {
        if (hit) return;
        st[c[0]] = "run"; var t = n >= c[1];
        ev[c[0]] = '<span class="eval' + (t ? "" : " f") + '">' + n + " &gt;= " + c[1] + " → " + T(t) + "</span>";
        if (t) { st[c[0] + 1] = "run"; hit = c[2]; }
      });
      if (!hit) { st[6] = "run"; st[7] = "run"; hit = K.e; ev[6] = '<span class="eval">semua False → else</span>'; }
      codeEl.innerHTML = K.lines.map(function (l, i) { return '<span class="ln ' + st[i] + '" data-n="' + (i + 1) + '">' + hl(l) + (ev[i] || "") + "</span>"; }).join("");
      var ok = hit === expect(n);
      vEl.className = "verdict " + (ok ? "ok" : "no");
      vEl.textContent = "Tampil: Nilai " + hit + (ok ? " ✓ benar" : " ✗ seharusnya Nilai " + expect(n));
    }
    function draw() { var n = parseInt($("#ksVal").value, 10); $("#ksShow").textContent = n; render(K1, n, $("#ks1"), $("#ks1v")); render(K2, n, $("#ks2"), $("#ks2v")); }
    $("#ksVal").addEventListener("input", draw); draw();
  })();

  Drill($("#drillElif"), {
    prompt: "Apa yang tampil di layar?", mono: true,
    items: [
      { q: 'suhu = 30\nif suhu > 35:\n    print("Panas sekali")\nelif suhu > 25:\n    print("Hangat")\nelif suhu > 15:\n    print("Sejuk")\nelse:\n    print("Dingin")', opts: ["Panas sekali", "Hangat", "Hangat\nSejuk", "Dingin"], a: "Hangat", why: "30 > 35 False, 30 > 25 True → \"Hangat\", lalu selesai. 30 > 15 tidak diperiksa lagi." },
      { q: 'x = 15\nif x > 10:\n    print("A")\nelif x > 5:\n    print("B")', opts: ["A", "B", "A\nB"], a: "A", why: "Kondisi pertama True, jadi elif tidak diperiksa." },
      { q: 'x = 15\nif x > 10:\n    print("A")\nif x > 5:\n    print("B")', opts: ["A", "B", "A\nB"], a: "A\nB", why: "Ini dua if <b>terpisah</b>, keduanya diperiksa dan keduanya True." },
      { q: 'nilai = 70\nif nilai >= 90:\n    print("Nilai A")\nelif nilai >= 70:\n    print("Nilai B")\nelif nilai >= 50:\n    print("Nilai C")\nelse:\n    print("Nilai D")', opts: ["Nilai A", "Nilai B", "Nilai C"], a: "Nilai B", why: "70 >= 70 True (sama dengan juga termasuk)." },
      { q: 'n = -3\nif n > 0:\n    print("Positif")\nelif n == 0:\n    print("Nol")\nelse:\n    print("Negatif")', opts: ["Positif", "Nol", "Negatif"], a: "Negatif", why: "Semua kondisi False, jadi blok else yang dijalankan." },
      { q: 'elif x > 5:\n    print("B")', opts: ["B", "(layar kosong)", "Error"], a: "Error", why: "SyntaxError: elif harus didahului if." },
      { q: 'warna = "biru"\nif warna == "merah":\n    print("Berhenti")\nelif warna == "hijau":\n    print("Jalan")', opts: ["Berhenti", "Jalan", "(layar kosong)"], a: "(layar kosong)", why: "Tidak ada kondisi yang True dan tidak ada else, jadi tidak ada yang dijalankan." },
      { q: 'skor = 85\nif skor >= 60:\n    print("Lulus")\nelif skor >= 80:\n    print("Lulus dengan pujian")', opts: ["Lulus", "Lulus dengan pujian", "Lulus\nLulus dengan pujian"], a: "Lulus", why: "Urutannya keliru: skor 85 sudah tertangkap di kondisi pertama. Kondisi >= 80 seharusnya diletakkan lebih dulu." }
    ]
  });

  Fill($("#fillElif"), [
    { title: "Soal 1 · Kategori BMI",
      desc: "BMI = berat ÷ (tinggi × tinggi). Kategori: kurang dari 18.5 <b>Kurus</b>, kurang dari 25 <b>Normal</b>, kurang dari 30 <b>Gemuk</b>, selain itu <b>Obesitas</b>.",
      code: 'berat = 60\ntinggi = 1.70\nbmi = berat / (tinggi * tinggi)\n{{if~elif~else}} bmi < 18.5:\n    kategori = "Kurus"\n{{elif~if~else}} bmi {{<~>~==}} 25:\n    kategori = "Normal"\nelif bmi < 30:\n    kategori = "Gemuk"\n{{else~elif~if}}:\n    kategori = "Obesitas"\nprint("Kategori BMI:", kategori)      # Kategori BMI: Normal',
      tip: "Rangkaian dimulai dengan <code>if</code>, dilanjutkan <code>elif</code>, dan ditutup <code>else</code> (tanpa kondisi)." },
    { title: "Soal 2 · Fungsi tarif parkir",
      desc: "Fungsi <code>tarif_parkir(jam)</code> mengembalikan tarif: sampai 1 jam Rp2.000, sampai 3 jam Rp4.000, lebih dari itu Rp6.000.",
      code: "def tarif_parkir(jam):\n    if jam {{<=~<~>=}} 1:\n        return 2000\n    {{elif~else~if}} jam <= 3:\n        return 4000\n    else{{:~;~.}}\n        return 6000\n\nprint(tarif_parkir(1))    # 2000\nprint(tarif_parkir(5))    # 6000",
      tip: "\"Sampai 1 jam\" berarti 1 jam juga termasuk, jadi pakai <code>&lt;=</code>. Jangan lupa titik dua setelah <code>else</code>." }
  ]);

  Studio($("#studioElif"), [
    { title: "Kategori usia",
      story: "Aplikasi menampilkan kategori pengguna berdasarkan usia: di bawah 13 tahun <b>Anak</b>, 13–17 <b>Remaja</b>, 18–59 <b>Dewasa</b>, 60 ke atas <b>Lansia</b>.",
      algo: { lines: ["START", "   INPUT usia", "   IF usia < 13 THEN", '      OUTPUT "Anak"', "   ELSE IF usia < 18 THEN", '      OUTPUT "Remaja"', "   ELSE IF usia < 60 THEN", '      OUTPUT "Dewasa"', "   ELSE", '      OUTPUT "Lansia"', "   ENDIF", "END"],
        bad: [{ t: "   IF usia < 60 THEN", h: "jika diperiksa paling awal, anak dan remaja ikut masuk kategori Dewasa. Periksa kondisi paling sempit lebih dulu." }, { t: "   ELSE usia >= 60", h: "ELSE tidak memiliki kondisi." }] },
      code: { lines: ['usia = int(input("Usia: "))', "if usia < 13:", '    print("Anak")', "elif usia < 18:", '    print("Remaja")', "elif usia < 60:", '    print("Dewasa")', "else:", '    print("Lansia")'],
        bad: [{ t: "else if usia < 18:", h: "di Python ditulis elif, bukan else if." }, { t: "elif usia > 60:", h: "untuk Dewasa, kondisinya usia < 60. Usia 60 ke atas ditangani else." }] } }
  ]);

  /* =================== TAB 4 =================== */
  Tracer($("#trMatch"), [
    { title: "Tombol game", desc: "Pilih tombol yang ditekan pemain.",
      inputs: [{ id: "t", label: "tombol =", type: "select", value: "a", options: ["w", "s", "a", "d", "x", "W"] }],
      build: function (v) {
        var t = v.t, R = Rec(), cases = [["w", "Maju ke depan"], ["s", "Mundur ke belakang"], ["a", "Belok kiri"], ["d", "Belok kanan"]], hit = false;
        R.set("tombol", q(t)).step(0, "Simpan tombol yang ditekan.");
        R.step(1, "Mulai mencocokkan <code>tombol</code> dengan setiap case, dari atas.");
        for (var i = 0; i < cases.length; i++) {
          var c = cases[i][0] === t;
          R.step(2 + i * 2, "Apakah <code>\"" + t + "\"</code> cocok dengan <code>\"" + cases[i][0] + "\"</code>? <b>" + (c ? "Cocok!" : "Tidak") + "</b>" + (t === "W" && cases[i][0] === "w" ? " (huruf besar berbeda dengan huruf kecil)" : ""));
          if (c) { R.step(3 + i * 2, "Blok case ini dijalankan. Case lain dilewati.", [cases[i][1]]); hit = true; break; }
        }
        if (!hit) { R.step(10, "Tidak ada yang cocok → <code>case _</code> (wildcard) menangkap semuanya."); R.step(11, "", ["Tombol tidak dikenal"]); }
        return { lines: ['tombol = "' + t + '"', "match tombol:", '    case "w":', '        print("Maju ke depan")', '    case "s":', '        print("Mundur ke belakang")', '    case "a":', '        print("Belok kiri")', '    case "d":', '        print("Belok kanan")', "    case _:", '        print("Tombol tidak dikenal")'], steps: R.steps };
      } },
    { title: "Kategori hari (pakai |)", desc: "Satu case bisa berisi beberapa nilai yang dipisah <code>|</code>.",
      inputs: [{ id: "h", label: "hari =", type: "select", value: "Sabtu", options: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu", "minggu", "Senen"] }],
      build: function (v) {
        var h = v.h, R = Rec(), kerja = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"], libur = ["Sabtu", "Minggu"];
        R.set("hari", q(h)).step(0, "");
        R.step(1, "Mulai mencocokkan.");
        var c1 = kerja.indexOf(h) >= 0;
        R.step(2, "Apakah <code>\"" + h + "\"</code> salah satu dari Senin | Selasa | Rabu | Kamis | Jumat? <b>" + (c1 ? "Ya" : "Tidak") + "</b>");
        if (c1) R.step(3, "", ["Hari kerja"]);
        else {
          var c2 = libur.indexOf(h) >= 0;
          R.step(4, "Apakah <code>\"" + h + "\"</code> salah satu dari Sabtu | Minggu? <b>" + (c2 ? "Ya" : "Tidak") + "</b>" + (h === "minggu" ? " (\"minggu\" huruf kecil tidak sama dengan \"Minggu\")" : ""));
          if (c2) R.step(5, "", ["Akhir pekan"]);
          else { R.step(6, "Tidak ada yang cocok → wildcard."); R.step(7, "", ["Nama hari tidak valid"]); }
        }
        return { lines: ['hari = "' + h + '"', "match hari:", '    case "Senin" | "Selasa" | "Rabu" | "Kamis" | "Jumat":', '        print("Hari kerja")', '    case "Sabtu" | "Minggu":', '        print("Akhir pekan")', "    case _:", '        print("Nama hari tidak valid")'], steps: R.steps };
      } }
  ]);

  Drill($("#drillMatch"), {
    prompt: "Apa yang tampil di layar?", mono: true,
    items: [
      { q: 'tombol = "a"\nmatch tombol:\n    case "w":\n        print("Maju")\n    case "a":\n        print("Kiri")\n    case _:\n        print("?")', opts: ["Maju", "Kiri", "?", "Kiri\n?"], a: "Kiri", why: "\"a\" cocok dengan case kedua. Case _ tidak dijalankan karena sudah ada yang cocok." },
      { q: 'tombol = "q"\nmatch tombol:\n    case "w":\n        print("Maju")\n    case "a":\n        print("Kiri")\n    case _:\n        print("?")', opts: ["Maju", "Kiri", "?", "(layar kosong)"], a: "?", why: "Tidak ada yang cocok, jadi wildcard <code>_</code> yang menangkap." },
      { q: 'pilihan = 5\nmatch pilihan:\n    case 1:\n        print("Mulai")\n    case 2:\n        print("Keluar")', opts: ["Mulai", "Keluar", "(layar kosong)", "Error"], a: "(layar kosong)", why: "Tidak ada case yang cocok dan tidak ada <code>case _</code>, jadi tidak terjadi apa-apa." },
      { q: 'hari = "Minggu"\nmatch hari:\n    case "Sabtu" | "Minggu":\n        print("Libur")\n    case _:\n        print("Kuliah")', opts: ["Libur", "Kuliah", "Error"], a: "Libur", why: "<code>|</code> berarti \"atau\". \"Minggu\" cocok." },
      { q: 'hari = "minggu"\nmatch hari:\n    case "Sabtu" | "Minggu":\n        print("Libur")\n    case _:\n        print("Kuliah")', opts: ["Libur", "Kuliah", "Error"], a: "Kuliah", why: "\"minggu\" (huruf kecil) tidak sama dengan \"Minggu\"." },
      { q: 'kode = "1"\nmatch kode:\n    case 1:\n        print("Nasi")\n    case _:\n        print("Tidak ada")', opts: ["Nasi", "Tidak ada", "Error"], a: "Tidak ada", why: "str \"1\" tidak sama dengan int 1. Hasil input() perlu diubah dengan int() dulu." },
      { q: 'x = 2\nmatch x:\n    case 2:\n        print("Dua")\n    case 2 | 3:\n        print("Dua atau tiga")', opts: ["Dua", "Dua atau tiga", "Dua\nDua atau tiga"], a: "Dua", why: "Hanya case pertama yang cocok yang dijalankan." }
    ]
  });

  Drill($("#drillPilih"), {
    opts: ["if-elif-else", "match-case"],
    prompt: "Situasi ini lebih rapi ditulis dengan …",
    items: [
      { text: true, q: "Menentukan nilai huruf dari nilai angka 0–100.", a: "if-elif-else", why: "Yang dicek adalah <b>rentang</b> nilai (>= 90, >= 70, …)." },
      { text: true, q: "Menu aplikasi: pengguna mengetik 1, 2, 3, atau 4.", a: "match-case", why: "Mencocokkan nilai tunggal yang spesifik." },
      { text: true, q: "Kontrol game dengan tombol w, a, s, d.", a: "match-case", why: "Setiap tombol adalah nilai spesifik." },
      { text: true, q: "Status suhu: di atas 30 panas, di atas 20 hangat, selain itu sejuk.", a: "if-elif-else", why: "Perbandingan rentang nilai." },
      { text: true, q: "Mengelompokkan nama hari menjadi \"kerja\" atau \"libur\".", a: "match-case", why: "Nilai spesifik yang bisa digabung dengan <code>|</code>." },
      { text: true, q: "Cek apakah umur >= 17 dan punya KTP sekaligus.", a: "if-elif-else", why: "Butuh operator perbandingan dan logika (and)." }
    ]
  });

  Fill($("#fillMatch"), [
    { title: "Soal 1 · Menu kantin",
      desc: "Fungsi <code>menu(kode)</code>: kode 1 → \"Nasi goreng\", kode 2 atau 3 → \"Mie ayam\", selain itu → \"Menu tidak ada\".",
      code: 'def menu(kode):\n    {{match~switch~if}} kode:\n        {{case~if~elif}} 1:\n            return "Nasi goreng"\n        case 2 {{|~or~and}} 3:\n            return "Mie ayam"\n        case {{_~else~default}}:\n            return "Menu tidak ada"\n\nprint(menu(3))    # Mie ayam\nprint(menu(9))    # Menu tidak ada',
      tip: "Kata kuncinya <code>match</code> dan <code>case</code>. Untuk \"atau\" di dalam case, pakai <code>|</code>. Wildcard ditulis <code>_</code>." },
    { title: "Soal 2 · Ubah if-elif menjadi match",
      desc: "Ubah kode <code>if nilai == \"A\": … elif nilai == \"B\": … else: …</code> menjadi match-case.",
      code: 'nilai = "B"\nmatch {{nilai~"nilai"~nilai ==}}:\n    case "A":\n        print("Sangat baik")\n    case {{"B"~B~== "B"}}:\n        print("Baik")\n    case _:\n        print("Perlu belajar lagi")\n# Output: Baik',
      tip: "Setelah <code>match</code> ditulis nama variabelnya. Setelah <code>case</code> ditulis nilai yang dicocokkan (string pakai kutip), tanpa <code>==</code>." }
  ]);

  /* =================== TAB 5 =================== */
  (function () {
    var A = $("#rgA"), B = $("#rgB"), C = $("#rgC");
    var P = [["range(5)", 0, 5, 1], ["range(2, 8)", 2, 8, 1], ["range(2, 8, 2)", 2, 8, 2], ["range(10, 0, -2)", 10, 0, -2], ["range(5, 2)", 5, 2, 1]];
    $("#rgPreset").innerHTML = P.map(function (p, i) { return '<button type="button" class="btn btn-ghost btn-sm" data-i="' + i + '">' + p[0] + "</button>"; }).join("");
    $$("#rgPreset button").forEach(function (b) { b.addEventListener("click", function () { var p = P[+b.getAttribute("data-i")]; A.value = p[1]; B.value = p[2]; C.value = p[3]; draw(); }); });
    function draw() {
      var a = parseInt(A.value, 10), b = parseInt(B.value, 10), c = parseInt(C.value, 10);
      if (isNaN(a)) a = 0; if (isNaN(b)) b = 0; if (isNaN(c)) c = 1;
      var code = "list(range(" + a + ", " + b + ", " + c + "))";
      if (c === 0) { $("#rgOut").innerHTML = '<div class="row-l">&gt;&gt;&gt; ' + hl(code) + '</div><div class="row-l err">ValueError: range() arg 3 must not be zero</div>'; $("#rgChips").innerHTML = ""; $("#rgNote").textContent = "Step tidak boleh 0, karena bilangannya tidak akan pernah bergerak."; return; }
      var r = [], x = a;
      while ((c > 0 ? x < b : x > b) && r.length < 60) { r.push(x); x += c; }
      var more = (c > 0 ? x < b : x > b);
      $("#rgOut").innerHTML = '<div class="row-l">&gt;&gt;&gt; ' + hl(code) + '</div><div class="row-l res">[' + r.join(", ") + (more ? ", …" : "") + "]</div>";
      $("#rgChips").innerHTML = r.map(function (n) { return '<span class="chip">' + n + "</span>"; }).join("") + (r.length ? "" : "") + '<span class="chip off" title="stop tidak ikut">' + b + " ✗</span>";
      $("#rgNote").innerHTML = r.length ? "Mulai dari <b>" + a + "</b>, " + (c > 0 ? "naik " : "turun ") + Math.abs(c) + " setiap langkah, berhenti <b>sebelum</b> " + b + ". Ada " + (more ? "lebih dari 60" : r.length) + " bilangan; " + (r.length && !more ? "itulah banyaknya iterasi jika dipakai di <code>for</code>." : "")
        : "List kosong! Dengan step " + c + ", tidak mungkin bergerak dari " + a + " menuju " + b + ". Perulangan for dengan range ini tidak dijalankan sama sekali.";
    }
    [A, B, C].forEach(function (x) { x.addEventListener("input", draw); });
    draw();
  })();

  function parseNums(s, max) { return s.split(",").map(function (x) { return parseInt(x, 10); }).filter(function (x) { return !isNaN(x); }).slice(0, max || 10); }

  Tracer($("#trFor"), [
    { title: "List kota",
      build: function () {
        var R = Rec(), kota = ["Solo", "Jogja", "Jakarta"];
        R.set("kota", '["Solo", "Jogja", "Jakarta"]').step(0, "List dengan 3 item, jadi perulangan akan berjalan 3 kali.");
        kota.forEach(function (k, i) { R.set("k", q(k)).step(1, "Iterasi ke-" + (i + 1) + ": <code>k</code> diisi item ke-" + i + ", yaitu \"" + k + "\"."); R.step(2, "", [k]); });
        R.step(1, "Semua item sudah dipakai → perulangan selesai.");
        R.step(3, "", ["Selesai"]);
        return { lines: ['kota = ["Solo", "Jogja", "Jakarta"]', "for k in kota:", "    print(k)", 'print("Selesai")'], steps: R.steps };
      } },
    { title: "Huruf dalam string", desc: "String juga koleksi: perulangan mengambil satu karakter per iterasi, termasuk spasi.",
      inputs: [{ id: "s", label: "kata =", type: "text", value: "Kami siap", max: 12 }],
      build: function (v) {
        var s = v.s.slice(0, 12), R = Rec();
        R.set("kata", q(s)).step(0, "String berisi " + s.length + " karakter (pakai <code>len(kata)</code> untuk menghitungnya).");
        s.split("").forEach(function (h, i) { R.set("huruf", q(h)).step(1, "Iterasi ke-" + (i + 1) + ": huruf = \"" + (h === " " ? "␣ (spasi)" : esc(h)) + "\""); R.step(2, "", [h]); });
        R.step(1, "Karakter habis → selesai.");
        return { lines: ['kata = "' + s + '"', "for huruf in kata:", "    print(huruf)"], steps: R.steps };
      } },
    { title: "Genap dari tuple", desc: "Latihan dari modul: for + if sebagai penyaring.",
      inputs: [{ id: "t", label: "isi tuple", type: "text", value: "3, 4, 2, 7, 6, 9" }],
      build: function (v) {
        var t = parseNums(v.t, 8), R = Rec(), rep = "(" + t.join(", ") + (t.length === 1 ? "," : "") + ")";
        R.set("tup", rep).step(0, "");
        t.forEach(function (d, i) {
          R.set("data", d).step(1, "Iterasi ke-" + (i + 1) + ": data = " + d);
          var c = mod(d, 2) === 0;
          R.step(2, "<code>" + d + " % 2 == 0</code> → <b>" + T(c) + "</b>" + (c ? "" : " → tidak ditampilkan"));
          if (c) R.step(3, "", [String(d)]);
        });
        R.step(1, "Item habis → selesai.");
        return { lines: ["tup = " + rep, "for data in tup:", "    if data % 2 == 0:", "        print(data)"], steps: R.steps };
      } },
    { title: "Total & rata-rata", desc: "Pola akumulator: variabel <code>total</code> dimulai dari 0 di luar perulangan.",
      inputs: [{ id: "t", label: "nilai", type: "text", value: "80, 75, 90, 65" }],
      build: function (v) {
        var t = parseNums(v.t, 8), R = Rec(), tot = 0, rep = "[" + t.join(", ") + "]";
        if (!t.length) t = [0];
        R.set("nilai", rep).step(0, "");
        R.set("total", 0).step(1, "total dimulai dari 0.");
        t.forEach(function (n, i) { R.set("n", n).step(2, "Iterasi ke-" + (i + 1) + ": n = " + n); var old = tot; tot += n; R.set("total", tot).step(3, "total = " + old + " + " + n + " = " + tot); });
        R.step(2, "Item habis → selesai.");
        R.step(4, "Di luar perulangan, jadi hanya sekali.", ["Total: " + tot]);
        var avg = tot / t.length;
        R.step(5, "<code>len(nilai)</code> = " + t.length + ". Pembagian <code>/</code> menghasilkan float.", ["Rata-rata: " + pyFloat(avg)]);
        return { lines: ["nilai = " + rep, "total = 0", "for n in nilai:", "    total += n", 'print("Total:", total)', 'print("Rata-rata:", total / len(nilai))'], steps: R.steps };
      } },
    { title: "for + range",
      inputs: [{ id: "a", label: "start", type: "number", value: "1" }, { id: "b", label: "stop", type: "number", value: "10" }, { id: "c", label: "step", type: "number", value: "3" }],
      build: function (v) {
        var a = parseInt(v.a, 10) || 0, b = parseInt(v.b, 10) || 0, c = parseInt(v.c, 10), R = Rec();
        if (isNaN(c)) c = 1;
        var lines = ["for i in range(" + a + ", " + b + ", " + c + "):", "    print(i)"];
        if (c === 0) { R.step(0, "ValueError: step tidak boleh 0.", [], true); return { lines: lines, steps: R.steps }; }
        var x = a, n = 0;
        while ((c > 0 ? x < b : x > b) && n < 20) { R.set("i", x).step(0, "Iterasi ke-" + (n + 1) + ": i = " + x); R.step(1, "", [String(x)]); x += c; n++; }
        if (c > 0 ? x < b : x > b) R.step(0, "… dan masih berlanjut. Simulasi dibatasi 20 iterasi.", [], true);
        else R.step(0, n ? "Bilangan berikutnya (" + x + ") tidak lagi " + (c > 0 ? "kurang dari" : "lebih dari") + " stop " + b + " → selesai setelah " + n + " iterasi." : "range kosong → perulangan tidak dijalankan sama sekali.");
        return { lines: lines, steps: R.steps };
      } },
    { title: "Pengunjung web", desc: "Contoh dari modul (sudah diperbaiki): mencari kenaikan pengunjung terbesar. <code>range(1, len(pengunjung))</code> dipakai karena kita butuh indeks untuk membandingkan hari ke-k dengan hari sebelumnya.",
      inputs: [{ id: "t", label: "pengunjung", type: "text", value: "15, 25, 15, 30, 25, 35, 30" }],
      build: function (v) {
        var p = parseNums(v.t, 8), R = Rec(), ken = 0, hk = 1;
        if (p.length < 2) p = [15, 25];
        R.set("pengunjung", "[" + p.join(", ") + "]").step(0, "Data 7 hari: indeks 0 = hari ke-1, indeks 1 = hari ke-2, dan seterusnya.");
        R.set("kenaikan", 0).step(1, "");
        R.set("hari_ke", 1).step(2, "");
        for (var k = 1; k < p.length; k++) {
          R.set("k", k).step(3, "k = " + k + " (hari ke-" + (k + 1) + ")");
          var d = p[k] - p[k - 1], c = d > ken;
          R.step(4, "<code>pengunjung[" + k + "] - pengunjung[" + (k - 1) + "]</code> = " + p[k] + " - " + p[k - 1] + " = " + d + ". Apakah " + d + " &gt; " + ken + "? <b>" + T(c) + "</b>");
          if (c) { ken = d; R.set("kenaikan", ken).step(5, "Rekor kenaikan baru: " + ken); hk = k + 1; R.set("hari_ke", hk).step(6, "Indeks " + k + " berarti hari ke-" + hk + "."); }
        }
        R.step(3, "range habis → selesai.");
        R.step(7, "", ["Kenaikan terbesar: " + ken + " pada hari ke- " + hk]);
        return { lines: ["pengunjung = [" + p.join(", ") + "]", "kenaikan = 0", "hari_ke = 1", "for k in range(1, len(pengunjung)):", "    if pengunjung[k] - pengunjung[k - 1] > kenaikan:", "        kenaikan = pengunjung[k] - pengunjung[k - 1]", "        hari_ke = k + 1", 'print("Kenaikan terbesar:", kenaikan, "pada hari ke-", hari_ke)'], steps: R.steps };
      } }
  ]);

  Drill($("#drillFor"), {
    prompt: "Apa yang tampil di layar?", mono: true,
    items: [
      { q: 'for k in ["a", "b", "c"]:\n    print(k)', opts: ["a\nb\nc", "abc", "k\nk\nk"], a: "a\nb\nc", why: "Setiap iterasi, k berisi satu item, dan print menampilkan isinya di baris baru." },
      { q: "for i in range(3):\n    print(i)", opts: ["0\n1\n2", "1\n2\n3", "0\n1\n2\n3"], a: "0\n1\n2", why: "range(3) dimulai dari 0 dan berhenti sebelum 3." },
      { q: "print(list(range(2, 8, 2)))", opts: ["[2, 4, 6]", "[2, 4, 6, 8]", "[2, 3, 4, 5, 6, 7]"], a: "[2, 4, 6]", why: "Naik 2, berhenti sebelum 8." },
      { q: "print(list(range(5, 0, -1)))", opts: ["[5, 4, 3, 2, 1]", "[5, 4, 3, 2, 1, 0]", "[]"], a: "[5, 4, 3, 2, 1]", why: "Step negatif menghitung mundur, berhenti sebelum 0." },
      { q: "total = 0\nfor n in [3, 4, 5]:\n    total += n\nprint(total)", opts: ["12", "3\n7\n12", "345"], a: "12", why: "print di luar perulangan, jadi hanya tampil sekali di akhir." },
      { q: "total = 0\nfor n in [3, 4, 5]:\n    total += n\n    print(total)", opts: ["12", "3\n7\n12", "3\n4\n5"], a: "3\n7\n12", why: "print menjorok, jadi ikut diulang di setiap iterasi." },
      { q: 'jumlah = 0\nfor h in "banana":\n    if h == "a":\n        jumlah += 1\nprint(jumlah)', opts: ["3", "2", "6"], a: "3", why: "Ada 3 huruf a di \"banana\"." },
      { q: 'for i in range(1, 4):\n    print(i * "*")', opts: ["*\n**\n***", "*\n**\n***\n****", "1*\n2*\n3*"], a: "*\n**\n***", why: "i bernilai 1, 2, 3. int * str mengulang string." },
      { q: 'for x in range(0):\n    print("Hai")\nprint("Selesai")', opts: ["Selesai", "Hai\nSelesai", "(layar kosong)"], a: "Selesai", why: "range(0) kosong, jadi blok for tidak dijalankan sama sekali." },
      { q: 'buah = ("apel", "jeruk")\nfor i in range(len(buah)):\n    print(i, buah[i])', opts: ["0 apel\n1 jeruk", "1 apel\n2 jeruk", "apel\njeruk"], a: "0 apel\n1 jeruk", why: "len(buah) = 2, jadi i = 0 dan 1. buah[i] mengambil item lewat indeks." }
    ]
  });

  Parsons($("#parsonsFor"), [
    { title: "Soal 1 · Total belanja", desc: "Hitung total harga semua barang di list, lalu tampilkan totalnya <b>sekali</b> di akhir.",
      lines: ["harga = [12000, 5000, 8000]", "total = 0", "for h in harga:", "    total += h", 'print("Total belanja:", total)'],
      bad: [{ t: '    print("Total belanja:", total)', h: "jika menjorok, total ditampilkan di setiap iterasi." }, { t: "    total = 0", h: "jika di dalam perulangan, total di-reset menjadi 0 di setiap iterasi." }] },
    { title: "Soal 2 · Hitung yang lulus", desc: "Hitung berapa nilai yang lulus (>= 60) di dalam tuple.",
      lines: ["nilai = (80, 45, 70, 55, 90)", "lulus = 0", "for n in nilai:", "    if n >= 60:", "        lulus += 1", 'print("Jumlah lulus:", lulus)'],
      bad: [{ t: "    lulus += 1", h: "harus di dalam if (menjorok dua tingkat). Jika tidak, semua nilai ikut terhitung." }, { t: "for n in range(nilai):", h: "range membutuhkan angka, bukan tuple. Langsung saja for n in nilai." }] },
    { title: "Soal 3 · Segitiga bintang", desc: "Tampilkan segitiga bintang 4 baris: *, **, ***, ****.",
      lines: ["for i in range(1, 5):", '    print(i * "*")'],
      bad: [{ t: "for i in range(1, 4):", h: "range berhenti sebelum 4, jadi hanya 3 baris." }, { t: '    print(i + "*")', h: "int + str menyebabkan error. Untuk mengulang string, gunakan *." }] }
  ], { okMsg: "Program benar! 🎉" });

  /* =================== TAB 6 =================== */
  Tracer($("#trWhile"), [
    { title: "Hitung naik", desc: "Program dari modul. Coba ubah kondisi atau perubahannya menjadi <code>-= 1</code>: apa yang terjadi?",
      inputs: [{ id: "s", label: "angka =", type: "number", value: "0" }, { id: "op", label: "while angka", type: "select", value: "<", options: ["<", "<=", ">", "!="] }, { id: "L", label: "", type: "number", value: "5" }, { id: "u", label: "perubahan: angka", type: "select", value: "+= 1", options: ["+= 1", "+= 2", "-= 1"] }],
      build: function (v) {
        var a = parseInt(v.s, 10) || 0, L = parseInt(v.L, 10) || 0, op = v.op, u = v.u, R = Rec(), it = 0;
        var cmp = function (x) { return op === "<" ? x < L : op === "<=" ? x <= L : op === ">" ? x > L : x !== L; };
        var upd = function (x) { return u === "+= 1" ? x + 1 : u === "+= 2" ? x + 2 : x - 1; };
        var lines = ["angka = " + a, "while angka " + op + " " + L + ":", '    print("Angka yang ditampilkan:", angka)', "    angka " + u, 'print("Program selesai")'];
        R.set("angka", a).step(0, "Nilai awal.");
        while (true) {
          var c = cmp(a);
          R.step(1, "<code>" + a + " " + esc(op) + " " + L + "</code> → <b>" + T(c) + "</b>" + (c ? " → jalankan blok while" : " → perulangan berhenti"));
          if (!c) break;
          it++;
          if (it > 10) { R.step(1, "⚠️ Sudah 10 putaran dan kondisi masih True, dan akan selalu True. Ini <b>infinite loop</b>! Simulasi dihentikan. Di Python asli, program tidak akan pernah berhenti (tekan Ctrl+C).", [], true); return { lines: lines, steps: R.steps }; }
          R.step(2, "", ["Angka yang ditampilkan: " + a]);
          a = upd(a); R.set("angka", a).step(3, "angka berubah menjadi " + a + ".");
        }
        R.step(4, "Blok while dijalankan " + it + " kali.", ["Program selesai"]);
        return { lines: lines, steps: R.steps };
      } },
    { title: "Target tabungan", desc: "Berapa minggu menabung sampai target tercapai? Jumlah putarannya tidak diketahui di awal, cocok untuk while.",
      inputs: [{ id: "t", label: "target =", type: "number", value: "300000" }, { id: "s", label: "setoran =", type: "number", value: "50000" }],
      build: function (v) {
        var tg = parseInt(v.t, 10) || 0, s = parseInt(v.s, 10) || 0, R = Rec(), saldo = 0, mg = 0;
        var lines = ["target = " + tg, "setoran = " + s, "saldo = 0", "minggu = 0", "while saldo < target:", "    saldo += setoran", "    minggu += 1", 'print("Target tercapai dalam", minggu, "minggu")'];
        R.set("target", tg).step(0, ""); R.set("setoran", s).step(1, ""); R.set("saldo", 0).step(2, ""); R.set("minggu", 0).step(3, "");
        while (true) {
          var c = saldo < tg;
          R.step(4, "<code>" + saldo + " &lt; " + tg + "</code> → <b>" + T(c) + "</b>");
          if (!c) break;
          if (mg >= 12 && s <= 0) { R.step(4, "⚠️ Setoran " + s + " membuat saldo tidak pernah bertambah. Infinite loop! Simulasi dihentikan.", [], true); return { lines: lines, steps: R.steps }; }
          if (mg >= 40) { R.step(4, "Simulasi dibatasi 40 putaran. Coba setoran yang lebih besar.", [], true); return { lines: lines, steps: R.steps }; }
          saldo += s; R.set("saldo", saldo).step(5, "");
          mg++; R.set("minggu", mg).step(6, "");
        }
        R.step(7, "", ["Target tercapai dalam " + mg + " minggu"]);
        return { lines: lines, steps: R.steps };
      } },
    { title: "Kata sandi", desc: "Pengguna diminta terus mengetik selama kata sandinya salah. Tulis ketikan pengguna dipisah koma.",
      inputs: [{ id: "t", label: "ketikan pengguna", type: "text", value: "abc, 12345, rahasia" }],
      build: function (v) {
        var att = v.t.split(",").map(function (x) { return x.trim(); }).slice(0, 8), R = Rec(), s = "", i = 0;
        var lines = ['sandi = ""', 'while sandi != "rahasia":', '    sandi = input("Kata sandi: ")', 'print("Berhasil masuk!")'];
        R.set("sandi", '""').step(0, "Nilai awal string kosong, supaya kondisi pertama True.");
        while (true) {
          var c = s !== "rahasia";
          R.step(1, "<code>\"" + esc(s) + "\" != \"rahasia\"</code> → <b>" + T(c) + "</b>");
          if (!c) break;
          if (i >= att.length) { R.step(2, "Daftar ketikan di simulasi sudah habis, tapi sandi belum benar. Di program asli, pengguna akan terus diminta mengetik.", [], true); return { lines: lines, steps: R.steps }; }
          s = att[i++]; R.set("sandi", q(s)).step(2, "Percobaan ke-" + i + ".", ["Kata sandi: " + s]);
        }
        R.step(3, "Berhasil setelah " + i + " kali percobaan.", ["Berhasil masuk!"]);
        return { lines: lines, steps: R.steps };
      } }
  ]);

  Drill($("#drillWhile"), {
    prompt: "Apa yang tampil di layar?", mono: true,
    items: [
      { q: "i = 1\nwhile i <= 3:\n    print(i)\n    i += 1", opts: ["1\n2\n3", "1\n2", "1\n2\n3\n4"], a: "1\n2\n3", why: "Saat i = 4, kondisi 4 <= 3 False, perulangan berhenti." },
      { q: 'i = 10\nwhile i < 5:\n    print(i)\n    i += 1\nprint("Selesai")', opts: ["Selesai", "10\nSelesai", "(tidak berhenti)"], a: "Selesai", why: "Kondisi sudah False sejak awal, jadi blok while tidak dijalankan sama sekali." },
      { q: 'n = 3\nwhile n > 0:\n    print(n)\n    n -= 1\nprint("Meluncur!")', opts: ["3\n2\n1\nMeluncur!", "3\n2\n1\n0\nMeluncur!", "Meluncur!"], a: "3\n2\n1\nMeluncur!", why: "Saat n = 0, kondisi 0 > 0 False." },
      { q: "i = 0\nwhile i < 10:\n    i += 3\nprint(i)", opts: ["12", "9", "10"], a: "12", why: "i: 0 → 3 → 6 → 9 → 12. Saat i = 12, 12 < 10 False, lalu 12 ditampilkan." },
      { q: 'nilai = 5\nwhile nilai > 0:\n    nilai += 1\nprint("Selesai")', opts: ["Selesai", "(tidak pernah berhenti: infinite loop)", "Error"], a: "(tidak pernah berhenti: infinite loop)", why: "nilai terus bertambah dan selalu > 0." },
      { q: "x = 1\nwhile x < 20:\n    x = x * 2\nprint(x)", opts: ["32", "16", "20"], a: "32", why: "x: 1 → 2 → 4 → 8 → 16 → 32. Saat 32, kondisi False." },
      { q: 'i = 0\nwhile i < 10:\n    print("Hai")\n    i += 2', prompt: "Berapa kali \"Hai\" ditampilkan?", opts: ["5 kali", "10 kali", "6 kali"], a: "5 kali", why: "i = 0, 2, 4, 6, 8 → 5 kali. Saat i = 10, berhenti." },
      { q: "k = 0\nwhile k != 5:\n    k += 2", prompt: "Apa yang terjadi?", opts: ["Berhenti saat k = 6", "Berhenti saat k = 4", "Tidak pernah berhenti (infinite loop)"], a: "Tidak pernah berhenti (infinite loop)", why: "k bernilai 0, 2, 4, 6, 8, … dan tidak pernah tepat 5. Hati-hati memakai != pada kondisi while." }
    ]
  });

  Fill($("#fillWhile"), [
    { title: "Soal 1 · Perbaiki infinite loop",
      desc: "Program dari modul ini berputar tanpa henti. Perbaiki agar menampilkan 5, 4, 3, 2, 1.",
      code: 'nilai = 5\nwhile nilai {{>~<~==}} 0:\n    print("Angka :", nilai)\n    nilai {{-=~+=~=}} 1\n# Output: Angka : 5 … Angka : 1',
      tip: "Nilai harus <b>berkurang</b> di setiap putaran supaya suatu saat kondisi <code>nilai &gt; 0</code> menjadi False." },
    { title: "Soal 2 · Target tabungan",
      desc: "Menabung Rp50.000 per minggu. Berapa minggu sampai saldo mencapai Rp300.000?",
      code: 'saldo = 0\nminggu = 0\nwhile saldo {{<~>~==}} 300000:\n    saldo {{+=~=~-=}} 50000\n    minggu {{+= 1~= 1~-= 1}}\nprint("Butuh", minggu, "minggu")     # Butuh 6 minggu',
      tip: "Ulangi <b>selama</b> saldo masih kurang dari target. Saldo dan minggu sama-sama bertambah." },
    { title: "Soal 3 · Hitung mundur",
      desc: "Tampilkan 3, 2, 1, lalu \"Meluncur!\".",
      code: 'n = {{3~0~1}}\nwhile n {{>=~<~==}} 1:\n    print(n)\n    n -= 1\nprint({{"Meluncur!"~Meluncur!~n}})',
      tip: "Mulai dari 3. Ulangi selama n masih 1 atau lebih. Teks ditulis dengan tanda kutip." }
  ]);

  /* =================== TAB 7: KUIS =================== */
  var QZ = [
    { lv: "mudah", q: "Baris <code>if</code>, <code>else</code>, <code>for</code>, dan <code>while</code> harus diakhiri tanda …", o: [";", ":", ".", ","], a: 1, mono: true,
      why: "Titik dua <code>:</code> menandai awal blok perintah yang menjorok di bawahnya." },
    { lv: "mudah", q: "Perulangan yang jumlah putarannya sama dengan banyaknya item dalam koleksi adalah …", o: ["if", "for", "while", "match"], a: 1, mono: true,
      why: "<code>for</code> adalah perulangan berbasis koleksi." },
    { lv: "mudah", q: "Apa yang tampil di layar?", code: "print(list(range(4)))", o: ["[0, 1, 2, 3]", "[1, 2, 3, 4]", "[0, 1, 2, 3, 4]", "[4]"], a: 0, mono: true,
      why: "range(4) dimulai dari 0 dan berhenti <b>sebelum</b> 4." },
    { lv: "sedang", q: "Apa hasil ekspresi berikut?", code: '"gratis" in "Dapatkan hadiah GRATIS"', o: ["True", "False", "Error", "GRATIS"], a: 1, mono: true,
      why: "Huruf besar dan kecil dianggap berbeda, jadi \"gratis\" tidak ditemukan di dalam \"…GRATIS\"." },
    { lv: "sedang", q: "Apa yang tampil di layar?", code: 'x = 15\nif x > 10:\n    print("A")\nelif x > 5:\n    print("B")\nelse:\n    print("C")', o: ["A", "B", "A\nB", "C"], a: 0, mono: true,
      why: "Kondisi pertama sudah True, jadi elif dan else tidak diperiksa." },
    { lv: "sedang", q: "Apa yang tampil di layar?", code: 'warna = "kuning"\nmatch warna:\n    case "merah":\n        print("Berhenti")\n    case "kuning" | "oranye":\n        print("Hati-hati")\n    case _:\n        print("Jalan")', o: ["Berhenti", "Hati-hati", "Jalan", "Hati-hati\nJalan"], a: 1, mono: true,
      why: "\"kuning\" cocok dengan case kedua (<code>|</code> berarti atau). Case _ tidak dijalankan." },
    { lv: "sedang", q: "Apa yang tampil di layar?", code: "total = 0\nfor n in (2, 4, 6):\n    total += n\nprint(total)", o: ["12", "246", "2\n6\n12", "6"], a: 0, mono: true,
      why: "Akumulator: 0 + 2 + 4 + 6 = 12. print di luar perulangan, jadi tampil sekali." },
    { lv: "sulit", q: "Apa yang tampil di layar?", code: "i = 1\nwhile i < 20:\n    i = i * 3\nprint(i)", o: ["27", "9", "18", "20"], a: 0, mono: true,
      why: "i: 1 → 3 → 9 → 27. Saat i = 27, kondisi 27 < 20 False, lalu 27 ditampilkan." },
    { lv: "sulit", q: "Apa yang tampil di layar?", code: 'nilai = 95\nif nilai >= 0:\n    print("Nilai D")\nelif nilai >= 50:\n    print("Nilai C")\nelif nilai >= 70:\n    print("Nilai B")\nelse:\n    print("Nilai A")', o: ["Nilai A", "Nilai B", "Nilai D", "Nilai C"], a: 2, mono: true,
      why: "95 >= 0 sudah True di kondisi pertama, jadi langsung \"Nilai D\". Inilah \"Kasus 1\": urutan kondisinya salah." },
    { lv: "sulit", q: "Algoritma: <code>FOR EACH n IN data · IF n habis dibagi 3 THEN OUTPUT n · ENDIF · ENDFOR</code>. Kode mana yang benar?",
      o: ["for n in data:\n    if n % 3 == 0:\n        print(n)", "for n in data:\nif n % 3 == 0:\n    print(n)", "while n in data:\n    if n % 3 == 0:\n        print(n)", "for n in data:\n    if n / 3 == 0:\n        print(n)"], a: 0, mono: true,
      why: "B: if tidak menjorok di dalam for (IndentationError). C: FOR EACH diterjemahkan menjadi for, bukan while. D: \"habis dibagi\" dicek dengan sisa bagi <code>%</code>, bukan <code>/</code>." }
  ];

  var qAns = [], qSubmitted = false;
  function renderQuiz() {
    var L = "ABCD";
    $("#quizWrap").innerHTML = QZ.map(function (x, i) {
      return '<div class="quiz-q" data-i="' + i + '"><div class="qhead"><span class="qnum">Soal ' + (i + 1) + '</span><span class="level ' + x.lv + '">' + x.lv + "</span></div>" +
        '<div class="qtext">' + x.q + "</div>" + (x.code ? '<pre class="code">' + hl(x.code) + "</pre>" : "") +
        '<div class="quiz-opts">' + x.o.map(function (o, k) {
          return '<button type="button" class="qopt" data-k="' + k + '"><span class="letter">' + L[k] + '</span><span class="otext' + (x.mono ? " mono" : "") + '">' + (x.mono ? hl(o) : esc(o)) + "</span></button>";
        }).join("") + '</div><div class="explain"></div></div>';
    }).join("");
    $$(".quiz-q").forEach(function (box) {
      var i = +box.getAttribute("data-i");
      $$(".qopt", box).forEach(function (b) {
        b.addEventListener("click", function () {
          if (qSubmitted) return;
          qAns[i] = +b.getAttribute("data-k");
          $$(".qopt", box).forEach(function (x) { x.classList.toggle("chosen", x === b); });
          updateCount();
        });
      });
    });
    updateCount();
  }
  function answered() { return qAns.filter(function (x) { return x !== undefined; }).length; }
  function updateCount() {
    var n = answered();
    $("#quizCount").innerHTML = "<b>" + n + "</b> dari " + QZ.length + " soal terjawab";
    $("#quizSubmit").disabled = n < QZ.length || qSubmitted;
  }
  $("#quizSubmit").addEventListener("click", function () {
    if (answered() < QZ.length) return;
    qSubmitted = true;
    var right = 0;
    $$(".quiz-q").forEach(function (box) {
      var i = +box.getAttribute("data-i"), x = QZ[i], ok = qAns[i] === x.a;
      if (ok) right++;
      $$(".qopt", box).forEach(function (b) {
        var k = +b.getAttribute("data-k"); b.disabled = true; b.classList.remove("chosen");
        if (k === x.a) b.classList.add("correct"); else if (k === qAns[i]) b.classList.add("wrong");
      });
      var ex = $(".explain", box); ex.classList.add("show");
      ex.innerHTML = "<b>" + (ok ? "✅ Benar." : "❌ Kurang tepat.") + "</b> " + x.why;
    });
    var score = right * 10;
    state.quizDone = true;
    if (state.best === null || score > state.best) state.best = score;
    if (lmsOn) { SCORM.set("cmi.core.score.min", 0); SCORM.set("cmi.core.score.max", 100); SCORM.set("cmi.core.score.raw", state.best); }
    save();
    showResult(score, right);
    updateNav(); updateCount();
  });
  function showResult(score, right) {
    var msg = score === 100 ? "Luar biasa! Semua benar. 🏆" : score >= 80 ? "Hebat! Pemahamanmu sudah kuat. 🎉" : score >= 60 ? "Cukup baik! Pelajari lagi soal yang salah, ya." : "Jangan menyerah! Baca ulang materinya dan coba lagi. 💪";
    var C = 2 * Math.PI * 62, off = C * (1 - score / 100);
    $("#quizResult").innerHTML =
      '<div class="score-card" id="scoreCard"><div class="score-ring"><svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="62" fill="none" stroke="#ffffff" stroke-width="14"/>' +
      '<circle cx="75" cy="75" r="62" fill="none" stroke="#2e8b4f" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + off + '"/></svg><div class="val">' + score + "</div></div>" +
      '<div class="score-msg">Skormu: ' + score + " / 100 (" + right + " dari " + QZ.length + " benar)</div><p>" + msg + "</p>" +
      (state.best !== null && state.best > score ? "<p>Skor terbaikmu yang tercatat: <b>" + state.best + "</b></p>" : "") +
      '<p style="font-size:.92rem;color:var(--muted)">Pembahasan setiap soal ada di bawah. Tekan <b>Aku paham →</b> untuk ke rangkuman.</p>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="quizRetry">↺ Ulangi kuis</button></div>';
    $("#quizRetry").addEventListener("click", function () { qAns = []; qSubmitted = false; $("#quizResult").innerHTML = ""; renderQuiz(); window.scrollTo(0, $("#quizWrap").offsetTop - 80); });
    $("#scoreCard").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  renderQuiz();
  if (state.quizDone && state.best !== null) {
    $("#quizResult").innerHTML = '<div class="callout info"><strong>Kamu sudah pernah mengerjakan kuis ini.</strong> Skor terbaik yang tercatat: <b>' + state.best + "</b>. Kamu boleh mengerjakan ulang untuk latihan.</div>";
  }

  /* =================== TAB 8 =================== */
  function renderWrapScore() {
    var el = $("#wrapScore");
    if (state.quizDone && state.best !== null) el.innerHTML = "Selamat, kamu sudah sampai di akhir materi! Skor kuis terbaikmu: <b>" + state.best + " / 100</b>.";
    else el.innerHTML = "Kamu sudah sampai di akhir materi. Jangan lupa kerjakan kuis di Tab 7 supaya materi tercatat selesai.";
  }
  (function () {
    var boxes = $$("#reflect input");
    function upd() {
      var n = 0;
      boxes.forEach(function (b) { b.parentNode.classList.toggle("on", b.checked); if (b.checked) n++; });
      $("#reflectNote").textContent = n === boxes.length ? "Mantap, semua sudah kamu kuasai! 🚀" : n > 0 ? n + " dari " + boxes.length + " tercentang. Bagian yang belum, coba buka lagi tab materinya." : "";
    }
    boxes.forEach(function (b) { b.addEventListener("change", upd); });
  })();

  go(state.cur);
})();
