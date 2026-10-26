from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

# --- Endpoint Schemas ---
class EndpointBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=2, max_length=60, pattern="^[a-zA-Z0-9_-]+$")
    description: Optional[str] = ""
    is_active: bool = True
    auth_required: bool = True
    model_name: Optional[str] = ""
    system_prompt: Optional[str] = ""
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    top_p: float = Field(0.95, ge=0.0, le=1.0)
    max_tokens: int = Field(2048, ge=1, le=32768)
    stream_allowed: bool = True
    enable_reasoning: bool = True
    rate_limit_per_min: int = Field(60, ge=1, le=1000)

class EndpointCreate(EndpointBase):
    pass

class EndpointUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    auth_required: Optional[bool] = None
    model_name: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    max_tokens: Optional[int] = None
    stream_allowed: Optional[bool] = None
    enable_reasoning: Optional[bool] = None
    rate_limit_per_min: Optional[int] = None

class EndpointResponse(EndpointBase):
    id: str
    total_requests: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- API Key Schemas ---
class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    allowed_slugs: Optional[str] = "*" # "*" or comma-separated list of slugs

class ApiKeyCreatedResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    raw_api_key: str
    allowed_slugs: str
    is_active: bool
    created_at: datetime

class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    raw_key: Optional[str] = ""
    is_active: bool
    allowed_slugs: str
    total_requests: int
    created_at: datetime
    last_used_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- Log Schemas ---
class ApiLogResponse(BaseModel):
    id: str
    endpoint_slug: str
    api_key_name: Optional[str] = None
    client_ip: Optional[str] = None
    method: str
    status_code: int
    duration_ms: float
    prompt_tokens: int
    completion_tokens: int
    stream: bool
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# --- Public Client Request/Response ---
class ChatMessage(BaseModel):
    role: str
    content: str

class RunRequest(BaseModel):
    prompt: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    stream: Optional[bool] = False
    enable_reasoning: Optional[bool] = None  # Explicit boolean to turn reasoning on/off
    reasoning: Optional[bool] = None         # Alias for enable_reasoning
    include_reasoning: Optional[bool] = None # Alias for enable_reasoning
    reasoning_effort: Optional[str] = None   # "none", "low", "medium", "high"

class RunResponse(BaseModel):
    status: str = "success"
    endpoint: str
    model: str
    response: str
    reasoning: Optional[str] = None
    reasoning_enabled: bool = True
    usage: Dict[str, Any]
    duration_ms: float

# --- LM Studio / Settings ---
class LMStudioModelItem(BaseModel):
    id: str
    object: str = "model"
    owned_by: Optional[str] = None

class LMStudioStatusResponse(BaseModel):
    connected: bool
    base_url: str
    latency_ms: Optional[float] = None
    models: List[LMStudioModelItem] = []
    error: Optional[str] = None

class SettingItem(BaseModel):
    key: str
    value: str
    updated_at: Optional[datetime] = None

class SettingUpdate(BaseModel):
    value: str
