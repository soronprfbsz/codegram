"""POST /api/introspect: connect to an external DB and return DDL (ADR-0008).

The reflection call is sync, so it runs in a threadpool (anyio.to_thread) to
keep the event loop free. Domain errors map to safe HTTP responses; raw driver
exceptions are never surfaced. Credentials in the body are used once. Every
endpoint authenticates via require_password_ok.
"""
import anyio
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.permissions import require_password_ok
from app.models.user import User
from app.schemas.introspect import (
    IntrospectRequest,
    IntrospectResponse,
    SchemaListResponse,
)
from app.services.introspect import (
    ConnectionFailedError,
    NoTablesFoundError,
    introspect_to_ddl,
    list_schemas,
)

router = APIRouter(prefix="/introspect", tags=["introspect"])


@router.post("", response_model=IntrospectResponse)
async def introspect(
    payload: IntrospectRequest,
    user: User = Depends(require_password_ok),
) -> IntrospectResponse:
    """Introspect the target DB and return DDL + the @dbml/core import dialect."""
    try:
        result = await anyio.to_thread.run_sync(
            introspect_to_ddl, payload, abandon_on_cancel=True
        )
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


@router.post("/schemas", response_model=SchemaListResponse)
async def schemas(
    payload: IntrospectRequest,
    user: User = Depends(require_password_ok),
) -> SchemaListResponse:
    """List selectable schemas for the target DB (PostgreSQL; MariaDB → [])."""
    try:
        names = await anyio.to_thread.run_sync(
            list_schemas, payload, abandon_on_cancel=True
        )
    except ConnectionFailedError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from None
    return SchemaListResponse(schemas=names)
