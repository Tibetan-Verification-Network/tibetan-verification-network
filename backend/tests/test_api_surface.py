"""Phase 1B must not expose editorial CRUD endpoints."""

from httpx import AsyncClient


async def test_openapi_has_no_editorial_record_routes(client: AsyncClient) -> None:
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    forbidden_fragments = (
        "/submissions",
        "/factchecks",
        "/fact-checks",
        "/investigations",
        "/archive",
    )
    allowed_editorial_paths = {"/api/v1/editorial/status"}
    for path in paths:
        for fragment in forbidden_fragments:
            assert fragment not in path
        if "/editorial" in path:
            assert path in allowed_editorial_paths
