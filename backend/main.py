"""
Find-A-Lifer Backend Server
============================
Lightweight FastAPI server that serves pre-processed static JSON data files
and provides API endpoints for the Find-A-Lifer birding application.

Supports two weekly data formats:
  - Cell-grouped (new): [[cell_id, [species_id_1, species_id_2, ...]], ...]
  - Record-based (old): [{"cell_id": int, "species_id": int, "probability": float}, ...]
"""

import os
import json
from pathlib import Path
from datetime import datetime
from functools import lru_cache

from collections import defaultdict

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
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

# GZip middleware for compressing large JSON responses
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS middleware for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_species_meta():
    """Load species.json and build lookup maps."""
    species_file = DATA_DIR / "species.json"
    if not species_file.exists():
        return [], {}, {}
    with open(species_file, "r", encoding="utf-8") as f:
        species_list = json.load(f)
    by_code = {sp["speciesCode"]: sp for sp in species_list}
    by_id = {sp["species_id"]: sp for sp in species_list}
    return species_list, by_code, by_id


_species_list, _species_by_code, _species_by_id = _load_species_meta()


# Week data cache: week_number -> {"cells": {cell_id: [species_ids]}, "format": str}
_week_cache: dict[int, dict] = {}


def _load_week_data(week_number: int) -> dict | None:
    """Load weekly data and return normalized format.

    Returns dict with:
      "cells": {cell_id: [species_id, ...]}  -- cell-grouped lookup
      "format": "cell_grouped" | "record_based"
    Or None if file not found.
    """
    if week_number in _week_cache:
        return _week_cache[week_number]

    week_file = DATA_DIR / "weeks" / f"week_{week_number:02d}.json"
    if not week_file.exists():
        return None

    with open(week_file, "r", encoding="utf-8") as f:
        raw = json.load(f)

    cells: dict[int, list[int]] = {}

    # Detect format
    if raw and isinstance(raw[0], list):
        # Cell-grouped: [[cell_id, [species_ids]], ...]
        for entry in raw:
            cell_id = entry[0]
            species_ids = entry[1]
            cells[cell_id] = species_ids
        fmt = "cell_grouped"
    elif raw and isinstance(raw[0], dict):
        # Record-based (old): [{"cell_id", "species_id", "probability"}, ...]
        for r in raw:
            cid = r["cell_id"]
            sid = r["species_id"]
            if cid not in cells:
                cells[cid] = []
            cells[cid].append(sid)
        fmt = "record_based"
    else:
        return None

    result = {"cells": cells, "format": fmt}
    _week_cache[week_number] = result
    return result


def get_available_data_endpoints() -> list[str]:
    """Scan the data directory and return available data endpoints."""
    endpoints = []

    if (DATA_DIR / "species.json").exists():
        endpoints.append("/api/species")

    if (DATA_DIR / "grid_27km.geojson").exists():
        endpoints.append("/api/grid (27km)")
    elif (DATA_DIR / "grid.geojson").exists():
        endpoints.append("/api/grid")

    if (DATA_DIR / "regions.geojson").exists():
        endpoints.append("/api/regions")

    weeks_dir = DATA_DIR / "weeks"
    if weeks_dir.exists():
        week_files = sorted(weeks_dir.glob("week_*_summary.json"))
        if not week_files:
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
                endpoints.append("/api/weeks/:weekNumber/summary")
                endpoints.append("/api/weeks/:weekNumber/species/:speciesCode")
                endpoints.append("/api/weeks/:weekNumber/cells/:cellId")

    return endpoints


@app.get("/api/health")
async def health_check():
    """Health check endpoint that reports server status and available data."""
    available_endpoints = get_available_data_endpoints()
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "2.0.0",
        "data_endpoints": available_endpoints,
        "species_count": len(_species_list),
    }


@app.get("/api/species")
async def get_species():
    """Return the full species metadata JSON."""
    if not _species_list:
        raise HTTPException(status_code=404, detail="Species data not found")
    return _species_list


@app.get("/api/weeks/{week_number}/summary")
async def get_week_summary(week_number: int):
    """Return pre-aggregated weekly summary (species count per cell).

    Summary format: array of [cell_id, species_count, max_prob_uint8]
    If no separate summary file exists, computes from main data.
    """
    if week_number < 1 or week_number > 52:
        raise HTTPException(status_code=400, detail="Week number must be between 1 and 52")

    # Try pre-computed summary file first
    summary_file = DATA_DIR / "weeks" / f"week_{week_number:02d}_summary.json"
    if summary_file.exists():
        with open(summary_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data

    # Fall back to computing from main data
    week_data = _load_week_data(week_number)
    if week_data is None:
        raise HTTPException(status_code=404, detail=f"Summary for week {week_number} not found")

    cells = week_data["cells"]
    summary = [[cid, len(sids), 200] for cid, sids in cells.items()]
    return summary


@app.get("/api/weeks/{week_number}")
async def get_week(week_number: int):
    """Return full weekly occurrence data.

    Returns in the old record-based format for backward compatibility:
    [{"cell_id": int, "species_id": int, "probability": float}, ...]
    """
    if week_number < 1 or week_number > 52:
        raise HTTPException(status_code=400, detail="Week number must be between 1 and 52")

    week_data = _load_week_data(week_number)
    if week_data is None:
        raise HTTPException(status_code=404, detail=f"Data for week {week_number} not found")

    # Convert cell-grouped format to flat records for backward compat
    cells = week_data["cells"]
    records = []
    for cid, sids in cells.items():
        for sid in sids:
            records.append({"cell_id": cid, "species_id": sid, "probability": 1.0})
    return records


@app.get("/api/weeks/{week_number}/species/{species_code}")
async def get_week_species(week_number: int, species_code: str):
    """Return occurrence data for a single species in a given week.

    Returns array of {cell_id, probability} records for the species.
    """
    if week_number < 1 or week_number > 52:
        raise HTTPException(status_code=400, detail="Week number must be between 1 and 52")

    species_meta = _species_by_code.get(species_code)
    if not species_meta:
        raise HTTPException(status_code=404, detail=f"Species '{species_code}' not found")
    species_id = species_meta["species_id"]

    week_data = _load_week_data(week_number)
    if week_data is None:
        raise HTTPException(status_code=404, detail=f"Data for week {week_number} not found")

    cells = week_data["cells"]
    records = []
    for cid, sids in cells.items():
        if species_id in sids:
            records.append({"cell_id": cid, "probability": 1.0})
    return records


@app.get("/api/weeks/{week_number}/species-batch")
async def get_week_species_batch(week_number: int, ids: str = Query(..., description="Comma-separated species IDs")):
    """Return occurrence data for multiple species in a given week.

    Query param: ids=33,45,102 (species_id values)
    Returns {species_id: [{cell_id, probability}, ...], ...}
    Used for Goal Birds mode to load multiple species at once.
    """
    if week_number < 1 or week_number > 52:
        raise HTTPException(status_code=400, detail="Week number must be between 1 and 52")

    try:
        species_ids = set(int(x) for x in ids.split(",") if x.strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid species IDs format")

    if len(species_ids) > 500:
        raise HTTPException(status_code=400, detail="Too many species IDs (max 500)")

    week_data = _load_week_data(week_number)
    if week_data is None:
        raise HTTPException(status_code=404, detail=f"Data for week {week_number} not found")

    result: dict[int, list] = {sid: [] for sid in species_ids}
    cells = week_data["cells"]
    for cid, sids in cells.items():
        for sid in sids:
            if sid in species_ids:
                result[sid].append({"cell_id": cid, "probability": 1.0})

    return result


@app.get("/api/weeks/{week_number}/cells/{cell_id}")
async def get_week_cell(week_number: int, cell_id: int):
    """Return all species present in a specific cell for a given week.

    Returns array of {species_id, speciesCode, comName, probability}.
    Used for click-to-inspect popup.
    """
    if week_number < 1 or week_number > 52:
        raise HTTPException(status_code=400, detail="Week number must be between 1 and 52")

    week_data = _load_week_data(week_number)
    if week_data is None:
        raise HTTPException(status_code=404, detail=f"Data for week {week_number} not found")

    cells = week_data["cells"]
    species_ids = cells.get(cell_id, [])

    records = []
    for sid in species_ids:
        sp = _species_by_id.get(sid, {})
        records.append({
            "species_id": sid,
            "speciesCode": sp.get("speciesCode", ""),
            "comName": sp.get("comName", "Unknown"),
            "probability": 1.0,
        })

    # Sort by taxonomic order
    records.sort(key=lambda r: _species_by_id.get(r["species_id"], {}).get("taxonOrder", 99999))
    return records


@app.post("/api/weeks/{week_number}/lifer-summary")
async def get_lifer_summary(week_number: int, request: Request):
    """Return per-cell lifer counts after excluding seen species.

    Accepts JSON body: {"seen_species_codes": ["amerob", "houspa", ...]}
    Returns compact format: [[cell_id, lifer_count, max_prob_uint8], ...]
    """
    if week_number < 1 or week_number > 52:
        raise HTTPException(status_code=400, detail="Week number must be between 1 and 52")

    body = await request.json()
    seen_codes = set(body.get("seen_species_codes", []))

    # Map species codes to IDs for fast lookup
    seen_ids = set()
    for code in seen_codes:
        sp = _species_by_code.get(code)
        if sp:
            seen_ids.add(sp["species_id"])

    week_data = _load_week_data(week_number)
    if week_data is None:
        raise HTTPException(status_code=404, detail=f"Data for week {week_number} not found")

    cells = week_data["cells"]
    result = []
    for cid, sids in cells.items():
        lifer_count = sum(1 for sid in sids if sid not in seen_ids)
        if lifer_count > 0:
            result.append([cid, lifer_count, 200])

    return result


@app.get("/api/grid")
async def get_grid():
    """Return grid cell geometry data (GeoJSON). Prefers 27km resolution grid."""
    grid_file = DATA_DIR / "grid_27km.geojson"
    if not grid_file.exists():
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
