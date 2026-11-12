#!/usr/bin/env python3
"""Seed deterministic published content for the Playwright public flows (dev and CI only).

It drives the real editorial workflow in-process (draft, review, approval, publish, withdraw),
so the data is exactly what the public API would serve in production. Run from `backend/`
against a migrated database, with the dev dependency group installed:

    uv run python scripts/seed_e2e.py

Seeded topics (all active, for public browse and submit): `environment`, `human-rights`,
`history-and-culture`, `health-and-medicine`, `misinformation-and-media`, `politics-and-governance`.

Seeded fact-checks (all slugs start with `e2e-`):

* `e2e-river`      published in English and Tibetan, topic "environment"
* `e2e-pending`    published in English; the Tibetan translation is marked pending
* `e2e-withdrawn`  published in English, then withdrawn with a public notice

Running it again is safe: slugs that already exist are skipped.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.security import CSRF_HEADER_NAME
from app.db.enums import RoleCode
from app.db.session import create_engine, create_session_factory, session_scope
from app.main import create_app
from app.models.identity import User
from app.models.publication import FactCheck
from app.models.research import EvidenceItem, Source
from app.storage.memory import InMemoryStorage
from tests.factories import make_investigation, make_user

PASSWORD = "correct-horse-battery-staple"
AUTHOR_EMAIL = "e2e-author@example.org"
EDITOR_EMAIL = "e2e-editor@example.org"
APPROVER_EMAIL = "e2e-approver@example.org"


@dataclass(frozen=True)
class Article:
    title: str
    summary: str | None
    claim: str
    context: str
    verdict: str
    explanation: str
    analysis: str
    limitations: str


RIVER_EN = Article(
    title="E2E river flow claim",
    summary="A post says the river stops flowing every winter.",
    claim="The river stops flowing every winter.",
    context="The post circulated in a community group in December.",
    verdict="false",
    explanation="Gauge records show continuous flow in every month.",
    analysis="Gauge data from 2015 to 2025 shows flow in **every** month.",
    limitations="Only one gauge station was available.",
)
RIVER_BO = Article(
    title="ཆུ་མཐོ་འཐུང་རྟག་པར་སྐམ་གྲང་ངམ།",
    summary="ཆུ་མཐོ་འཐུང་རྟག་པར་སྐམ་གྲང་ཞེས་འཕྲིན་ཡིག་ཅིག་ལ་བཤད་འདུག",
    claim="ཆུ་མཐོ་འཐུང་རྟག་པར་སྐམ།",
    context="འཕྲིན་ཡིག་འདི་ཟླ་བ་བཅུ་གཉིས་པར་སྤེལ།",
    verdict="false",
    explanation="ཆུ་ཚད་ཀྱི་ཟིན་ཐོས་ཟླ་བ་རེ་རེར་རྒྱུན་མཐུད་ཡོད།",
    analysis="ལོ་ ༢༠༡༥ ནས་ ༢༠༢༥ བར་གྱི་ཆུ་ཚད་ཀྱི་གཞི་གྲངས་ལྟར་ཟླ་བ་རེ་རེར་ཆུ་འབབ་ཡོད།",
    limitations="ཆུ་ཚད་ལ་ཞིབ་བཤེར་བྱེད་ས་གཅིག་ཁོ་ན་ཡོད།",
)
PENDING_EN = Article(
    title="E2E claim awaiting translation",
    summary="A claim whose Tibetan translation is still pending.",
    claim="The bridge was rebuilt last year.",
    context="Seen in a regional news roundup.",
    verdict="misleading",
    explanation="The bridge was repaired, not rebuilt.",
    analysis="Public works records describe a repair of the deck.",
    limitations="Records for one season are missing.",
)
WITHDRAWN_EN = Article(
    title="E2E withdrawn claim",
    summary="This fact-check was later withdrawn.",
    claim="The festival was cancelled.",
    context="Reported in a social media thread.",
    verdict="unverified",
    explanation="No reliable confirmation was found.",
    analysis="The only source was later retracted.",
    limitations="The original poster could not be reached.",
)

# Active public browse topics for e2e and local submit/search dropdowns.
SEED_TOPICS: tuple[dict[str, Any], ...] = (
    {
        "slug": "environment",
        "name_en": "Environment",
        "name_bo": "ཁོར་ཡུག",
        "description_en": "Claims about land, water, and climate.",
        "description_bo": None,
        "position": 1,
    },
    {
        "slug": "human-rights",
        "name_en": "Human rights",
        "name_bo": "མིའི་ཐོབ་ཐང་",
        "description_en": (
            "Claims about detention, freedom of expression, religious practice, "
            "and other human-rights issues."
        ),
        "description_bo": (
            "བཙུན་གནས་དང་ཞལ་གྱི་རང་དབང་། ཆོས་ལུགས་གྱི་སྤྱོད་པ། "
            "མིའི་ཐོབ་ཐང་གི་གླེང་གཞི་འདྲི་བརྩད་ཀྱི་ཁོངས་སུ་གཏོགས་པ།"
        ),
        "position": 2,
    },
    {
        "slug": "history-and-culture",
        "name_en": "History and culture",
        "name_bo": "ལོ་རྒྱུས་དང་རིག་གནས་",
        "description_en": "Claims about Tibetan history, language, arts, and cultural heritage.",
        "description_bo": "བོད་ཀྱི་ལོ་རྒྱུས་དང་སྐད་ཡིག་། སྒྱུ་རྩལ་དང་རིག་གནས་ཀྱི་ཤ་ཚུགས་སྐོར་གྱི་གླེང་གཞི།",
        "position": 3,
    },
    {
        "slug": "health-and-medicine",
        "name_en": "Health and medicine",
        "name_bo": "བདེ་ཐང་དང་སྨན་བཅོས་",
        "description_en": (
            "Claims about disease outbreaks, vaccines, traditional medicine, and public health policy."
        ),
        "description_bo": (
            "ནད་ཡམས། འབུ་སྨན། གསོ་རིག་སོགས་དམངས་ཁམས་ཀྱི་བདེ་ཐང་སྲིད་བྱུས་སྐོར་གྱི་གླེང་གཞི།"
        ),
        "position": 4,
    },
    {
        "slug": "misinformation-and-media",
        "name_en": "Misinformation and media",
        "name_bo": "ཡན་ལག་བརྙན་འཕྲིན་དང་ཆ་འཕྲིན་ཡང་དག་མིན་",
        "description_en": (
            "Viral posts, doctored images or video, impersonation, and coordinated online campaigns."
        ),
        "description_bo": (
            "ཡར་ཁ་སིམ། བཟོ་བཅོས་བྱས་པའི་པར་རིས་དང་བརྙན་ཟློས། སྒེར་མིང་བཟུང་བ། "
            "གྲོགས་པོ་མང་པོས་མཉམ་དུ་སྤེལ་བའི་དྲ་ཐོག་བརྙན་འཕྲིན་སོགས།"
        ),
        "position": 5,
    },
    {
        "slug": "politics-and-governance",
        "name_en": "Politics and governance",
        "name_bo": "ཆབ་སྲིད་དང་སྲིད་འཛིན་",
        "description_en": (
            "Claims about officials, laws, elections, borders, and government statements."
        ),
        "description_bo": (
            "དཔོན་རིགས། ཁྲིམས་ལུགས། འོས་བླངས། མཐའ་འཁོར། "
            "གཞུང་གི་གསུང་བཤད་སོགས་སྐོར་གྱི་གླེང་གཞི།"
        ),
        "position": 6,
    },
)


class Seeder:
    """Calls the in-process API as the seeded staff users, with cookies and CSRF per user."""

    def __init__(
        self,
        app: FastAPI,
        factory: async_sessionmaker[AsyncSession],
        origin: str,
    ) -> None:
        self.factory = factory
        self.origin = origin
        self._transport = ASGITransport(app=app)
        self._clients: dict[str, AsyncClient] = {}
        self._csrf: dict[str, str] = {}

    async def ensure_user(self, email: str, role: RoleCode, display_name: str) -> User:
        async with session_scope(self.factory) as session:
            existing = await session.scalar(select(User).where(User.email_normalized == email))
            if existing is not None:
                # Distinct names let the editorial UI tell the three staff apart.
                existing.display_name = display_name
                return existing
            return await make_user(
                session,
                email=email,
                roles=(role,),
                password=PASSWORD,
                display_name=display_name,
            )

    async def login(self, email: str) -> None:
        client = AsyncClient(transport=self._transport, base_url="http://seed.local")
        response = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": PASSWORD}
        )
        response.raise_for_status()
        self._csrf[email] = response.json()["csrf_token"]
        self._clients[email] = client

    async def aclose(self) -> None:
        for client in self._clients.values():
            await client.aclose()

    async def call(self, email: str, method: str, path: str, **kwargs: Any) -> Any:
        response = await self._clients[email].request(
            method,
            path,
            headers={CSRF_HEADER_NAME: self._csrf[email], "Origin": self.origin},
            **kwargs,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"{method} {path} -> {response.status_code}: {response.text}")
        return response.json() if response.content else None


async def _run() -> None:
    settings = get_settings()
    engine = create_engine(settings.database_url.get_secret_value())
    factory = create_session_factory(engine)
    app = create_app(settings)
    app.state.db_engine = engine
    app.state.db_session_factory = factory
    app.state.object_storage = InMemoryStorage()
    origin = settings.cors_origins[0] if settings.cors_origins else "http://localhost:5173"

    seeder = Seeder(app, factory, origin)
    try:
        await _seed(seeder, factory)
    finally:
        await seeder.aclose()
        await engine.dispose()


async def _seed(seeder: Seeder, factory: async_sessionmaker[AsyncSession]) -> None:
    author = await seeder.ensure_user(AUTHOR_EMAIL, RoleCode.RESEARCHER, "E2E Author")
    await seeder.ensure_user(EDITOR_EMAIL, RoleCode.EDITOR, "E2E Editor")
    approver = await seeder.ensure_user(APPROVER_EMAIL, RoleCode.APPROVER, "E2E Approver")
    for email in (AUTHOR_EMAIL, EDITOR_EMAIL, APPROVER_EMAIL):
        await seeder.login(email)

    topic_id = await _ensure_topic(seeder)

    await _publish_article(
        seeder,
        factory,
        author=author,
        approver=approver,
        slug="e2e-river",
        topic_id=topic_id,
        languages={"en": RIVER_EN, "bo": RIVER_BO},
    )
    await _publish_article(
        seeder,
        factory,
        author=author,
        approver=approver,
        slug="e2e-pending",
        topic_id=None,
        languages={"en": PENDING_EN},
        pending_translation="bo",
    )
    fact_check_id = await _publish_article(
        seeder,
        factory,
        author=author,
        approver=approver,
        slug="e2e-withdrawn",
        topic_id=None,
        languages={"en": WITHDRAWN_EN},
    )
    if fact_check_id is not None:
        await seeder.call(
            APPROVER_EMAIL,
            "POST",
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/withdraw",
            json={
                "public_notice": "Withdrawn because the only source was retracted.",
                "internal_reason": "Seeded e2e withdrawal",
            },
        )
    topic_slugs = ", ".join(item["slug"] for item in SEED_TOPICS)
    print(f"Seeded topics: {topic_slugs}")
    print("Seeded e2e fact-checks: e2e-river, e2e-pending, e2e-withdrawn")


async def _ensure_topic(seeder: Seeder) -> str:
    by_slug = await _ensure_topics(seeder)
    try:
        return by_slug["environment"]
    except KeyError as exc:
        raise RuntimeError("environment topic missing after seed") from exc


async def _ensure_topics(seeder: Seeder) -> dict[str, str]:
    """Create missing seed topics; return slug -> id for each configured topic."""
    listing = await seeder.call(EDITOR_EMAIL, "GET", "/api/v1/editorial/topics")
    by_slug = {topic["slug"]: str(topic["id"]) for topic in listing["items"]}
    for spec in SEED_TOPICS:
        slug = spec["slug"]
        if slug in by_slug:
            continue
        payload = {key: value for key, value in spec.items() if value is not None}
        created = await seeder.call(
            EDITOR_EMAIL,
            "POST",
            "/api/v1/editorial/topics",
            json=payload,
        )
        by_slug[slug] = str(created["id"])
    return by_slug


async def _publish_article(
    seeder: Seeder,
    factory: async_sessionmaker[AsyncSession],
    *,
    author: User,
    approver: User,
    slug: str,
    topic_id: str | None,
    languages: dict[str, Article],
    pending_translation: str | None = None,
) -> str | None:
    async with session_scope(factory) as session:
        if await session.scalar(select(FactCheck.id).where(FactCheck.public_slug == slug)):
            print(f"{slug}: already seeded, skipping")
            return None
        investigation = await make_investigation(session, owner=author)
        investigation_id = investigation.id

    created = await seeder.call(
        AUTHOR_EMAIL,
        "POST",
        f"/api/v1/investigations/{investigation_id}/factcheck",
        json={"languages": ["en", "bo"]},
    )
    fact_check_id = created["id"]
    await seeder.call(
        AUTHOR_EMAIL,
        "PATCH",
        f"/api/v1/editorial/factchecks/{fact_check_id}",
        json={"public_slug": slug},
    )
    if topic_id is not None:
        await seeder.call(
            EDITOR_EMAIL,
            "PUT",
            f"/api/v1/editorial/factchecks/{fact_check_id}/topics",
            json={"topic_ids": [topic_id]},
        )

    async with session_scope(factory) as session:
        source = Source(
            investigation_id=investigation_id,
            title="Primary source",
            publisher="Seeded Publisher",
            url="https://example.org/report",
            created_by_id=author.id,
        )
        session.add(source)
        await session.flush()
        evidence = EvidenceItem(
            investigation_id=investigation_id,
            source_id=source.id,
            excerpt="Verified quote",
        )
        session.add(evidence)
        await session.flush()
        source_id, evidence_id = source.id, evidence.id

    await seeder.call(
        AUTHOR_EMAIL,
        "POST",
        f"/api/v1/investigations/{investigation_id}/evidence/{evidence_id}/verify",
    )
    # The approver must be assigned to the investigation before approving.
    await seeder.call(
        EDITOR_EMAIL,
        "POST",
        f"/api/v1/investigations/{investigation_id}/assignments",
        json={"user_id": str(approver.id), "assignment_role": "contributor"},
    )

    for language, article in languages.items():
        path = f"/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}"
        await seeder.call(
            AUTHOR_EMAIL,
            "PATCH",
            path,
            json={
                "expected_revision": 0,
                "title": article.title,
                "summary": article.summary,
                "claim_text": article.claim,
                "context_text": article.context,
                "verdict": article.verdict,
                "verdict_explanation": article.explanation,
                "analysis_markdown": article.analysis,
                "limitations_markdown": article.limitations,
                "translation_status": "unavailable",
            },
        )
        sources = await seeder.call(
            AUTHOR_EMAIL,
            "PUT",
            f"{path}/sources",
            json={
                "items": [
                    {"source_id": str(source_id), "relevance_note": "Primary data", "position": 0}
                ]
            },
        )
        await seeder.call(AUTHOR_EMAIL, "POST", f"{path}/submit-for-review")
        await seeder.call(EDITOR_EMAIL, "POST", f"{path}/mark-ready")
        await seeder.call(
            APPROVER_EMAIL,
            "POST",
            f"{path}/approve",
            json={"expected_revision": sources["current_revision_number"]},
        )
        await seeder.call(APPROVER_EMAIL, "POST", f"{path}/publish", json={})

    if pending_translation is not None:
        await seeder.call(
            AUTHOR_EMAIL,
            "PATCH",
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/{pending_translation}",
            json={"expected_revision": 0, "translation_status": "pending"},
        )
    return str(fact_check_id)


def main() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    main()
