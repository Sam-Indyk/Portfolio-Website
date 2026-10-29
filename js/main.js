(() => {
  document.getElementById("yr").textContent = new Date().getFullYear();

  // ?at=<section-id> jumps straight to a section (deep links and screenshots).
  const at = new URLSearchParams(location.search).get("at");
  if (at && document.getElementById(at)) {
    document.documentElement.style.scrollBehavior = "auto";
    document.getElementById(at).scrollIntoView();
  }

  // ---------- reveal on scroll ----------
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((n) => io.observe(n));

  // ---------- demo modal ----------
  const modal = document.getElementById("demo-modal");
  const frame = document.getElementById("modal-frame");
  const title = document.getElementById("modal-title");
  const newtab = document.getElementById("modal-newtab");

  function openDemo(src, name) {
    if (!modal.showModal || window.innerWidth < 640) { window.open(src, "_blank", "noopener"); return; }
    frame.src = src;
    title.textContent = name;
    newtab.href = src;
    modal.showModal();
  }
  function closeDemo() { modal.close(); }
  modal.addEventListener("close", () => { frame.src = "about:blank"; });
  modal.addEventListener("click", (e) => { if (e.target === modal) closeDemo(); });
  document.getElementById("modal-close").addEventListener("click", closeDemo);

  document.querySelectorAll("[data-demo]").forEach((card) => {
    const go = () => openDemo(card.dataset.demo, card.dataset.title);
    card.querySelectorAll(".launch").forEach((b) => b.addEventListener("click", go));
    card.querySelector(".lab-preview")?.addEventListener("click", go);
    card.querySelector(".lab-preview")?.style.setProperty("cursor", "pointer");
  });

  // ---------- EigenGalaxy preview tiles ----------
  const prev = document.getElementById("eg-preview");
  if (prev && window.GalaxyGen) {
    // Real held-out Galaxy Zoo 2 galaxies from the exported basis; procedural if unavailable.
    const real = Promise.all([
      fetch("demos/eigengalaxy/data/eigengalaxies.json").then((r) => r.json()),
      fetch("demos/eigengalaxy/data/eigengalaxies.bin").then((r) => r.arrayBuffer()),
    ]).then(([meta, buf]) => {
      const n = meta.image_size[0], d = n * n, t = meta.layout.test;
      const px = new Uint8Array(buf, t.offset, t.count);
      let j = 0;
      return { N: n, next: () => Float32Array.from(px.subarray((j % meta.n_test) * d, (j++ % meta.n_test) * d + d), (v) => v / 255) };
    }).catch(() => {
      const rng = GalaxyGen.rng(7);
      return { N: 48, next: () => GalaxyGen.make(48, rng) };
    });
    real.then(({ N, next }) => {
      const tiles = Array.from({ length: 8 }, () => {
        const c = document.createElement("canvas");
        GalaxyGen.paint(c, next(), N);
        prev.appendChild(c);
        return c;
      });
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        let i = 0;
        setInterval(() => {
          const c = tiles[i++ % tiles.length];
          c.animate([{ opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }], { duration: 900 });
          setTimeout(() => GalaxyGen.paint(c, next(), N), 450);
        }, 1400);
      }
    });
  }

  // ---------- photo galleries (js/photos.js) ----------
  const photos = window.PHOTOS || {};
  document.querySelectorAll("[data-gallery]").forEach((grid) => {
    const list = photos[grid.dataset.gallery] || [];
    if (!list.length) return;
    for (const p of list) {
      const fig = document.createElement("figure");
      const img = document.createElement("img");
      img.src = p.src; img.alt = p.alt || ""; img.loading = "lazy"; img.decoding = "async";
      fig.appendChild(img);
      if (p.caption) {
        const cap = document.createElement("figcaption");
        cap.textContent = p.caption;
        fig.appendChild(cap);
      }
      grid.appendChild(fig);
    }
    grid.hidden = false;
  });
})();
