import * as THREE from "three";

const app = {
  projects: [],
  archiveNotes: [],
  profile: null,
  activeSlug: "anchormesh",
  graphMode: "orbit",
  scene: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  bootLine: $("#boot-line"),
  statProjects: $("#stat-projects"),
  searchForm: $("#search-form"),
  query: $("#portfolio-query"),
  guideAnswer: $("#guide-answer"),
  rankedResults: $("#ranked-results"),
  projectList: $("#project-list"),
  caseStudy: $("#case-study"),
  previewWall: $("#preview-wall"),
  terminalForm: $("#terminal-form"),
  terminalInput: $("#terminal-input"),
  terminalOutput: $("#terminal-output"),
  statusList: $("#status-list"),
  refreshStatus: $("#refresh-status"),
  heroGrade: $("#hero-grade"),
  archiveLane: $("#archive-lane"),
  graphTitle: $("#graph-node-title"),
  graphCopy: $("#graph-node-copy"),
  graphOpenCase: $("#graph-open-case"),
  graphOverlay: $("#constellation-overlay"),
  canvas: $("#constellation-canvas"),
  shufflePreviews: $("#shuffle-previews"),
};

const orbitLabelOffsets = {
  qagent: [76, -18],
  masterbuild: [-78, 18],
  fairvalue: [-170, 20],
  flowpr: [48, 16],
};

init();

async function init() {
  document.documentElement.classList.add("js-enabled");
  typeBootLine();
  await loadData();
  wireEvents();
  renderEverything();
  await runGuide(els.query.value);
  runTerminal("proof");
  refreshStatus();
  initConstellation();
}

async function loadData() {
  const [projectsResponse, graphResponse] = await Promise.all([
    fetch("/api/projects"),
    fetch("/api/graph"),
  ]);
  const payload = await projectsResponse.json();
  app.projects = payload.projects;
  app.archiveNotes = payload.archiveNotes;
  app.profile = payload.profile;
  app.graph = await graphResponse.json();
  els.statProjects.textContent = app.projects.length;
}

function wireEvents() {
  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runGuide(els.query.value);
  });

  $$(".query-presets button").forEach((button) => {
    button.addEventListener("click", () => {
      els.query.value = button.dataset.query;
      runGuide(button.dataset.query);
    });
  });

  els.projectList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project]");
    if (!button) return;
    openCase(button.dataset.project);
  });

  els.previewWall.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preview-case]");
    if (!button) return;
    document.querySelector("#cases").scrollIntoView({ behavior: "smooth", block: "start" });
    openCase(button.dataset.previewCase);
  });

  els.terminalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const command = els.terminalInput.value.trim();
    if (!command) return;
    runTerminal(command);
    els.terminalInput.value = "";
  });

  els.refreshStatus.addEventListener("click", refreshStatus);

  els.graphOpenCase.addEventListener("click", () => {
    document.querySelector("#cases").scrollIntoView({ behavior: "smooth", block: "start" });
    openCase(app.activeSlug);
  });

  $("[aria-label='Graph modes']").addEventListener("click", (event) => {
    const button = event.target.closest("[data-graph-mode]");
    if (!button) return;
    app.graphMode = button.dataset.graphMode;
    $$("[data-graph-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
    updateConstellationLabels();
  });

  els.shufflePreviews.addEventListener("click", () => {
    app.projects.sort(() => Math.random() - 0.5);
    renderPreviewWall();
  });

  window.addEventListener("resize", () => {
    resizeConstellation();
    updateConstellationLabels();
  });
}

function renderEverything() {
  renderProjectList();
  renderPreviewWall();
  renderCuration();
  openCase(app.activeSlug);
}

function renderProjectList() {
  els.projectList.innerHTML = app.projects
    .map((project) => {
      const selected = project.slug === app.activeSlug ? "is-selected" : "";
      return `
        <button class="project-row ${selected}" type="button" data-project="${project.slug}">
          <span class="project-dot" style="--dot-a:${project.gradient[0]};--dot-b:${project.gradient[1]}"></span>
          <span>
            <strong>${escapeHtml(project.title)}</strong>
            <small>${escapeHtml(project.kind)} · ${escapeHtml(project.tier)}</small>
          </span>
          <em>${project.score}</em>
        </button>
      `;
    })
    .join("");
}

function renderPreviewWall() {
  const visible = app.projects.slice(0, 10);
  els.previewWall.innerHTML = visible
    .map(
      (project) => `
      <article class="preview-card">
        <div class="browser-chrome">
          <span></span><span></span><span></span>
          <strong>${escapeHtml(project.slug)}</strong>
        </div>
        <img src="/api/og/${project.slug}.svg" alt="${escapeHtml(project.title)} generated preview" loading="lazy" />
        <div class="preview-body">
          <div>
            <h3>${escapeHtml(project.title)}</h3>
            <p>${escapeHtml(project.summary)}</p>
          </div>
          <div class="preview-actions">
            <button type="button" data-preview-case="${project.slug}">Case</button>
            ${
              project.repoUrl
                ? `<a href="${project.repoUrl}" target="_blank" rel="noreferrer">Repo</a>`
                : project.liveUrl
                  ? `<a href="${project.liveUrl}" target="_blank" rel="noreferrer">Live</a>`
                  : `<span>Private</span>`
            }
          </div>
        </div>
      </article>
    `,
    )
    .join("");
}

function renderCuration() {
  els.heroGrade.innerHTML = app.projects
    .filter((project) => project.tier === "Hero")
    .map((project) => `<li><strong>${escapeHtml(project.title)}</strong><span>${escapeHtml(project.outcome)}</span></li>`)
    .join("");

  els.archiveLane.innerHTML = app.archiveNotes
    .map((note) => `<li><strong>${escapeHtml(note.name)}</strong><span>${escapeHtml(note.reason)}</span></li>`)
    .join("");
}

async function openCase(slug) {
  app.activeSlug = slug;
  renderProjectList();
  const response = await fetch(`/api/case-study/${slug}`);
  const project = await response.json();
  els.caseStudy.innerHTML = `
    <div class="case-hero" style="--case-a:${project.gradient[0]};--case-b:${project.gradient[1]}">
      <div>
        <span>${escapeHtml(project.tier)} / ${escapeHtml(project.visibility)}</span>
        <h3>${escapeHtml(project.title)}</h3>
        <p>${escapeHtml(project.summary)}</p>
      </div>
      <strong>${project.score}</strong>
    </div>
    <div class="case-meta">
      <span>${escapeHtml(project.timeline)}</span>
      <span>${escapeHtml(project.outcome)}</span>
    </div>
    <div class="case-sections">
      ${project.sections
        .map(
          (section) => `
        <section>
          <h4>${escapeHtml(section.title)}</h4>
          <p>${escapeHtml(section.body)}</p>
        </section>
      `,
        )
        .join("")}
    </div>
    <div class="stack-strip">
      ${project.stack.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
    </div>
    <div class="proof-list">
      ${project.proof.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
    </div>
  `;
  setGraphReadout(project.slug);
}

async function runGuide(query) {
  const response = await fetch(`/api/guide?q=${encodeURIComponent(query)}`);
  const payload = await response.json();
  els.guideAnswer.innerHTML = `
    <span class="muted-label">retrieval guide</span>
    <p>${escapeHtml(payload.answer)}</p>
  `;
  els.rankedResults.innerHTML = payload.results
    .map(
      (project, index) => `
      <button type="button" class="result-pill" data-project="${project.slug}">
        <span>${index + 1}</span>
        <strong>${escapeHtml(project.title)}</strong>
        <small>${escapeHtml(project.explanation || project.kind)}</small>
      </button>
    `,
    )
    .join("");

  $$("#ranked-results [data-project]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("#cases").scrollIntoView({ behavior: "smooth", block: "start" });
      openCase(button.dataset.project);
    });
  });
}

async function runTerminal(command) {
  appendTerminal(`rb@dev % ${command}`, "input");
  const response = await fetch("/api/terminal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  const payload = await response.json();
  appendTerminal(payload.output, "output");
}

function appendTerminal(text, type) {
  const block = document.createElement("pre");
  block.className = `terminal-line terminal-${type}`;
  block.textContent = text;
  els.terminalOutput.append(block);
  els.terminalOutput.scrollTop = els.terminalOutput.scrollHeight;
}

async function refreshStatus() {
  els.statusList.innerHTML = Array.from({ length: 4 })
    .map(() => `<div class="status-row loading"><span></span><strong>checking</strong><em>--</em></div>`)
    .join("");
  const response = await fetch("/api/status");
  const payload = await response.json();
  els.statusList.innerHTML = payload.checks
    .map(
      (check) => `
      <a class="status-row ${check.ok ? "is-up" : "is-down"}" href="${check.url}" target="_blank" rel="noreferrer">
        <span></span>
        <strong>${escapeHtml(check.label)}</strong>
        <small>${escapeHtml(check.role)}</small>
        <em>${check.ok ? check.status : check.detail || check.status} · ${check.ms}ms</em>
      </a>
    `,
    )
    .join("");
}

function initConstellation() {
  if (!els.canvas) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.z = 18;
  const renderer = new THREE.WebGLRenderer({
    canvas: els.canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const group = new THREE.Group();
  scene.add(group);

  const nodeMeshes = [];
  const linePositions = [];
  const geometry = new THREE.SphereGeometry(0.22, 24, 16);
  const projectNodes = app.projects.map((project, index) => {
    const angle = (index / app.projects.length) * Math.PI * 2;
    const ring = project.tier === "Hero" ? 6.2 : project.tier === "Strong" ? 7.6 : 9;
    const y = Math.sin(index * 1.7) * 2.2;
    const position = new THREE.Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
    const color = new THREE.Color(project.gradient[0]);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.7,
      roughness: 0.28,
      metalness: 0.15,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(project.tier === "Hero" ? 1.45 : project.tier === "Strong" ? 1.1 : 0.86);
    mesh.userData = { slug: project.slug };
    group.add(mesh);
    nodeMeshes.push(mesh);
    linePositions.push(0, 0, 0, position.x, position.y, position.z);
    return { project, mesh, position };
  });

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9, 1),
    new THREE.MeshStandardMaterial({
      color: "#f8fafc",
      emissive: "#38bdf8",
      emissiveIntensity: 0.35,
      roughness: 0.4,
    }),
  );
  group.add(core);

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
  const lines = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: "#8bd3ff", transparent: true, opacity: 0.23 }),
  );
  group.add(lines);

  scene.add(new THREE.AmbientLight("#ffffff", 0.9));
  const key = new THREE.PointLight("#7dd3fc", 90, 40);
  key.position.set(4, 5, 7);
  scene.add(key);
  const warm = new THREE.PointLight("#f59e0b", 40, 30);
  warm.position.set(-5, -4, 4);
  scene.add(warm);

  app.scene = { scene, camera, renderer, group, projectNodes, nodeMeshes };
  resizeConstellation();
  updateConstellationLabels();
  wireConstellationPointer();
  animateConstellation();
}

function wireConstellationPointer() {
  const { group } = app.scene;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  els.canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    els.canvas.setPointerCapture(event.pointerId);
  });

  els.canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    group.rotation.y += dx * 0.006;
    group.rotation.x += dy * 0.004;
    lastX = event.clientX;
    lastY = event.clientY;
    updateConstellationLabels();
  });

  els.canvas.addEventListener("pointerup", () => {
    dragging = false;
  });

  els.canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    app.scene.camera.position.z = clamp(app.scene.camera.position.z + event.deltaY * 0.01, 10, 24);
    resizeConstellation();
  });
}

function resizeConstellation() {
  if (!app.scene) return;
  const rect = els.canvas.getBoundingClientRect();
  app.scene.camera.aspect = rect.width / Math.max(rect.height, 1);
  app.scene.camera.updateProjectionMatrix();
  app.scene.renderer.setSize(rect.width, rect.height, false);
}

function animateConstellation() {
  const { scene, camera, renderer, group, nodeMeshes } = app.scene;
  let tick = 0;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function frame() {
    tick += 0.01;
    if (!reduced) {
      group.rotation.y += 0.0025;
      nodeMeshes.forEach((mesh, index) => {
        const pulse = 1 + Math.sin(tick * 3 + index) * 0.08;
        const base = mesh.userData.slug === app.activeSlug ? 1.45 : 1;
        mesh.scale.setScalar(base * pulse * (mesh.userData.slug === app.activeSlug ? 1.25 : 1));
      });
    }
    renderer.render(scene, camera);
    if (Math.floor(tick * 100) % 6 === 0) updateConstellationLabels();
    requestAnimationFrame(frame);
  }
  frame();
}

function updateConstellationLabels() {
  if (!app.scene) return;
  const { projectNodes, camera } = app.scene;
  const rect = els.canvas.getBoundingClientRect();
  const sorted = app.graphMode === "rank"
    ? [...projectNodes].sort((a, b) => b.project.score - a.project.score)
    : projectNodes;
  const labeledNodes =
    app.graphMode === "orbit"
      ? sorted.filter(({ project }) => project.tier === "Hero" || project.slug === app.activeSlug)
      : sorted;

  els.graphOverlay.innerHTML = labeledNodes
    .map(({ project, mesh }, index) => {
      const position = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      let x = ((position.x + 1) / 2) * rect.width;
      let y = ((-position.y + 1) / 2) * rect.height;

      if (app.graphMode === "rank") {
        x = 94 + (index % 4) * 170;
        y = 26 + Math.floor(index / 4) * 52;
      } else if (app.graphMode === "domain") {
        x = 112 + (index % 3) * 190;
        y = rect.height - 170 + Math.floor(index / 3) * 48;
      } else {
        const dx = x - rect.width / 2;
        const dy = y - rect.height / 2;
        const distance = Math.max(1, Math.hypot(dx, dy));
        x += (dx / distance) * 70;
        y += (dy / distance) * 44;
        const [offsetX, offsetY] = orbitLabelOffsets[project.slug] || [0, 0];
        x += offsetX;
        y += offsetY;
      }

      const active = project.slug === app.activeSlug ? "is-active" : "";
      return `
        <button class="node-label ${active}" type="button" data-node="${project.slug}" style="left:${x}px;top:${y}px">
          ${escapeHtml(project.title)}
        </button>
      `;
    })
    .join("");

  $$("#constellation-overlay [data-node]").forEach((button) => {
    button.addEventListener("click", () => {
      setGraphReadout(button.dataset.node);
    });
  });
}

function setGraphReadout(slug) {
  const project = app.projects.find((item) => item.slug === slug) || app.projects[0];
  app.activeSlug = project.slug;
  els.graphTitle.textContent = project.title;
  els.graphCopy.textContent = project.summary;
  updateConstellationLabels();
}

function typeBootLine() {
  if (!els.bootLine) return;
  const lines = [
    "sqlite index warm",
    "github repositories scanned",
    "linkedin proof loaded",
    "constellation online",
  ];
  let index = 0;
  setInterval(() => {
    els.bootLine.textContent = lines[index % lines.length];
    index += 1;
  }, 2200);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
