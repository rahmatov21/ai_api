import httpx

print("Sending request to manual endpoint /api/v1/run/general-assistant...")
try:
    resp = httpx.post(
        "http://127.0.0.1:8000/api/v1/run/general-assistant",
        json={"prompt": "Say hello in three words.", "stream": False},
        timeout=30.0
    )
    print("Status code:", resp.status_code)
    print("Response JSON:", resp.json())
except Exception as e:
    print("Error:", e)
