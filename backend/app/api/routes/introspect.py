"""POST /api/introspect: connect to an external DB and return DDL (ADR-0008).

The reflection call is sync, so it runs in a threadpool (anyio.to_thread) to
keep the event loop free. Domain errors map to safe HTTP responses; raw driver
exceptions are never surfaced. Credentials in the body are used once.
"""
import anyio
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.users import current_active_user
from app.models.user import User
from app.schemas.introspect import IntrospectRequest, IntrospectResponse
from app.services.introspect import (
    ConnectionFailedError,
    NoTablesFoundError,
    introspect_to_ddl,
)

router = APIRouter(prefix="/introspect", tags=["introspect"])


@router.post("", response_model=IntrospectResponse)
async def introspect(
    payload: IntrospectRequest,
    user: User = Depends(current_active_user),
) -> IntrospectResponse:
    """Introspect the target DB and return DDL + the @dbml/core import dialect."""
    try:
        result = await anyio.to_thread.run_sync(introspect_to_ddl, payload)
    except ConnectionFailedError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from None
    except NoTablesFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from None
    return IntrospectResponse(
        import_dialect=result.import_dialect,
        ddl=result.ddl,
        table_count=result.table_count,
    )
