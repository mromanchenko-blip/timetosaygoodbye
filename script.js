(() => {
  // ================== Дані події ==================
  const EVENT = {
    title: "Postmen. Час прощатися",
    // 11 грудня 2026, 18:30 за Києвом (UTC+2) → 16:30 UTC
    startUTC: "20261211T163000Z",
    // Кінець — 21:00 за Києвом. Зміни тут і в event.ics, якщо треба.
    endUTC: "20261211T190000Z",
    location: "UNIT.Core, UNIT.City, вул. Дорогожицька, 3, Київ",
    details:
      "Дрескод: святкувати життя\n\nЯк дістатися: https://maps.app.goo.gl/BhrDpMX653HEhSPF9\n\nPOSTMEN — https://postmen.ua/",
  };

  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const titleLayer = $("titleLayer");
  const title = $("title");
  const infoLayer = $("infoLayer");
  const introHit = $("introHit");
  const orb = $("orb");
  const cal = $("cal");
  const calBtn = $("calBtn");
  const stage = titleLayer.querySelector(".stage");
  const reveals = [...document.querySelectorAll(".rv")];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMob = () => window.matchMedia("(max-aspect-ratio: 4/5)").matches;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

  // ================== Геометрія з Figma (одиниці макета) ==================
  const LAYOUT = {
    desktop: {
      W: 1440, dot: 45, r: 142, light0: [236, 512],
      // шлях цятки: з-під лівого краю — хвилею вздовж «ЧАС ПРОЩАТИСЯ» і назад у центр
      path: [[122.5, 600.5], [205, 548], [380, 494], [580, 534], [790, 488], [990, 532], [1140, 504], [1020, 470], [820, 500], [648, 512]],
    },
    mobile: {
      W: 390, dot: 17, r: 66.5, light0: [194.5, 363.5],
      // два рядки: знизу — по «ПРОЩАТИСЯ», потім угору до «ЧАС»
      path: [[195, 470], [80, 428], [150, 404], [255, 420], [318, 400], [250, 362], [150, 354], [118, 384], [195, 386]],
    },
  };
  let L, g;
  function geo() {
    L = isMob() ? LAYOUT.mobile : LAYOUT.desktop;
    const rect = stage.getBoundingClientRect();
    const u = rect.width / L.W;
    const vp = ([x, y]) => [rect.left + x * u, rect.top + y * u];
    g = { u, dot: L.dot * u, r: L.r * u, light0: vp(L.light0), path: L.path.map(vp) };
  }
  geo();

  // Плавна крива через точки (Catmull-Rom)
  function pathAt(pts, t) {
    const n = pts.length - 1;
    const f = clamp(t) * n;
    const i = Math.min(n - 1, Math.floor(f));
    const s = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    const c = (a, b, c2, d) =>
      0.5 * (2 * b + (-a + c2) * s + (2 * a - 5 * b + 4 * c2 - d) * s * s + (-a + 3 * b - 3 * c2 + d) * s * s * s);
    return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
  }

  // ================== Стан ==================
  let phase = "intro"; // intro → opening → open
  const T0 = performance.now();
  const TRAVEL_START = 900;   // мс: коли цятка рушає
  const TRAVEL_DUR = 4800;    // мс: прохід уздовж напису й повернення в центр
  const HOLD = 0;             // мс: розкриття — одразу, щойно цятка в центрі
  let holdStart = 0;
  let travel = 0;             // 0..1
  let speed = 1;              // >1 — коли користувач клікнув, щоб пропустити
  let lastNow = T0;

  const dotPos = [...g.path[0]];
  const light = { x: g.light0[0], y: g.light0[1], vx: 0, vy: 0, r: 0 };
  let lightOverride = null;   // під час відкриття
  let orbState = { x: dotPos[0], y: dotPos[1], d: g.dot, o: 0, s: 0.4 };
  let orbFlying = false;

  window.addEventListener("resize", () => {
    geo();
    setupDither();
    if (phase === "open") placeOrbOnButton();
  });

  function drawOrb() {
    const { x, y, d, o, s } = orbState;
    orb.style.width = orb.style.height = d + "px";
    orb.style.opacity = o;
    orb.style.transform = `translate(${x - d / 2}px, ${y - d / 2}px) scale(${s})`;
  }

  // ================== Напівтон (ordered dither) ==================
  // Випадкове «плівкове» зерно замість піксельної сітки: таблиця випадкових порогів 128×128
  const NZ = new Float32Array(128 * 128).map(() => Math.random());
  let ox = 0, oy = 0; // зсув таблиці щокадру — зерно «живе», як на плівці
  const grain = (x, y) => NZ[((y + oy) & 127) * 128 + ((x + ox) & 127)];
  const cvCover = $("ditherCover"), cvAcc = $("ditherAccent");
  const ctxCover = cvCover.getContext("2d"), ctxAcc = cvAcc.getContext("2d");
  let cell, cw, ch, imgCover, imgAcc;
  let prevBox = null;
  function setupDither() {
    cell = 1; // 1 піксель — найдрібніший напівтон
    cw = Math.ceil(window.innerWidth / cell);
    ch = Math.ceil(window.innerHeight / cell);
    for (const cv of [cvCover, cvAcc]) {
      cv.width = cw; cv.height = ch;
      cv.style.width = cw * cell + "px";
      cv.style.height = ch * cell + "px";
    }
    imgCover = ctxCover.createImageData(cw, ch);
    imgAcc = ctxAcc.createImageData(cw, ch);
    prevBox = null;
  }
  setupDither();

  // м'який «хмарний» шум для органічного краю
  // (x, y — у клітинках; переводимо в пікселі, щоб «хмари» не залежали від розміру пікселя)
  const noise = (x, y) => {
    const px = x * cell / 3, py = y * cell / 3;
    return 0.5 + 0.27 * Math.sin(px * 0.11 + py * 0.06 + 1.3) + 0.23 * Math.sin(py * 0.15 - px * 0.045 + 4.1);
  };

  const ACCENT = {
    y: [255, 218, 0, 0.5],   // на білому тексті — жовтий напівтон
    g: [120, 120, 120, 0.45], // на жовтій даті — сірий напівтон
  };

  // Елементи, що зараз проявляються: { el, start, dur, accent }
  const active = [];
  let ditherDirty = false;
  let titleClear = 0; // 0..1: наприкінці заголовок плавно «очищається» від напівтону

  function drawDither(now) {
    const cb = imgCover.data, ab = imgAcc.data;
    // чистимо лише ту ділянку, де малювали минулого кадру
    if (prevBox) {
      for (let y = prevBox[1]; y <= prevBox[3]; y++) {
        const a = (y * cw + prevBox[0]) * 4, z = (y * cw + prevBox[2] + 1) * 4;
        cb.fill(0, a, z); ab.fill(0, a, z);
      }
    }
    let drew = false;
    let box = null;
    ox = (Math.random() * 128) | 0; oy = (Math.random() * 128) | 0;
    const mark = (x0, y0, x1, y1) => {
      if (x1 < x0 || y1 < y0) return;
      if (!box) box = [x0, y0, x1, y1];
      else { box[0] = Math.min(box[0], x0); box[1] = Math.min(box[1], y0); box[2] = Math.max(box[2], x1); box[3] = Math.max(box[3], y1); }
    };

    // 1) Проявлення рядків
    for (let k = active.length - 1; k >= 0; k--) {
      const it = active[k];
      const p = (now - it.start) / it.dur;
      if (p >= 1) { active.splice(k, 1); continue; }
      if (p < 0) continue;
      drew = true;
      const r = it.el.getBoundingClientRect();
      const padY = r.height * 0.14 + 26, padX = 26; // з запасом під блюр
      const x0 = Math.max(0, Math.floor((r.left - padX) / cell)), x1 = Math.min(cw - 1, Math.ceil((r.right + padX) / cell));
      const y0 = Math.max(0, Math.floor((r.top - padY) / cell)), y1 = Math.min(ch - 1, Math.ceil((r.bottom + padY) / cell));
      const span = Math.max(1, x1 - x0);
      mark(x0, y0, x1, y1);
      const [ar, ag, abl, aa] = ACCENT[it.accent] || ACCENT.y;
      const pe = easeInOutSine(p);
      for (let y = y0; y <= y1; y++) {
        const row = y * cw;
        for (let x = x0; x <= x1; x++) {
          const b = grain(x, y);
          const f = pe * 2.25 - 0.45 * ((x - x0) / span) - 0.5 * noise(x, y);
          const i = (row + x) * 4;
          if (f < b) {
            cb[i + 3] = 255; // чорний піксель закриває текст
          } else if (f < b + 0.32) {
            const a = aa * (1 - (f - b) / 0.32);
            ab[i] = ar; ab[i + 1] = ag; ab[i + 2] = abl; ab[i + 3] = a * 255;
          }
        }
      }
    }

    // 2) Світло на заголовку — напівтоном: що далі від центру, то рідші пікселі
    const lr = lightOverride ?? light.r;
    if (phase !== "open") {
      const tr = title.getBoundingClientRect();
      const pad = tr.height * 0.2;
      const x0 = Math.max(0, Math.floor((tr.left - pad) / cell)), x1 = Math.min(cw - 1, Math.ceil((tr.right + pad) / cell));
      const y0 = Math.max(0, Math.floor((tr.top - pad) / cell)), y1 = Math.min(ch - 1, Math.ceil((tr.bottom + pad) / cell));
      const lx = light.x, ly = light.y, inv = lr > 1 ? 1 / lr : 0;
      const clear = titleClear;
      mark(x0, y0, x1, y1);
      for (let y = y0; y <= y1; y++) {
        const row = y * cw, py = (y + 0.5) * cell - ly;
        for (let x = x0; x <= x1; x++) {
          const i = (row + x) * 4;
          if (!inv) { cb[i + 3] = 255; continue; }
          const d = Math.hypot((x + 0.5) * cell - lx, py) * inv;
          if (d >= 1.05 && clear < 0.02) { cb[i + 3] = 255; continue; }
          const s = clamp((d - 0.12) / 0.9);
          // шум лише на краю світла — у центрі літери суцільні
          const I = 1 - s * s * (3 - 2 * s) + (noise(x, y) - 0.5) * 0.22 * Math.min(1, s * 4) + clear * 1.3;
          if (I < grain(x, y)) cb[i + 3] = 255;
        }
      }
      drew = true;
    }

    // 3) Жовтий напівтоновий ореол навколо світла на заголовку (інтро й відкриття)
    if (phase !== "open" && lr > 2) {
      const tr = title.getBoundingClientRect();
      const ring = lr * 1.05, band = Math.max(lr * 0.28, 18);
      const lx = light.x, ly = light.y;
      const x0 = Math.max(0, Math.floor(Math.max(tr.left, lx - ring - band) / cell));
      const x1 = Math.min(cw - 1, Math.ceil(Math.min(tr.right, lx + ring + band) / cell));
      const y0 = Math.max(0, Math.floor(Math.max(tr.top, ly - ring - band) / cell));
      const y1 = Math.min(ch - 1, Math.ceil(Math.min(tr.bottom, ly + ring + band) / cell));
      mark(x0, y0, x1, y1);
      for (let y = y0; y <= y1; y++) {
        const row = y * cw, py = (y + 0.5) * cell - ly;
        for (let x = x0; x <= x1; x++) {
          const px = (x + 0.5) * cell - lx;
          const dist = Math.hypot(px, py);
          const v = 1 - Math.abs(dist - ring * 0.82) / band;
          if (v <= 0) continue;
          const b = grain(x, y);
          if (v * 0.85 > b) {
            const i = (row + x) * 4;
            ab[i] = 255; ab[i + 1] = 218; ab[i + 2] = 0; ab[i + 3] = 0.42 * 255 * v;
            drew = true;
          }
        }
      }
    }

    const u = box && prevBox
      ? [Math.min(box[0], prevBox[0]), Math.min(box[1], prevBox[1]), Math.max(box[2], prevBox[2]), Math.max(box[3], prevBox[3])]
      : box || prevBox;
    if (u) {
      const w = u[2] - u[0] + 1, h = u[3] - u[1] + 1;
      ctxCover.putImageData(imgCover, 0, 0, u[0], u[1], w, h);
      ctxAcc.putImageData(imgAcc, 0, 0, u[0], u[1], w, h);
    }
    prevBox = box;
    ditherDirty = !!box;
  }

  // ================== Фінальний фон ==================
  // "light" — м'яке тепле світло вгорі зліва, повільно пульсує й трохи змінює форму
  // "glow"  — сяйво за кнопкою «Додати в календар», що повільно «дихає»
  const FINALE = new URLSearchParams(location.search).get("finale") || "light";
  body.dataset.finale = FINALE;
  let bgRunning = false;
  function startBg() {
    if (bgRunning) return;
    bgRunning = true;
    body.classList.add("finale-on");
    // світло стоїть угорі зліва й саме пульсує (CSS-анімація)
  }

  // ================== Головний цикл ==================
  function frame(now) {
    const dt = Math.min(50, now - lastNow);
    lastNow = now;
    const t = now - T0;

    if (phase === "intro") {
      // Поява цятки та світла
      const appear = easeOutExpo(clamp((t - 200) / 900));
      orbState.o = appear;
      orbState.s = lerp(0.4, 1, appear);
      orbState.d = g.dot;

      // Рух уздовж напису
      if (t > TRAVEL_START) travel = clamp(travel + (dt / TRAVEL_DUR) * speed);
      const tp = easeInOutSine(travel);
      const [px, py] = pathAt(g.path, tp);
      // легке «дихання» — щоб рух був живим
      const wob = Math.sin(t / 420) * g.dot * 0.12 * (1 - Math.abs(tp - 0.5) * 2);
      dotPos[0] = px; dotPos[1] = py + wob;
      orbState.x = dotPos[0]; orbState.y = dotPos[1];

      // Світло йде за цяткою на «пружині»
      const k = 0.0009 * dt * (speed > 1 ? 2.5 : 1), damp = Math.pow(0.86, dt / 16);
      light.vx = (light.vx + (dotPos[0] - light.x) * k) * damp;
      light.vy = (light.vy + (dotPos[1] - light.y) * k) * damp;
      light.x += light.vx * dt / 16;
      light.y += light.vy * dt / 16;
      const lAppear = easeOutExpo(clamp((t - 350) / 1100));
      light.r = g.r * lAppear * (1 + 0.04 * Math.sin(t / 600));

      if (travel >= 1) {
        if (!holdStart) holdStart = now;
        if (now - holdStart >= HOLD / speed) open();
      }
    }

    if (!orbFlying && phase !== "open") drawOrb();

    titleLayer.style.setProperty("--mx", light.x + "px");
    titleLayer.style.setProperty("--my", light.y + "px");
    titleLayer.style.setProperty("--r", (lightOverride ?? light.r) + "px");


    if (phase !== "open") requestAnimationFrame(frame);
    else running = false;
  }
  let running = true;
  const kick = () => { if (!running) { running = true; lastNow = performance.now(); requestAnimationFrame(frame); } };
  requestAnimationFrame(frame);

  // ================== Відкриття ==================
  function tween(duration, fn, ease = easeInOut) {
    return new Promise((resolve) => {
      const s = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - s) / duration);
        fn(ease(p), p);
        p < 1 ? requestAnimationFrame(step) : resolve();
      };
      requestAnimationFrame(step);
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Заголовок плавно піднімається з центру на своє місце з макета
  function flipTitle(duration) {
    const before = title.getBoundingClientRect();
    body.classList.remove("is-intro");
    const after = title.getBoundingClientRect();
    if (!duration) return Promise.resolve();
    return title.animate(
      [
        { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` },
        { transform: "translate(0px, 0px)" },
      ],
      { duration, easing: "cubic-bezier(.7, 0, .16, 1)", fill: "backwards" }
    ).finished;
  }

  function buttonCircle() {
    const r = calBtn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, d: r.width };
  }
  function placeOrbOnButton() {
    const b = buttonCircle();
    orbState = { x: b.x, y: b.y, d: b.d, o: 0, s: 1 };
    drawOrb();
  }

  // Цятка дугою летить у кнопку і виростає до її розміру
  function flyOrb(duration) {
    orbFlying = true;
    const from = { ...orbState };
    const to = buttonCircle();
    const side = L.W * 0.08 * g.u;
    const cx = Math.max(from.x, to.x) + side;
    const cy = lerp(from.y, to.y, 0.35);
    return tween(duration, (e) => {
      const it = 1 - e;
      orbState.x = it * it * from.x + 2 * it * e * cx + e * e * to.x;
      orbState.y = it * it * from.y + 2 * it * e * cy + e * e * to.y;
      orbState.d = lerp(from.d, to.d, easeInOut(clamp(e * 1.15)));
      orbState.s = 1; orbState.o = 1;
      drawOrb();
    }, (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2)).then(() => {
      cal.classList.add("shown");
      orb.style.opacity = 0;
      orbFlying = false;
    });
  }

  function enableInfo() {
    body.classList.add("is-open");
    infoLayer.setAttribute("aria-hidden", "false");
    infoLayer.querySelectorAll("a, button").forEach((el) => el.removeAttribute("tabindex"));
  }

  // Порядок і затримки проявлення (мс від старту)
  const ORDER_DESKTOP = [0, 320, 520, 860, 1060, 1380, 1540]; // лого, 11/12, 2026, 18:30, UNIT.Core, дрескод ×2 — по черзі
  function revealInfo() {
    const now = performance.now();
    const delays = ORDER_DESKTOP;
    reveals.forEach((el, i) => {
      const start = now + (delays[i] ?? i * 140);
      setTimeout(() => el.classList.add("in"), start - now);
    });
    kick();
  }

  async function open() {
    if (phase !== "intro") return;
    phase = "opening";
    title.style.filter = "blur(0)";

    // 1) Світло розливається по всьому заголовку — напівтоновий ореол проходить по літерах
    const fromR = light.r;
    const maxR = Math.hypot(window.innerWidth, window.innerHeight) * 1.1;
    const fx = light.x, fy = light.y;
    const tr = title.getBoundingClientRect();
    const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    const lightAnim = tween(1600, (e, p) => {
      lightOverride = lerp(fromR, maxR, e);
      titleClear = clamp((p - 0.25) / 0.75);
      light.x = lerp(fx, tx, e);
      light.y = lerp(fy, ty, e);
    }, (p) => p * p * (3 - 2 * p));

    // 2) Заголовок піднімається
    await wait(250);
    const move = flipTitle(1900);

    // 3) Цятка летить і стає кнопкою «Додати в календар»
    await wait(300);
    const fly = flyOrb(1700);

    // 4) Решта інформації проявляється напівтоном
    await wait(350);
    enableInfo();
    revealInfo();

    await Promise.all([lightAnim, move, fly]);
    setTimeout(startBg, 300);
    phase = "open";
    lightOverride = null;
    titleLayer.classList.add("unmasked");
    ditherDirty = true;
    kick();
  }

  function skip() {
    if (phase === "intro") speed = 7;
  }
  introHit.addEventListener("click", skip);
  window.addEventListener("keydown", (e) => {
    if (phase === "intro" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); skip(); }
  });

  // Одразу фінальний стан: ?final (для перевірки та шерінг-картинки) або «менше руху» в системі
  function showFinal() {
    body.classList.add("no-anim");
    phase = "open";
    travel = 1;
    titleLayer.classList.add("unmasked");
    title.style.filter = "none";
    body.classList.remove("is-intro");
    reveals.forEach((el) => el.classList.add("in"));
    cal.classList.add("shown");
    orb.style.opacity = 0;
    enableInfo();
    if (!new URLSearchParams(location.search).has("nobg")) startBg();
  }
  if (new URLSearchParams(location.search).has("final") || reduceMotion) showFinal();

  // ================== Календар ==================
  const gcal = new URL("https://calendar.google.com/calendar/render");
  gcal.searchParams.set("action", "TEMPLATE");
  gcal.searchParams.set("text", EVENT.title);
  gcal.searchParams.set("dates", `${EVENT.startUTC}/${EVENT.endUTC}`);
  gcal.searchParams.set("ctz", "Europe/Kyiv");
  gcal.searchParams.set("location", EVENT.location);
  gcal.searchParams.set("details", EVENT.details);
  $("gcal").href = gcal.toString();

  const calMenu = $("calMenu");
  const setMenu = (open) => {
    calMenu.hidden = !open;
    calBtn.setAttribute("aria-expanded", String(open));
    if (open) calMenu.querySelector("a").focus({ preventScroll: true });
  };
  calBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setMenu(calMenu.hidden);
  });
  calMenu.addEventListener("click", () => setTimeout(() => setMenu(false), 150));
  document.addEventListener("click", (e) => {
    if (!calMenu.hidden && !cal.contains(e.target)) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !calMenu.hidden) { setMenu(false); calBtn.focus(); }
  });

  // «Магнітна» кнопка на десктопі
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduceMotion) {
    window.addEventListener("pointermove", (e) => {
      if (!cal.classList.contains("shown")) return;
      const r = calBtn.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const near = Math.hypot(dx, dy) < r.width * 0.95;
      calBtn.style.transform = near ? `translate(${dx * 0.16}px, ${dy * 0.16}px)` : "";
    }, { passive: true });
  }
})();
