"""Declarative base and metadata registry for Alembic autogenerate."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared ORM base. Import all mapped classes before running Alembic."""

    pass
