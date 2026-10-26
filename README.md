# LM Studio API Gateway & Control Plane 🚀

A production-ready platform that empowers administrators to manually configure, govern, and distribute custom AI endpoints powered by local LLMs running inside **LM Studio**.

---

## 🌟 Key Capabilities

- **Manual API Creation**: Administrators have complete control to define custom endpoints (e.g. `/api/v1/run/code-reviewer`, `/api/v1/run/customer-support`), assign specific LM Studio models, inject persistent system prompts, and configure hyperparameters (temperature, top-p, max tokens).
- **Public Universal Invocations**: Generated APIs can be called by **anyone in the world** using Python, Node.js, cURL, Go, or standard OpenAI SDKs.
- **Drop-in OpenAI SDK Compatibility**: Endpoints can be consumed directly via `from openai import OpenAI` with custom `base_url`.
- **Zero-Buffer Real-Time Streaming (SSE)**: Configured with Nginx `proxy_buffering off` for instant token streaming.
- **Enterprise API Key Security**: Generate and revoke client API keys (`ak_live_...`) with fine-grained endpoint restrictions.
- **Live LM Studio Discovery**: Real-time health pulse and dynamic detection of loaded models from LM Studio (`http://127.0.0.1:1234/v1`).
- **Interactive Playground & Code Generator**: Built-in test runner with instant code snippet generation for 5+ programming languages.
- **Full Audit Logging & Metrics**: Track latency, token consumption, status codes, and IP addresses in real time.

---

## 🏗️ Architecture

```
                                      +-------------------------------+
                                      |     Clients Across the World  |
                                      | (Python, cURL, JS, Mobile)    |
                                      +---------------+---------------+
                                                      |
                                                      | HTTP / HTTPS / SSE
                                                      v
+---------------------------------------------------------------------------------------------------+
|  NGINX Reverse Proxy (Port 80)                                                                    |
|  - Buffering Disabled for LLM Server-Sent Events (SSE)                                           |
|  - Static React SPA serving (/)                                                                  |
|  - Reverse Proxy to FastAPI (/api/*)                                                             |
+---------------------------------------------------------------------------------------------------+
                  |                                                      |
                  | / (Static Assets)                                    | /api/*
                  v                                                      v
  +--------------------------------+                  +-----------------------------------+
  | React / Vite Admin Dashboard   |                  | FastAPI Gateway Engine            |
  | - Modern Dark Glassmorphic UI  |                  | - Dynamic Route Dispatcher        |
  | - Manual API Builder & Models  |                  | - API Key Validation (SHA-256)    |
  | - Interactive Test Playground  |                  | - System Prompt Injection         |
  | - Code Generator & Live Logs   |                  | - SQLite Database (gateway.db)    |
  +--------------------------------+                  +-----------------+-----------------+
                                                                        |
                                                                        | OpenAI API Spec
                                                                        v
                                                      +-----------------------------------+
                                                      | LM Studio Local Server            |
                                                      | (http://127.0.0.1:1234/v1)        |
                                                      | - Local LLMs (e.g., Qwen, GLM)   |
                                                      +-----------------------------------+
```

---

## 🚀 Quick Start

### Option A: Launch with Docker Compose (Recommended)

Make sure LM Studio is running on your machine with **Start Server** enabled on port 1234.

1. Double click `start-docker.bat` or run:
   ```bash
   docker compose up --build -d
   ```
2. Open your browser:
   - **Admin Dashboard**: [http://localhost](http://localhost)
   - **FastAPI Interactive Docs**: [http://localhost/docs](http://localhost/docs)

*Note: In Docker, the backend connects to LM Studio via `http://host.docker.internal:1234/v1` automatically.*

---

### Option B: Native Local Launch (No Docker Required)

1. **Start the Backend:**
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

2. **Start the Frontend Dashboard:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Open [http://localhost:5173](http://localhost:5173). Requests to `/api/*` are automatically proxied to the backend.

---

## 🛠️ How to Create & Use a Manual API

### Step 1: Create API in Dashboard
1. Open the dashboard and click **"Create New API"**.
2. Specify:
   - **API Name**: e.g. `Code Reviewer`
   - **Route Slug**: e.g. `code-reviewer` (URL becomes `/api/v1/run/code-reviewer`)
   - **LM Studio Model**: Select any loaded model from the dropdown
   - **System Prompt**: e.g. `"You are a senior staff engineer. Review code for bugs, performance, and best practices."`
   - **Temperature**: e.g. `0.2`
   - **Require API Key**: Check if authentication is desired.

### Step 2: Generate a Client API Key
1. Go to the **"API Keys"** tab and click **"Generate API Key"**.
2. Provide a descriptive name (e.g. `Python Client Script`).
3. Copy the generated key (e.g. `ak_live_a1b2c3d4...`).

---

## 💻 Calling Your Manual API from Anywhere

### 1. Python (Using `requests`)

```python
import requests

url = "http://your-server-ip/api/v1/run/code-reviewer"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "ak_live_xxxxxxxxxxxxxxxxxxxxxxxx"
}
payload = {
    "prompt": "Review this Python function for memory leaks:\ndef load_data(): ...",
    "stream": False
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()

print(data["response"])
print(f"Latency: {data['duration_ms']}ms | Model: {data['model']}")
```

---

### 2. Python (Using OpenAI SDK)

Any standard OpenAI SDK client can connect to your custom endpoint:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://your-server-ip/api/v1/run/code-reviewer",
    api_key="ak_live_xxxxxxxxxxxxxxxxxxxxxxxx"
)

response = client.chat.completions.create(
    model="code-reviewer",
    messages=[
        {"role": "user", "content": "How do I optimize a large SQLite query?"}
    ],
    stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

---

### 3. cURL (Terminal / Command Line)

```bash
curl -X POST "http://your-server-ip/api/v1/run/code-reviewer" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ak_live_xxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "prompt": "Explain dependency injection in three sentences.",
    "stream": false
  }'
```

---

### 4. JavaScript / TypeScript (Node.js or Web)

```javascript
const response = await fetch("http://your-server-ip/api/v1/run/code-reviewer", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "ak_live_xxxxxxxxxxxxxxxxxxxxxxxx"
  },
  body: JSON.stringify({
    prompt: "Write a React hook for debouncing an input",
    stream: false
  })
});

const data = await response.json();
console.log(data.response);
```

---

## 🔒 Security & Data Persistence

- **API Keys**: Stored securely as SHA-256 hashes. Raw keys are never stored in plaintext.
- **Database**: Persistent SQLite database stored in `./backend/data/gateway.db` (automatically volume-mounted in Docker).
- **CORS**: Pre-configured to allow integration into web applications globally.
