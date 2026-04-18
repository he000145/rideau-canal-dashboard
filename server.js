/**
 * Express backend for the Rideau Canal dashboard.
 * Serves the frontend and reads aggregated sensor data from Cosmos DB.
 */
require('dotenv').config();

const express = require('express');
const path = require('path');
const { CosmosClient } = require('@azure/cosmos');

const app = express();
const PORT = process.env.PORT || 3000;

const LOCATIONS = ["Dow's Lake", 'Fifth Avenue', 'NAC'];

const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
const COSMOS_KEY = process.env.COSMOS_KEY;
const COSMOS_DATABASE_ID = process.env.COSMOS_DATABASE_ID || 'RideauCanalDB';
const COSMOS_CONTAINER_ID =
  process.env.COSMOS_CONTAINER_ID || 'SensorAggregations';

app.use(express.json());
// Serve the static dashboard files from the public folder.
app.use(express.static(path.join(__dirname, 'public')));

let cosmosClient = null;

/**
 * Checks whether the required Cosmos DB environment variables are present.
 *
 * @returns {boolean} True when the app has enough config to connect to Cosmos DB.
 */
function isCosmosConfigured() {
  return Boolean(
    COSMOS_ENDPOINT &&
      COSMOS_KEY &&
      COSMOS_DATABASE_ID &&
      COSMOS_CONTAINER_ID
  );
}

/**
 * Creates an error object with an HTTP status for API responses.
 *
 * @param {number} statusCode HTTP status to return.
 * @param {string} message Human-readable error message.
 * @param {string} [details] Optional extra context for debugging.
 * @returns {Error} Error object with status metadata attached.
 */
function createServiceError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

/**
 * Returns a shared Cosmos DB client for the current process.
 *
 * @returns {CosmosClient} Configured Cosmos DB client.
 * @throws {Error} Throws a 503-style service error when config is missing.
 */
function getCosmosClient() {
  if (!isCosmosConfigured()) {
    throw createServiceError(
      503,
      'Cosmos DB is not configured. Set COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE_ID, and COSMOS_CONTAINER_ID.'
    );
  }

  if (!cosmosClient) {
    // Reuse one client instance so each request does not create a new connection.
    cosmosClient = new CosmosClient({
      endpoint: COSMOS_ENDPOINT,
      key: COSMOS_KEY,
    });
  }

  return cosmosClient;
}

/**
 * Gets the configured Cosmos DB container used by the dashboard API.
 *
 * @returns {import('@azure/cosmos').Container} Cosmos container handle.
 */
function getContainer() {
  return getCosmosClient()
    .database(COSMOS_DATABASE_ID)
    .container(COSMOS_CONTAINER_ID);
}

function toNumberOrNull(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function toIntegerOrNull(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue) : null;
}

function normalizeStatus(value) {
  if (!value) {
    return 'Unknown';
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === 'safe') {
    return 'Safe';
  }

  if (normalized === 'caution') {
    return 'Caution';
  }

  if (normalized === 'unsafe') {
    return 'Unsafe';
  }

  return String(value).trim();
}

/**
 * Normalizes a raw Cosmos DB document into the API response shape.
 *
 * @param {object} [record={}] Raw document read from Cosmos DB.
 * @returns {object} Cleaned record with predictable null/default values.
 */
function normalizeRecord(record = {}) {
  return {
    id: record.id || null,
    location: record.location || 'Unknown',
    windowStart: record.windowStart || null,
    windowEnd: record.windowEnd || null,
    avgIceThicknessCm: toNumberOrNull(record.avgIceThicknessCm),
    minIceThicknessCm: toNumberOrNull(record.minIceThicknessCm),
    maxIceThicknessCm: toNumberOrNull(record.maxIceThicknessCm),
    avgSurfaceTemperatureC: toNumberOrNull(record.avgSurfaceTemperatureC),
    minSurfaceTemperatureC: toNumberOrNull(record.minSurfaceTemperatureC),
    maxSurfaceTemperatureC: toNumberOrNull(record.maxSurfaceTemperatureC),
    maxSnowAccumulationCm: toNumberOrNull(record.maxSnowAccumulationCm),
    avgExternalTemperatureC: toNumberOrNull(record.avgExternalTemperatureC),
    readingCount: toIntegerOrNull(record.readingCount),
    safetyStatus: normalizeStatus(record.safetyStatus),
  };
}

function sortByLocationOrder(records) {
  return [...records].sort(
    (left, right) =>
      LOCATIONS.indexOf(left.location) - LOCATIONS.indexOf(right.location)
  );
}

function sortByWindowEndAscending(records) {
  return [...records].sort((left, right) => {
    const leftValue = left.windowEnd || '';
    const rightValue = right.windowEnd || '';
    return leftValue.localeCompare(rightValue);
  });
}

/**
 * Calculates the overall safety state from the latest location records.
 *
 * @param {object[]} records Latest records for all available locations.
 * @returns {string} Overall status used by the summary endpoint.
 */
function getOverallStatus(records) {
  const statuses = records.map((record) => normalizeStatus(record.safetyStatus));

  if (!statuses.length) {
    return 'No Data';
  }

  if (statuses.includes('Unsafe')) {
    return 'Unsafe';
  }

  if (statuses.includes('Caution')) {
    return 'Caution';
  }

  if (statuses.every((status) => status === 'Safe')) {
    return 'Safe';
  }

  return 'Unknown';
}

/**
 * Counts how many locations fall into each safety category.
 *
 * @param {object[]} records Latest records for all available locations.
 * @returns {{safe:number, caution:number, unsafe:number, unknown:number}} Status totals.
 */
function getStatusCounts(records) {
  return records.reduce(
    (counts, record) => {
      const status = normalizeStatus(record.safetyStatus);

      if (status === 'Safe') {
        counts.safe += 1;
      } else if (status === 'Caution') {
        counts.caution += 1;
      } else if (status === 'Unsafe') {
        counts.unsafe += 1;
      } else {
        counts.unknown += 1;
      }

      return counts;
    },
    { safe: 0, caution: 0, unsafe: 0, unknown: 0 }
  );
}

function extractErrorDetails(error) {
  if (!error) {
    return undefined;
  }

  const details = [];

  if (error.code) {
    details.push(`Code: ${error.code}`);
  }

  if (error.substatus) {
    details.push(`Substatus: ${error.substatus}`);
  }

  if (error.message) {
    details.push(error.message);
  }

  return details.length ? details.join(' | ') : undefined;
}

/**
 * Converts backend/config/SDK errors into a consistent API response.
 *
 * @param {import('express').Response} response Express response object.
 * @param {Error & {statusCode?: number, details?: string}} error Error from config or Cosmos DB.
 * @returns {void}
 */
function sendDataErrorResponse(response, error) {
  const statusCode = error.statusCode || (isCosmosConfigured() ? 502 : 503);

  response.status(statusCode).json({
    error: 'DataUnavailable',
    message:
      error.message ||
      'Unable to retrieve data from Cosmos DB at this time. Please try again later.',
    details: error.details || extractErrorDetails(error),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Checks whether the backend can reach the configured Cosmos DB container.
 *
 * @returns {Promise<object>} Health details used by the `/api/health` endpoint.
 */
async function checkCosmosAvailability() {
  if (!isCosmosConfigured()) {
    return {
      configured: false,
      available: false,
      message:
        'Cosmos DB environment variables are missing. Configure the app before requesting data.',
    };
  }

  try {
    await getContainer().read();

    return {
      configured: true,
      available: true,
      message: 'Cosmos DB connection successful.',
    };
  } catch (error) {
    return {
      configured: true,
      available: false,
      message: 'Unable to connect to Cosmos DB.',
      details: extractErrorDetails(error),
    };
  }
}

/**
 * Reads the newest aggregation document for a single monitored location.
 *
 * @param {string} location Partition key / monitored location name.
 * @returns {Promise<object|null>} Latest normalized record, or null if no document exists.
 */
async function readLatestForLocation(location) {
  const container = getContainer();
  const querySpec = {
    // Query only the newest document in the location partition.
    query:
      'SELECT TOP 1 * FROM c WHERE c.location = @location ORDER BY c.windowEnd DESC',
    parameters: [{ name: '@location', value: location }],
  };

  const { resources } = await container.items
    .query(querySpec, { partitionKey: location })
    .fetchAll();

  return resources[0] ? normalizeRecord(resources[0]) : null;
}

/**
 * Reads the last hour of history for a single monitored location.
 *
 * @param {string} location Partition key / monitored location name.
 * @param {string} sinceIso ISO timestamp used as the lower bound.
 * @returns {Promise<object[]>} Normalized history points sorted by window end time.
 */
async function readHistoryForLocation(location, sinceIso) {
  const container = getContainer();
  const querySpec = {
    // Keep the query inside one partition and return the points in chart order.
    query:
      'SELECT * FROM c WHERE c.location = @location AND c.windowEnd >= @since ORDER BY c.windowEnd ASC',
    parameters: [
      { name: '@location', value: location },
      { name: '@since', value: sinceIso },
    ],
  };

  const { resources } = await container.items
    .query(querySpec, { partitionKey: location })
    .fetchAll();

  return sortByWindowEndAscending(resources.map(normalizeRecord));
}

/**
 * Reads the latest aggregation document for all monitored locations.
 *
 * @returns {Promise<object[]>} Latest normalized records sorted in dashboard order.
 */
async function readLatestForAllLocations() {
  const records = await Promise.all(LOCATIONS.map(readLatestForLocation));
  return sortByLocationOrder(records.filter(Boolean));
}

/**
 * GET /api/health
 * Reports basic app status and Cosmos DB connectivity.
 *
 * @returns {object} Service metadata, timestamp, and Cosmos health details.
 */
app.get('/api/health', async (request, response) => {
  const cosmos = await checkCosmosAvailability();

  response.json({
    service: 'rideau-canal-dashboard',
    status: cosmos.available ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    cosmos,
    monitoredLocations: LOCATIONS,
  });
});

/**
 * GET /api/latest
 * Returns the newest aggregation record for each monitored location.
 *
 * @returns {object} Latest location list, missing locations, and a response timestamp.
 */
app.get('/api/latest', async (request, response) => {
  try {
    const latestRecords = await readLatestForAllLocations();
    const availableLocations = latestRecords.map((record) => record.location);
    const missingLocations = LOCATIONS.filter(
      (location) => !availableLocations.includes(location)
    );

    response.json({
      locations: latestRecords,
      missingLocations,
      message: latestRecords.length
        ? undefined
        : 'No aggregation data found yet for the monitored locations.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    sendDataErrorResponse(response, error);
  }
});

/**
 * GET /api/history
 * Returns the last hour of history for one monitored location.
 *
 * @param {string} request.query.location Required location name.
 * @returns {object} Location name, lower-bound timestamp, point count, and history points.
 */
app.get('/api/history', async (request, response) => {
  const location = request.query.location;

  if (!location) {
    return response.status(400).json({
      error: 'BadRequest',
      message: 'The "location" query parameter is required.',
      supportedLocations: LOCATIONS,
    });
  }

  if (!LOCATIONS.includes(location)) {
    return response.status(400).json({
      error: 'BadRequest',
      message: 'Unsupported location. Use one of the monitored locations.',
      supportedLocations: LOCATIONS,
    });
  }

  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  try {
    const points = await readHistoryForLocation(location, sinceIso);

    response.json({
      location,
      since: sinceIso,
      count: points.length,
      points,
      message: points.length
        ? undefined
        : 'No history found for the selected location in the last hour.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    sendDataErrorResponse(response, error);
  }
});

/**
 * GET /api/summary
 * Returns the overall dashboard status based on the latest available records.
 *
 * @returns {object} Overall status, per-status counts, missing locations, and timestamps.
 */
app.get('/api/summary', async (request, response) => {
  try {
    const latestRecords = await readLatestForAllLocations();
    const counts = getStatusCounts(latestRecords);
    const latestWindowEnd = latestRecords.reduce((currentLatest, record) => {
      if (!record.windowEnd) {
        return currentLatest;
      }

      if (!currentLatest || record.windowEnd > currentLatest) {
        return record.windowEnd;
      }

      return currentLatest;
    }, null);

    response.json({
      overallStatus: getOverallStatus(latestRecords),
      counts,
      availableLocations: latestRecords.length,
      missingLocations: LOCATIONS.filter(
        (location) => !latestRecords.some((record) => record.location === location)
      ),
      latestWindowEnd,
      monitoredLocations: LOCATIONS,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    sendDataErrorResponse(response, error);
  }
});

/**
 * Fallback handler for unknown API routes under `/api`.
 *
 * @returns {object} Standard 404 API error response.
 */
app.use('/api', (request, response) => {
  response.status(404).json({
    error: 'NotFound',
    message: 'API endpoint not found.',
  });
});

app.listen(PORT, () => {
  console.log(`Rideau Canal dashboard server listening on port ${PORT}`);
});
