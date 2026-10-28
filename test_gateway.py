import os
import httpx
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"

print("==================================================")
print("  LM Studio API Gateway - Security Verification")
print("==================================================")

# 1. Test Health Endpoint
try:
    health_resp = httpx.get(f"{BASE_URL}/health", timeout=5.0)
    print(f"[OK] Health check: Status {health_resp.status_code}")
except Exception as e:
    print(f"[ERROR] Could not connect to gateway: {e}")

# 2. Test Admin Endpoint Unauthenticated (Expect 401)
try:
    admin_unauth = httpx.get(f"{BASE_URL}/api/admin/keys", timeout=5.0)
    if admin_unauth.status_code == 401:
        print(f"[OK] Admin endpoint protected: Status 401 Unauthorized (Expected)")
    else:
        print(f"[WARN] Admin endpoint returned status {admin_unauth.status_code}")
except Exception as e:
    print(f"[ERROR] Admin test failed: {e}")

# 3. Test Admin Authentication with Admin Key
admin_key_path = Path("./backend/data/admin_api_key.txt")
if not admin_key_path.exists():
    admin_key_path = Path("./data/admin_api_key.txt")

if admin_key_path.exists():
    admin_key = admin_key_path.read_text(encoding="utf-8").strip()
    try:
        admin_auth_resp = httpx.get(
            f"{BASE_URL}/api/admin/auth/verify",
            headers={"X-Admin-Key": admin_key},
            timeout=5.0
        )
        if admin_auth_resp.status_code == 200:
            print(f"[OK] Admin authentication verified: Status 200 OK")
        else:
            print(f"[WARN] Admin verification returned status {admin_auth_resp.status_code}")
    except Exception as e:
        print(f"[ERROR] Admin verify failed: {e}")
else:
    print("[INFO] Admin key file not found locally yet (will be created on first server run)")

# 4. Test Public API Unauthenticated (Expect 401)
try:
    public_unauth = httpx.post(
        f"{BASE_URL}/api/v1/run/general-assistant",
        json={"prompt": "Hello", "stream": False},
        timeout=5.0
    )
    if public_unauth.status_code == 401:
        print(f"[OK] Public endpoint protected: Status 401 Unauthorized (Expected)")
    else:
        print(f"[INFO] Public endpoint returned status {public_unauth.status_code}")
except Exception as e:
    print(f"[ERROR] Public API test failed: {e}")

print("==================================================")

