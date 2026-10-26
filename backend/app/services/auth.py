import secrets
import hashlib
from datetime import datetime
from typing import Optional, Tuple
from fastapi import Request, HTTPException, status
from sqlalchemy.orm import Session
from app.models import ApiKey

def hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.strip().encode("utf-8")).hexdigest()

def generate_api_key(name: str) -> Tuple[str, str, str]:
    """Generates (raw_key, key_hash, key_prefix)."""
    random_part = secrets.token_hex(16) # 32 hex chars
    raw_key = f"ak_live_{random_part}"
    key_hash = hash_key(raw_key)
    key_prefix = raw_key[:12] + "..."
    return raw_key, key_hash, key_prefix

def extract_api_key(request: Request) -> Optional[str]:
    """Extracts API key from X-API-Key header, Authorization Bearer, or query param."""
    # 1. Header X-API-Key
    api_key = request.headers.get("x-api-key")
    if api_key:
        return api_key.strip()

    # 2. Authorization header: Bearer <key>
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()

    # 3. Query param ?api_key=...
    query_key = request.query_params.get("api_key")
    if query_key:
        return query_key.strip()

    return None

def validate_client_access(
    request: Request,
    endpoint_slug: str,
    auth_required: bool,
    db: Session
) -> Optional[ApiKey]:
    """Validates access for public endpoint execution. If auth not required, passes."""
    if not auth_required:
        return None

    raw_key = extract_api_key(request)
    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Provide via 'X-API-Key' or 'Authorization: Bearer <key>'."
        )

    hashed = hash_key(raw_key)
    api_key_record = db.query(ApiKey).filter(ApiKey.key_hash == hashed).first()

    if not api_key_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key."
        )

    if not api_key_record.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This API key has been deactivated by administrator."
        )

    # Check allowed slugs
    allowed = (api_key_record.allowed_slugs or "*").split(",")
    allowed = [s.strip() for s in allowed]
    if "*" not in allowed and endpoint_slug not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This API key does not have permission to access endpoint '{endpoint_slug}'."
        )

    # Update stats
    api_key_record.total_requests += 1
    api_key_record.last_used_at = datetime.utcnow()
    db.commit()

    return api_key_record
