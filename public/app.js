/**
 * Frontend dashboard logic for polling the API and updating the page.
 * Handles summary cards, status messaging, and the ice thickness chart.
 */
const LOCATIONS = ["Dow's Lake", 'Fifth Avenue', 'NAC'];
const REFRESH_INTERVAL_MS = 30000;
const HERO_REFRESH_MESSAGE = `Live data refreshes every 30 seconds. Showing ${LOCATIONS.length} monitored locations.`;
const SUMMARY_STATUSES = [
  { key: 'safe', label: 'Safe' },
  { key: 'caution', label: 'Caution' },
  { key: 'unsafe', label: 'Unsafe' },
  { key: 'unknown', label: 'Unknown' },
];
const CARD_METRICS = [
  { key: 'avgIceThicknessCm', label: 'Avg. Ice Thickness' },
  { key: 'avgSurfaceTemperatureC', label: 'Avg. Surface Temp' },
  { key: 'maxSnowAccumulationCm', label: 'Max Snow Accumulation' },
  { key: 'avgExternalTemperatureC', label: 'Avg. External Temp' },
  { key: 'readingCount', label: 'Reading Count' },
  { key: 'windowEnd', label: 'Window End' },
];

let iceThicknessChart = null;

const dashboardState = {
  hasLoadedOnce: false,
  isRefreshing: false,
  lastSuccessfulRefreshIso: null,
  snapshots: {
    latest: '',
    summary: '',
    history: '',
  },
  cardElementsByLocation: new Map(),
  summaryCountElements: {},
};

document.addEventListener('DOMContentLoaded', () => {
  initializeSummaryCounts();
  initializeCards();
  setRefreshStatus(HERO_REFRESH_MESSAGE);
  setRefreshIndicatorState('syncing');
  loadDashboard();
  window.setInterval(() => {
    loadDashboard();
  }, REFRESH_INTERVAL_MS);
});

/**
 * Runs one full dashboard refresh cycle.
 *
 * Fetches latest, summary, and history data together, then updates the DOM
 * and chart state for the current polling cycle.
 *
 * @returns {Promise<void>}
 */
async function loadDashboard() {
  if (dashboardState.isRefreshing) {
    return;
  }

  dashboardState.isRefreshing = true;
  setRefreshIndicatorState('syncing');

  try {
    // Refresh all API slices together so the page updates from one poll cycle.
    const [latestResponse, summaryResponse, historyResponses] = await Promise.all([
      fetchJson('/api/latest'),
      fetchJson('/api/summary'),
      Promise.all(
        LOCATIONS.map((location) =>
          fetchJson(`/api/history?location=${encodeURIComponent(location)}`)
        )
      ),
    ]);

    const latestData = normalizeLatestResponse(latestResponse);
    const summaryData = normalizeSummaryResponse(summaryResponse);
    const historyData = normalizeHistoryResponses(historyResponses);

    applyDashboardData(latestData, summaryData, historyData);

    dashboardState.lastSuccessfulRefreshIso =
      latestResponse.timestamp || new Date().toISOString();
    dashboardState.hasLoadedOnce = true;

    hideMessage('error-state');
    updateEmptyState(latestData);
    updateRefreshStatus(latestData);
    renderLastUpdated(dashboardState.lastSuccessfulRefreshIso);
    setRefreshIndicatorState('live');
  } catch (error) {
    handleRefreshError(error);
  } finally {
    dashboardState.isRefreshing = false;
  }
}

/**
 * Fetches JSON from the backend and throws a readable error for failed requests.
 *
 * @param {string} url API URL to request.
 * @returns {Promise<object>} Parsed JSON payload from the backend.
 */
async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Request failed.');
  }

  return data;
}

/**
 * Applies new dashboard data only when a section has actually changed.
 *
 * @param {object} latestData Normalized latest-location payload.
 * @param {object} summaryData Normalized summary payload.
 * @param {object[]} historyData Normalized chart history payload.
 * @returns {void}
 */
function applyDashboardData(latestData, summaryData, historyData) {
  const latestSnapshot = JSON.stringify({
    locations: latestData.locations,
    missingLocations: latestData.missingLocations,
    message: latestData.message,
  });
  const summarySnapshot = JSON.stringify(summaryData);
  const historySnapshot = JSON.stringify(historyData);

  // Skip unnecessary DOM and chart work to keep polling updates steady.
  if (latestSnapshot !== dashboardState.snapshots.latest) {
    renderCards(latestData.locations);
    dashboardState.snapshots.latest = latestSnapshot;
  }

  if (summarySnapshot !== dashboardState.snapshots.summary) {
    renderSummary(summaryData);
    dashboardState.snapshots.summary = summarySnapshot;
  }

  if (historySnapshot !== dashboardState.snapshots.history) {
    renderChart(historyData);
    dashboardState.snapshots.history = historySnapshot;
  }
}

/**
 * Shows fallback UI when a refresh fails.
 *
 * On the very first load, this also renders empty placeholder content so the
 * page still looks complete even when the API is unavailable.
 *
 * @param {Error} error Error thrown during the refresh cycle.
 * @returns {void}
 */
function handleRefreshError(error) {
  if (!dashboardState.hasLoadedOnce) {
    // First-load fallback: show stable empty sections instead of a blank page.
    renderSummary({
      overallStatus: 'Unknown',
      counts: { safe: 0, caution: 0, unsafe: 0, unknown: 0 },
    });
    renderCards([]);
    renderChart([]);
  }

  hideMessage('empty-state');
  showMessage(
    'error-state',
    error.message ||
      'Unable to load dashboard data right now. Check the API and Cosmos DB configuration.'
  );
  setRefreshIndicatorState('error');

  if (!dashboardState.hasLoadedOnce) {
    renderLastUpdated(new Date().toISOString());
  }
}

/**
 * Converts the latest-record API response into the frontend's display order.
 *
 * @param {object} response Raw `/api/latest` response.
 * @returns {{locations: object[], missingLocations: string[], message: string|null}}
 */
function normalizeLatestResponse(response) {
  const locationMap = new Map(
    (response.locations || []).map((record) => [
      record.location,
      normalizeLatestRecord(record),
    ])
  );

  return {
    locations: LOCATIONS.map((location) => locationMap.get(location)).filter(Boolean),
    missingLocations: response.missingLocations
      ? [...response.missingLocations].sort(compareLocations)
      : LOCATIONS.filter((location) => !locationMap.has(location)),
    message: response.message || null,
  };
}

function normalizeLatestRecord(record = {}) {
  return {
    id: record.id || null,
    location: record.location || null,
    windowStart: record.windowStart || null,
    windowEnd: record.windowEnd || null,
    avgIceThicknessCm: normalizeNumber(record.avgIceThicknessCm),
    avgSurfaceTemperatureC: normalizeNumber(record.avgSurfaceTemperatureC),
    maxSnowAccumulationCm: normalizeNumber(record.maxSnowAccumulationCm),
    avgExternalTemperatureC: normalizeNumber(record.avgExternalTemperatureC),
    readingCount: normalizeInteger(record.readingCount),
    safetyStatus: normalizeStatus(record.safetyStatus),
  };
}

function normalizeSummaryResponse(response = {}) {
  return {
    overallStatus: normalizeStatus(response.overallStatus),
    counts: {
      safe: normalizeInteger(response.counts?.safe) ?? 0,
      caution: normalizeInteger(response.counts?.caution) ?? 0,
      unsafe: normalizeInteger(response.counts?.unsafe) ?? 0,
      unknown: normalizeInteger(response.counts?.unknown) ?? 0,
    },
    availableLocations: normalizeInteger(response.availableLocations) ?? 0,
    missingLocations: Array.isArray(response.missingLocations)
      ? [...response.missingLocations].sort(compareLocations)
      : [],
    latestWindowEnd: response.latestWindowEnd || null,
  };
}

/**
 * Converts history responses into the smaller shape needed by Chart.js.
 *
 * @param {object[]} historyResponses Raw `/api/history` responses for all locations.
 * @returns {{location: string, points: object[]}[]} Chart-ready history data.
 */
function normalizeHistoryResponses(historyResponses) {
  const historyMap = new Map(
    (historyResponses || []).map((history) => [
      history.location,
      {
        location: history.location,
        // Keep only the fields the chart actually needs.
        points: (history.points || []).map((point) => ({
          windowEnd: point.windowEnd || null,
          avgIceThicknessCm: normalizeNumber(point.avgIceThicknessCm),
        })),
      },
    ])
  );

  return LOCATIONS.map((location) => {
    const history = historyMap.get(location);

    if (!history) {
      return {
        location,
        points: [],
      };
    }

    return {
      location,
      points: [...history.points].sort((left, right) =>
        String(left.windowEnd || '').localeCompare(String(right.windowEnd || ''))
      ),
    };
  });
}

/**
 * Creates the summary pills once and stores references for later updates.
 *
 * @returns {void}
 */
function initializeSummaryCounts() {
  const container = document.getElementById('status-counts');

  if (Object.keys(dashboardState.summaryCountElements).length) {
    return;
  }

  container.innerHTML = '';

  SUMMARY_STATUSES.forEach((status) => {
    const pill = document.createElement('div');
    pill.className = 'stat-pill';
    pill.dataset.statusKey = status.key;
    pill.textContent = `${status.label}: 0`;
    container.appendChild(pill);
    dashboardState.summaryCountElements[status.key] = pill;
  });
}

/**
 * Builds the location card skeleton once so refreshes only update text/classes.
 *
 * @returns {void}
 */
function initializeCards() {
  const container = document.getElementById('cards-grid');

  if (dashboardState.cardElementsByLocation.size) {
    return;
  }

  container.innerHTML = '';

  LOCATIONS.forEach((location) => {
    const article = document.createElement('article');
    article.className = 'location-card is-empty';

    const top = document.createElement('div');
    top.className = 'card-top';

    const headingWrapper = document.createElement('div');
    const locationLabel = document.createElement('p');
    locationLabel.className = 'location-label';
    locationLabel.textContent = 'Location';
    const locationHeading = document.createElement('h3');
    locationHeading.textContent = location;

    headingWrapper.appendChild(locationLabel);
    headingWrapper.appendChild(locationHeading);

    const badge = document.createElement('span');
    applyStatusBadge(badge, 'No Data');
    badge.textContent = 'No Data';

    top.appendChild(headingWrapper);
    top.appendChild(badge);

    const metricsGrid = document.createElement('div');
    metricsGrid.className = 'metrics-grid';

    const metricElements = {};

    CARD_METRICS.forEach((metric) => {
      const metricElement = createMetricElement(metric.label);
      metricsGrid.appendChild(metricElement.root);
      metricElements[metric.key] = metricElement.value;
    });

    const note = document.createElement('p');
    note.className = 'card-note';

    article.appendChild(top);
    article.appendChild(metricsGrid);
    article.appendChild(note);
    container.appendChild(article);

    dashboardState.cardElementsByLocation.set(location, {
      article,
      badge,
      metricElements,
      note,
    });
  });

  renderCards([]);
}

function createMetricElement(label) {
  const root = document.createElement('div');
  root.className = 'metric';

  const labelElement = document.createElement('p');
  labelElement.className = 'metric-label';
  labelElement.textContent = label;

  const valueElement = document.createElement('p');
  valueElement.className = 'metric-value';
  valueElement.textContent = '--';

  root.appendChild(labelElement);
  root.appendChild(valueElement);

  return {
    root,
    value: valueElement,
  };
}

/**
 * Updates the overall status badge, summary text, and per-status counts.
 *
 * @param {object} summary Normalized summary data from the backend.
 * @returns {void}
 */
function renderSummary(summary) {
  const overallStatus = summary.overallStatus || 'Unknown';
  const badge = document.getElementById('overall-status-badge');
  const text = document.getElementById('overall-status-text');

  // Match the summary badge styling to the current normalized safety status.
  setElementText(badge, overallStatus);
  applyStatusBadge(badge, overallStatus);

  if (overallStatus === 'Safe') {
    setElementText(
      text,
      'All available locations are currently reporting safe conditions.'
    );
  } else if (overallStatus === 'Caution') {
    setElementText(
      text,
      'At least one location requires caution, but none are currently unsafe.'
    );
  } else if (overallStatus === 'Unsafe') {
    setElementText(
      text,
      'At least one location is currently reporting unsafe conditions.'
    );
  } else if (overallStatus === 'No Data') {
    setElementText(
      text,
      'No recent aggregation records are available yet for the monitored locations.'
    );
  } else {
    setElementText(
      text,
      'The dashboard is waiting for complete status information from the backend.'
    );
  }

  SUMMARY_STATUSES.forEach((status) => {
    const value = summary.counts?.[status.key] ?? 0;
    const element = dashboardState.summaryCountElements[status.key];
    setElementText(element, `${status.label}: ${value}`);
  });
}

function renderCards(records) {
  const recordMap = new Map(records.map((record) => [record.location, record]));

  LOCATIONS.forEach((location) => {
    const card = dashboardState.cardElementsByLocation.get(location);
    const record = recordMap.get(location) || null;
    updateLocationCard(card, record);
  });
}

/**
 * Updates one location card with the latest metrics or empty-state placeholders.
 *
 * @param {object} card Cached DOM references for a single location card.
 * @param {object|null} record Latest normalized record for that location.
 * @returns {void}
 */
function updateLocationCard(card, record) {
  const status = record?.safetyStatus || 'No Data';

  card.article.classList.toggle('is-empty', !record);
  // Reuse the same badge helper as the summary so colors stay consistent.
  setElementText(card.badge, status);
  applyStatusBadge(card.badge, status);

  setElementText(
    card.metricElements.avgIceThicknessCm,
    formatMetric(record?.avgIceThicknessCm, 'cm')
  );
  setElementText(
    card.metricElements.avgSurfaceTemperatureC,
    formatMetric(record?.avgSurfaceTemperatureC, 'deg C')
  );
  setElementText(
    card.metricElements.maxSnowAccumulationCm,
    formatMetric(record?.maxSnowAccumulationCm, 'cm')
  );
  setElementText(
    card.metricElements.avgExternalTemperatureC,
    formatMetric(record?.avgExternalTemperatureC, 'deg C')
  );
  setElementText(card.metricElements.readingCount, formatCount(record?.readingCount));
  setElementText(card.metricElements.windowEnd, formatDateTime(record?.windowEnd));

  if (record?.windowEnd) {
    setElementText(
      card.note,
      `Latest aggregation window recorded at ${formatDateTime(record.windowEnd)}.`
    );
  } else {
    setElementText(
      card.note,
      'No aggregation data available yet for this location.'
    );
  }
}

/**
 * Creates the chart once, then updates its data on later refreshes.
 *
 * @param {object[]} historyResponses Chart-ready history data for all locations.
 * @returns {void}
 */
function renderChart(historyResponses) {
  const canvas = document.getElementById('ice-thickness-chart');
  const chartData = buildChartData(historyResponses);

  if (!iceThicknessChart) {
    iceThicknessChart = new Chart(canvas, {
      type: 'line',
      data: chartData,
      options: getChartOptions(),
    });
  } else {
    // Update the existing chart instance to avoid canvas flicker on refresh.
    iceThicknessChart.data.labels = chartData.labels;
    iceThicknessChart.data.datasets = chartData.datasets;
    iceThicknessChart.update('none');
  }

  if (chartData.labels.length) {
    hideMessage('chart-empty');
  } else {
    showMessage(
      'chart-empty',
      'No last-hour ice thickness history is available yet.'
    );
  }
}

/**
 * Converts normalized history responses into a Chart.js dataset object.
 *
 * @param {object[]} historyResponses Chart-ready history data for all locations.
 * @returns {{labels: string[], datasets: object[]}} Chart.js data object.
 */
function buildChartData(historyResponses) {
  const rawLabels = getSortedHistoryTimestamps(historyResponses);

  if (!rawLabels.length) {
    return {
      labels: [],
      datasets: [],
    };
  }

  const displayLabels = rawLabels.map(formatTime);

  return {
    labels: displayLabels,
    datasets: historyResponses.map((history, index) => {
      const pointMap = new Map(
        (history.points || []).map((point) => [
          point.windowEnd,
          point.avgIceThicknessCm,
        ])
      );
      const palette = getDatasetPalette(index);

      return {
        label: history.location,
        data: rawLabels.map((label) =>
          typeof pointMap.get(label) === 'number' ? pointMap.get(label) : null
        ),
        borderColor: palette.border,
        backgroundColor: palette.background,
        borderWidth: 3,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.28,
        spanGaps: true,
      };
    }),
  };
}

/**
 * Returns the shared Chart.js options for the ice thickness trend chart.
 *
 * @returns {object} Chart.js options object.
 */
function getChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    // Disable animation so polling updates feel stable instead of jumpy.
    animation: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 14,
          color: '#244159',
          font: {
            family: '"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif',
            weight: '700',
          },
        },
      },
      tooltip: {
        callbacks: {
          label(context) {
            const value = context.parsed.y;
            return value == null
              ? `${context.dataset.label}: no data`
              : `${context.dataset.label}: ${value.toFixed(1)} cm`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#486377',
        },
        grid: {
          color: 'rgba(172, 204, 223, 0.28)',
        },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Average Ice Thickness (cm)',
          color: '#244159',
          font: {
            weight: '700',
          },
        },
        ticks: {
          color: '#486377',
        },
        grid: {
          color: 'rgba(172, 204, 223, 0.28)',
        },
      },
    },
  };
}

function getDatasetPalette(index) {
  return [
    { border: '#2f6ea5', background: 'rgba(47, 110, 165, 0.14)' },
    { border: '#1d8f84', background: 'rgba(29, 143, 132, 0.14)' },
    { border: '#d08a1f', background: 'rgba(208, 138, 31, 0.16)' },
  ][index];
}

function getSortedHistoryTimestamps(historyResponses) {
  const timestampSet = new Set();

  historyResponses.forEach((history) => {
    (history.points || []).forEach((point) => {
      if (point.windowEnd) {
        timestampSet.add(point.windowEnd);
      }
    });
  });

  return Array.from(timestampSet).sort((left, right) => left.localeCompare(right));
}

/**
 * Updates the empty-data message shown above the cards section.
 *
 * @param {object} latestData Normalized latest-location payload.
 * @returns {void}
 */
function updateEmptyState(latestData) {
  if (!latestData.locations.length) {
    showMessage(
      'empty-state',
      latestData.message ||
        'No aggregation data is available yet. Once documents are written to Cosmos DB, the dashboard will update automatically.'
    );
    return;
  }

  hideMessage('empty-state');
}

/**
 * Updates the hero refresh message.
 *
 * @param {object} latestData Latest payload for the current refresh cycle.
 * @returns {void}
 */
function updateRefreshStatus(latestData) {
  setRefreshStatus(HERO_REFRESH_MESSAGE);
}

function renderLastUpdated(value) {
  setElementText(
    document.getElementById('last-updated'),
    `Last updated: ${formatHeroTimestamp(value)}`
  );
}

function setRefreshStatus(message) {
  const copy = document.querySelector('#refresh-status .info-chip-copy');
  setElementText(copy, message);
}

function setRefreshIndicatorState(state) {
  const indicator = document.getElementById('refresh-indicator');
  const nextClassName = `refresh-indicator is-${state}`;

  if (indicator.className !== nextClassName) {
    indicator.className = nextClassName;
  }
}

function showMessage(elementId, message) {
  const element = document.getElementById(elementId);
  setElementText(element, message);

  if (element.classList.contains('hidden')) {
    element.classList.remove('hidden');
  }
}

function hideMessage(elementId) {
  const element = document.getElementById(elementId);

  if (!element.classList.contains('hidden')) {
    element.classList.add('hidden');
  }
}

function setElementText(element, value) {
  const nextValue = String(value ?? '');

  if (element.textContent !== nextValue) {
    element.textContent = nextValue;
  }
}

/**
 * Maps a normalized safety status to the matching badge CSS class.
 *
 * @param {HTMLElement} element Badge element to style.
 * @param {string} status Normalized status text.
 * @returns {void}
 */
function applyStatusBadge(element, status) {
  const nextClassName = `status-badge ${getStatusClass(status)}`;

  if (element.className !== nextClassName) {
    element.className = nextClassName;
  }
}

function normalizeStatus(status) {
  if (!status) {
    return 'Unknown';
  }

  const normalized = String(status).trim().toLowerCase();

  if (normalized === 'safe') {
    return 'Safe';
  }

  if (normalized === 'caution') {
    return 'Caution';
  }

  if (normalized === 'unsafe') {
    return 'Unsafe';
  }

  if (normalized === 'no data') {
    return 'No Data';
  }

  return String(status).trim();
}

function normalizeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeInteger(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue) : null;
}

function compareLocations(left, right) {
  return LOCATIONS.indexOf(left) - LOCATIONS.indexOf(right);
}

function formatMetric(value, unit) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  return `${value.toFixed(1)} ${unit}`;
}

function formatCount(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  return String(value);
}

function formatDateTime(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function formatTime(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatHeroTimestamp(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getStatusClass(status) {
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'safe') {
    return 'status-safe';
  }

  if (normalized === 'caution') {
    return 'status-caution';
  }

  if (normalized === 'unsafe') {
    return 'status-unsafe';
  }

  if (normalized === 'no data') {
    return 'status-no-data';
  }

  return 'status-unknown';
}
