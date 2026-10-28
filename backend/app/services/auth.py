import secrets
import hashlib
from datetime import datetime
from typing import Optional, Tuple
from fastapi import Request, HTTPException, status, Depends
from sqlalchemy.orm import Session
from app.config import settings
from app.models import ApiKey

def hash_key(raw_key: str) -> str:
    """Computes SHA-256 hash of a raw API key."""
    return hashlib.sha256(raw_key.strip().encode("utf-8")).hexdigest()

def generate_api_key(name: str) -> Tuple[str, str, str]:
    """Generates (raw_key, key_hash, key_prefix)."""
    random_part = secrets.token_hex(20) # 40 hex chars for high entropy
    raw_key = f"ak_live_{random_part}"
    key_hash = hash_key(raw_key)
    key_prefix = raw_key[:12] + "..."
    return raw_key, key_hash, key_prefix

def extract_api_key(request: Request) -> Optional[str]:
    """
    Extracts API key exclusively from secure HTTP headers:
    1. X-API-Key
    2. Authorization: Bearer <key>
    Query parameter key extraction is rejected to prevent credential leakage in logs and history.
    """
    # 1. Header X-API-Key
    api_key = request.headers.get("x-api-key")
    if api_key:
        return api_key.strip()

    # 2. Authorization header: Bearer <key>
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()

    return None

def verify_admin_access(request: Request) -> bool:
    """
    Dependency that enforces administrator authentication.
    Accepts X-Admin-Key header or Authorization: Bearer <admin_key>.
    Uses constant-time comparison to protect against timing attacks.
    """
    admin_key = request.headers.get("x-admin-key")
    if not admin_key:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            admin_key = auth_header[7:].strip()

    if not admin_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required. Provide header 'X-Admin-Key' or 'Authorization: Bearer <admin_key>'."
        )

    expected_key = settings.ADMIN_API_KEY
    if not secrets.compare_digest(admin_key.strip(), expected_key.strip()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Admin API credentials."
        )

    return True

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

    # Update stats non-critically
    try:
        api_key_record.total_requests += 1
        api_key_record.last_used_at = datetime.utcnow()
        db.commit()
    except Exception:
        db.rollback()

    return api_key_record

