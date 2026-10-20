"""Guardrails on which editorial routes exist in each phase."""

from httpx import AsyncClient

ALLOWED_PUBLIC_PATHS = {
    "/api/v1/submissions",
    "/api/v1/factchecks",
    "/api/v1/factchecks/{slug}",
    "/api/v1/factchecks/{slug}/versions/{version_number}",
    "/api/v1/topics",
    "/api/v1/topics/{slug}",
}
ALLOWED_EDITORIAL_PATHS = {
    "/api/v1/editorial/approval-queue",
    "/api/v1/editorial/audit",
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
    "/api/v1/investigations/{investigation_id}/evidence/{evidence_id}/verify",
    "/api/v1/investigations/{investigation_id}/documents",
    "/api/v1/investigations/{investigation_id}/factcheck",
}
ALLOWED_FACTCHECK_EDITORIAL_PATHS = {
    "/api/v1/editorial/factchecks",
    "/api/v1/editorial/approval-queue",
    "/api/v1/editorial/factchecks/{fact_check_id}",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/sources",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/preview",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/revisions",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/readiness",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/submit-for-review",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/reviews",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/request-changes",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/mark-ready",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/approve",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/reopen",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/publish",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/corrections",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/withdraw",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/versions",
    "/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/versions/{version_number}",
    "/api/v1/editorial/factchecks/{fact_check_id}/topics",
}
ALLOWED_EDITORIAL_TOPIC_PATHS = {
    "/api/v1/editorial/topics",
    "/api/v1/editorial/topics/{topic_id}",
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
    forbidden_fragments = ("/fact-checks",)
    for path in paths:
        for fragment in forbidden_fragments:
            assert fragment not in path
        if path in ALLOWED_PUBLIC_PATHS:
            continue
        if path == "/api/v1/editorial/approval-queue":
            continue
        if "/editorial/factchecks" in path:
            assert path in ALLOWED_FACTCHECK_EDITORIAL_PATHS
            continue
        if "/editorial/topics" in path:
            assert path in ALLOWED_EDITORIAL_TOPIC_PATHS
            continue
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
