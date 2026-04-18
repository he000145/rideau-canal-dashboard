# API Documentation

This file documents the dashboard API exposed by the Express backend.

All responses below are examples only.

## Base URL

```text
http://localhost:3000
```

## `GET /api/health`

### Purpose

Returns a simple health check for the web app and Cosmos DB connectivity status.

### Example Request

```http
GET /api/health
```

### Example Response

```json
{
  "service": "rideau-canal-dashboard",
  "status": "ok",
  "timestamp": "2026-04-18T18:35:59.559Z",
  "cosmos": {
  "configured": true,
  "available": true,
  "message": "Cosmos DB connection successful."
  },
  "monitoredLocations": [
  "Dow's Lake",
  "Fifth Avenue",
  "NAC"
  ]
}
```

## `GET /api/latest`

### Purpose

Returns the most recent aggregation record for each of the three monitored locations.

### Example Request

```http
GET /api/latest
```

### Example Response

```json
{
  "locations": [
    {
      "id": "Dow's Lake-1776537300",
      "location": "Dow's Lake",
      "windowStart": null,
      "windowEnd": "2026-04-18T18:30:00.0000000Z",
      "avgIceThicknessCm": 35.01625,
      "minIceThicknessCm": 34.88,
      "maxIceThicknessCm": 35.14,
      "avgSurfaceTemperatureC": -10.837499999999999,
      "minSurfaceTemperatureC": -11.29,
      "maxSurfaceTemperatureC": -9.9,
      "maxSnowAccumulationCm": 6.39,
      "avgExternalTemperatureC": -10.847500000000002,
      "readingCount": 8,
      "safetyStatus": "Safe"
    },
    {
      "id": "Fifth Avenue-1776537300",
      "location": "Fifth Avenue",
      "windowStart": null,
      "windowEnd": "2026-04-18T18:30:00.0000000Z",
      "avgIceThicknessCm": 31.46375,
      "minIceThicknessCm": 31.35,
      "maxIceThicknessCm": 31.55,
      "avgSurfaceTemperatureC": -8.7975,
      "minSurfaceTemperatureC": -8.96,
      "maxSurfaceTemperatureC": -8.25,
      "maxSnowAccumulationCm": 5.44,
      "avgExternalTemperatureC": -8.955,
      "readingCount": 8,
      "safetyStatus": "Safe"
    },
    {
      "id": "NAC-1776537300",
      "location": "NAC",
      "windowStart": null,
      "windowEnd": "2026-04-18T18:30:00.0000000Z",
      "avgIceThicknessCm": 29.0075,
      "minIceThicknessCm": 29,
      "maxIceThicknessCm": 29.02,
      "avgSurfaceTemperatureC": -6.08125,
      "minSurfaceTemperatureC": -6.18,
      "maxSurfaceTemperatureC": -5.99,
      "maxSnowAccumulationCm": 3.78,
      "avgExternalTemperatureC": -6.4025,
      "readingCount": 8,
      "safetyStatus": "Caution"
    }
  ],
  "missingLocations": [],
  "timestamp": "2026-04-18T18:36:25.330Z"
}
```

## `GET /api/history?location=Dow%27s%20Lake`

### Purpose
Returns the last hour of historical aggregation data for one location, sorted by `windowEnd` ascending.

### Example Request

```http
GET /api/history?location=Dow%27s%20Lake
```

### Example Response

```json
{
  "location": "Dow's Lake",
  "since": "2026-04-18T17:37:27.853Z",
  "count": 1,
  "points": [
    {
      "id": "Dow's Lake-1776537300",
      "location": "Dow's Lake",
      "windowStart": null,
      "windowEnd": "2026-04-18T18:30:00.0000000Z",
      "avgIceThicknessCm": 35.01625,
      "minIceThicknessCm": 34.88,
      "maxIceThicknessCm": 35.14,
      "avgSurfaceTemperatureC": -10.837499999999999,
      "minSurfaceTemperatureC": -11.29,
      "maxSurfaceTemperatureC": -9.9,
      "maxSnowAccumulationCm": 6.39,
      "avgExternalTemperatureC": -10.847500000000002,
      "readingCount": 8,
      "safetyStatus": "Safe"
    }
  ],
  "timestamp": "2026-04-18T18:37:27.977Z"
}
```

## `GET /api/summary`

### Purpose
Returns an overall dashboard summary calculated from the latest records.

### Example Request

```http
GET /api/summary
```

### Example Response

```json
{
  "overallStatus": "Caution",
  "counts": {
    "safe": 2,
    "caution": 1,
    "unsafe": 0,
    "unknown": 0
  },
  "availableLocations": 3,
  "missingLocations": [],
  "latestWindowEnd": "2026-04-18T18:30:00.0000000Z",
  "monitoredLocations": [
    "Dow's Lake",
    "Fifth Avenue",
    "NAC"
  ],
  "timestamp": "2026-04-18T18:37:54.887Z"
}
```

## Error Response Example

If Cosmos DB is missing or unavailable, the API returns a clear JSON error.

### Example Response

```json
{
  "error": "DataUnavailable",
  "message": "Cosmos DB is not configured. Set COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE_ID, and COSMOS_CONTAINER_ID.",
  "details": null,
  "timestamp": "2026-04-17T20:00:05.000Z"
}
```
