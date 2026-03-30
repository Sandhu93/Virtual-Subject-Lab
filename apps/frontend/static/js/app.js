const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;

const state = {
  atlasId: "lab_curated_v1",
  runs: [],
  stimuli: [],
  exports: [],
  roiMeta: [],
  runPollTimer: null,
  viewer: null,   // BrainViewer instance
};

function parseRoute() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [pathPart, queryString = ""] = raw.split("?");
  const route = pathPart.replace(/^\/+/, "") || "home";
  return {
    route,
    params: new URLSearchParams(queryString),
  };
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch (_error) {
      detail = await response.text();
    }
    throw new Error(detail);
  }

  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

function setFeedback(node, payload) {
  if (!node) return;
  node.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}

function renderLineChart(container, values, opts = {}) {
  if (!container || !values || !values.length) {
    if (container) container.innerHTML = "";
    return;
  }
  const width = opts.width || 520;
  const height = opts.height || 160;
  const padding = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  const points = values
    .map((value, index) => {
      const x = padding + index * step;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="spark-svg" role="img" aria-label="Trace chart">
      <rect x="0" y="0" width="${width}" height="${height}" rx="12"></rect>
      <polyline points="${points}"></polyline>
    </svg>
  `;
}

function fillSelect(select, items, valueKey, labelBuilder, selectedValue = "") {
  if (!select) return;
  select.innerHTML = "";
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item[valueKey];
    option.textContent = labelBuilder(item);
    if (selectedValue && option.value === selectedValue) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function updateNav(route) {
  document.querySelectorAll("#main-nav a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const linkRoute = href.replace(/^#\/?/, "") || "home";
    link.classList.toggle("active-link", linkRoute === route);
  });
}

function showRoute(route) {
  document.querySelectorAll(".route-panel").forEach((panel) => {
    panel.hidden = panel.dataset.route !== route;
  });
  updateNav(route);
}

async function loadStimuli() {
  state.stimuli = await apiFetch("/stimuli");
  const tbody = document.getElementById("stimuli-table-body");
  const select = document.getElementById("stimulus-select");
  if (tbody) {
    tbody.innerHTML = "";
    state.stimuli.forEach((stimulus) => {
      const row = document.createElement("tr");
      const transcriptPreview = stimulus.transcript
        ? stimulus.transcript.length > 60
          ? stimulus.transcript.slice(0, 60) + "…"
          : stimulus.transcript
        : "—";
      row.innerHTML = `
        <td>${stimulus.name}</td>
        <td>${stimulus.source_type}</td>
        <td>${stimulus.status}</td>
        <td>${(stimulus.modalities || []).join(", ")}</td>
        <td>${(stimulus.duration_seconds || 0).toFixed(1)}s</td>
        <td title="${stimulus.transcript || ""}">${transcriptPreview}</td>
        <td>${stimulus.word_timing_status || "—"}</td>
      `;
      tbody.appendChild(row);
    });
  }
  fillSelect(
    select,
    state.stimuli.filter((item) => item.status === "ready"),
    "stimulus_id",
    (item) => `${item.name} - ${item.source_type} - ${item.status}`
  );
}

async function loadRuns() {
  state.runs = await apiFetch("/runs");
  fillSelect(
    document.getElementById("run-select"),
    state.runs,
    "run_id",
    (item) => `${item.run_id} - ${item.status}`
  );
  fillSelect(
    document.getElementById("compare-run-a"),
    state.runs,
    "run_id",
    (item) => `${item.run_id} - ${item.status}`
  );
  fillSelect(
    document.getElementById("compare-run-b"),
    state.runs,
    "run_id",
    (item) => `${item.run_id} - ${item.status}`
  );
  fillSelect(
    document.getElementById("export-run-select"),
    state.runs,
    "run_id",
    (item) => `${item.run_id} - ${item.status}`
  );
}

async function loadExports() {
  state.exports = await apiFetch("/exports");
  const tbody = document.getElementById("exports-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  state.exports.forEach((item) => {
    const row = document.createElement("tr");
    const download = item.bundle_key
      ? `<a href="${API_BASE}/exports/${item.export_id}/download">Download</a>`
      : "Pending";
    row.innerHTML = `
      <td>${item.export_id}</td>
      <td>${item.run_id}</td>
      <td>${item.status}</td>
      <td>${download}</td>
    `;
    tbody.appendChild(row);
  });
}

async function loadRoiMeta() {
  const payload = await apiFetch(`/atlases/${state.atlasId}/rois`);
  state.roiMeta = payload.items || [];
  fillSelect(
    document.getElementById("roi-select"),
    state.roiMeta,
    "roi_id",
    (item) => item.label
  );
}

function getOrCreateViewer() {
  if (state.viewer) return state.viewer;
  const canvas = document.getElementById("brain-canvas");
  if (!canvas || !window.BrainViewer) return null;
  state.viewer = BrainViewer.init(canvas);

  // Keep time slider in sync when the viewer advances during playback
  canvas.addEventListener("viewer-timechange", (e) => {
    const slider = document.getElementById("time-slider");
    if (slider) slider.value = e.detail.timeIndex;
  });

  return state.viewer;
}

async function loadRunWorkspace(runId) {
  const feedback = document.getElementById("workspace-feedback");
  try {
    const run = await apiFetch(`/runs/${runId}`);
    document.getElementById("run-title").textContent = run.run_id;
    document.getElementById("run-status").textContent = run.status;

    fillSelect(
      document.getElementById("ablation-select"),
      run.ablations || [],
      "ablation",
      (item) => item.ablation
    );

    const ablationSelect = document.getElementById("ablation-select");
    const ablation = ablationSelect.value || "full";
    if (!state.roiMeta.length) {
      await loadRoiMeta();
    }

    if (run.status !== "succeeded") {
      setFeedback(feedback, { status: run.status, detail: "Run is still processing." });
      return;
    }

    // ── Timeline ────────────────────────────────────────────────────────────
    const timeline = await apiFetch(`/runs/${runId}/timeline?ablation=${encodeURIComponent(ablation)}`);
    const timeSlider = document.getElementById("time-slider");
    timeSlider.max = Math.max(0, timeline.n_timesteps - 1);
    renderLineChart(document.getElementById("timeline-chart"), timeline.global_signal, { width: 560, height: 180 });

    // ── WebGL viewer ────────────────────────────────────────────────────────
    const viewer = getOrCreateViewer();
    if (viewer) {
      const threshold = Number(document.getElementById("threshold-slider").value);
      const hemMode = document.getElementById("hemisphere-toggle").checked ? "right" : "both";
      const parcel  = document.getElementById("parcel-toggle").checked;
      viewer.setRunConfig(runId, ablation, timeline.n_timesteps, API_BASE);
      viewer.setThreshold(threshold);
      viewer.setHemisphere(hemMode);
      viewer.setParcelOverlay(parcel);
      viewer.setTimeIndex(Number(timeSlider.value) || 0);
    }

    // ── Top ROIs ─────────────────────────────────────────────────────────────
    const top = await apiFetch(
      `/analysis/top-rois?run_id=${encodeURIComponent(runId)}&ablation=${encodeURIComponent(ablation)}&limit=10`
    );
    const list = document.getElementById("top-roi-list");
    list.innerHTML = "";
    top.items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.label}: peak ${item.peak_response.toFixed(3)} at ${item.peak_time_seconds}s`;
      list.appendChild(li);
    });

    // ── ROI trace ─────────────────────────────────────────────────────────────
    const roiSelect = document.getElementById("roi-select");
    const roiId = roiSelect.value || state.roiMeta[0]?.roi_id;
    if (roiId) {
      const trace = await apiFetch("/analysis/roi-traces", {
        method: "POST",
        body: JSON.stringify({ run_id: runId, ablation, roi_ids: [roiId] }),
      });
      if (trace.traces.length) {
        renderLineChart(document.getElementById("roi-trace-chart"), trace.traces[0].mean_trace, { width: 320, height: 160 });
      }
    }

    setFeedback(feedback, { run_id: runId, status: run.status, ablation });
    // Persist viewer state in the URL so the link is shareable
    pushViewerState();
  } catch (error) {
    setFeedback(feedback, { error: error.message });
  }
}

function currentRunId() {
  const { params } = parseRoute();
  return params.get("id") || document.getElementById("run-select")?.value || "";
}

/**
 * Build a hash URL that encodes the full viewer state so the link is shareable.
 * Parameters: id, ablation, threshold, hemisphere (left|right|both), time.
 */
function viewerStateParams() {
  const p = new URLSearchParams();
  const runId = currentRunId();
  if (runId) p.set("id", runId);

  const ablation = document.getElementById("ablation-select")?.value;
  if (ablation) p.set("ablation", ablation);

  const threshold = document.getElementById("threshold-slider")?.value;
  if (threshold) p.set("threshold", threshold);

  const rightBias = document.getElementById("hemisphere-toggle")?.checked;
  p.set("hemisphere", rightBias ? "right" : "both");

  const time = document.getElementById("time-slider")?.value;
  if (time) p.set("time", time);

  return p;
}

function pushViewerState() {
  const p = viewerStateParams();
  const hash = `#/runs?${p.toString()}`;
  // Use replaceState so back-navigation works naturally
  if (window.location.hash !== hash) {
    history.replaceState(null, "", hash);
  }
}

function restoreViewerStateFromParams(params) {
  const ablation   = params.get("ablation");
  const threshold  = params.get("threshold");
  const hemisphere = params.get("hemisphere");
  const time       = params.get("time");

  if (ablation) {
    const sel = document.getElementById("ablation-select");
    if (sel) sel.value = ablation;
  }
  if (threshold) {
    const slider = document.getElementById("threshold-slider");
    if (slider) slider.value = threshold;
  }
  if (hemisphere) {
    const tog = document.getElementById("hemisphere-toggle");
    if (tog) tog.checked = hemisphere === "right";
  }
  if (time) {
    const slider = document.getElementById("time-slider");
    if (slider) slider.value = time;
  }
}

function navigateToRun(runId) {
  window.location.hash = `#/runs?id=${encodeURIComponent(runId)}`;
}

function bindHandlers() {
  if (document.body.dataset.bound === "true") return;
  document.body.dataset.bound = "true";

  document.getElementById("text-stimulus-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const feedback = document.getElementById("stimulus-feedback");
    try {
      const payload = await apiFetch("/stimuli/text", {
        method: "POST",
        body: JSON.stringify({ name: form.get("name"), text: form.get("text") }),
      });
      await loadStimuli();
      setFeedback(feedback, payload);
    } catch (error) {
      setFeedback(feedback, { error: error.message });
    }
  });

  document.getElementById("file-stimulus-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const feedback = document.getElementById("stimulus-feedback");
    const file = form.get("file");
    if (!(file instanceof File)) return;
    try {
      const created = await apiFetch("/stimuli", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          source_type: form.get("source_type"),
          mime_type: file.type || null,
          filename: file.name,
        }),
      });
      const uploadBody = new FormData();
      uploadBody.append("file", file);
      await apiFetch(created.upload_url.replace(API_BASE, ""), { method: "PUT", body: uploadBody });
      const finalized = await apiFetch(created.finalize_url.replace(API_BASE, ""), { method: "POST" });
      await loadStimuli();
      setFeedback(feedback, finalized);
    } catch (error) {
      setFeedback(feedback, { error: error.message });
    }
  });

  document.getElementById("run-create-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const feedback = document.getElementById("stimulus-feedback");
    const ablations = String(form.get("ablations") || "full")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    try {
      const payload = await apiFetch("/runs", {
        method: "POST",
        body: JSON.stringify({ stimulus_id: form.get("stimulus_id"), ablations }),
      });
      await loadRuns();
      setFeedback(feedback, payload);
      navigateToRun(payload.run_id);
    } catch (error) {
      setFeedback(feedback, { error: error.message });
    }
  });

  document.getElementById("run-select")?.addEventListener("change", (event) => {
    navigateToRun(event.target.value);
  });

  // Controls that require a full workspace reload (new ablation or ROI selection)
  ["ablation-select", "roi-select"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => loadRunWorkspace(currentRunId()));
  });

  // Threshold: update viewer directly without API round-trip
  document.getElementById("threshold-slider")?.addEventListener("input", (e) => {
    const viewer = getOrCreateViewer();
    if (viewer) viewer.setThreshold(Number(e.target.value));
  });

  // Time scrubber: fetch new vertex frame
  document.getElementById("time-slider")?.addEventListener("input", (e) => {
    const viewer = getOrCreateViewer();
    if (viewer) viewer.setTimeIndex(Number(e.target.value));
  });

  // Hemisphere toggle: update viewer directly
  document.getElementById("hemisphere-toggle")?.addEventListener("change", (e) => {
    const viewer = getOrCreateViewer();
    if (viewer) viewer.setHemisphere(e.target.checked ? "right" : "both");
  });

  // Parcel overlay toggle
  document.getElementById("parcel-toggle")?.addEventListener("change", (e) => {
    const viewer = getOrCreateViewer();
    if (viewer) viewer.setParcelOverlay(e.target.checked);
  });

  document.getElementById("play-button")?.addEventListener("click", () => {
    const viewer = getOrCreateViewer();
    if (!viewer) return;
    viewer.play();
    document.getElementById("play-button").disabled  = true;
    document.getElementById("pause-button").disabled = false;
  });

  document.getElementById("pause-button")?.addEventListener("click", () => {
    const viewer = getOrCreateViewer();
    if (!viewer) return;
    viewer.pause();
    document.getElementById("play-button").disabled  = false;
    document.getElementById("pause-button").disabled = true;
  });

  document.getElementById("snapshot-button")?.addEventListener("click", () => {
    const viewer = getOrCreateViewer();
    if (viewer) {
      const url = viewer.snapshot();
      const a = document.createElement("a");
      a.href = url;
      a.download = `snapshot_${Date.now()}.png`;
      a.click();
    }
  });

  document.getElementById("export-button")?.addEventListener("click", async () => {
    const feedback = document.getElementById("workspace-feedback");
    try {
      const payload = await apiFetch("/exports", {
        method: "POST",
        body: JSON.stringify({ run_id: currentRunId() }),
      });
      await loadExports();
      setFeedback(feedback, payload);
      window.location.hash = "#/exports";
    } catch (error) {
      setFeedback(feedback, { error: error.message });
    }
  });

  document.getElementById("compare-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const feedback = document.getElementById("compare-feedback");
    const tbody = document.querySelector("#compare-table tbody");
    try {
      const payload = await apiFetch("/analysis/contrast", {
        method: "POST",
        body: JSON.stringify({
          run_a_id: form.get("run_a_id"),
          run_b_id: form.get("run_b_id"),
          ablation: form.get("ablation"),
          mode: "mean_difference",
        }),
      });
      setFeedback(feedback, {
        contrast_id: payload.contrast_id,
        global_mean_delta: payload.global_mean_delta,
        vertices_url: payload.vertices_url,
      });
      tbody.innerHTML = "";
      payload.roi_deltas.forEach((item) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${item.label}</td>
          <td>${item.run_a_peak.toFixed(3)}</td>
          <td>${item.run_b_peak.toFixed(3)}</td>
          <td>${item.delta_peak.toFixed(3)}</td>
        `;
        tbody.appendChild(row);
      });
    } catch (error) {
      setFeedback(feedback, { error: error.message });
    }
  });

  document.getElementById("export-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const feedback = document.getElementById("export-feedback");
    try {
      const payload = await apiFetch("/exports", {
        method: "POST",
        body: JSON.stringify({ run_id: form.get("run_id") }),
      });
      await loadExports();
      setFeedback(feedback, payload);
    } catch (error) {
      setFeedback(feedback, { error: error.message });
    }
  });
}

async function renderRoute() {
  const { route } = parseRoute();
  const normalized = route || "home";
  showRoute(normalized);

  if (state.runPollTimer) {
    window.clearInterval(state.runPollTimer);
    state.runPollTimer = null;
  }

  if (normalized === "stimuli") {
    await loadStimuli();
  }
  if (normalized === "compare") {
    await loadRuns();
  }
  if (normalized === "exports") {
    await Promise.all([loadRuns(), loadExports()]);
  }
  if (normalized === "runs") {
    const { params } = parseRoute();
    await Promise.all([loadRuns(), loadRoiMeta()]);
    const runId = currentRunId();
    if (runId) {
      document.getElementById("run-select").value = runId;
      // Restore slider/toggle values from URL params before loading workspace
      restoreViewerStateFromParams(params);
      await loadRunWorkspace(runId);
      const run = state.runs.find((item) => item.run_id === runId);
      if (run && run.status !== "succeeded") {
        state.runPollTimer = window.setInterval(() => loadRunWorkspace(runId), 3000);
      }
    }
  }
}

bindHandlers();
window.addEventListener("hashchange", () => {
  renderRoute().catch(console.error);
});
if (!window.location.hash) {
  window.location.hash = "#/";
}
renderRoute().catch(console.error);
