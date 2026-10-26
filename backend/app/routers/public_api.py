import time
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Endpoint, ApiLog
from app.schemas import RunRequest, RunResponse
from app.services.auth import validate_client_access
from app.services.lm_studio import (
    build_messages, execute_chat_completion, execute_chat_stream
)

router = APIRouter(prefix="/api/v1/run", tags=["Public Manual APIs"])

def log_api_call(
    db: Session,
    slug: str,
    api_key_name: Optional[str],
    client_ip: Optional[str],
    status_code: int,
    duration_ms: float,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    stream: bool = False,
    error: Optional[str] = None
):
    try:
        log_entry = ApiLog(
            endpoint_slug=slug,
            api_key_name=api_key_name,
            client_ip=client_ip,
            status_code=status_code,
            duration_ms=duration_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            stream=stream,
            error_message=error
        )
        db.add(log_entry)
        db.commit()
    except Exception:
        db.rollback()

@router.get("/{slug}/info")
def get_endpoint_info(slug: str, db: Session = Depends(get_db)):
    """Returns metadata and usage guidelines for a manual API endpoint."""
    endpoint = db.query(Endpoint).filter(Endpoint.slug == slug).first()
    if not endpoint:
        raise HTTPException(status_code=404, detail=f"Endpoint '{slug}' not found")

    return {
        "name": endpoint.name,
        "slug": endpoint.slug,
        "description": endpoint.description,
        "auth_required": endpoint.auth_required,
        "model": endpoint.model_name or "LM Studio Auto",
        "stream_supported": endpoint.stream_allowed,
        "endpoint_url": f"/api/v1/run/{slug}",
        "openai_compatible_url": f"/api/v1/run/{slug}/chat/completions"
    }

@router.post("/{slug}")
async def run_manual_api(
    slug: str,
    payload: RunRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Main invocation endpoint for custom manual APIs.
    Accepts prompt or messages, streams or returns complete response.
    """
    start_time = time.perf_counter()
    client_ip = request.client.host if request.client else "unknown"

    # 1. Lookup Endpoint
    endpoint = db.query(Endpoint).filter(Endpoint.slug == slug).first()
    if not endpoint:
        log_api_call(db, slug, None, client_ip, 404, 0, error="Endpoint not found")
        raise HTTPException(status_code=404, detail=f"Endpoint '{slug}' not found")

    if not endpoint.is_active:
        log_api_call(db, slug, None, client_ip, 403, 0, error="Endpoint inactive")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"API endpoint '{slug}' is currently disabled by administrator."
        )

    # 2. Authenticate
    api_key_record = validate_client_access(request, slug, endpoint.auth_required, db)
    key_name = api_key_record.name if api_key_record else None

    # 3. Format Messages
    messages_payload = [m.model_dump() for m in payload.messages] if payload.messages else None
    messages = build_messages(
        endpoint=endpoint,
        prompt=payload.prompt,
        messages=messages_payload,
        system_prompt_override=payload.system_prompt
    )

    should_stream = bool(payload.stream and endpoint.stream_allowed)

    # 4. Handle Streaming Response
    if should_stream:
        # Increment request counter
        endpoint.total_requests += 1
        db.commit()

        log_api_call(
            db, slug, key_name, client_ip, 200, 0,
            stream=True
        )

        stream_payload = {
            "messages": messages,
            "temperature": payload.temperature if payload.temperature is not None else endpoint.temperature,
            "max_tokens": payload.max_tokens if payload.max_tokens is not None else endpoint.max_tokens,
            "model": endpoint.model_name,
            "enable_reasoning": payload.enable_reasoning,
            "reasoning": payload.reasoning,
            "include_reasoning": payload.include_reasoning,
            "reasoning_effort": payload.reasoning_effort
        }

        return StreamingResponse(
            execute_chat_stream(endpoint, stream_payload, db),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no"
            }
        )

    # 5. Handle Standard Non-Streaming Response
    try:
        completion_payload = {
            "messages": messages,
            "temperature": payload.temperature if payload.temperature is not None else endpoint.temperature,
            "max_tokens": payload.max_tokens if payload.max_tokens is not None else endpoint.max_tokens,
            "model": endpoint.model_name,
            "enable_reasoning": payload.enable_reasoning,
            "reasoning": payload.reasoning,
            "include_reasoning": payload.include_reasoning,
            "reasoning_effort": payload.reasoning_effort
        }

        result = await execute_chat_completion(endpoint, completion_payload, db)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Update endpoint stats
        endpoint.total_requests += 1
        db.commit()

        # Log entry
        log_api_call(
            db=db,
            slug=slug,
            api_key_name=key_name,
            client_ip=client_ip,
            status_code=200,
            duration_ms=duration_ms,
            prompt_tokens=result.get("usage", {}).get("prompt_tokens", 0),
            completion_tokens=result.get("usage", {}).get("completion_tokens", 0),
            stream=False
        )

        return RunResponse(
            status="success",
            endpoint=slug,
            model=result["model"],
            response=result["response"],
            reasoning=result.get("reasoning"),
            reasoning_enabled=result.get("reasoning_enabled", True),
            usage=result.get("usage", {}),
            duration_ms=duration_ms
        )

    except Exception as e:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        log_api_call(
            db=db,
            slug=slug,
            api_key_name=key_name,
            client_ip=client_ip,
            status_code=500,
            duration_ms=duration_ms,
            error=str(e)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Execution error: {str(e)}"
        )

@router.post("/{slug}/chat/completions")
async def openai_compatible_chat(
    slug: str,
    payload: Dict[str, Any],
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Drop-in OpenAI SDK compatible endpoint:
    from openai import OpenAI
    client = OpenAI(base_url="http://host/api/v1/run/<slug>", api_key="<key>")
    """
    start_time = time.perf_counter()
    client_ip = request.client.host if request.client else "unknown"

    endpoint = db.query(Endpoint).filter(Endpoint.slug == slug).first()
    if not endpoint:
        raise HTTPException(status_code=404, detail=f"Endpoint '{slug}' not found")

    if not endpoint.is_active:
        raise HTTPException(status_code=403, detail=f"Endpoint '{slug}' is disabled")

    api_key_record = validate_client_access(request, slug, endpoint.auth_required, db)
    key_name = api_key_record.name if api_key_record else None

    # System prompt injection if configured
    messages = payload.get("messages", [])
    if endpoint.system_prompt:
        has_system = any(m.get("role") == "system" for m in messages)
        if not has_system:
            messages = [{"role": "system", "content": endpoint.system_prompt}] + messages

    is_stream = bool(payload.get("stream", False) and endpoint.stream_allowed)

    if is_stream:
        endpoint.total_requests += 1
        db.commit()
        log_api_call(db, slug, key_name, client_ip, 200, 0, stream=True)

        return StreamingResponse(
            execute_chat_stream(endpoint, {
                "messages": messages,
                "model": endpoint.model_name or payload.get("model", ""),
                "temperature": payload.get("temperature", endpoint.temperature),
                "max_tokens": payload.get("max_tokens", endpoint.max_tokens),
                "enable_reasoning": payload.get("enable_reasoning"),
                "reasoning": payload.get("reasoning"),
                "include_reasoning": payload.get("include_reasoning"),
                "reasoning_effort": payload.get("reasoning_effort")
            }, db),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
        )

    try:
        result = await execute_chat_completion(endpoint, {
            "messages": messages,
            "model": endpoint.model_name or payload.get("model", ""),
            "temperature": payload.get("temperature", endpoint.temperature),
            "max_tokens": payload.get("max_tokens", endpoint.max_tokens),
            "enable_reasoning": payload.get("enable_reasoning"),
            "reasoning": payload.get("reasoning"),
            "include_reasoning": payload.get("include_reasoning"),
            "reasoning_effort": payload.get("reasoning_effort")
        }, db)

        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        endpoint.total_requests += 1
        db.commit()

        log_api_call(
            db=db,
            slug=slug,
            api_key_name=key_name,
            client_ip=client_ip,
            status_code=200,
            duration_ms=duration_ms,
            prompt_tokens=result.get("usage", {}).get("prompt_tokens", 0),
            completion_tokens=result.get("usage", {}).get("completion_tokens", 0)
        )

        # Return standard OpenAI response shape
        return result.get("raw_response", result)
    except Exception as e:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        log_api_call(db, slug, key_name, client_ip, 500, duration_ms, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
