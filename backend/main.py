"""
Find-A-Lifer Backend Server
============================
Lightweight FastAPI server that serves pre-processed static JSON data files
and provides API endpoints for the Find-A-Lifer birding application.
"""

import os
import json
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

# Data directory - relative to this file
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"

app = FastAPI(
    title="Find-A-Lifer API",
    description="Backend API for the Find-A-Lifer birding application",
    version="1.0.0",
)

# CORS middleware for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_available_data_endpoints() -> list[str]:
    """Scan the data directory and return available data endpoints."""
    endpoints = []

    # Check for species metadata
    if (DATA_DIR / "species.json").exists():
        endpoints.append("/api/species")

    # Check for grid data
    if (DATA_DIR / "grid.geojson").exists():
        endpoints.append("/api/grid")

    # Check for regions data
    if (DATA_DIR / "regions.geojson").exists():
        endpoints.append("/api/regions")

    # Check for weekly occurrence files
    weeks_dir = DATA_DIR / "weeks"
    if weeks_dir.exists():
        week_files = sorted(weeks_dir.glob("week_*.json"))
        if week_files:
            week_numbers = []
            for wf in week_files:
                try:
                    num = int(wf.stem.split("_")[1])
                    week_numbers.append(num)
                except (IndexError, ValueError):
                    pass
            if week_numbers:
                endpoints.append(f"/api/weeks/:weekNumber (weeks {min(week_numbers)}-{max(week_numbers)})")

    return endpoints


@app.get("/api/health")
async def health_check():
    """Health check endpoint that reports server status and available data."""
    available_endpoints = get_available_data_endpoints()
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0",
        "data_endpoints": available_endpoints,
    }


@app.get("/api/species")
async def get_species():
    """Return the full species metadata JSON."""
    species_file = DATA_DIR / "species.json"
    if not species_file.exists():
        raise HTTPException(status_code=404, detail="Species data not found")
    with open(species_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


@app.get("/api/weeks/{week_number}")
async def get_week(week_number: int):
    """Return weekly occurrence data for the given week number (1-52)."""
    if week_number < 1 or week_number > 52:
        raise HTTPException(status_code=400, detail="Week number must be between 1 and 52")
    week_file = DATA_DIR / "weeks" / f"week_{week_number:02d}.json"
    if not week_file.exists():
        raise HTTPException(status_code=404, detail=f"Data for week {week_number} not found")
    with open(week_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


@app.get("/api/grid")
async def get_grid():
    """Return grid cell geometry data (GeoJSON)."""
    grid_file = DATA_DIR / "grid.geojson"
    if not grid_file.exists():
        raise HTTPException(status_code=404, detail="Grid data not found")
    with open(grid_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


@app.get("/api/regions")
async def get_regions():
    """Return region polygons and species-region mappings."""
    regions_file = DATA_DIR / "regions.geojson"
    if not regions_file.exists():
        raise HTTPException(status_code=404, detail="Regions data not found")
    with open(regions_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


# Mount static data directory for direct file access
if DATA_DIR.exists():
    app.mount("/data", StaticFiles(directory=str(DATA_DIR)), name="data")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
