/* ============================================================
   StudyFlow — charts (Chart.js loaded on demand from CDN)
   ============================================================ */
const CDN = "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js";
let chartPromise = null;

export function ensureChartJS() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (chartPromise) return chartPromise;
  chartPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CDN; s.async = true;
    s.onload = () => resolve(window.Chart);
    s.onerror = () => reject(new Error("Could not load charts library"));
    document.head.appendChild(s);
  });
  return chartPromise;
}

const registry = new Map();

function mount(canvas, config) {
  if (!window.Chart || !canvas) return null;
  if (registry.has(canvas)) { try { registry.get(canvas).destroy(); } catch {} registry.delete(canvas); }
  const chart = new window.Chart(canvas, config);
  registry.set(canvas, chart);
  return chart;
}

export function renderDailyChart(canvas, labels, values, { fullLabels } = {}) {
  return mount(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Minutes studied",
        data: values,
        backgroundColor: values.map(v => (v > 0 ? "rgba(79,70,229,.85)" : "rgba(79,70,229,.12)")),
        borderRadius: 6,
        maxBarThickness: 34
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => (fullLabels && fullLabels[items[0].dataIndex]) || items[0].label,
            label: (item) => ` ${fmt(item.raw)}`
          }
        }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: "#eef0f6" }, ticks: { callback: (v) => v + "m", color: "#6b7383" } },
        x: { grid: { display: false }, ticks: { color: "#6b7383", maxRotation: 0, autoSkip: true } }
      }
    }
  });
}

export function renderSubjectChart(canvas, labels, values, colors) {
  return mount(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "62%",
      plugins: {
        legend: { position: "right", labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, color: "#1e2433", font: { size: 12 } } },
        tooltip: { callbacks: { label: (item) => ` ${item.label}: ${fmt(item.raw)}` } }
      }
    }
  });
}

function fmt(mins) {
  mins = Math.round(mins);
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
