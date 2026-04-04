from datetime import datetime
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from models import ChatSession
from schemas import ChatRequest, ChatSessionOut
from services.chat_service import stream_chat, maybe_compact_session

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _find_session(db: Session, scope_type: str, scope_id: str | None) -> ChatSession | None:
    q = db.query(ChatSession).filter(ChatSession.scope_type == scope_type)
    if scope_id:
        q = q.filter(ChatSession.scope_id == scope_id)
    else:
        q = q.filter(ChatSession.scope_id.is_(None))
    return q.first()


def _persist_exchange(db: Session, focus_project_id: str | None, user_msg: str, assistant_msg: str):
    scope_type = "project" if focus_project_id else "portfolio"
    scope_id = focus_project_id

    session = _find_session(db, scope_type, scope_id)
    if not session:
        session = ChatSession(scope_type=scope_type, scope_id=scope_id, messages=[])
        db.add(session)

    # Must reassign (not mutate) for SQLAlchemy JSON change detection
    session.messages = session.messages + [
        {"role": "user", "content": user_msg},
        {"role": "assistant", "content": assistant_msg},
    ]
    session.updated_at = datetime.utcnow()
    db.commit()
    return session


# ── Session endpoints ────────────────────────────────────────────────────────

@router.get("/session")
def get_session(
    scope_type: str = Query(default="portfolio"),
    project_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    session = _find_session(db, scope_type, project_id)
    if not session:
        return JSONResponse(content=None)
    return ChatSessionOut.model_validate(session)


@router.delete("/session", status_code=204)
def clear_session(
    scope_type: str = Query(default="portfolio"),
    project_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    session = _find_session(db, scope_type, project_id)
    if session:
        db.delete(session)
        db.commit()


# ── Streaming chat ───────────────────────────────────────────────────────────

@router.post("")
async def chat(body: ChatRequest, db: Session = Depends(get_db)):
    """
    Streaming chat endpoint. Returns Server-Sent Events.
    Persists the exchange to the session after streaming completes.
    """
    messages = [m.model_dump() for m in body.messages]

    # Extract the last user message for persistence
    user_messages = [m for m in body.messages if m.role == "user"]
    last_user_msg = user_messages[-1].content if user_messages else ""

    collected_chunks: list[str] = []

    async def event_stream():
        async for chunk in stream_chat(db, messages, body.focus_project_id):
            if isinstance(chunk, dict) and chunk.get("type") == "status":
                yield f"event: status\ndata: {chunk['message']}\n\n"
            else:
                collected_chunks.append(chunk)
                yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

        # Persist after stream completes
        full_response = "".join(collected_chunks)
        if last_user_msg and full_response:
            session = _persist_exchange(db, body.focus_project_id, last_user_msg, full_response)
            await maybe_compact_session(db, session)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
