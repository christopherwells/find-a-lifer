import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app


@pytest.fixture
def client():
    """Synchronous test client using httpx."""
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture
async def async_client():
    """Async test client for async test functions."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
