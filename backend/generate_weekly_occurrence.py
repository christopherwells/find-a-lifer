"""
Generate weekly occurrence data for the Find-A-Lifer application.

Uses the real species metadata (2,490 species from eBird taxonomy + avibase)
and the existing grid cells to create 52 weekly occurrence files with
realistic seasonal variation patterns.

Since we don't have actual eBird Status & Trends raster data available,
this generates simulated occurrence probabilities that follow realistic
ecological patterns:
- Migratory species appear/disappear with seasons
- Resident species are present year-round
- Geographic variation based on latitude/longitude
- Species abundance varies by region and season
"""

import json
import math
import random
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
WEEKS_DIR = DATA_DIR / "weeks"

# Ensure directory exists
WEEKS_DIR.mkdir(parents=True, exist_ok=True)


def load_species():
    """Load the real species metadata."""
    species_file = DATA_DIR / "species.json"
    if not species_file.exists():
        raise FileNotFoundError(
            "species.json not found. Run build_species_metadata.py first."
        )
    with open(species_file, "r", encoding="utf-8") as f:
        return json.load(f)


def load_grid():
    """Load grid cell data."""
    grid_file = DATA_DIR / "grid.geojson"
    if not grid_file.exists():
        raise FileNotFoundError(
            "grid.geojson not found. Run generate_sample_data.py for grid first."
        )
    with open(grid_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    cells = []
    for feature in data["features"]:
        props = feature["properties"]
        cells.append({
            "cell_id": props["cell_id"],
            "center_lat": props["center_lat"],
            "center_lng": props["center_lng"],
        })
    return cells


def assign_species_patterns(species_list):
    """
    Assign ecological behavior patterns to each species.
    Uses species metadata to make reasonable assignments.
    """
    random.seed(42)  # Reproducible
    patterns = {}

    for sp in species_list:
        sid = sp["species_id"]
        difficulty = sp.get("difficultyScore", 0.5)
        is_restricted = sp.get("isRestrictedRange", False)
        invasion = sp.get("invasionStatus", "Native")

        # Determine seasonal behavior pattern
        # ~40% resident, ~30% summer breeder, ~15% winter visitor, ~15% migrant
        r = random.random()
        if invasion == "Rare/Accidental":
            pattern_type = "rare"
        elif is_restricted:
            pattern_type = "restricted"
        elif r < 0.40:
            pattern_type = "resident"
        elif r < 0.70:
            pattern_type = "summer_breeder"
        elif r < 0.85:
            pattern_type = "winter_visitor"
        else:
            pattern_type = "passage_migrant"

        # Assign base probability based on difficulty (easy=higher prob, hard=lower)
        base_prob = max(0.05, min(0.85, 1.0 - difficulty))

        # Assign geographic range center (where the species is most likely found)
        # Use taxon order to spread species across geography
        range_lat = random.uniform(28, 48)
        range_lng = random.uniform(-120, -70)
        range_radius = random.uniform(5, 25)  # degrees
        if is_restricted:
            range_radius = random.uniform(3, 8)

        # Assign number of cells this species occupies (rarer = fewer cells)
        if invasion == "Rare/Accidental":
            max_cells_frac = 0.02
        elif is_restricted:
            max_cells_frac = random.uniform(0.03, 0.15)
        elif difficulty > 0.8:
            max_cells_frac = random.uniform(0.05, 0.25)
        elif difficulty > 0.5:
            max_cells_frac = random.uniform(0.15, 0.50)
        else:
            max_cells_frac = random.uniform(0.30, 0.80)

        patterns[sid] = {
            "type": pattern_type,
            "base_prob": base_prob,
            "range_lat": range_lat,
            "range_lng": range_lng,
            "range_radius": range_radius,
            "max_cells_frac": max_cells_frac,
        }

    return patterns


def get_season_factor(week, pattern_type):
    """Get seasonal presence multiplier for a given week and pattern type."""
    # Convert week to approximate month-like cycle
    # Week 1 = early Jan, Week 26 = late June, Week 52 = late Dec
    angle = 2 * math.pi * (week - 1) / 52

    if pattern_type == "resident":
        # Present year-round with slight winter dip
        return 0.8 + 0.2 * math.cos(angle - math.pi)  # peaks in summer

    elif pattern_type == "summer_breeder":
        # Present roughly weeks 14-40 (April-October)
        # Peak in June-July (weeks 22-30)
        summer_center = 26  # late June
        dist = min(abs(week - summer_center), 52 - abs(week - summer_center))
        if dist > 18:
            return 0.0  # absent in winter
        elif dist > 12:
            return 0.3  # arriving/departing
        else:
            return 0.7 + 0.3 * math.cos(2 * math.pi * dist / 24)

    elif pattern_type == "winter_visitor":
        # Present roughly weeks 40-52 and 1-14 (Oct-March)
        winter_center = 1  # early Jan (wraps around)
        dist = min(abs(week - winter_center), abs(week - 53))
        if dist > 20:
            return 0.0
        elif dist > 14:
            return 0.3
        else:
            return 0.7 + 0.3 * math.cos(2 * math.pi * dist / 28)

    elif pattern_type == "passage_migrant":
        # Brief peaks in spring (weeks 14-22) and fall (weeks 34-42)
        spring_dist = min(abs(week - 18), 52 - abs(week - 18))
        fall_dist = min(abs(week - 38), 52 - abs(week - 38))
        spring_factor = max(0, 1.0 - spring_dist / 6) if spring_dist < 6 else 0
        fall_factor = max(0, 1.0 - fall_dist / 6) if fall_dist < 6 else 0
        return max(spring_factor, fall_factor)

    elif pattern_type == "rare":
        # Extremely sparse, random weeks
        return 0.1  # very low but occasionally present

    elif pattern_type == "restricted":
        # Present year-round in restricted range
        return 0.6 + 0.2 * math.cos(angle - math.pi)

    return 0.5


def distance_degrees(lat1, lng1, lat2, lng2):
    """Simple Euclidean distance in degrees (approximate for N America)."""
    return math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2)


def generate_all_weeks(species_list, cells, patterns):
    """Generate all 52 weekly occurrence files."""
    random.seed(123)  # Reproducible but different from pattern assignment

    num_cells = len(cells)
    print(f"Generating weekly data for {len(species_list)} species across {num_cells} cells...")

    for week in range(1, 53):
        records = []

        for sp in species_list:
            sid = sp["species_id"]
            pat = patterns[sid]

            # Get seasonal factor
            season = get_season_factor(week, pat["type"])
            if season < 0.05:
                continue  # Species absent this week

            # Determine which cells this species occupies this week
            max_cells = max(1, int(num_cells * pat["max_cells_frac"] * season))

            # Score cells by distance from species range center
            cell_scores = []
            for cell in cells:
                dist = distance_degrees(
                    cell["center_lat"], cell["center_lng"],
                    pat["range_lat"], pat["range_lng"]
                )
                # Gaussian-like falloff from range center
                score = math.exp(-0.5 * (dist / pat["range_radius"]) ** 2)
                # Add small random noise
                score *= random.uniform(0.7, 1.3)
                cell_scores.append((cell["cell_id"], score))

            # Sort by score and take top cells
            cell_scores.sort(key=lambda x: -x[1])
            selected_cells = cell_scores[:max_cells]

            for cell_id, score in selected_cells:
                # Probability = base_prob * season * geographic_score
                prob = pat["base_prob"] * season * min(score, 1.0)
                # Add noise
                prob *= random.uniform(0.6, 1.4)
                prob = round(max(0.001, min(0.999, prob)), 4)
                records.append({
                    "cell_id": cell_id,
                    "species_id": sid,
                    "probability": prob,
                })

        # Write week file
        week_file = WEEKS_DIR / f"week_{week:02d}.json"
        with open(week_file, "w", encoding="utf-8") as f:
            json.dump(records, f)

        unique_species = len(set(r["species_id"] for r in records))
        print(f"  Week {week:02d}: {len(records)} records, {unique_species} species")

    print("Done! Generated 52 weekly occurrence files.")


def main():
    print("Generating weekly occurrence data from real species metadata...")
    species_list = load_species()
    print(f"Loaded {len(species_list)} species from species.json")

    cells = load_grid()
    print(f"Loaded {len(cells)} grid cells from grid.geojson")

    patterns = assign_species_patterns(species_list)
    generate_all_weeks(species_list, cells, patterns)


if __name__ == "__main__":
    main()
