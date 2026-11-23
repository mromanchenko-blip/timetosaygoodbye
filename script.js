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
  const hintLayer = $("hintLayer");
  const infoLayer = $("infoLayer");
  const introHit = $("introHit");
  const stage = titleLayer.querySelector(".stage");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobileLayout = () => window.matchMedia("(max-aspect-ratio: 4/5)").matches;

  // ================== Геометрія макета ==================
  // Координати з Figma (в одиницях макета)
  const LAYOUT = {
    desktop: { W: 1440, spot: [236, 512], r: 129, titleC: [648, 512], titleHalf: [548, 66] },
    mobile: { W: 390, spot: [194.5, 363.5], r: 66.5, titleC: [195, 386], titleHalf: [162, 53] },
  };
  function geo() {
    const L = isMobileLayout() ? LAYOUT.mobile : LAYOUT.desktop;
    const rect = stage.getBoundingClientRect();
    const u = rect.width / L.W;
    const toVp = ([x, y]) => [rect.left + x * u, rect.top + y * u];
    return {
      u,
      spot: toVp(L.spot),
      r: L.r * u,
      titleC: toVp(L.titleC),
      titleHalf: [L.titleHalf[0] * u, L.titleHalf[1] * u],
    };
  }

  // ================== «Ліхтарик» ==================
  let phase = "intro"; // intro → opening → open
  let g = geo();
  let cur = { x: g.spot[0], y: g.spot[1] };
  let target = { x: cur.x, y: cur.y };
  let radius = g.r;
  let radiusOverride = null; // під час відкриття
  let lastPointer = -Infinity;
  const IDLE_MS = 2500;
  const t0 = performance.now();

  window.addEventListener("resize", () => { g = geo(); });

  function onPointer(e) {
    if (phase !== "intro") return;
    target.x = e.clientX;
    target.y = e.clientY;
    lastPointer = performance.now();
  }
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointerdown", onPointer, { passive: true });

  function frame(now) {
    if (phase === "open") return;

    if (phase === "intro") {
      if (now - lastPointer > IDLE_MS) {
        // Повільне блукання над заголовком, поки ніхто не водить курсором
        const t = (now - t0) / 1000;
        const [cx, cy] = g.titleC;
        const [hx, hy] = g.titleHalf;
        target.x = cx + hx * 0.7 * Math.sin(t * 0.45);
        target.y = cy + hy * 0.55 * Math.sin(t * 0.8 + 2.2);
      }
      const k = reduceMotion ? 1 : 0.09;
      cur.x += (target.x - cur.x) * k;
      cur.y += (target.y - cur.y) * k;
      radius = g.r;
    }

    titleLayer.style.setProperty("--mx", cur.x + "px");
    titleLayer.style.setProperty("--my", cur.y + "px");
    titleLayer.style.setProperty("--r", (radiusOverride ?? radius) + "px");
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ================== Відкриття ==================
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function animate(duration, fn) {
    return new Promise((resolve) => {
      const s = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - s) / duration);
        fn(ease(p));
        p < 1 ? requestAnimationFrame(step) : resolve();
      };
      requestAnimationFrame(step);
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // FLIP: заголовок плавно піднімається з центру на своє місце з макета
  function flipTitle(duration) {
    const before = title.getBoundingClientRect();
    body.classList.remove("is-intro");
    const after = title.getBoundingClientRect();
    if (reduceMotion || !duration) return Promise.resolve();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    return title.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
      { duration, easing: "cubic-bezier(.45, 0, .15, 1)", fill: "backwards" }
    ).finished;
  }

  function enableInfo() {
    body.classList.add("is-open");
    infoLayer.setAttribute("aria-hidden", "false");
    infoLayer.querySelectorAll("a, button").forEach((el) => el.removeAttribute("tabindex"));
  }

  async function open() {
    if (phase !== "intro") return;
    phase = "opening";
    hintLayer.classList.add("gone");
    hintLayer.setAttribute("aria-hidden", "true");
    title.style.filter = "blur(0)";

    if (reduceMotion) {
      phase = "open";
      titleLayer.classList.add("unmasked");
      flipTitle(0);
      enableInfo();
      $("calBtn").focus({ preventScroll: true });
      return;
    }

    // 1) Світло розливається на весь екран
    const fromR = radiusOverride ?? radius;
    const maxR = Math.hypot(window.innerWidth, window.innerHeight) * 1.15;
    const fromX = cur.x, fromY = cur.y;
    const [toX, toY] = g.titleC;
    const light = animate(1100, (p) => {
      radiusOverride = fromR + (maxR - fromR) * p;
      cur.x = fromX + (toX - fromX) * p;
      cur.y = fromY + (toY - fromY) * p;
    });

    // 2) Заголовок плавно переїжджає на своє місце
    await wait(500);
    const move = flipTitle(1700);

    // 3) Решта інфи — з прозорості й блюру, коли заголовок майже на місці
    await wait(1150);
    enableInfo();

    await Promise.all([light, move]);
    phase = "open";
    titleLayer.classList.add("unmasked");
  }

  introHit.addEventListener("click", open);

  // ?final — одразу фінальний стан (для перевірки та шерінг-картинки)
  if (new URLSearchParams(location.search).has("final")) {
    body.classList.add("no-anim");
    phase = "open";
    titleLayer.classList.add("unmasked");
    hintLayer.classList.add("gone");
    title.style.filter = "none";
    body.classList.remove("is-intro");
    enableInfo();
  }

  // ================== Календар ==================
  const gcal = new URL("https://calendar.google.com/calendar/render");
  gcal.searchParams.set("action", "TEMPLATE");
  gcal.searchParams.set("text", EVENT.title);
  gcal.searchParams.set("dates", `${EVENT.startUTC}/${EVENT.endUTC}`);
  gcal.searchParams.set("ctz", "Europe/Kyiv");
  gcal.searchParams.set("location", EVENT.location);
  gcal.searchParams.set("details", EVENT.details);
  $("gcal").href = gcal.toString();

  const calBtn = $("calBtn");
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
    if (!calMenu.hidden && !$("cal").contains(e.target)) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !calMenu.hidden) { setMenu(false); calBtn.focus(); }
  });

  // «Магнітна» кнопка на десктопі
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduceMotion) {
    window.addEventListener("pointermove", (e) => {
      if (phase !== "open" && !body.classList.contains("is-open")) return;
      const r = calBtn.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const near = Math.hypot(dx, dy) < r.width * 0.95;
      calBtn.style.transform = near ? `translate(${dx * 0.18}px, ${dy * 0.18}px)` : "";
    }, { passive: true });
  }
})();
