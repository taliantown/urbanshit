/**
 * Tela reativa de uma obra. URL: index.html?n=1..5
 *
 * Fluxo:
 *   1. Lê ?n=, carrega config.json
 *   2. Carrega o SVG inline (fetch + innerHTML) pra poder manipular
 *   3. Botão "tocar" libera o AudioContext (browsers exigem interação)
 *   4. Loop: analisa banda de frequência da obra → aplica efeitos
 *
 * Efeitos (configuráveis por obra):
 *   - vibracao:     vértices oscilam em senos, amplitude com energia
 *   - stroke_pulso: stroke-width modulada por energia
 *   - glow:         filter SVG (feGaussianBlur) modulada por energia
 *   - cor_migra:    hue rotaciona com o tempo
 *   - onset_glitch: pulso visual em picos (translate súbito)
 */

(async function () {
  const params = new URLSearchParams(location.search);
  const n = params.get("n") || "1";

  const config = await fetch("config.json").then((r) => r.json());
  const obra = config.obras[n];
  if (!obra) {
    document.body.innerHTML =
      '<p style="color:#fff;padding:2em;font-family:sans-serif">' +
      "Obra inexistente: ?n=" + n + "</p>";
    return;
  }

  document.getElementById("play-sub").textContent =
    `obra ${n} · ${obra.titulo}`;
  document.title = `Paisagens · obra ${n} — ${obra.titulo}`;

  // ---------- SVG ----------
  const wrap = document.getElementById("svg-wrap");
  const svgText = await fetch(obra.svg).then((r) => r.text());
  wrap.innerHTML = svgText;
  const svgEl = wrap.querySelector("svg");
  if (!svgEl) {
    console.error("SVG inválido em", obra.svg);
    return;
  }

  // Remover width/height fixos (mm) pra responsividade — viewBox cuida do resto.
  svgEl.removeAttribute("width");
  svgEl.removeAttribute("height");
  svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svgEl.style.width = "100%";
  svgEl.style.height = "100%";

  // Injeta filtro de glow (controlamos stdDeviation no loop)
  injectFilters(svgEl);

  // Pré-extrai vértices originais (precisamos perturbar a partir deles)
  const elements = collectElements(svgEl);

  // ---------- Áudio ----------
  const audioEl = document.getElementById("audio");
  audioEl.src = obra.audio;
  audioEl.crossOrigin = "anonymous";

  const playBtn = document.getElementById("play-btn");
  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let started = false;
  const tStart = performance.now();

  playBtn.addEventListener("click", async () => {
    if (started) return;
    started = true;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaElementSource(audioEl);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      await audioEl.play();
    } catch (e) {
      console.error("falha ao iniciar áudio:", e);
    }
    playBtn.classList.add("hidden");
    requestAnimationFrame(loop);
  });

  // ---------- Loop ----------
  let energySmooth = 0;
  let energyMax = 0.001;
  let onsetEnvelope = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    if (!analyser) return;
    analyser.getByteFrequencyData(freqData);

    const sr = audioCtx.sampleRate;
    const binCount = analyser.frequencyBinCount;
    const [loHz, hiHz] = obra.banda_hz;
    const loBin = Math.max(0, Math.floor((loHz / (sr / 2)) * binCount));
    const hiBin = Math.min(
      binCount - 1,
      Math.ceil((hiHz / (sr / 2)) * binCount),
    );
    let sum = 0;
    for (let i = loBin; i <= hiBin; i++) sum += freqData[i];
    const energy = sum / ((hiBin - loBin + 1) * 255); // 0..1

    // suaviza + normaliza por máximo móvel (auto-gain)
    energySmooth = energySmooth * 0.85 + energy * 0.15;
    energyMax = Math.max(energyMax * 0.9995, energy);
    const norm = Math.min(1, energy / Math.max(0.05, energyMax * 0.9));

    // onset detection (pico contra suavização)
    const isOnset = energy > energySmooth * 1.8 && energy > 0.12;
    if (isOnset) onsetEnvelope = 1.0;
    onsetEnvelope = Math.max(0, onsetEnvelope - 0.05);

    const t = (now - tStart) / 1000;
    applyEffects(svgEl, elements, obra.efeitos || {}, t, norm, onsetEnvelope);
  }
})();

// ============================================================
// Helpers
// ============================================================

function hash01(i) {
  let x = (i * 2654435761) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function parsePoints(str) {
  if (!str) return [];
  const nums = str.trim().split(/[\s,]+/).map(Number).filter((v) => !isNaN(v));
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function parsePathD(d) {
  // Suporta só "M x y L x y L x y..." (o que o vsketch produz a partir de polilinhas).
  if (!d) return [];
  const tokens = d.trim().split(/[\s,]+/);
  const pts = [];
  let i = 0;
  while (i < tokens.length) {
    const tk = tokens[i];
    if (tk === "M" || tk === "L" || tk === "m" || tk === "l") {
      const x = parseFloat(tokens[i + 1]);
      const y = parseFloat(tokens[i + 2]);
      if (!isNaN(x) && !isNaN(y)) pts.push([x, y]);
      i += 3;
    } else {
      // pula valores soltos (ex: caso "M x y L x y x y" — repetição implícita)
      const x = parseFloat(tk);
      const y = parseFloat(tokens[i + 1]);
      if (!isNaN(x) && !isNaN(y)) {
        pts.push([x, y]);
        i += 2;
      } else {
        i += 1;
      }
    }
  }
  return pts;
}

function collectElements(svgEl) {
  const out = [];
  let idx = 0;

  for (const el of svgEl.querySelectorAll("line")) {
    out.push({
      el,
      type: "line",
      orig: {
        x1: parseFloat(el.getAttribute("x1")),
        y1: parseFloat(el.getAttribute("y1")),
        x2: parseFloat(el.getAttribute("x2")),
        y2: parseFloat(el.getAttribute("y2")),
      },
      hash: hash01(idx++),
    });
  }
  for (const el of svgEl.querySelectorAll("polyline")) {
    const pts = parsePoints(el.getAttribute("points"));
    out.push({
      el,
      type: "polyline",
      orig: pts,
      hashes: pts.map((_, i) => hash01(idx++ * 17 + i)),
    });
  }
  for (const el of svgEl.querySelectorAll("path")) {
    const pts = parsePathD(el.getAttribute("d"));
    if (pts.length < 2) continue;
    out.push({
      el,
      type: "path",
      orig: pts,
      hashes: pts.map((_, i) => hash01(idx++ * 23 + i)),
    });
  }
  return out;
}

function injectFilters(svgEl) {
  const NS = "http://www.w3.org/2000/svg";
  let defs = svgEl.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS(NS, "defs");
    svgEl.insertBefore(defs, svgEl.firstChild);
  }
  defs.insertAdjacentHTML(
    "beforeend",
    `<filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="0" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>`,
  );
}

function applyEffects(svgEl, elements, efx, t, norm, onset) {
  // ---- vibração ----
  const vibAmp = (efx.vibracao || 0) * norm * 5; // até 5mm de desvio
  const vibFreq = 1.6;
  if (vibAmp > 0.01) {
    for (const el of elements) {
      if (el.type === "line") {
        const h = el.hash;
        const o = el.orig;
        const dx1 = Math.sin(t * vibFreq + h * 6.283) * vibAmp * 0.5;
        const dy1 = Math.cos(t * vibFreq + h * 6.283 * 1.3) * vibAmp * 0.5;
        const dx2 = Math.sin(t * vibFreq + h * 6.283 + 1.7) * vibAmp * 0.5;
        const dy2 = Math.cos(t * vibFreq + h * 6.283 * 1.3 + 1.7) * vibAmp * 0.5;
        el.el.setAttribute("x1", (o.x1 + dx1).toFixed(3));
        el.el.setAttribute("y1", (o.y1 + dy1).toFixed(3));
        el.el.setAttribute("x2", (o.x2 + dx2).toFixed(3));
        el.el.setAttribute("y2", (o.y2 + dy2).toFixed(3));
      } else if (el.type === "polyline") {
        const parts = new Array(el.orig.length);
        for (let i = 0; i < el.orig.length; i++) {
          const [x, y] = el.orig[i];
          const h = el.hashes[i];
          const dx = Math.sin(t * vibFreq + h * 6.283) * vibAmp;
          const dy = Math.cos(t * vibFreq + h * 6.283 * 1.3) * vibAmp;
          parts[i] = `${(x + dx).toFixed(3)},${(y + dy).toFixed(3)}`;
        }
        el.el.setAttribute("points", parts.join(" "));
      } else if (el.type === "path") {
        const cmds = new Array(el.orig.length);
        for (let i = 0; i < el.orig.length; i++) {
          const [x, y] = el.orig[i];
          const h = el.hashes[i];
          const dx = Math.sin(t * vibFreq + h * 6.283) * vibAmp;
          const dy = Math.cos(t * vibFreq + h * 6.283 * 1.3) * vibAmp;
          cmds[i] =
            (i === 0 ? "M " : "L ") +
            (x + dx).toFixed(3) + " " + (y + dy).toFixed(3);
        }
        el.el.setAttribute("d", cmds.join(" "));
      }
    }
  } else {
    // sem vibração — restaura pontos originais uma vez (na primeira chamada)
    // (não precisamos resetar a cada frame; só se passar de >0 pra 0)
  }

  // ---- stroke pulso ----
  if (efx.stroke_pulso) {
    const sw = 0.25 + efx.stroke_pulso * (0.3 + norm * 1.6);
    svgEl.style.setProperty("--sw", sw);
    // aplicamos via atributo (override do CSS !important via setAttribute funciona)
    for (const el of elements) {
      el.el.setAttribute("stroke-width", sw.toFixed(3));
    }
  }

  // ---- glow ----
  if (efx.glow) {
    const std = efx.glow * (0.2 + norm * 2.8);
    const blurEl = svgEl.querySelector("#glow feGaussianBlur");
    if (blurEl) blurEl.setAttribute("stdDeviation", std.toFixed(2));
    if (!svgEl.hasAttribute("filter")) {
      svgEl.setAttribute("filter", "url(#glow)");
    }
  }

  // ---- cor migra (hue rotaciona com o tempo) ----
  if (efx.cor_migra) {
    const hue = (t * 18 * efx.cor_migra) % 360;
    const color = `hsl(${hue.toFixed(0)}, 65%, 75%)`;
    for (const el of elements) {
      el.el.style.setProperty("stroke", color, "important");
    }
  }

  // ---- onset glitch ----
  if (efx.onset_glitch && onset > 0.05) {
    const off = efx.onset_glitch * onset * 6; // px
    svgEl.style.transform = `translate(${off.toFixed(2)}px, ${(off * 0.3).toFixed(2)}px)`;
  } else if (svgEl.style.transform) {
    svgEl.style.transform = "";
  }
}
