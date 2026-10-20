"""Guardrails on which editorial routes exist in each phase."""

from httpx import AsyncClient

ALLOWED_PUBLIC_PATHS = {
    "/api/v1/submissions",
}
ALLOWED_EDITORIAL_PATHS = {
    "/api/v1/editorial/status",
    "/api/v1/editorial/submissions",
    "/api/v1/editorial/submissions/{submission_id}",
    "/api/v1/editorial/submissions/{submission_id}/contact",
    "/api/v1/editorial/submissions/{submission_id}/triage",
    "/api/v1/editorial/claims",
    "/api/v1/editorial/claims/{claim_id}",
}
ALLOWED_INVESTIGATION_PATHS = {
    "/api/v1/investigations",
    "/api/v1/investigations/{investigation_id}",
    "/api/v1/investigations/{investigation_id}/status",
    "/api/v1/investigations/{investigation_id}/assignments",
    "/api/v1/investigations/{investigation_id}/assignments/{user_id}",
    "/api/v1/investigations/{investigation_id}/sources",
    "/api/v1/investigations/{investigation_id}/sources/reorder",
    "/api/v1/investigations/{investigation_id}/sources/{source_id}",
    "/api/v1/investigations/{investigation_id}/evidence",
    "/api/v1/investigations/{investigation_id}/evidence/reorder",
    "/api/v1/investigations/{investigation_id}/evidence/{evidence_id}",
    "/api/v1/investigations/{investigation_id}/documents",
}
ALLOWED_ARCHIVE_PATHS = {
    "/api/v1/archive/documents",
    "/api/v1/archive/documents/{document_id}",
    "/api/v1/archive/documents/{document_id}/classification",
    "/api/v1/archive/documents/{document_id}/grants",
    "/api/v1/archive/documents/{document_id}/grants/{user_id}",
    "/api/v1/archive/documents/{document_id}/access-link",
}


async def test_openapi_editorial_surface_matches_phase_two(client: AsyncClient) -> None:
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    forbidden_fragments = (
        "/factchecks",
        "/fact-checks",
    )
    for path in paths:
        for fragment in forbidden_fragments:
            assert fragment not in path
        if path in ALLOWED_PUBLIC_PATHS:
            continue
        if "/editorial" in path:
            assert path in ALLOWED_EDITORIAL_PATHS
        if "/archive" in path:
            assert path in ALLOWED_ARCHIVE_PATHS
        if "/investigations" in path:
            assert path in ALLOWED_INVESTIGATION_PATHS
        if "/submissions" in path:
            assert path in ALLOWED_PUBLIC_PATHS or path in ALLOWED_EDITORIAL_PATHS
