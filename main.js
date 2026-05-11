// Tiny enhancements only — type, year, greeting, and a single
// IntersectionObserver. No frameworks, no canvas, no rabbit holes.

(() => {
  // —— year stamp ——
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // —— time-of-day greeting ——
  const greet = document.getElementById("hero-greeting");
  if (greet) {
    const h = new Date().getHours();
    const phrase =
      h < 5  ? "still up,"
    : h < 12 ? "good morning,"
    : h < 17 ? "good afternoon,"
    : h < 22 ? "good evening,"
    :          "late again,";
    greet.textContent = phrase;
  }

  // —— reveal on scroll ——
  const targets = document.querySelectorAll(".reveal");
  if (targets.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );

    targets.forEach((el, i) => {
      el.style.setProperty("--reveal-delay", `${Math.min(i * 60, 240)}ms`);
      io.observe(el);
    });
  } else {
    targets.forEach((el) => el.classList.add("is-in"));
  }

  // —— index row: support data-href fallback for projects without a real link ——
  document.querySelectorAll(".index-row[data-href]").forEach((row) => {
    row.addEventListener("click", (e) => {
      const href = row.getAttribute("data-href");
      if (!href) return;
      e.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
    });
  });
})();
