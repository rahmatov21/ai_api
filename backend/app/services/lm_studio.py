import os
import json
import time
import httpx
from typing import AsyncGenerator, Dict, Any, List, Optional
from fastapi import Request
from sqlalchemy.orm import Session
from app.config import settings
from app.models import SystemSetting, Endpoint

def get_lm_studio_base_url(db: Session) -> str:
    """Fetch LM Studio URL with smart bidirectional translation for Docker vs Host."""
    is_docker = os.path.exists("/.dockerenv") or os.environ.get("RUNNING_IN_DOCKER") == "true" or "host.docker.internal" in settings.LM_STUDIO_URL
    base_url = None
    try:
        setting = db.query(SystemSetting).filter(SystemSetting.key == "lm_studio_url").first()
        if setting and setting.value and setting.value.strip():
            base_url = setting.value.strip().rstrip("/")
    except Exception:
        pass

    if not base_url:
        base_url = settings.LM_STUDIO_URL.rstrip("/")

    # If running inside Docker container and base_url points to localhost/127.0.0.1, auto-redirect to host machine
    if is_docker and ("127.0.0.1" in base_url or "localhost" in base_url):
        base_url = base_url.replace("127.0.0.1", "host.docker.internal").replace("localhost", "host.docker.internal")
    # Conversely, if running directly on host Windows and base_url is host.docker.internal, auto-redirect to 127.0.0.1
    elif not is_docker and "host.docker.internal" in base_url:
        base_url = base_url.replace("host.docker.internal", "127.0.0.1")

    return base_url

async def get_health_and_models(db: Session) -> Dict[str, Any]:
    """Test connection to LM Studio and fetch active models."""
    base_url = get_lm_studio_base_url(db)
    models_url = f"{base_url}/models"
    
    start_time = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(models_url)
            latency = round((time.perf_counter() - start_time) * 1000, 2)
            
            if resp.status_code == 200:
                data = resp.json()
                models = data.get("data", [])
                return {
                    "connected": True,
                    "base_url": base_url,
                    "latency_ms": latency,
                    "models": models,
                    "error": None
                }
            else:
                return {
                    "connected": False,
                    "base_url": base_url,
                    "latency_ms": latency,
                    "models": [],
                    "error": f"LM Studio returned status {resp.status_code}: {resp.text}"
                }
    except Exception as e:
        latency = round((time.perf_counter() - start_time) * 1000, 2)
        return {
            "connected": False,
            "base_url": base_url,
            "latency_ms": latency,
            "models": [],
            "error": f"Could not reach LM Studio at {base_url}: {str(e)}"
        }

def build_messages(
    endpoint: Endpoint,
    prompt: Optional[str] = None,
    messages: Optional[List[Dict[str, str]]] = None,
    system_prompt_override: Optional[str] = None
) -> List[Dict[str, str]]:
    """Compose messages list adhering to endpoint configuration and system prompt."""
    sys_prompt = system_prompt_override if system_prompt_override is not None else endpoint.system_prompt
    sys_prompt = (sys_prompt or "").strip()

    result_messages: List[Dict[str, str]] = []

    if messages and len(messages) > 0:
        # Check if first message is system
        has_system = any(m.get("role") == "system" for m in messages)
        if sys_prompt and not has_system:
            result_messages.append({"role": "system", "content": sys_prompt})
        for m in messages:
            result_messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})
    elif prompt:
        if sys_prompt:
            result_messages.append({"role": "system", "content": sys_prompt})
        result_messages.append({"role": "user", "content": prompt})
    else:
        if sys_prompt:
            result_messages.append({"role": "system", "content": sys_prompt})
        result_messages.append({"role": "user", "content": "Hello"})

    return result_messages

def resolve_reasoning_enabled(payload: Dict[str, Any], endpoint: Endpoint) -> bool:
    """
    Resolves whether reasoning / thinking mode should be enabled.
    Priority:
    1. Explicit request body flags: enable_reasoning, reasoning, include_reasoning
    2. Request body reasoning_effort: "none" / "off" => False, other values => True
    3. Endpoint default setting from database (endpoint.enable_reasoning)
    """
    for key in ("enable_reasoning", "reasoning", "include_reasoning"):
        if key in payload and payload[key] is not None:
            val = payload[key]
            if isinstance(val, str):
                return val.lower() in ("true", "1", "yes", "on")
            return bool(val)

    effort = payload.get("reasoning_effort")
    if effort is not None:
        return str(effort).strip().lower() not in ("none", "off", "false", "0", "disabled")

    return getattr(endpoint, "enable_reasoning", True)

async def execute_chat_completion(
    endpoint: Endpoint,
    payload: Dict[str, Any],
    db: Session
) -> Dict[str, Any]:
    """Execute non-streaming chat completion against LM Studio with reasoning toggle."""
    base_url = get_lm_studio_base_url(db)
    url = f"{base_url}/chat/completions"

    # Determine model
    model = payload.get("model") or endpoint.model_name
    if not model:
        # Fetch first available model
        health = await get_health_and_models(db)
        if health.get("models") and len(health["models"]) > 0:
            model = health["models"][0]["id"]
        else:
            model = "local-model"

    is_reasoning_enabled = resolve_reasoning_enabled(payload, endpoint)

    request_body = {
        "model": model,
        "messages": payload["messages"],
        "temperature": payload.get("temperature", endpoint.temperature),
        "top_p": payload.get("top_p", endpoint.top_p),
        "max_tokens": payload.get("max_tokens", endpoint.max_tokens),
        "stream": False
    }

    if not is_reasoning_enabled:
        request_body["reasoning_effort"] = "none"
        request_body["chat_template_kwargs"] = {"thinking": False}
    else:
        effort = payload.get("reasoning_effort")
        if effort and str(effort).strip().lower() not in ("default", ""):
            request_body["reasoning_effort"] = str(effort).strip().lower()

    start_time = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT) as client:
            resp = await client.post(url, json=request_body)
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            if resp.status_code != 200:
                raise RuntimeError(f"LM Studio API error ({resp.status_code}): {resp.text}")

            data = resp.json()
            choices = data.get("choices", [])
            content = ""
            reasoning = ""
            if choices:
                msg = choices[0].get("message", {})
                content = msg.get("content", "") or ""
                reasoning = msg.get("reasoning_content", "") or msg.get("reasoning", "") or ""
                
                if not is_reasoning_enabled:
                    # Strip reasoning when disabled
                    reasoning = ""
                else:
                    # If content is empty because the model spent its budget on reasoning
                    if not content.strip() and reasoning.strip():
                        content = f"💭 [Model Reasoning Thought Process]:\n{reasoning}\n\n⚠️ Note: The token limit was reached during reasoning. Increase max_tokens on this endpoint for the final answer."

            usage = data.get("usage", {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0
            })

            return {
                "status": "success",
                "endpoint": endpoint.slug,
                "model": model,
                "response": content,
                "reasoning": reasoning if is_reasoning_enabled and reasoning else None,
                "reasoning_enabled": is_reasoning_enabled,
                "raw_response": data,
                "usage": usage,
                "duration_ms": duration_ms
            }
    except httpx.TimeoutException:
        raise RuntimeError(
            "LM Studio timed out. Please verify that a model (e.g. Qwen or GLM) is LOADED into memory in the top bar of LM Studio."
        )
    except httpx.ConnectError:
        raise RuntimeError(
            f"Could not connect to LM Studio at {base_url}. Make sure LM Studio is running with 'Start Server' enabled on port 1234."
        )

async def execute_chat_stream(
    endpoint: Endpoint,
    payload: Dict[str, Any],
    db: Session,
    request: Optional[Request] = None
) -> AsyncGenerator[str, None]:
    """Execute streaming chat completion against LM Studio and yield SSE chunks with reasoning control."""
    base_url = get_lm_studio_base_url(db)
    url = f"{base_url}/chat/completions"

    model = payload.get("model") or endpoint.model_name
    if not model:
        health = await get_health_and_models(db)
        if health.get("models") and len(health["models"]) > 0:
            model = health["models"][0]["id"]
        else:
            model = "local-model"

    is_reasoning_enabled = resolve_reasoning_enabled(payload, endpoint)

    request_body = {
        "model": model,
        "messages": payload["messages"],
        "temperature": payload.get("temperature", endpoint.temperature),
        "top_p": payload.get("top_p", endpoint.top_p),
        "max_tokens": payload.get("max_tokens", endpoint.max_tokens),
        "stream": True
    }

    if not is_reasoning_enabled:
        request_body["reasoning_effort"] = "none"
        request_body["chat_template_kwargs"] = {"thinking": False}
    else:
        effort = payload.get("reasoning_effort")
        if effort and str(effort).strip().lower() not in ("default", ""):
            request_body["reasoning_effort"] = str(effort).strip().lower()

    try:
        async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT) as client:
            async with client.stream("POST", url, json=request_body) as response:
                if response.status_code != 200:
                    err_text = await response.aread()
                    yield f"data: {json.dumps({'error': f'LM Studio error ({response.status_code}): {err_text.decode()}'})}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                async for line in response.aiter_lines():
                    # Stop generation if client disconnected
                    if request and await request.is_disconnected():
                        break
                    if line:
                        if not is_reasoning_enabled:
                            if line.startswith("data: "):
                                raw_data = line[6:].strip()
                                if raw_data == "[DONE]":
                                    yield "data: [DONE]\n\n"
                                    continue
                                try:
                                    chunk_json = json.loads(raw_data)
                                    choices = chunk_json.get("choices", [])
                                    if choices:
                                        delta = choices[0].get("delta", {})
                                        delta.pop("reasoning_content", None)
                                        delta.pop("reasoning", None)
                                        if not delta.get("content"):
                                            continue
                                        yield f"data: {json.dumps(chunk_json)}\n\n"
                                        continue
                                except Exception:
                                    pass
                        if line.startswith("data: "):
                            yield f"{line}\n\n"
                        else:
                            yield f"data: {line}\n\n"
    except httpx.TimeoutException:
        yield f"data: {json.dumps({'error': 'LM Studio timed out. Make sure a model is LOADED into memory in LM Studio top bar.'})}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': f'Connection error: {str(e)}'})}\n\n"
        yield "data: [DONE]\n\n"
