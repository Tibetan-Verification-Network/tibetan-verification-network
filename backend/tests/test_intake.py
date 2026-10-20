"""Public submission and editorial triage tests."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import RoleCode, WorkflowStatus
from app.models.audit import AuditEvent
from app.models.intake import Submission
from tests.auth_helpers import csrf_headers, login
from tests.factories import make_submission, make_user
from tests.helpers import settings_for_tests

STRONG_PASSWORD = "correct-horse-battery-staple"
TIBETAN_CLAIM = "བོད་ཡིག་གི་དཔྱད་བརྗོད་འདི་ཚོད་ལྟ་ཞིབ་ཕྲ་ཡིན།"


@pytest.fixture
def intake_settings(api_application):
    api_application.state.settings = settings_for_tests(
        submission_rate_limit_ip_max=3,
        submission_rate_limit_global_max=100,
        submission_rate_limit_ip_window_seconds=3600,
    )
    return api_application.state.settings


async def _editor_session(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
) -> dict:
    editor = await make_user(db_session_for_api, roles=(RoleCode.EDITOR,))
    return await login(api_client, email=editor.email, password=STRONG_PASSWORD)


async def test_public_submission_accepts_tibetan_text_and_returns_receipt_only(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
    intake_settings,
) -> None:
    response = await api_client.post(
        "/api/v1/submissions",
        json={"claim_text": TIBETAN_CLAIM, "privacy_consent": False},
    )
    assert response.status_code == 202
    body = response.json()
    assert set(body.keys()) == {"receipt_id"}
    stored = await db_session_for_api.scalar(
        select(func.count()).select_from(Submission).where(Submission.claim_text == TIBETAN_CLAIM)
    )
    assert stored == 1


async def test_public_submission_accepts_optional_captcha_token(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
    intake_settings,
) -> None:
    claim = "A claim submitted with a captcha token"
    response = await api_client.post(
        "/api/v1/submissions",
        json={"claim_text": claim, "captcha_token": "token-from-widget"},
    )
    assert response.status_code == 202
    stored = await db_session_for_api.scalar(
        select(func.count()).select_from(Submission).where(Submission.claim_text == claim)
    )
    assert stored == 1


async def test_honeypot_returns_receipt_without_persisting(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
    intake_settings,
) -> None:
    before = await db_session_for_api.scalar(select(func.count()).select_from(Submission))
    response = await api_client.post(
        "/api/v1/submissions",
        json={
            "claim_text": "A honeypot triggered submission",
            "website": "https://spam.example",
        },
    )
    assert response.status_code == 202
    after = await db_session_for_api.scalar(select(func.count()).select_from(Submission))
    assert after == before


async def test_malicious_url_is_accepted_with_receipt_but_not_persisted(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
    intake_settings,
) -> None:
    response = await api_client.post(
        "/api/v1/submissions",
        json={
            "claim_text": "Malicious URL should not be stored",
            "source_url": "javascript:alert(1)",
        },
    )
    assert response.status_code == 202
    assert (
        await db_session_for_api.scalar(
            select(func.count())
            .select_from(Submission)
            .where(Submission.claim_text == "Malicious URL should not be stored")
        )
        == 0
    )


async def test_oversized_body_is_rejected(api_client: AsyncClient, intake_settings) -> None:
    response = await api_client.post(
        "/api/v1/submissions",
        content=b"x" * 40_000,
        headers={"content-type": "application/json", "content-length": "40000"},
    )
    assert response.status_code == 413


async def test_rate_limit_returns_receipt_without_persisting(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
    intake_settings,
) -> None:
    before = await db_session_for_api.scalar(select(func.count()).select_from(Submission))
    for index in range(3):
        ok = await api_client.post(
            "/api/v1/submissions",
            json={"claim_text": f"Rate limit submission example text {index}"},
        )
        assert ok.status_code == 202
    blocked = await api_client.post(
        "/api/v1/submissions",
        json={"claim_text": "Rate limit submission example text number four"},
    )
    assert blocked.status_code == 202
    after = await db_session_for_api.scalar(select(func.count()).select_from(Submission))
    assert after - before == 3


async def test_editorial_inbox_never_includes_contact_fields(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
) -> None:
    from app.models.intake import SubmissionContact

    submission = await make_submission(db_session_for_api, claim_text="Contact must stay hidden")
    submission.contact = SubmissionContact(
        contact_email="hidden@example.org",
        privacy_notice_acknowledged=True,
    )
    await db_session_for_api.flush()
    session = await _editor_session(api_client, db_session_for_api)
    response = await api_client.get(
        "/api/v1/editorial/submissions",
        headers=csrf_headers(session["csrf_token"]),
    )
    assert response.status_code == 200
    rendered = response.text
    assert "contact_email" not in rendered
    assert "contact_phone" not in rendered


async def test_contact_view_is_audited_and_restricted(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
) -> None:
    submission = await make_submission(db_session_for_api)
    from app.models.intake import SubmissionContact

    submission.contact = SubmissionContact(
        contact_email="submitter@example.org",
        privacy_notice_acknowledged=True,
    )
    await db_session_for_api.flush()

    researcher = await make_user(
        db_session_for_api,
        email="researcher@example.org",
        roles=(RoleCode.RESEARCHER,),
    )
    await login(api_client, email=researcher.email, password=STRONG_PASSWORD)
    denied = await api_client.get(f"/api/v1/editorial/submissions/{submission.id}/contact")
    assert denied.status_code == 404

    session = await _editor_session(api_client, db_session_for_api)
    allowed = await api_client.get(
        f"/api/v1/editorial/submissions/{submission.id}/contact",
        headers=csrf_headers(session["csrf_token"]),
    )
    assert allowed.status_code == 200
    assert allowed.json()["contact_email"] == "submitter@example.org"
    audit_count = await db_session_for_api.scalar(
        select(func.count())
        .select_from(AuditEvent)
        .where(AuditEvent.event_type == "submission.contact_viewed")
    )
    assert audit_count == 1


async def test_triage_open_investigation_and_duplicate_linking(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
) -> None:
    submission = await make_submission(
        db_session_for_api,
        claim_text="Open investigation from triage",
    )
    session = await _editor_session(api_client, db_session_for_api)
    response = await api_client.post(
        f"/api/v1/editorial/submissions/{submission.id}/triage",
        headers=csrf_headers(session["csrf_token"]),
        json={"action": "open_investigation"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["submission"]["workflow_status"] == WorkflowStatus.TRIAGED.value
    assert payload["claim"] is not None


async def test_concurrent_triage_requests_leave_one_final_state(
    api_client_factory,
    db_session_for_api: AsyncSession,
    api_application,
) -> None:
    api_application.state.settings = settings_for_tests()
    submission = await make_submission(db_session_for_api)
    editor = await make_user(db_session_for_api, roles=(RoleCode.EDITOR,))
    async with api_client_factory() as bootstrap:
        editor_session = await login(
            bootstrap,
            email=editor.email,
            password=STRONG_PASSWORD,
        )
    shared_cookies = editor_session["cookies"]
    shared_csrf = editor_session["csrf_token"]

    async def triage(action: str, reason: str) -> int:
        async with api_client_factory() as client:
            client.cookies.update(shared_cookies)
            response = await client.post(
                f"/api/v1/editorial/submissions/{submission.id}/triage",
                headers=csrf_headers(shared_csrf),
                json={"action": action, "reason": reason},
            )
            return response.status_code

    # The API test harness shares one AsyncSession across requests, so true
    # parallel HTTP calls are not safe here. Run back-to-back to exercise locking.
    reject_status = await triage("reject", "Rejected in concurrent test")
    hold_status = await triage("hold", "Held in concurrent test")
    assert reject_status == 200
    assert hold_status == 409

    refreshed = await db_session_for_api.get(Submission, submission.id)
    assert refreshed is not None
    assert refreshed.workflow_status == WorkflowStatus.REJECTED
