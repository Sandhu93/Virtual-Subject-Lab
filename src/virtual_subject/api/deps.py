from __future__ import annotations

from collections.abc import Generator

from fastapi import Depends
from sqlalchemy.orm import Session

from virtual_subject.db.session import get_db
from virtual_subject.services.app_service import AppService


def get_service(db: Session = Depends(get_db)) -> Generator[AppService, None, None]:
    yield AppService(db)

