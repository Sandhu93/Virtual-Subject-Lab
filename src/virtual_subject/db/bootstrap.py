from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from virtual_subject.config import get_settings
from virtual_subject.db import models as _models  # noqa: F401
from virtual_subject.db.models import Project, User
from virtual_subject.db.session import Base, engine
from virtual_subject.domain.utils import new_id


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def ensure_defaults(db: Session) -> tuple[User, Project]:
    settings = get_settings()

    user = db.scalar(select(User).where(User.email == settings.default_user_email))
    if user is None:
        user = User(
            id=new_id("usr"),
            email=settings.default_user_email,
            name=settings.default_user_name,
        )
        db.add(user)
        db.flush()

    project = db.scalar(select(Project).where(Project.owner_user_id == user.id))
    if project is None:
        project = Project(
            id=new_id("prj"),
            owner_user_id=user.id,
            name=settings.default_project_name,
            description="Auto-created default project",
        )
        db.add(project)
        db.flush()

    return user, project
