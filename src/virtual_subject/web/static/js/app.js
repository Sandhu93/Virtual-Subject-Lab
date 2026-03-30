const page = document.body.dataset.page;

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
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
    } catch (_err) {
      detail = await response.text();
    }
    throw new Error(detail);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function setFeedback(node, payload) {
  if (!node) return;
  node.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}

function renderLineChart(container, values, opts = {}) {
  if (!container || !values || !values.length) return;
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

function updateStimulusSelect(stimulus) {
  const select = document.getElementById("stimulus-select");
  if (!select) return;
  const option = document.createElement("option");
  option.value = stimulus.stimulus_id;
  option.textContent = `${stimulus.name} · ${stimulus.source_type} · ${stimulus.status}`;
  option.selected = true;
  select.prepend(option);
}

async function initStimuliPage() {
  const textForm = document.getElementById("text-stimulus-form");
  const fileForm = document.getElementById("file-stimulus-form");
  const runForm = document.getElementById("run-create-form");
  const feedback = document.getElementById("stimulus-feedback");

  textForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(textForm);
    try {
      const payload = await apiFetch("/api/v1/stimuli/text", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          text: form.get("text"),
        }),
      });
      updateStimulusSelect(payload);
      setFeedback(feedback, payload);
    } catch (error) {
      setFeedback(feedback, { error: error.message });
    }
  });

  fileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(fileForm);
    const file = form.get("file");
    if (!(file instanceof File)) return;

    try {
      const created = await apiFetch("/api/v1/stimuli", {
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
      await apiFetch(created.upload_url, { method: "PUT", body: uploadBody });
      const finalized = await apiFetch(created.finalize_url, { method: "POST" });
      updateStimulusSelect(finalized);
      setFeedback(feedback, finalized);
    } catch (error) {
      setFeedback(feedback, { error: error.message });
    }
  });

  runForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(runForm);
    const ablations = String(form.get("ablations") || "full")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      const payload = await apiFetch("/api/v1/runs", {
        method: "POST",
        body: JSON.stringify({
          stimulus_id: form.get("stimulus_id"),
          ablations,
        }),
      });
      window.location.href = `/runs/${payload.run_id}`;
    } catch (error) {
      setFeedback(feedback, { error: error.message });
    }
  });
}

function applyViewerFrame(frame, threshold, rightBias, parcelToggle) {
  const nodes = document.querySelectorAll(".brain-node");
  const lookup = Object.fromEntries(frame.roi_frame.map((item) => [item.roi_id, item]));
  nodes.forEach((node) => {
    const roi = lookup[node.dataset.roiId];
    if (!roi) return;
    const circle = node.querySelector("circle");
    const label = node.querySelector("text");
    const value = Math.max(0, roi.value);
    const alpha = value < threshold ? 0.14 : Math.min(0.95, 0.2 + value);
    const bias = rightBias && node.dataset.hemisphere === "left" ? 0.35 : 1;
    circle.style.fill = `rgba(148, 76, 42, ${alpha * bias})`;
    label.style.display = parcelToggle ? "block" : "none";
  });
}

async function initRunPage() {
  const shell = document.querySelector("[data-run-id]");
  if (!shell) return;

  const runId = shell.dataset.runId;
  const ablationSelect = document.getElementById("ablation-select");
  const roiSelect = document.getElementById("roi-select");
  const thresholdSlider = document.getElementById("threshold-slider");
  const timeSlider = document.getElementById("time-slider");
  const hemisphereToggle = document.getElementById("hemisphere-toggle");
  const parcelToggle = document.getElementById("parcel-toggle");
  const feedback = document.getElementById("workspace-feedback");
  const timelineChart = document.getElementById("timeline-chart");
  const roiTraceChart = document.getElementById("roi-trace-chart");
  const topList = document.getElementById("top-roi-list");
  const runStatus = document.getElementById("run-status");

  async function loadWorkspace() {
    const run = await apiFetch(`/api/v1/runs/${runId}`);
    runStatus.textContent = run.status;
    const ablation = ablationSelect.value;
    const timeline = await apiFetch(`/api/v1/runs/${runId}/timeline?ablation=${encodeURIComponent(ablation)}`);
    renderLineChart(timelineChart, timeline.global_signal, { width: 560, height: 180 });
    timeSlider.max = Math.max(0, timeline.n_timesteps - 1);

    const frame = await apiFetch(
      `/api/v1/runs/${runId}/frames/${timeSlider.value}?ablation=${encodeURIComponent(ablation)}`
    );
    applyViewerFrame(frame, Number(thresholdSlider.value), hemisphereToggle.checked, parcelToggle.checked);

    const top = await apiFetch(
      `/api/v1/analysis/top-rois?run_id=${encodeURIComponent(runId)}&ablation=${encodeURIComponent(ablation)}&limit=10`
    );
    topList.innerHTML = "";
    top.items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.label}: peak ${item.peak_response.toFixed(3)} at ${item.peak_time_seconds}s`;
      topList.appendChild(li);
    });

    const trace = await apiFetch("/api/v1/analysis/roi-traces", {
      method: "POST",
      body: JSON.stringify({
        run_id: runId,
        ablation,
        roi_ids: [roiSelect.value],
      }),
    });
    if (trace.traces.length) {
      renderLineChart(roiTraceChart, trace.traces[0].mean_trace, { width: 320, height: 160 });
    }
  }

  ablationSelect?.addEventListener("change", () => loadWorkspace().catch((error) => setFeedback(feedback, error.message)));
  roiSelect?.addEventListener("change", () => loadWorkspace().catch((error) => setFeedback(feedback, error.message)));
  thresholdSlider?.addEventListener("input", () => loadWorkspace().catch((error) => setFeedback(feedback, error.message)));
  timeSlider?.addEventListener("input", () => loadWorkspace().catch((error) => setFeedback(feedback, error.message)));
  hemisphereToggle?.addEventListener("change", () => loadWorkspace().catch((error) => setFeedback(feedback, error.message)));
  parcelToggle?.addEventListener("change", () => loadWorkspace().catch((error) => setFeedback(feedback, error.message)));

  document.getElementById("snapshot-button")?.addEventListener("click", () => {
    loadWorkspace().catch((error) => setFeedback(feedback, error.message));
  });

  document.getElementById("export-button")?.addEventListener("click", async () => {
    try {
      const payload = await apiFetch("/api/v1/exports", {
        method: "POST",
        body: JSON.stringify({ run_id: runId }),
      });
      setFeedback(feedback, payload);
    } catch (error) {
      setFeedback(feedback, { error: error.message });
    }
  });

  try {
    await loadWorkspace();
    const run = await apiFetch(`/api/v1/runs/${runId}`);
    if (run.status !== "succeeded") {
      window.setInterval(() => {
        loadWorkspace().catch((error) => setFeedback(feedback, error.message));
      }, 3000);
    }
  } catch (error) {
    setFeedback(feedback, { error: error.message });
  }
}

async function initComparePage() {
  const form = document.getElementById("compare-form");
  const feedback = document.getElementById("compare-feedback");
  const tableBody = document.querySelector("#compare-table tbody");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    try {
      const payload = await apiFetch("/api/v1/analysis/compare", {
        method: "POST",
        body: JSON.stringify({
          run_a_id: formData.get("run_a_id"),
          run_b_id: formData.get("run_b_id"),
          ablation: formData.get("ablation"),
        }),
      });
      setFeedback(feedback, { global_mean_delta: payload.global_mean_delta });
      tableBody.innerHTML = "";
      payload.roi_deltas.forEach((item) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${item.label}</td>
          <td>${item.run_a_peak.toFixed(3)}</td>
          <td>${item.run_b_peak.toFixed(3)}</td>
          <td>${item.delta_peak.toFixed(3)}</td>
        `;
        tableBody.appendChild(row);
      });
    } catch (error) {
      setFeedback(feedback, { error: error.message });
    }
  });
}

async function initExportsPage() {
  const form = document.getElementById("export-form");
  const feedback = document.getElementById("export-feedback");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    try {
      const payload = await apiFetch("/api/v1/exports", {
        method: "POST",
        body: JSON.stringify({ run_id: formData.get("run_id") }),
      });
      setFeedback(feedback, payload);
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      setFeedback(feedback, { error: error.message });
    }
  });
}

if (page === "stimuli") initStimuliPage();
if (page === "runs") initRunPage();
if (page === "compare") initComparePage();
if (page === "exports") initExportsPage();
