# Rideau Canal Skateway Monitoring Dashboard

## 1. Overview

This repository contains the web dashboard application for the CST8916 final project. It reads aggregated sensor data from Azure Cosmos DB and displays current safety conditions and recent trends for three Rideau Canal Skateway monitoring locations:

- Dow's Lake
- Fifth Avenue
- NAC

This repository only contains the dashboard application. It does not include the sensor simulator or the separate documentation repository.

### Dashboard Features

- Express-based backend with REST API endpoints
- Azure Cosmos DB integration using `@azure/cosmos`
- Three location cards showing the latest aggregated conditions
- Safety status badges for each monitored location
- Overall system status summary
- Historical ice thickness trend chart
- Auto-refresh every 30 seconds
- Static frontend served by the same Express app

### Technologies Used

- Node.js
- Express
- Azure Cosmos DB SDK for JavaScript (`@azure/cosmos`)
- HTML
- CSS
- JavaScript
- Chart.js

## 2. Prerequisites

Before running this project, make sure you have:

- Node.js 18 or later
- npm
- An Azure Cosmos DB account
- Access to:
  - Database: `RideauCanalDB`
  - Container: `SensorAggregations`
- Aggregated telemetry data already written to Cosmos DB by the upstream pipeline

## 3. Installation

Clone the repository and install dependencies:

```bash
npm install
```

## 4. Configuration

Create a local environment file based on `.env.example`:

```bash
copy .env.example .env
```

Update `.env` with your Azure Cosmos DB settings:

```env
PORT=3000
COSMOS_ENDPOINT=https://your-cosmos-account.documents.azure.com:443/
COSMOS_KEY=your-cosmos-primary-key
COSMOS_DATABASE_ID=RideauCanalDB
COSMOS_CONTAINER_ID=SensorAggregations
```

### Required Environment Variables

- `PORT`: Local server port
- `COSMOS_ENDPOINT`: Cosmos DB account endpoint
- `COSMOS_KEY`: Cosmos DB access key
- `COSMOS_DATABASE_ID`: Database name
- `COSMOS_CONTAINER_ID`: Container name

### Run Locally

Start the dashboard in development mode:

```bash
npm run dev
```

Start the dashboard in production mode:

```bash
npm start
```

Open in browser:

```text
http://localhost:3000
```

## 5. API Endpoints

### `GET /api/health`

Checks whether the app is running and whether Cosmos DB is reachable.

Example response:

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

### `GET /api/latest`

Returns the most recent aggregation document for each monitored location.

Example response:

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

### `GET /api/history?location=Dow%27s%20Lake`

Returns recent history for one location, sorted by `windowEnd` ascending.

Example response:

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

### `GET /api/summary`

Returns an overall status summary based on the latest records.

Example response:

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

## 6. Deployment to Azure App Service

### Step-by-Step Deployment Guide

1. Create an Azure App Service using a Node.js runtime.
2. Set the startup command to `npm start` if Azure does not detect it automatically.
3. Deploy this repository using one of these methods:
   - GitHub deployment
   - ZIP deployment
   - Local Git
   - Visual Studio Code Azure extension
4. After deployment, restart the App Service.
5. Open the deployed URL and verify that the dashboard loads correctly.

### Configuration Settings

In Azure App Service > Configuration, add these application settings:

- `COSMOS_ENDPOINT`
- `COSMOS_KEY`
- `COSMOS_DATABASE_ID`
- `COSMOS_CONTAINER_ID`

After saving the settings, restart the App Service and verify:

- `/api/health` responds successfully
- the dashboard page loads
- data appears in the location cards and chart

## 7. Dashboard Features

This dashboard includes the required user-facing features:

### Real-Time Updates

- The frontend refreshes data automatically every 30 seconds
- The latest conditions for all three monitored locations are updated from Cosmos DB

### Charts and Visualizations

- A historical ice thickness trend chart is displayed for recent data
- Summary cards provide quick visibility into current conditions

### Safety Status Indicators

- Each location shows a safety badge
- Status values include `Safe`, `Caution`, and `Unsafe`
- The page also shows an overall system status summary

## 8. Troubleshooting

### Missing Environment Variables

If `COSMOS_ENDPOINT` or `COSMOS_KEY` is missing, the API returns a configuration error. Check `.env` locally or App Service Configuration in Azure.

### Cosmos DB Authentication Errors

If the endpoint or key is incorrect, the API may return a data-unavailable response. Verify:
- the endpoint URL
- the access key
- the database name
- the container name

### Empty Data

If the dashboard loads but shows no records:
- confirm that the simulator and Stream Analytics pipeline are writing data to Cosmos DB
- confirm the documents are stored in `RideauCanalDB / SensorAggregations`
- confirm the `location` values match the expected names exactly

### Chart Not Rendering

If the cards load but the chart is empty:
- check that `/api/history` returns points
- confirm the documents include `windowStart`, `windowEnd`, and `avgIceThicknessCm`
- check the browser console for JavaScript errors

