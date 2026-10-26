import React, { useState, useEffect } from 'react';
import { 
  Server, Key, Terminal, Activity, Settings, Plus, Copy, Check, 
  Play, RefreshCw, Trash2, Edit3, Shield, Cpu, 
  Zap, Lock, Unlock, ArrowRight, CheckCircle2, Eye, EyeOff, BookOpen, 
  Send, ExternalLink, HelpCircle, Globe, AlertTriangle
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('endpoints');
  const [endpoints, setEndpoints] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [lmStatus, setLmStatus] = useState({ connected: false, models: [], latency_ms: null });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Cloud / Public Base URL state
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [tempPublicUrl, setTempPublicUrl] = useState('');

  // Modals
  const [showEndpointModal, setShowEndpointModal] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyCreated, setNewKeyCreated] = useState(null);
  const [showCodeModal, setShowCodeModal] = useState(null);
  const [newlyCreatedEndpoint, setNewlyCreatedEndpoint] = useState(null);

  // Revealed keys set for admin
  const [revealedKeys, setRevealedKeys] = useState({});

  // Playground state
  const [selectedEndpointSlug, setSelectedEndpointSlug] = useState('');
  const [testPrompt, setTestPrompt] = useState('Write a concise python function to reverse a string.');
  const [testStream, setTestStream] = useState(true);
  const [testReasoning, setTestReasoning] = useState(true);
  const [testResponse, setTestResponse] = useState('');
  const [testingStatus, setTestingStatus] = useState(false);
  const [testMetrics, setTestMetrics] = useState(null);
  const [codeTab, setCodeTab] = useState('python_requests');

  // Settings state
  const [lmStudioUrl, setLmStudioUrl] = useState('http://127.0.0.1:1234/v1');
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [showQuickGuide, setShowQuickGuide] = useState(true);

  // Endpoint form state
  const [endpointForm, setEndpointForm] = useState({
    name: '',
    slug: '',
    description: '',
    is_active: true,
    auth_required: true,
    model_name: '',
    system_prompt: '',
    temperature: 0.7,
    top_p: 0.95,
    max_tokens: 2048,
    stream_allowed: true,
    enable_reasoning: true,
    rate_limit_per_min: 60
  });

  // API Key form state
  const [keyForm, setKeyForm] = useState({
    name: '',
    allowed_slugs: '*'
  });

  const showToastMsg = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const copyToClipboard = (text, label = 'Copied to clipboard!') => {
    navigator.clipboard.writeText(text);
    showToastMsg(label);
  };

  const toggleKeyVisibility = (keyId) => {
    setRevealedKeys(prev => ({
      ...prev,
      [keyId]: !prev[keyId]
    }));
  };

  // Computes active base URL (Cloud domain if set, otherwise fallback to local origin)
  const getActiveBaseUrl = () => {
    if (publicBaseUrl && publicBaseUrl.trim()) {
      return publicBaseUrl.trim().replace(/\/+$/, '');
    }
    return window.location.origin;
  };

  // Fetch all platform data
  const loadData = async () => {
    try {
      const [epRes, keysRes, logsRes, statsRes, lmRes, setRes, pubUrlRes] = await Promise.all([
        fetch('/api/admin/endpoints'),
        fetch('/api/admin/keys'),
        fetch('/api/admin/logs?limit=50'),
        fetch('/api/admin/stats'),
        fetch('/api/admin/lmstudio/status'),
        fetch('/api/admin/settings'),
        fetch('/api/admin/public-url')
      ]);

      if (epRes.ok) {
        const epData = await epRes.json();
        setEndpoints(epData);
        if (epData.length > 0 && !selectedEndpointSlug) {
          setSelectedEndpointSlug(epData[0].slug);
        }
      }
      if (keysRes.ok) setApiKeys(await keysRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (lmRes.ok) {
        const lmData = await lmRes.json();
        setLmStatus(lmData);
      }
      if (setRes.ok) {
        const sData = await setRes.json();
        const found = sData.find(s => s.key === 'lm_studio_url');
        if (found) setLmStudioUrl(found.value);
      }
      if (pubUrlRes.ok) {
        const pubData = await pubUrlRes.json();
        if (pubData.public_url) {
          setPublicBaseUrl(pubData.public_url);
          setTempPublicUrl(pubData.public_url);
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, []);

  // Save Public Cloud URL
  const handleSavePublicUrl = async (e) => {
    if (e) e.preventDefault();
    try {
      const res = await fetch('/api/admin/public-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_url: tempPublicUrl })
      });
      if (res.ok) {
        const cleaned = tempPublicUrl.trim().replace(/\/+$/, '');
        setPublicBaseUrl(cleaned);
        showToastMsg(cleaned ? 'Worldwide Public Cloud Link saved!' : 'Switched back to local mode');
        loadData();
      }
    } catch (err) {
      alert('Failed to save public URL');
    }
  };

  // Save / Edit Endpoint
  const handleSaveEndpoint = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = editingEndpoint 
        ? `/api/admin/endpoints/${editingEndpoint.id}` 
        : '/api/admin/endpoints';
      const method = editingEndpoint ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endpointForm)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save endpoint');
      }

      const savedEndpoint = await res.json();
      setShowEndpointModal(false);
      
      if (!editingEndpoint) {
        setNewlyCreatedEndpoint(savedEndpoint);
      } else {
        showToastMsg('API Endpoint updated successfully!');
      }

      setEditingEndpoint(null);
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (ep) => {
    setEditingEndpoint(ep);
    setEndpointForm({
      name: ep.name,
      slug: ep.slug,
      description: ep.description || '',
      is_active: ep.is_active,
      auth_required: ep.auth_required,
      model_name: ep.model_name || '',
      system_prompt: ep.system_prompt || '',
      temperature: ep.temperature,
      top_p: ep.top_p,
      max_tokens: ep.max_tokens,
      stream_allowed: ep.stream_allowed,
      enable_reasoning: ep.enable_reasoning !== undefined ? ep.enable_reasoning : true,
      rate_limit_per_min: ep.rate_limit_per_min
    });
    setShowEndpointModal(true);
  };

  const handleOpenCreate = () => {
    setEditingEndpoint(null);
    const defaultModel = lmStatus.models && lmStatus.models.length > 0 ? lmStatus.models[0].id : '';
    setEndpointForm({
      name: '',
      slug: '',
      description: '',
      is_active: true,
      auth_required: true,
      model_name: defaultModel,
      system_prompt: 'You are a helpful and specialized AI assistant.',
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 2048,
      stream_allowed: true,
      enable_reasoning: true,
      rate_limit_per_min: 60
    });
    setShowEndpointModal(true);
  };

  const handleDeleteEndpoint = async (id, name) => {
    if (!confirm(`Are you sure you want to delete API '${name}'?`)) return;
    try {
      await fetch(`/api/admin/endpoints/${id}`, { method: 'DELETE' });
      showToastMsg(`Endpoint '${name}' deleted`);
      loadData();
    } catch (err) {
      alert('Failed to delete endpoint');
    }
  };

  const handleToggleEndpoint = async (id) => {
    try {
      await fetch(`/api/admin/endpoints/${id}/toggle`, { method: 'POST' });
      loadData();
    } catch (err) {
      alert('Failed to toggle status');
    }
  };

  // API Key Actions
  const handleCreateKey = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keyForm)
      });
      if (!res.ok) throw new Error('Failed to create key');
      const data = await res.json();
      setNewKeyCreated(data);
      setShowKeyModal(false);
      setKeyForm({ name: '', allowed_slugs: '*' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteKey = async (id, name) => {
    if (!confirm(`Revoke API Key '${name}'? Any client using this key will be blocked.`)) return;
    try {
      await fetch(`/api/admin/keys/${id}`, { method: 'DELETE' });
      showToastMsg('API Key revoked');
      loadData();
    } catch (err) {
      alert('Failed to delete key');
    }
  };

  const handleToggleKey = async (id) => {
    try {
      await fetch(`/api/admin/keys/${id}/toggle`, { method: 'POST' });
      loadData();
    } catch (err) {
      alert('Failed to toggle key');
    }
  };

  // Save LM Studio URL setting
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setUpdatingSettings(true);
    try {
      const res = await fetch('/api/admin/settings/lm_studio_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: lmStudioUrl })
      });
      if (res.ok) {
        showToastMsg('LM Studio URL saved!');
        loadData();
      }
    } catch (err) {
      alert('Failed to save setting');
    } finally {
      setUpdatingSettings(false);
    }
  };

  // Run test in playground
  const handleRunPlayground = async () => {
    if (!selectedEndpointSlug) return;
    const ep = endpoints.find(e => e.slug === selectedEndpointSlug);
    if (!ep) return;

    setTestingStatus(true);
    setTestResponse('Connecting to LM Studio...');
    setTestMetrics(null);

    const startTime = performance.now();
    const activeKey = apiKeys.find(k => k.is_active);
    const keyToUse = activeKey ? (activeKey.raw_key || activeKey.key_prefix.replace('...', '')) : 'ak_live_demo1234567890abcdef12345';

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (ep.auth_required) {
        headers['X-API-Key'] = keyToUse;
      }

      if (testStream && ep.stream_allowed) {
        const response = await fetch(`/api/v1/run/${selectedEndpointSlug}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt: testPrompt,
            stream: true,
            reasoning: testReasoning
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || 'Streaming failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        setTestResponse('');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr === '[DONE]') break;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.error) {
                  accumulated = `⚠️ LM Studio Notice:\n${typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error)}\n\n💡 Tip: In LM Studio, click the model dropdown at the top and click "Load Model" so it is active in memory!`;
                  setTestResponse(accumulated);
                  break;
                }
                const deltaContent = parsed.choices?.[0]?.delta?.content || '';
                const deltaReasoning = parsed.choices?.[0]?.delta?.reasoning_content || parsed.choices?.[0]?.delta?.reasoning || '';
                
                if (deltaReasoning) {
                  if (!accumulated.startsWith('💭 Thinking:\n')) {
                    accumulated = '💭 Thinking:\n' + deltaReasoning;
                  } else {
                    accumulated += deltaReasoning;
                  }
                  setTestResponse(accumulated);
                }
                
                if (deltaContent) {
                  if (accumulated.startsWith('💭 Thinking:\n') && !accumulated.includes('\n\n💡 Answer:\n')) {
                    accumulated += '\n\n💡 Answer:\n' + deltaContent;
                  } else {
                    accumulated += deltaContent;
                  }
                  setTestResponse(accumulated);
                }
              } catch (e) {}
            }
          }
        }
        const duration = Math.round(performance.now() - startTime);
        setTestMetrics({ duration_ms: duration, streamed: true });
      } else {
        const response = await fetch(`/api/v1/run/${selectedEndpointSlug}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt: testPrompt,
            stream: false,
            reasoning: testReasoning
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || 'Request failed');
        }

        if (data.reasoning && testReasoning) {
          setTestResponse(`💭 Thinking:\n${data.reasoning}\n\n💡 Answer:\n${data.response}`);
        } else {
          setTestResponse(data.response);
        }

        setTestMetrics({
          duration_ms: data.duration_ms,
          usage: data.usage,
          model: data.model
        });
      }
      loadData();
    } catch (err) {
      setTestResponse(`❌ Execution Error: ${err.message}\n\n💡 Tip: Please ensure that LM Studio is running AND that a model (e.g. Qwen or GLM) is LOADED in the top bar of LM Studio.`);
    } finally {
      setTestingStatus(false);
    }
  };

  // Code Snippet Generator (Uses Worldwide Cloud Link!)
  const getSnippets = (ep) => {
    if (!ep) return {};
    const host = getActiveBaseUrl();
    const url = `${host}/api/v1/run/${ep.slug}`;
    const openAiUrl = `${host}/api/v1/run/${ep.slug}`;
    const firstKey = apiKeys.find(k => k.is_active);
    const keyVal = firstKey ? (firstKey.raw_key || 'YOUR_API_KEY') : 'YOUR_API_KEY';

    return {
      python_requests: `import requests

# Worldwide Cloud Endpoint Link
url = "${url}"

headers = {
    "Content-Type": "application/json",${ep.auth_required ? `\n    "X-API-Key": "${keyVal}"` : ''}
}

payload = {
    "prompt": "Hello! How can you help me today?",
    "stream": False,
    # Set reasoning to True (thinking chain) or False (instant direct answer)
    "reasoning": True
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()

if data.get("reasoning"):
    print("💭 Reasoning Thoughts:", data["reasoning"])

print("AI Response:", data["response"])
print("Latency:", data["duration_ms"], "ms")`,

      python_openai: `from openai import OpenAI

# Drop-in compatible with standard OpenAI SDK worldwide!
client = OpenAI(
    base_url="${openAiUrl}",
    api_key="${ep.auth_required ? keyVal : 'not-needed'}"
)

# You can pass extra_body={"reasoning": False} or reasoning_effort="none" to disable thinking!
completion = client.chat.completions.create(
    model="${ep.model_name || 'local-model'}",
    messages=[
        {"role": "user", "content": "Explain quantum computing simply in 2 sentences."}
    ],
    stream=True,
    extra_body={"reasoning": True} # Set to False for instant answer without thinking
)

for chunk in completion:
    print(chunk.choices[0].delta.content or "", end="", flush=True)`,

      curl: `curl -X POST "${url}" \\
  -H "Content-Type: application/json"${ep.auth_required ? ` \\\n  -H "X-API-Key: ${keyVal}"` : ''} \\
  -d '{
    "prompt": "What is the speed of light?",
    "stream": false,
    "reasoning": false
  }'`,

      javascript: `// Works in Node.js or in browser from any computer worldwide
const response = await fetch("${url}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",${ep.auth_required ? `\n    "X-API-Key": "${keyVal}"` : ''}
  },
  body: JSON.stringify({
    prompt: "Write a quicksort implementation in Python",
    stream: false,
    reasoning: true // Set to false to disable reasoning thoughts
  })
});

const data = await response.json();
if (data.reasoning) {
  console.log("Thinking:", data.reasoning);
}
console.log("Answer:", data.response);`,

      golang: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func main() {
	url := "${url}"
	payload := map[string]interface{}{
		"prompt": "Explain goroutines in Go",
		"stream": false,
		"reasoning": true, // false = instant answer without thinking
	}
	jsonData, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")${ep.auth_required ? `\n	req.Header.Set("X-API-Key", "${keyVal}")` : ''}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println(string(body))
}`
    };
  };

  const selectedEndpointObj = endpoints.find(e => e.slug === selectedEndpointSlug) || endpoints[0];

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {toast && (
        <div className="toast-notice">
          <CheckCircle2 size={18} color="#34d399" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="brand-wrapper">
          <div className="brand-logo">
            <Cpu size={24} color="#fff" />
          </div>
          <div>
            <div className="brand-title">LM Studio API Gateway</div>
            <div className="brand-subtitle">Worldwide Cloud LLM Control Plane</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className={`lm-pulse-badge ${lmStatus.connected ? '' : 'offline'}`}>
            <span className="pulse-dot"></span>
            <span>
              {lmStatus.connected 
                ? `LM Studio Online (${lmStatus.latency_ms || 12}ms) • ${lmStatus.models?.length || 0} Models`
                : 'LM Studio Unreachable'}
            </span>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={loadData} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* WORLDWIDE CLOUD ACCESS BAR (EXPLICITLY REQUESTED) */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.12), rgba(99, 102, 241, 0.12))',
        border: '1px solid rgba(6, 182, 212, 0.35)',
        borderRadius: 'var(--radius-md)',
        padding: '14px 20px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Globe size={22} color="#06b6d4" />
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e0f2fe', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Worldwide Public Cloud Link:</span>
              {publicBaseUrl ? (
                <span className="badge badge-active" style={{ fontSize: '0.72rem' }}>
                  ● WORLDWIDE ACTIVE
                </span>
              ) : (
                <span className="badge badge-inactive" style={{ fontSize: '0.72rem' }}>
                  ● Localhost Mode
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              All API links & code snippets automatically use this public link so anyone on any Wi-Fi can send requests.
            </div>
          </div>
        </div>

        <form onSubmit={handleSavePublicUrl} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', maxWidth: '560px' }}>
          <input 
            type="text"
            className="form-input"
            style={{ padding: '8px 12px', fontSize: '0.85rem' }}
            placeholder="e.g. https://neighbors-steal-mile-hearts.trycloudflare.com"
            value={tempPublicUrl}
            onChange={(e) => setTempPublicUrl(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}>
            Set Cloud Link
          </button>
        </form>
      </div>

      {/* LM Studio Model Loading Notice */}
      <div style={{
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 16px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '0.82rem',
        color: '#fbbf24'
      }}>
        <AlertTriangle size={18} />
        <div>
          <b>Important for Model Generation:</b> In LM Studio, click the <b>model dropdown at the very top</b> and click <b>"Load Model"</b> (e.g. Qwen or GLM). If no model is loaded into memory, requests will wait and time out!
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="nav-tabs">
        <button 
          className={`nav-tab-btn ${activeTab === 'endpoints' ? 'active' : ''}`}
          onClick={() => setActiveTab('endpoints')}
        >
          <Server size={17} />
          <span>Manual APIs ({endpoints.length})</span>
        </button>

        <button 
          className={`nav-tab-btn ${activeTab === 'keys' ? 'active' : ''}`}
          onClick={() => setActiveTab('keys')}
        >
          <Key size={17} />
          <span>API Keys ({apiKeys.length})</span>
        </button>

        <button 
          className={`nav-tab-btn ${activeTab === 'playground' ? 'active' : ''}`}
          onClick={() => setActiveTab('playground')}
        >
          <Terminal size={17} />
          <span>Test Playground & Code</span>
        </button>

        <button 
          className={`nav-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          <Activity size={17} />
          <span>Request Logs</span>
        </button>

        <button 
          className={`nav-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={17} />
          <span>LM Studio & Cloudflare</span>
        </button>
      </nav>

      {/* TAB 1: MANUAL APIS MANAGEMENT */}
      {activeTab === 'endpoints' && (
        <section>
          <div className="section-header">
            <div>
              <h2 className="section-title">Manual API Endpoints</h2>
              <p className="section-desc">Create custom APIs with dedicated instructions. All generated links below use your worldwide cloud domain.</p>
            </div>
            <button className="btn btn-primary" onClick={handleOpenCreate}>
              <Plus size={16} />
              <span>Create New API</span>
            </button>
          </div>

          <div className="panel-card">
            {endpoints.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <Server size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                <h3>No Manual APIs Created Yet</h3>
                <p>Click "Create New API" to define your first custom LM Studio endpoint.</p>
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>API Name & Description</th>
                      <th>Worldwide API Request Link (Give this to anyone)</th>
                      <th>Model</th>
                      <th>Auth</th>
                      <th>Calls</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoints.map((ep) => {
                      const fullUrl = `${getActiveBaseUrl()}/api/v1/run/${ep.slug}`;
                      return (
                        <tr key={ep.id}>
                          <td>
                            <button 
                              onClick={() => handleToggleEndpoint(ep.id)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                              title="Click to enable or disable this API"
                            >
                              <span className={`badge ${ep.is_active ? 'badge-active' : 'badge-inactive'}`}>
                                {ep.is_active ? 'Active' : 'Disabled'}
                              </span>
                            </button>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.98rem' }}>{ep.name}</div>
                            {ep.description ? (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {ep.description}
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                                Slug: <code>{ep.slug}</code>
                              </div>
                            )}
                          </td>
                          <td style={{ minWidth: '360px' }}>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px', 
                              background: 'rgba(0,0,0,0.5)', 
                              padding: '6px 12px', 
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid rgba(6, 182, 212, 0.25)'
                            }}>
                              <code style={{ color: '#38bdf8', fontSize: '0.82rem', wordBreak: 'break-all' }}>
                                {fullUrl}
                              </code>
                              <button 
                                className="btn btn-primary btn-sm"
                                style={{ padding: '3px 8px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                onClick={() => copyToClipboard(fullUrl, `Copied worldwide link: ${fullUrl}`)}
                                title="Copy the exact worldwide link"
                              >
                                <Copy size={12} /> Copy Link
                              </button>
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-model" title={ep.model_name || 'LM Studio Auto'}>
                              {ep.model_name || 'LM Studio Auto'}
                            </span>
                            <div style={{ marginTop: '4px' }}>
                              <span 
                                className={`badge ${ep.enable_reasoning !== false ? 'badge-reasoning-on' : 'badge-reasoning-off'}`} 
                                style={{ fontSize: '0.7rem' }}
                                title={ep.enable_reasoning !== false ? 'Reasoning enabled by default' : 'Direct answers (reasoning disabled)'}
                              >
                                {ep.enable_reasoning !== false ? '🧠 Reasoning' : '⚡ Direct'}
                              </span>
                            </div>
                          </td>
                          <td>
                            {ep.auth_required ? (
                              <span className="badge badge-lock" title="Requires X-API-Key header">
                                <Lock size={11} /> API Key
                              </span>
                            ) : (
                              <span className="badge badge-open" title="Publicly accessible">
                                <Unlock size={11} /> Public
                              </span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontWeight: 700 }}>{ep.total_requests}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setSelectedEndpointSlug(ep.slug);
                                  setActiveTab('playground');
                                }}
                                title="Test this API with a prompt"
                              >
                                <Play size={13} /> Test
                              </button>
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowCodeModal(ep)}
                                title="Get ready-to-copy code"
                              >
                                <Terminal size={13} /> Code
                              </button>
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleOpenEdit(ep)}
                                title="Edit this API"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button 
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteEndpoint(ep.id, ep.name)}
                                title="Delete this API"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 2: API KEYS MANAGEMENT */}
      {activeTab === 'keys' && (
        <section>
          <div className="section-header">
            <div>
              <h2 className="section-title">Client API Keys</h2>
              <p className="section-desc">You have full admin access. You can view, unhide, and copy any API key at any time.</p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowKeyModal(true)}>
              <Plus size={16} />
              <span>Generate New API Key</span>
            </button>
          </div>

          <div className="panel-card">
            {apiKeys.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <Key size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                <h3>No API Keys Yet</h3>
                <p>Generate an API key so external scripts and applications can authenticate with your APIs.</p>
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Key Name</th>
                      <th>API Key Secret (Click eye to reveal anytime)</th>
                      <th>Permissions</th>
                      <th>Total Calls</th>
                      <th>Created Date</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((k) => {
                      const isRevealed = Boolean(revealedKeys[k.id]);
                      const actualKey = k.raw_key || k.key_prefix;

                      return (
                        <tr key={k.id}>
                          <td>
                            <button 
                              onClick={() => handleToggleKey(k.id)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                              title="Click to activate/deactivate"
                            >
                              <span className={`badge ${k.is_active ? 'badge-active' : 'badge-inactive'}`}>
                                {k.is_active ? 'Active' : 'Revoked'}
                              </span>
                            </button>
                          </td>
                          <td style={{ fontWeight: 700, color: '#fff' }}>{k.name}</td>
                          <td style={{ minWidth: '320px' }}>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px',
                              background: 'rgba(0,0,0,0.5)',
                              padding: '6px 12px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid rgba(255,255,255,0.08)'
                            }}>
                              <code style={{ 
                                color: isRevealed ? '#34d399' : '#94a3b8', 
                                fontSize: '0.86rem', 
                                fontFamily: 'var(--font-mono)',
                                letterSpacing: isRevealed ? 'normal' : '0.15em'
                              }}>
                                {isRevealed ? actualKey : '••••••••••••••••••••••••••••••••'}
                              </code>

                              <button 
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '3px 8px' }}
                                onClick={() => toggleKeyVisibility(k.id)}
                                title={isRevealed ? "Hide key" : "Show full API key"}
                              >
                                {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>

                              <button 
                                className="btn btn-primary btn-sm"
                                style={{ padding: '3px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                onClick={() => copyToClipboard(actualKey, 'API Key copied to clipboard!')}
                                title="Copy API Key"
                              >
                                <Copy size={12} /> Copy
                              </button>
                            </div>
                          </td>
                          <td>
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              {k.allowed_slugs === '*' ? 'All APIs (*)' : k.allowed_slugs}
                            </span>
                          </td>
                          <td>{k.total_requests}</td>
                          <td style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                            {new Date(k.created_at).toLocaleDateString()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button 
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDeleteKey(k.id, k.name)}
                              title="Revoke and delete key"
                            >
                              <Trash2 size={13} /> Revoke
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 3: PLAYGROUND & CODE GENERATOR */}
      {activeTab === 'playground' && (
        <section>
          <div className="section-header">
            <div>
              <h2 className="section-title">API Playground & Interactive Tester</h2>
              <p className="section-desc">Test manual APIs in real time, and copy worldwide client code for Python, cURL, and JS.</p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Target API:</label>
              <select 
                className="form-select"
                style={{ width: 'auto', minWidth: '240px' }}
                value={selectedEndpointSlug}
                onChange={(e) => setSelectedEndpointSlug(e.target.value)}
              >
                {endpoints.map(e => (
                  <option key={e.slug} value={e.slug}>
                    {e.name} (/api/v1/run/{e.slug})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedEndpointObj ? (
            <div className="playground-grid">
              {/* Left Column: Test Runner */}
              <div className="panel-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ fontSize: '1.1rem' }}>Live Request Runner</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span className="badge badge-model">{selectedEndpointObj.model_name || 'LM Studio Auto'}</span>
                    <span className={`badge ${selectedEndpointObj.auth_required ? 'badge-lock' : 'badge-open'}`}>
                      {selectedEndpointObj.auth_required ? 'Requires Key' : 'Public'}
                    </span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">System Instructions (Injected by Gateway):</label>
                  <div style={{ 
                    padding: '8px 12px', 
                    background: 'rgba(0,0,0,0.3)', 
                    borderRadius: 'var(--radius-sm)', 
                    fontSize: '0.8rem', 
                    color: '#94a3b8',
                    fontFamily: 'var(--font-mono)' 
                  }}>
                    {selectedEndpointObj.system_prompt || 'No system prompt defined.'}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Prompt to send to this API:</label>
                  <textarea 
                    className="form-textarea"
                    rows={4}
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    placeholder="Enter prompt to send..."
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                      <input 
                        type="checkbox"
                        checked={testStream}
                        onChange={(e) => setTestStream(e.target.checked)}
                        disabled={!selectedEndpointObj.stream_allowed}
                      />
                      <span>Stream SSE</span>
                    </label>

                    <button
                      type="button"
                      className={`btn btn-sm ${testReasoning ? 'btn-primary' : 'btn-secondary'}`}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.8rem',
                        borderColor: testReasoning ? '#a855f7' : 'rgba(255,255,255,0.15)',
                        background: testReasoning ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255,255,255,0.05)',
                        color: testReasoning ? '#d8b4fe' : '#94a3b8'
                      }}
                      onClick={() => setTestReasoning(!testReasoning)}
                      title="Toggle LLM internal chain-of-thought / reasoning process"
                    >
                      {testReasoning ? '🧠 Reasoning: ON (Thinking)' : '⚡ Reasoning: OFF (Direct)'}
                    </button>
                  </div>

                  <button 
                    className="btn btn-primary"
                    disabled={testingStatus || !testPrompt.trim()}
                    onClick={handleRunPlayground}
                  >
                    {testingStatus ? <RefreshCw className="animate-spin" size={15} /> : <Send size={15} />}
                    <span>{testingStatus ? 'Generating...' : 'Send API Request'}</span>
                  </button>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Live Model Response:</label>
                    {testMetrics && (
                      <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                        Latency: {testMetrics.duration_ms}ms {testMetrics.streamed ? '• Streamed' : ''}
                      </span>
                    )}
                  </div>
                  <div className="response-window">
                    {testResponse || (testingStatus ? 'Waiting for tokens from LM Studio...' : 'Response from LM Studio will appear here...')}
                  </div>
                </div>
              </div>

              {/* Right Column: Code Snippets */}
              <div className="panel-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ fontSize: '1.1rem' }}>Worldwide Client Code Snippets</h3>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => copyToClipboard(getSnippets(selectedEndpointObj)[codeTab], 'Code snippet copied!')}
                  >
                    <Copy size={13} /> Copy Code
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '6px', marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                  <button 
                    className={`btn btn-sm ${codeTab === 'python_requests' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCodeTab('python_requests')}
                  >
                    Python (Requests)
                  </button>
                  <button 
                    className={`btn btn-sm ${codeTab === 'python_openai' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCodeTab('python_openai')}
                  >
                    Python (OpenAI SDK)
                  </button>
                  <button 
                    className={`btn btn-sm ${codeTab === 'curl' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCodeTab('curl')}
                  >
                    cURL
                  </button>
                  <button 
                    className={`btn btn-sm ${codeTab === 'javascript' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCodeTab('javascript')}
                  >
                    JavaScript
                  </button>
                  <button 
                    className={`btn btn-sm ${codeTab === 'golang' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCodeTab('golang')}
                  >
                    Go
                  </button>
                </div>

                <pre className="code-box" style={{ height: '360px' }}>
                  {getSnippets(selectedEndpointObj)[codeTab]}
                </pre>

                <div style={{ marginTop: 14, padding: '12px', background: 'rgba(6, 182, 212, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(6, 182, 212, 0.25)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#38bdf8', marginBottom: 4 }}>
                    Public Link (Worldwide):
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={{ fontSize: '0.82rem', color: '#fff', wordBreak: 'break-all' }}>
                      {getActiveBaseUrl()}/api/v1/run/{selectedEndpointObj.slug}
                    </code>
                    <button 
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '3px 8px' }}
                      onClick={() => copyToClipboard(`${getActiveBaseUrl()}/api/v1/run/${selectedEndpointObj.slug}`, 'Worldwide link copied!')}
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel-card" style={{ textAlign: 'center', padding: '40px' }}>
              <p>Please create an endpoint first in the "Manual APIs" tab.</p>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: REQUEST LOGS */}
      {activeTab === 'logs' && (
        <section>
          <div className="section-header">
            <div>
              <h2 className="section-title">Request Logs & Audit Trail</h2>
              <p className="section-desc">Every request sent to your APIs from around the world is logged here with latency and token usage.</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadData}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          <div className="panel-card">
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <Activity size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                <h3>No Logs Yet</h3>
                <p>When clients or tests invoke your APIs, live logs will appear here.</p>
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Endpoint</th>
                      <th>Client IP</th>
                      <th>Status</th>
                      <th>Latency</th>
                      <th>Tokens</th>
                      <th>Mode</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ color: 'var(--text-dim)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                        <td>
                          <code style={{ color: '#38bdf8', fontWeight: 600 }}>/run/{log.endpoint_slug}</code>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                          {log.client_ip || 'unknown'}
                        </td>
                        <td>
                          <span className={`badge ${log.status_code === 200 ? 'badge-active' : 'badge-inactive'}`} style={log.status_code >= 400 ? { color: '#fb7185', background: 'rgba(244,63,94,0.1)' } : {}}>
                            {log.status_code}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                          {log.duration_ms}ms
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                          {log.prompt_tokens + log.completion_tokens > 0 
                            ? `${log.prompt_tokens} in / ${log.completion_tokens} out`
                            : '-'}
                        </td>
                        <td>
                          <span className="badge" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            {log.stream ? 'SSE Stream' : 'JSON'}
                          </span>
                        </td>
                        <td style={{ color: '#fb7185', fontSize: '0.78rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.error_message || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 5: LM STUDIO & CLOUDFLARE */}
      {activeTab === 'settings' && (
        <section>
          <div className="section-header">
            <div>
              <h2 className="section-title">LM Studio & Cloudflare Tunnel Settings</h2>
              <p className="section-desc">Manage your local LM Studio connection and global public access.</p>
            </div>
          </div>

          <div className="playground-grid">
            {/* LM Studio Connection */}
            <div className="panel-card">
              <h3 style={{ fontSize: '1.15rem', marginBottom: 14 }}>LM Studio Connection</h3>
              
              <form onSubmit={handleSaveSettings}>
                <div className="form-group">
                  <label className="form-label">LM Studio Base URL:</label>
                  <input 
                    type="text"
                    className="form-input"
                    value={lmStudioUrl}
                    onChange={(e) => setLmStudioUrl(e.target.value)}
                    placeholder="http://127.0.0.1:1234/v1"
                  />
                  <div className="form-hint">
                    Default is <code>http://127.0.0.1:1234/v1</code>.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: 16 }}>
                  <button type="submit" className="btn btn-primary" disabled={updatingSettings}>
                    {updatingSettings ? 'Saving...' : 'Save URL'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={loadData}>
                    <RefreshCw size={14} /> Test LM Studio
                  </button>
                </div>
              </form>

              <div style={{ marginTop: 24, borderTop: '1px solid var(--border-subtle)', paddingTop: 18 }}>
                <h4 style={{ fontSize: '0.95rem', marginBottom: 10 }}>Detected Models in LM Studio:</h4>
                {lmStatus.models && lmStatus.models.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {lmStatus.models.map(m => (
                      <div key={m.id} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        background: 'rgba(99, 102, 241, 0.1)', 
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        <Cpu size={13} color="#a5b4fc" />
                        <span>{m.id}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                    No models detected. Open LM Studio and start the Local Server on port 1234.
                  </p>
                )}
              </div>
            </div>

            {/* Cloudflare Public Access */}
            <div className="panel-card">
              <h3 style={{ fontSize: '1.15rem', marginBottom: 14 }}>Global Public Access</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                To let computers on other Wi-Fi networks access your APIs worldwide, use the Cloudflare Tunnel script included in your folder.
              </p>

              <div style={{ background: '#060911', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 14 }}>
                <div style={{ color: '#38bdf8', fontSize: '0.82rem', fontWeight: 700, marginBottom: 6 }}>
                  Run Cloudflare Tunnel:
                </div>
                <code style={{ color: '#e2e8f0', fontSize: '0.84rem' }}>
                  Double-click start-cloudflare-tunnel.bat
                </code>
              </div>

              <div style={{ background: '#060911', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: '#34d399', fontSize: '0.82rem', fontWeight: 700, marginBottom: 6 }}>
                  Active Worldwide URL:
                </div>
                <p style={{ fontSize: '0.85rem', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                  {getActiveBaseUrl()}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* POPUP: "API CREATED SUCCESSFULLY" (WITH WORLDWIDE CLOUD LINK) */}
      {newlyCreatedEndpoint && (
        <div className="modal-overlay" onClick={() => setNewlyCreatedEndpoint(null)}>
          <div className="modal-content" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(52, 211, 153, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={20} color="#34d399" />
                </div>
                <div>
                  <h3 className="modal-title" style={{ color: '#34d399' }}>API Created Successfully!</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                    Your custom API is now live and ready to receive requests worldwide.
                  </p>
                </div>
              </div>
              <button className="close-btn" onClick={() => setNewlyCreatedEndpoint(null)}>&times;</button>
            </div>

            {/* Big Prominent URL Box */}
            <div style={{ 
              background: 'rgba(6, 182, 212, 0.08)', 
              border: '1px solid rgba(6, 182, 212, 0.35)', 
              borderRadius: 'var(--radius-md)', 
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                🌐 Worldwide API Request Link:
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <code style={{ 
                  background: '#040711', 
                  padding: '10px 14px', 
                  borderRadius: 'var(--radius-sm)', 
                  color: '#fff', 
                  fontSize: '0.92rem', 
                  flex: 1,
                  wordBreak: 'break-all',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  {getActiveBaseUrl()}/api/v1/run/{newlyCreatedEndpoint.slug}
                </code>

                <button 
                  className="btn btn-primary"
                  onClick={() => copyToClipboard(`${getActiveBaseUrl()}/api/v1/run/${newlyCreatedEndpoint.slug}`, 'Worldwide API Link copied!')}
                >
                  <Copy size={15} /> Copy API Link
                </button>
              </div>

              <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Target Model: <b style={{ color: '#fff' }}>{newlyCreatedEndpoint.model_name || 'LM Studio Auto'}</b> • Security: <b style={{ color: '#fff' }}>{newlyCreatedEndpoint.auth_required ? 'Requires API Key' : 'Public'}</b>
              </div>
            </div>

            {/* Quick Python Example */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e0e7ff' }}>
                  Quick Python Code Example (Worldwide):
                </span>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyToClipboard(getSnippets(newlyCreatedEndpoint)['python_requests'], 'Python code copied!')}
                >
                  <Copy size={13} /> Copy Python Code
                </button>
              </div>

              <pre className="code-box" style={{ maxHeight: '180px' }}>
                {getSnippets(newlyCreatedEndpoint)['python_requests']}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  setSelectedEndpointSlug(newlyCreatedEndpoint.slug);
                  setNewlyCreatedEndpoint(null);
                  setActiveTab('playground');
                }}
              >
                <Play size={14} /> Test in Playground
              </button>
              <button className="btn btn-primary" onClick={() => setNewlyCreatedEndpoint(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT ENDPOINT */}
      {showEndpointModal && (
        <div className="modal-overlay" onClick={() => setShowEndpointModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingEndpoint ? 'Edit Manual API' : 'Create New Manual API'}
              </h3>
              <button className="close-btn" onClick={() => setShowEndpointModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleSaveEndpoint}>
              <div className="form-group">
                <label className="form-label">API Name *</label>
                <input 
                  type="text"
                  required
                  className="form-input"
                  value={endpointForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
                    setEndpointForm({
                      ...endpointForm,
                      name,
                      slug: editingEndpoint ? endpointForm.slug : slug
                    });
                  }}
                  placeholder="e.g. Code Review Assistant"
                />
              </div>

              <div className="form-group">
                <label className="form-label">URL Slug / Route *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>/api/v1/run/</span>
                  <input 
                    type="text"
                    required
                    className="form-input"
                    value={endpointForm.slug}
                    onChange={(e) => setEndpointForm({ ...endpointForm, slug: e.target.value })}
                    placeholder="code-review"
                  />
                </div>
                <div className="form-hint">This forms the link clients will call worldwide.</div>
              </div>

              <div className="form-group">
                <label className="form-label">Assigned LM Studio Model</label>
                {lmStatus.models && lmStatus.models.length > 0 ? (
                  <select 
                    className="form-select"
                    value={endpointForm.model_name}
                    onChange={(e) => setEndpointForm({ ...endpointForm, model_name: e.target.value })}
                  >
                    <option value="">Auto-Detect / Any Loaded Model</option>
                    {lmStatus.models.map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                ) : (
                  <input 
                    type="text"
                    className="form-input"
                    value={endpointForm.model_name}
                    onChange={(e) => setEndpointForm({ ...endpointForm, model_name: e.target.value })}
                    placeholder="e.g. qwen/qwen3-coder-next"
                  />
                )}
                <div className="form-hint" style={{ color: '#fbbf24' }}>
                  💡 Make sure this model is loaded in the top bar of LM Studio!
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">System Instructions (Prompt)</label>
                <textarea 
                  className="form-textarea"
                  rows={4}
                  value={endpointForm.system_prompt}
                  onChange={(e) => setEndpointForm({ ...endpointForm, system_prompt: e.target.value })}
                  placeholder="Define role, behavior, tone, or constraints..."
                />
                <div className="form-hint">Automatically prepended to all client requests to control model behavior.</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Creativity (Temperature): {endpointForm.temperature}</label>
                  <input 
                    type="range"
                    min="0.0"
                    max="2.0"
                    step="0.05"
                    style={{ width: '100%' }}
                    value={endpointForm.temperature}
                    onChange={(e) => setEndpointForm({ ...endpointForm, temperature: parseFloat(e.target.value) })}
                  />
                  <div className="form-hint">0.0 = Deterministic/Code, 1.0+ = Creative</div>
                </div>

                <div className="form-group">
                  <label className="form-label">Max Output Tokens</label>
                  <input 
                    type="number"
                    className="form-input"
                    value={endpointForm.max_tokens}
                    onChange={(e) => setEndpointForm({ ...endpointForm, max_tokens: parseInt(e.target.value) || 1024 })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: 10, marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input 
                    type="checkbox"
                    checked={endpointForm.auth_required}
                    onChange={(e) => setEndpointForm({ ...endpointForm, auth_required: e.target.checked })}
                  />
                  <span>Require API Key</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input 
                    type="checkbox"
                    checked={endpointForm.stream_allowed}
                    onChange={(e) => setEndpointForm({ ...endpointForm, stream_allowed: e.target.checked })}
                  />
                  <span>Allow Streaming (SSE)</span>
                </label>

                <div style={{ gridColumn: 'span 2', padding: '10px 12px', background: 'rgba(168, 85, 247, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
                    <input 
                      type="checkbox"
                      checked={endpointForm.enable_reasoning}
                      onChange={(e) => setEndpointForm({ ...endpointForm, enable_reasoning: e.target.checked })}
                    />
                    <span style={{ color: endpointForm.enable_reasoning ? '#c084fc' : '#94a3b8' }}>
                      🧠 Enable Reasoning / Thinking Process by Default
                    </span>
                  </label>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px', marginLeft: '24px' }}>
                    When enabled, models with reasoning capability (like GLM-4.7, DeepSeek R1, Qwen Thinker) will think through problems. When disabled, models provide instant, direct answers. Clients can always override this in their API request via <code>"reasoning": false</code>.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEndpointModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : editingEndpoint ? 'Save Changes' : 'Create API & Get Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GENERATE API KEY */}
      {showKeyModal && (
        <div className="modal-overlay" onClick={() => setShowKeyModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Generate New API Key</h3>
              <button className="close-btn" onClick={() => setShowKeyModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleCreateKey}>
              <div className="form-group">
                <label className="form-label">Key Name / Client Identifier *</label>
                <input 
                  type="text"
                  required
                  className="form-input"
                  value={keyForm.name}
                  onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })}
                  placeholder="e.g. My Python Script, Mobile App, Team Member"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Allowed API Endpoints</label>
                <select 
                  className="form-select"
                  value={keyForm.allowed_slugs}
                  onChange={(e) => setKeyForm({ ...keyForm, allowed_slugs: e.target.value })}
                >
                  <option value="*">All Current & Future APIs (*)</option>
                  {endpoints.map(e => (
                    <option key={e.slug} value={e.slug}>Only "{e.name}" (/run/{e.slug})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowKeyModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW KEY CREATED (REVEAL) */}
      {newKeyCreated && (
        <div className="modal-overlay" onClick={() => setNewKeyCreated(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#34d399' }}>API Key Created</h3>
              <button className="close-btn" onClick={() => setNewKeyCreated(null)}>&times;</button>
            </div>

            <p style={{ fontSize: '0.9rem', color: '#cbd5e1', marginBottom: 14 }}>
              Here is your new API Key. You can also view, unhide, and copy it anytime in the <b>API Keys</b> tab!
            </p>

            <div style={{ 
              background: '#060911', 
              border: '1px solid rgba(52, 211, 153, 0.4)', 
              borderRadius: 'var(--radius-sm)', 
              padding: '14px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: 20
            }}>
              <code style={{ color: '#34d399', fontSize: '0.95rem', wordBreak: 'break-all' }}>
                {newKeyCreated.raw_api_key}
              </code>
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => copyToClipboard(newKeyCreated.raw_api_key, 'API Key copied!')}
              >
                <Copy size={14} /> Copy Key
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setNewKeyCreated(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VIEW CODE FOR AN ENDPOINT */}
      {showCodeModal && (
        <div className="modal-overlay" onClick={() => setShowCodeModal(null)}>
          <div className="modal-content" style={{ maxWidth: '780px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Integration Code: {showCodeModal.name}</h3>
              <button className="close-btn" onClick={() => setShowCodeModal(null)}>&times;</button>
            </div>

            <div style={{ 
              background: 'rgba(6, 182, 212, 0.1)', 
              padding: '10px 14px', 
              borderRadius: 'var(--radius-sm)', 
              border: '1px solid rgba(6, 182, 212, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16 
            }}>
              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#38bdf8', fontWeight: 700 }}>Worldwide API Link:</span>
                <div style={{ color: '#fff', fontSize: '0.88rem', fontFamily: 'var(--font-mono)' }}>
                  {getActiveBaseUrl()}/api/v1/run/{showCodeModal.slug}
                </div>
              </div>
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => copyToClipboard(`${getActiveBaseUrl()}/api/v1/run/${showCodeModal.slug}`, 'Worldwide link copied!')}
              >
                <Copy size={12} /> Copy Link
              </button>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginBottom: 14 }}>
              <button 
                className={`btn btn-sm ${codeTab === 'python_requests' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCodeTab('python_requests')}
              >
                Python Requests
              </button>
              <button 
                className={`btn btn-sm ${codeTab === 'python_openai' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCodeTab('python_openai')}
              >
                OpenAI SDK
              </button>
              <button 
                className={`btn btn-sm ${codeTab === 'curl' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCodeTab('curl')}
              >
                cURL
              </button>
              <button 
                className={`btn btn-sm ${codeTab === 'javascript' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCodeTab('javascript')}
              >
                JavaScript
              </button>
            </div>

            <pre className="code-box" style={{ height: '280px' }}>
              {getSnippets(showCodeModal)[codeTab]}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <button 
                className="btn btn-secondary"
                onClick={() => copyToClipboard(getSnippets(showCodeModal)[codeTab], 'Code copied!')}
              >
                <Copy size={14} /> Copy Snippet
              </button>
              <button className="btn btn-primary" onClick={() => setShowCodeModal(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
