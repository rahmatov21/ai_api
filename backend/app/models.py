import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Float, Integer, Text, DateTime
from app.database import Base

class Endpoint(Base):
    __tablename__ = "endpoints"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    slug = Column(String(60), unique=True, index=True, nullable=False)
    description = Column(String(255), default="")
    is_active = Column(Boolean, default=True)
    auth_required = Column(Boolean, default=True)
    
    # Model parameters
    model_name = Column(String(120), default="")
    system_prompt = Column(Text, default="")
    temperature = Column(Float, default=0.7)
    top_p = Column(Float, default=0.95)
    max_tokens = Column(Integer, default=2048)
    stream_allowed = Column(Boolean, default=True)
    enable_reasoning = Column(Boolean, default=True)
    rate_limit_per_min = Column(Integer, default=60)
    
    # Stats
    total_requests = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    key_hash = Column(String(64), unique=True, index=True, nullable=False)
    key_prefix = Column(String(16), nullable=False)
    raw_key = Column(String(80), nullable=True, default="")
    is_active = Column(Boolean, default=True)
    allowed_slugs = Column(String(255), default="*") # comma separated or *
    total_requests = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)

class ApiLog(Base):
    __tablename__ = "api_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    endpoint_slug = Column(String(60), index=True, nullable=False)
    api_key_name = Column(String(100), nullable=True)
    client_ip = Column(String(45), nullable=True)
    method = Column(String(10), default="POST")
    status_code = Column(Integer, default=200)
    duration_ms = Column(Float, default=0.0)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    stream = Column(Boolean, default=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(60), primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
