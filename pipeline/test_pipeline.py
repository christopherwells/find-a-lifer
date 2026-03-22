#!/usr/bin/env python3
"""
Unit tests for Find-A-Lifer pipeline pure computation functions.

Run: python -m pytest pipeline/test_pipeline.py -v
Or:  python pipeline/test_pipeline.py
"""

import math
import sys
from pathlib import Path

# Add pipeline dir to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import SUB_REGIONS, STATE_TO_REGION, OCEAN_FAMILIES, RESOLUTIONS_ALL


# ── common.py tests ──────────────────────────────────────────────────

class TestSubRegions:
    def test_17_sub_regions(self):
        assert len(SUB_REGIONS) == 17

    def test_every_sub_region_has_name_codes_bbox(self):
        for key, (name, codes, bbox) in SUB_REGIONS.items():
            assert isinstance(name, str) and len(name) > 0, f"{key} missing name"
            assert isinstance(codes, set) and len(codes) > 0, f"{key} missing codes"
            assert isinstance(bbox, list) and len(bbox) == 4, f"{key} missing bbox"
            west, south, east, north = bbox
            assert south < north, f"{key} bbox south >= north"

    def test_no_duplicate_state_codes(self):
        all_codes = []
        for _, (_, codes, _) in SUB_REGIONS.items():
            all_codes.extend(codes)
        assert len(all_codes) == len(set(all_codes)), "Duplicate state codes across sub-regions"

    def test_state_to_region_covers_all_codes(self):
        for region_id, (_, codes, _) in SUB_REGIONS.items():
            for code in codes:
                assert code in STATE_TO_REGION, f"{code} not in STATE_TO_REGION"
                assert STATE_TO_REGION[code] == region_id, f"{code} maps to wrong region"

    def test_us_states_count(self):
        us_codes = [c for c in STATE_TO_REGION if c.startswith("US-")]
        assert len(us_codes) == 51, f"Expected 51 US state codes (50 + DC), got {len(us_codes)}"

    def test_hawaii_separate(self):
        assert STATE_TO_REGION["US-HI"] == "us-hi"
        assert STATE_TO_REGION["US-AK"] == "ca-west"


class TestOceanFamilies:
    def test_has_expected_families(self):
        expected = {"Albatrosses", "Loons", "Grebes", "Pelicans", "Gulls, Terns, and Skimmers"}
        assert expected.issubset(OCEAN_FAMILIES)

    def test_no_passerines(self):
        passerines = {"Tyrant Flycatchers", "New World Warblers", "Tanagers and Allies"}
        assert OCEAN_FAMILIES.isdisjoint(passerines)

    def test_count(self):
        assert len(OCEAN_FAMILIES) == 18


class TestResolutions:
    def test_three_resolutions(self):
        assert RESOLUTIONS_ALL == [2, 3, 4]


# ── compute_difficulty.py tests ──────────────────────────────────────

from compute_difficulty import (
    compute_species_metrics,
    score_to_rating,
    jenks_breaks_10,
)


class TestComputeSpeciesMetrics:
    def test_widespread_common_species(self):
        """A species in many cells with high frequency should have low difficulty."""
        cell_data = {}
        checklists = {}
        for cell_id in range(100):
            cell_data[cell_id] = {w: 80 for w in range(1, 53)}
            checklists[cell_id] = {w: 100 for w in range(1, 53)}
        metrics = compute_species_metrics(1, cell_data, checklists, total_cells=200)
        assert metrics is not None
        assert metrics["numCells"] == 100
        assert metrics["avgFreq"] > 0.5

    def test_rare_species(self):
        """A species in few cells with low frequency."""
        cell_data = {0: {26: 1}}
        checklists = {0: {26: 50}}
        metrics = compute_species_metrics(1, cell_data, checklists, total_cells=10000)
        assert metrics is not None
        assert metrics["numCells"] == 1
        assert metrics["avgFreq"] < 0.1

    def test_no_data_returns_none(self):
        metrics = compute_species_metrics(1, {}, {}, total_cells=100)
        assert metrics is None


class TestScoreToRating:
    def test_boundaries(self):
        # 11 thresholds: boundaries for 10 bins [min, b1, b2, ..., b9, max]
        thresholds = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        assert score_to_rating(5, thresholds) == 1   # below first break
        assert score_to_rating(15, thresholds) == 2   # between 10 and 20
        assert score_to_rating(95, thresholds) == 10  # above last break

    def test_exact_boundary(self):
        thresholds = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        # score < thresholds[d+1] — so score=10 is NOT < 10, falls through to rating 2
        assert score_to_rating(10, thresholds) == 2

    def test_zero(self):
        thresholds = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        assert score_to_rating(0, thresholds) == 1


class TestJenksBreaks:
    def test_returns_11_boundaries(self):
        """Jenks returns 11 boundaries (10 bins): [min, b1, ..., b9, max]."""
        values = list(range(100))
        breaks = jenks_breaks_10(values)
        assert len(breaks) == 11

    def test_sorted_ascending(self):
        values = [1, 5, 10, 20, 50, 80, 90, 95, 100] * 10
        breaks = jenks_breaks_10(values)
        for i in range(len(breaks) - 1):
            assert breaks[i] <= breaks[i + 1], f"Breaks not sorted: {breaks}"

    def test_fallback_to_deciles(self):
        """With few values, should still return 11 boundaries."""
        values = [10, 20, 30, 40, 50]
        breaks = jenks_breaks_10(values)
        assert len(breaks) == 11


# ── compute_species_habitat.py tests ─────────────────────────────────

from compute_species_habitat import (
    WATER_ASSOCIATED_FAMILIES,
    WATER_FAMILY_FRESHWATER_THRESHOLD,
    WATER_FAMILY_OCEAN_THRESHOLD,
    FOREST_THRESHOLD,
    NON_FOREST_THRESHOLDS,
)


class TestHabitatThresholds:
    def test_non_forest_thresholds_cover_key_habitats(self):
        labels = {t[0] for t in NON_FOREST_THRESHOLDS}
        expected = {"Freshwater", "Ocean", "Wetland", "Grassland", "Agricultural", "Scrubland"}
        for name in expected:
            assert name in labels, f"Missing threshold for {name}"

    def test_water_families_is_set(self):
        assert isinstance(WATER_ASSOCIATED_FAMILIES, (set, frozenset))
        assert "Ducks, Geese, and Waterfowl" in WATER_ASSOCIATED_FAMILIES

    def test_water_thresholds_lower_than_defaults(self):
        for label, key, default_thresh in NON_FOREST_THRESHOLDS:
            if key == "water":
                assert WATER_FAMILY_FRESHWATER_THRESHOLD < default_thresh, \
                    f"Water family freshwater threshold should be lower than default {default_thresh}"
            elif key == "ocean":
                assert WATER_FAMILY_OCEAN_THRESHOLD <= default_thresh, \
                    f"Water family ocean threshold should be <= default {default_thresh}"

    def test_forest_threshold_positive(self):
        assert 0 < FOREST_THRESHOLD <= 1


# ── Overrides files tests ────────────────────────────────────────────

import json


class TestOverridesFiles:
    def test_conservation_overrides_valid(self):
        path = Path(__file__).parent / "reference" / "conservation_overrides.json"
        data = json.loads(path.read_text())
        valid_statuses = {"LC", "NT", "VU", "EN", "CR"}
        assert len(data) > 0, "conservation_overrides.json is empty"
        for code, status in data.items():
            # Format: {"scientific name": "LC"} — flat string value
            assert isinstance(status, str), f"{code} value should be a string, got {type(status)}"
            assert status in valid_statuses, f"{code} has invalid status: {status}"

    def test_difficulty_overrides_valid(self):
        path = Path(__file__).parent / "reference" / "difficulty_overrides.json"
        data = json.loads(path.read_text())
        assert len(data) > 0, "difficulty_overrides.json is empty"
        for code, entry in data.items():
            # Format: {"code": {difficultyScore: N, difficultyRating: N}}
            assert "difficultyScore" in entry, f"{code} missing 'difficultyScore'"
            assert 0 <= entry["difficultyScore"] <= 100, f"{code} score out of range"
            assert "difficultyRating" in entry, f"{code} missing 'difficultyRating'"
            assert 1 <= entry["difficultyRating"] <= 10, f"{code} rating out of range"

    def test_conservation_overrides_count(self):
        path = Path(__file__).parent / "reference" / "conservation_overrides.json"
        data = json.loads(path.read_text())
        assert len(data) >= 149, f"Expected at least 149 overrides, got {len(data)}"

    def test_difficulty_overrides_count(self):
        path = Path(__file__).parent / "reference" / "difficulty_overrides.json"
        data = json.loads(path.read_text())
        assert len(data) >= 88, f"Expected at least 88 overrides, got {len(data)}"


# ── Run tests ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
