from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.database import get_db
from app.models import Endpoint, ApiKey, ApiLog, SystemSetting
from app.schemas import (
    EndpointCreate, EndpointUpdate, EndpointResponse,
    ApiKeyCreate, ApiKeyResponse, ApiKeyCreatedResponse,
    ApiLogResponse, LMStudioStatusResponse, SettingItem, SettingUpdate
)
from app.services.auth import generate_api_key
from app.services.lm_studio import get_health_and_models, execute_chat_completion, get_lm_studio_base_url

router = APIRouter(prefix="/api/admin", tags=["Admin Management"])

# --- Endpoints Management ---
@router.get("/endpoints", response_model=List[EndpointResponse])
def list_endpoints(db: Session = Depends(get_db)):
    return db.query(Endpoint).order_by(desc(Endpoint.created_at)).all()

@router.post("/endpoints", response_model=EndpointResponse, status_code=status.HTTP_201_CREATED)
def create_endpoint(payload: EndpointCreate, db: Session = Depends(get_db)):
    # Check slug uniqueness
    existing = db.query(Endpoint).filter(Endpoint.slug == payload.slug).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An API endpoint with route slug '{payload.slug}' already exists."
        )

    endpoint = Endpoint(**payload.model_dump())
    db.add(endpoint)
    db.commit()
    db.refresh(endpoint)
    return endpoint

@router.get("/endpoints/{endpoint_id}", response_model=EndpointResponse)
def get_endpoint(endpoint_id: str, db: Session = Depends(get_db)):
    endpoint = db.query(Endpoint).filter(Endpoint.id == endpoint_id).first()
    if not endpoint:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return endpoint

@router.put("/endpoints/{endpoint_id}", response_model=EndpointResponse)
def update_endpoint(endpoint_id: str, payload: EndpointUpdate, db: Session = Depends(get_db)):
    endpoint = db.query(Endpoint).filter(Endpoint.id == endpoint_id).first()
    if not endpoint:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    data = payload.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] != endpoint.slug:
        existing = db.query(Endpoint).filter(Endpoint.slug == data["slug"]).first()
        if existing and existing.id != endpoint_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Route slug '{data['slug']}' is already in use."
            )

    for field, val in data.items():
        setattr(endpoint, field, val)

    endpoint.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(endpoint)
    return endpoint

@router.delete("/endpoints/{endpoint_id}")
def delete_endpoint(endpoint_id: str, db: Session = Depends(get_db)):
    endpoint = db.query(Endpoint).filter(Endpoint.id == endpoint_id).first()
    if not endpoint:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    db.delete(endpoint)
    db.commit()
    return {"status": "success", "message": f"Endpoint '{endpoint.name}' deleted"}

@router.post("/endpoints/{endpoint_id}/toggle")
def toggle_endpoint_status(endpoint_id: str, db: Session = Depends(get_db)):
    endpoint = db.query(Endpoint).filter(Endpoint.id == endpoint_id).first()
    if not endpoint:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    endpoint.is_active = not endpoint.is_active
    db.commit()
    return {"status": "success", "is_active": endpoint.is_active}

# --- API Keys Management ---
@router.get("/keys", response_model=List[ApiKeyResponse])
def list_api_keys(db: Session = Depends(get_db)):
    return db.query(ApiKey).order_by(desc(ApiKey.created_at)).all()

@router.post("/keys", response_model=ApiKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_api_key(payload: ApiKeyCreate, db: Session = Depends(get_db)):
    raw_key, key_hash, key_prefix = generate_api_key(payload.name)
    api_key = ApiKey(
        name=payload.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        raw_key=raw_key,
        allowed_slugs=payload.allowed_slugs or "*",
        is_active=True
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return ApiKeyCreatedResponse(
        id=api_key.id,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        raw_api_key=raw_key,
        allowed_slugs=api_key.allowed_slugs,
        is_active=api_key.is_active,
        created_at=api_key.created_at
    )

@router.delete("/keys/{key_id}")
def delete_api_key(key_id: str, db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    db.delete(key)
    db.commit()
    return {"status": "success", "message": "API key revoked"}

@router.post("/keys/{key_id}/toggle")
def toggle_api_key(key_id: str, db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    key.is_active = not key.is_active
    db.commit()
    return {"status": "success", "is_active": key.is_active}

# --- LM Studio & Health ---
@router.get("/lmstudio/status", response_model=LMStudioStatusResponse)
async def check_lm_studio_status(db: Session = Depends(get_db)):
    status_data = await get_health_and_models(db)
    return status_data

@router.post("/lmstudio/test")
async def test_lm_studio_call(payload: Dict[str, Any], db: Session = Depends(get_db)):
    prompt = payload.get("prompt", "Say hello in one brief sentence.")
    model = payload.get("model", "")
    
    # Create temporary dummy endpoint
    temp_endpoint = Endpoint(
        id="test",
        name="Test",
        slug="test",
        model_name=model,
        system_prompt=payload.get("system_prompt", "You are a helpful assistant."),
        temperature=payload.get("temperature", 0.7),
        top_p=0.95,
        max_tokens=256
    )
    
    chat_payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": temp_endpoint.system_prompt},
            {"role": "user", "content": prompt}
        ]
    }
    
    result = await execute_chat_completion(temp_endpoint, chat_payload, db)
    return result

# --- Logs & Stats ---
@router.get("/logs", response_model=List[ApiLogResponse])
def get_logs(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    return db.query(ApiLog).order_by(desc(ApiLog.created_at)).limit(limit).all()

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_endpoints = db.query(Endpoint).count()
    active_endpoints = db.query(Endpoint).filter(Endpoint.is_active == True).count()
    total_keys = db.query(ApiKey).count()
    total_requests = db.query(func.count(ApiLog.id)).scalar() or 0
    successful_requests = db.query(func.count(ApiLog.id)).filter(ApiLog.status_code == 200).scalar() or 0
    
    # Calculate average latency
    avg_latency = db.query(func.avg(ApiLog.duration_ms)).filter(ApiLog.status_code == 200).scalar()
    avg_latency = round(float(avg_latency), 1) if avg_latency else 0.0

    success_rate = round((successful_requests / total_requests * 100), 1) if total_requests > 0 else 100.0

    return {
        "total_endpoints": total_endpoints,
        "active_endpoints": active_endpoints,
        "total_keys": total_keys,
        "total_requests": total_requests,
        "successful_requests": successful_requests,
        "success_rate": success_rate,
        "avg_latency_ms": avg_latency
    }

# --- Settings ---
@router.get("/settings", response_model=List[SettingItem])
def get_settings(db: Session = Depends(get_db)):
    settings_list = db.query(SystemSetting).all()
    # Ensure lm_studio_url exists in the list
    keys = {s.key for s in settings_list}
    if "lm_studio_url" not in keys:
        settings_list.append(SystemSetting(key="lm_studio_url", value=get_lm_studio_base_url(db)))
    return settings_list

@router.post("/settings/{key}")
def update_setting(key: str, payload: SettingUpdate, db: Session = Depends(get_db)):
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not setting:
        setting = SystemSetting(key=key, value=payload.value)
        db.add(setting)
    else:
        setting.value = payload.value
        setting.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "key": key, "value": setting.value}

# --- Cloud / Public Base URL ---
@router.get("/public-url")
def get_public_url(db: Session = Depends(get_db)):
    # 1. Check if public_url.txt was written by Cloudflare tunnel script
    import os
    data_dir = "./data"
    tunnel_file = os.path.join(data_dir, "public_url.txt")
    if os.path.exists(tunnel_file):
        try:
            with open(tunnel_file, "r") as f:
                content = f.read().strip()
                if content and content.startswith("http"):
                    return {"public_url": content}
        except Exception:
            pass

    setting = db.query(SystemSetting).filter(SystemSetting.key == "public_base_url").first()
    if setting and setting.value and setting.value.strip():
        return {"public_url": setting.value.strip()}
    return {"public_url": ""}

@router.post("/public-url")
def set_public_url(payload: Dict[str, str], db: Session = Depends(get_db)):
    url = (payload.get("public_url") or "").strip().rstrip("/")
    setting = db.query(SystemSetting).filter(SystemSetting.key == "public_base_url").first()
    if not setting:
        setting = SystemSetting(key="public_base_url", value=url)
        db.add(setting)
    else:
        setting.value = url
        setting.updated_at = datetime.utcnow()
    db.commit()

    # Also persist to public_url.txt
    try:
        import os
        os.makedirs("./data", exist_ok=True)
        with open("./data/public_url.txt", "w") as f:
            f.write(url)
    except Exception:
        pass

    return {"status": "success", "public_url": setting.value}
