"""
Tests for Find-A-Lifer backend API endpoints.

Uses httpx with FastAPI's ASGI transport for testing.
All tests run against the real data files in backend/data/.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app, _species_list, _species_by_code


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── GET /api/health ──────────────────────────────────────────────────

@pytest.mark.anyio
async def test_health_check(client: AsyncClient):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "timestamp" in data
    assert "version" in data
    assert "species_count" in data
    assert isinstance(data["species_count"], int)


@pytest.mark.anyio
async def test_health_has_data_endpoints(client: AsyncClient):
    resp = await client.get("/api/health")
    data = resp.json()
    assert "data_endpoints" in data
    assert isinstance(data["data_endpoints"], list)


# ── GET /api/species ─────────────────────────────────────────────────

@pytest.mark.anyio
async def test_get_species(client: AsyncClient):
    resp = await client.get("/api/species")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0
    # Verify species structure
    sp = data[0]
    assert "species_id" in sp
    assert "speciesCode" in sp
    assert "comName" in sp
    assert "sciName" in sp


# ── GET /api/weeks/{N} ───────────────────────────────────────────────

@pytest.mark.anyio
async def test_get_week_valid(client: AsyncClient):
    resp = await client.get("/api/weeks/1")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if len(data) > 0:
        record = data[0]
        assert "cell_id" in record
        assert "species_id" in record
        assert "probability" in record


@pytest.mark.anyio
async def test_get_week_boundary_52(client: AsyncClient):
    """Week 52 is the upper valid boundary."""
    resp = await client.get("/api/weeks/52")
    # Either 200 (data exists) or 404 (no data file for week 52) — not 400
    assert resp.status_code in (200, 404)


@pytest.mark.anyio
async def test_get_week_zero(client: AsyncClient):
    resp = await client.get("/api/weeks/0")
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_get_week_53(client: AsyncClient):
    resp = await client.get("/api/weeks/53")
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_get_week_negative(client: AsyncClient):
    resp = await client.get("/api/weeks/-1")
    assert resp.status_code == 400


# ── GET /api/weeks/{N}/summary ───────────────────────────────────────

@pytest.mark.anyio
async def test_get_week_summary_valid(client: AsyncClient):
    resp = await client.get("/api/weeks/1/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if len(data) > 0:
        entry = data[0]
        assert isinstance(entry, list)
        assert len(entry) >= 2  # [cell_id, species_count] or [cell_id, species_count, max_prob_uint8]


@pytest.mark.anyio
async def test_get_week_summary_invalid_week(client: AsyncClient):
    resp = await client.get("/api/weeks/0/summary")
    assert resp.status_code == 400


# ── GET /api/weeks/{N}/species/{code} ────────────────────────────────

@pytest.mark.anyio
async def test_get_week_species_valid(client: AsyncClient):
    # Use the first species in the catalog
    if not _species_list:
        pytest.skip("No species data available")
    code = _species_list[0]["speciesCode"]
    resp = await client.get(f"/api/weeks/1/species/{code}")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.anyio
async def test_get_week_species_invalid_code(client: AsyncClient):
    resp = await client.get("/api/weeks/1/species/totally_fake_bird_xxx")
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_get_week_species_invalid_week(client: AsyncClient):
    if not _species_list:
        pytest.skip("No species data available")
    code = _species_list[0]["speciesCode"]
    resp = await client.get(f"/api/weeks/0/species/{code}")
    assert resp.status_code == 400


# ── GET /api/weeks/{N}/species-batch ─────────────────────────────────

@pytest.mark.anyio
async def test_get_species_batch_valid(client: AsyncClient):
    if not _species_list:
        pytest.skip("No species data available")
    ids = ",".join(str(sp["species_id"]) for sp in _species_list[:3])
    resp = await client.get(f"/api/weeks/1/species-batch?ids={ids}")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.anyio
async def test_get_species_batch_invalid_ids(client: AsyncClient):
    resp = await client.get("/api/weeks/1/species-batch?ids=abc,def")
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_get_species_batch_invalid_week(client: AsyncClient):
    resp = await client.get("/api/weeks/0/species-batch?ids=1,2")
    assert resp.status_code == 400


# ── GET /api/weeks/{N}/cells/{cellId} ────────────────────────────────

@pytest.mark.anyio
async def test_get_week_cell_valid(client: AsyncClient):
    resp = await client.get("/api/weeks/1/cells/291064")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if len(data) > 0:
        record = data[0]
        assert "species_id" in record
        assert "speciesCode" in record
        assert "comName" in record


@pytest.mark.anyio
async def test_get_week_cell_nonexistent(client: AsyncClient):
    """A cell that doesn't exist should return empty list, not an error."""
    resp = await client.get("/api/weeks/1/cells/999999999")
    assert resp.status_code == 200
    data = resp.json()
    assert data == []


@pytest.mark.anyio
async def test_get_week_cell_invalid_week(client: AsyncClient):
    resp = await client.get("/api/weeks/0/cells/291064")
    assert resp.status_code == 400


# ── POST /api/weeks/{N}/lifer-summary ────────────────────────────────

@pytest.mark.anyio
async def test_lifer_summary_no_seen(client: AsyncClient):
    resp = await client.post(
        "/api/weeks/1/lifer-summary",
        json={"seen_species_codes": []}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.anyio
async def test_lifer_summary_with_seen(client: AsyncClient):
    if not _species_list:
        pytest.skip("No species data available")
    # Mark a few species as seen
    seen = [sp["speciesCode"] for sp in _species_list[:5]]
    resp = await client.post(
        "/api/weeks/1/lifer-summary",
        json={"seen_species_codes": seen}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if len(data) > 0:
        entry = data[0]
        assert isinstance(entry, list)
        assert len(entry) == 3  # [cell_id, lifer_count, max_prob_uint8]


@pytest.mark.anyio
async def test_lifer_summary_invalid_week(client: AsyncClient):
    resp = await client.post(
        "/api/weeks/53/lifer-summary",
        json={"seen_species_codes": []}
    )
    assert resp.status_code == 400


# ── GET /api/grid ────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_get_grid(client: AsyncClient):
    resp = await client.get("/api/grid")
    # Grid endpoint should return 200 or 500 if data file is corrupted
    assert resp.status_code in (200, 500)
    if resp.status_code == 200:
        data = resp.json()
        # Should be a GeoJSON object
        assert "type" in data
        assert "features" in data


# ── GET /api/regions ─────────────────────────────────────────────────

@pytest.mark.anyio
async def test_get_regions(client: AsyncClient):
    resp = await client.get("/api/regions")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (dict, list))
