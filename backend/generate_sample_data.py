"""
Generate sample/test data for the Find-A-Lifer application.

Creates sample JSON files that mirror the format expected by the frontend:
- species.json: Species metadata
- grid.geojson: Grid cell geometry
- regions.geojson: Region polygons
- weeks/week_01.json through week_52.json: Weekly occurrence data
"""

import json
import os
import random
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
WEEKS_DIR = DATA_DIR / "weeks"

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
WEEKS_DIR.mkdir(parents=True, exist_ok=True)

# Sample species data (a small subset for testing)
SAMPLE_SPECIES = [
    {
        "species_id": 1,
        "speciesCode": "norcar",
        "comName": "Northern Cardinal",
        "sciName": "Cardinalis cardinalis",
        "familyComName": "Cardinals and Allies",
        "taxonOrder": 1,
        "invasionStatus": "Native",
        "conservStatus": "Least Concern",
        "difficultyScore": 0.15,
        "difficultyLabel": "Easy",
        "isRestrictedRange": False,
        "ebirdUrl": "https://ebird.org/species/norcar",
        "photoUrl": "",
    },
    {
        "species_id": 2,
        "speciesCode": "blujay",
        "comName": "Blue Jay",
        "sciName": "Cyanocitta cristata",
        "familyComName": "Crows, Jays, and Magpies",
        "taxonOrder": 2,
        "invasionStatus": "Native",
        "conservStatus": "Least Concern",
        "difficultyScore": 0.12,
        "difficultyLabel": "Easy",
        "isRestrictedRange": False,
        "ebirdUrl": "https://ebird.org/species/blujay",
        "photoUrl": "",
    },
    {
        "species_id": 3,
        "speciesCode": "baleag",
        "comName": "Bald Eagle",
        "sciName": "Haliaeetus leucocephalus",
        "familyComName": "Hawks, Eagles, and Kites",
        "taxonOrder": 3,
        "invasionStatus": "Native",
        "conservStatus": "Least Concern",
        "difficultyScore": 0.45,
        "difficultyLabel": "Moderate",
        "isRestrictedRange": False,
        "ebirdUrl": "https://ebird.org/species/baleag",
        "photoUrl": "",
    },
    {
        "species_id": 4,
        "speciesCode": "amered",
        "comName": "American Redstart",
        "sciName": "Setophaga ruticilla",
        "familyComName": "New World Warblers",
        "taxonOrder": 4,
        "invasionStatus": "Native",
        "conservStatus": "Least Concern",
        "difficultyScore": 0.55,
        "difficultyLabel": "Moderate",
        "isRestrictedRange": False,
        "ebirdUrl": "https://ebird.org/species/amered",
        "photoUrl": "",
    },
    {
        "species_id": 5,
        "speciesCode": "kirtwa",
        "comName": "Kirtland's Warbler",
        "sciName": "Setophaga kirtlandii",
        "familyComName": "New World Warblers",
        "taxonOrder": 5,
        "invasionStatus": "Native",
        "conservStatus": "Near Threatened",
        "difficultyScore": 0.92,
        "difficultyLabel": "Very Hard",
        "isRestrictedRange": True,
        "ebirdUrl": "https://ebird.org/species/kirtwa",
        "photoUrl": "",
    },
    {
        "species_id": 6,
        "speciesCode": "amegol",
        "comName": "American Goldfinch",
        "sciName": "Spinus tristis",
        "familyComName": "Finches, Euphonias, and Allies",
        "taxonOrder": 6,
        "invasionStatus": "Native",
        "conservStatus": "Least Concern",
        "difficultyScore": 0.10,
        "difficultyLabel": "Easy",
        "isRestrictedRange": False,
        "ebirdUrl": "https://ebird.org/species/amegol",
        "photoUrl": "",
    },
    {
        "species_id": 7,
        "speciesCode": "rethaw",
        "comName": "Red-tailed Hawk",
        "sciName": "Buteo jamaicensis",
        "familyComName": "Hawks, Eagles, and Kites",
        "taxonOrder": 7,
        "invasionStatus": "Native",
        "conservStatus": "Least Concern",
        "difficultyScore": 0.20,
        "difficultyLabel": "Easy",
        "isRestrictedRange": False,
        "ebirdUrl": "https://ebird.org/species/rethaw",
        "photoUrl": "",
    },
    {
        "species_id": 8,
        "speciesCode": "grablo",
        "comName": "Gray Catbird",
        "sciName": "Dumetella carolinensis",
        "familyComName": "Mockingbirds and Thrashers",
        "taxonOrder": 8,
        "invasionStatus": "Native",
        "conservStatus": "Least Concern",
        "difficultyScore": 0.30,
        "difficultyLabel": "Easy",
        "isRestrictedRange": False,
        "ebirdUrl": "https://ebird.org/species/grablo",
        "photoUrl": "",
    },
    {
        "species_id": 9,
        "speciesCode": "pilwoo",
        "comName": "Pileated Woodpecker",
        "sciName": "Dryocopus pileatus",
        "familyComName": "Woodpeckers",
        "taxonOrder": 9,
        "invasionStatus": "Native",
        "conservStatus": "Least Concern",
        "difficultyScore": 0.50,
        "difficultyLabel": "Moderate",
        "isRestrictedRange": False,
        "ebirdUrl": "https://ebird.org/species/pilwoo",
        "photoUrl": "",
    },
    {
        "species_id": 10,
        "speciesCode": "calcon",
        "comName": "California Condor",
        "sciName": "Gymnogyps californianus",
        "familyComName": "New World Vultures",
        "taxonOrder": 10,
        "invasionStatus": "Native",
        "conservStatus": "Critically Endangered",
        "difficultyScore": 0.98,
        "difficultyLabel": "Very Hard",
        "isRestrictedRange": True,
        "ebirdUrl": "https://ebird.org/species/calcon",
        "photoUrl": "",
    },
]


def generate_species_json():
    """Generate species.json metadata file."""
    output_path = DATA_DIR / "species.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(SAMPLE_SPECIES, f, indent=2)
    print(f"Generated {output_path} with {len(SAMPLE_SPECIES)} species")


def generate_grid_geojson():
    """Generate a sample grid.geojson with cells across North America."""
    random.seed(42)

    features = []
    cell_id = 0

    # Generate a grid covering roughly US continental area
    # Lat: 25 to 50, Lng: -125 to -65
    lat_step = 2.0  # ~222km at equator, roughly matching 27km grid at higher resolution
    lng_step = 2.5

    lat = 25.0
    while lat < 50.0:
        lng = -125.0
        while lng < -65.0:
            cell_id += 1
            center_lat = lat + lat_step / 2
            center_lng = lng + lng_step / 2

            feature = {
                "type": "Feature",
                "properties": {
                    "cell_id": cell_id,
                    "center_lat": round(center_lat, 4),
                    "center_lng": round(center_lng, 4),
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [round(lng, 4), round(lat, 4)],
                            [round(lng + lng_step, 4), round(lat, 4)],
                            [round(lng + lng_step, 4), round(lat + lat_step, 4)],
                            [round(lng, 4), round(lat + lat_step, 4)],
                            [round(lng, 4), round(lat, 4)],
                        ]
                    ],
                },
            }
            features.append(feature)
            lng += lng_step
        lat += lat_step

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    output_path = DATA_DIR / "grid.geojson"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f)
    print(f"Generated {output_path} with {len(features)} grid cells")
    return [f["properties"]["cell_id"] for f in features]


def generate_regions_geojson():
    """Generate a sample regions.geojson."""
    regions = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "region_id": "us_northeast",
                    "name": "US Northeast",
                    "species_codes": ["norcar", "blujay", "baleag", "amered", "kirtwa", "amegol", "rethaw", "grablo", "pilwoo"],
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[-80, 37], [-67, 37], [-67, 47], [-80, 47], [-80, 37]]],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "region_id": "us_southeast",
                    "name": "US Southeast",
                    "species_codes": ["norcar", "blujay", "baleag", "amered", "amegol", "rethaw", "grablo", "pilwoo"],
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[-92, 25], [-75, 25], [-75, 37], [-92, 37], [-92, 25]]],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "region_id": "us_west",
                    "name": "US West",
                    "species_codes": ["baleag", "rethaw", "calcon", "amegol", "pilwoo"],
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[-125, 32], [-104, 32], [-104, 49], [-125, 49], [-125, 32]]],
                },
            },
        ],
    }

    output_path = DATA_DIR / "regions.geojson"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(regions, f, indent=2)
    print(f"Generated {output_path} with {len(regions['features'])} regions")


def generate_weekly_data(cell_ids: list[int]):
    """Generate 52 weekly occurrence JSON files."""
    random.seed(42)
    species_ids = [s["species_id"] for s in SAMPLE_SPECIES]

    for week in range(1, 53):
        records = []
        # Simulate seasonal variation
        season_factor = 1.0
        if 12 <= week <= 20:  # Spring migration peak
            season_factor = 1.5
        elif 35 <= week <= 43:  # Fall migration peak
            season_factor = 1.3
        elif 24 <= week <= 32:  # Summer breeding
            season_factor = 1.2
        elif week <= 8 or week >= 46:  # Winter
            season_factor = 0.6

        # For each cell, randomly assign some species with probabilities
        for cell_id in cell_ids:
            num_species = random.randint(
                max(1, int(2 * season_factor)),
                min(len(species_ids), int(6 * season_factor)),
            )
            selected = random.sample(species_ids, num_species)
            for sp_id in selected:
                prob = round(random.uniform(0.01, 0.95) * season_factor, 4)
                prob = min(prob, 1.0)
                records.append(
                    {
                        "cell_id": cell_id,
                        "species_id": sp_id,
                        "probability": prob,
                    }
                )

        week_file = WEEKS_DIR / f"week_{week:02d}.json"
        with open(week_file, "w", encoding="utf-8") as f:
            json.dump(records, f)

    print(f"Generated 52 weekly files in {WEEKS_DIR}")


if __name__ == "__main__":
    print("Generating sample data for Find-A-Lifer...")
    generate_species_json()
    cell_ids = generate_grid_geojson()
    generate_regions_geojson()
    generate_weekly_data(cell_ids)
    print("Done! Sample data generated successfully.")
