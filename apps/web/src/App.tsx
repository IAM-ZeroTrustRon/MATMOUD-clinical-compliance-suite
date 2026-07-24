import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect, useCallback } from 'react';
import './App.css';

interface Credential {
  id: string;
  provider_name: string; // PHI
  dob: string; // PHI
  ssn: string; // PHI
  license_number: string; // PHI
  expiration_date: string;
  created_at: string;
}

interface AuditEvent {
  id: number;
  user_id: string;
  action_type: string;
  resource_id: string | null;
  occurred_at: string;
  ip_address: string | null;
  http_status: number;
}

/** --------------------------------------------------------------------------
 * UploadCell — renders a file input + upload button for a single credential.
 * Posts to POST /credentials/:id/upload with the file.
 * Only shown when the user holds a Tier 4+ role (enforced server-side).
 * -------------------------------------------------------------------------- */
interface UploadCellProps {
  credentialId: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  API_BASE: string;
}

function UploadCell({ credentialId, getAuthHeaders, API_BASE }: UploadCellProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const token = await getAuthHeaders().then((h) => h.Authorization.replace('Bearer ', ''));
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/credentials/${credentialId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (res.ok || res.status === 201) {
        setUploadResult('✅');
      } else {
        setUploadResult(`❌ ${data.error || res.statusText}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setUploadResult(`❌ ${message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-cell">
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={handleUpload}
        disabled={uploading}
        title="Upload PDF or image (max 10 MB)"
      />
      {uploading && <span className="upload-spinner">⏳</span>}
      {uploadResult && <span className="upload-result">{uploadResult}</span>}
    </div>
  );
}

function App() {
  const {
    loginWithRedirect,
    logout,
    user,
    isAuthenticated,
    isLoading,
    getAccessTokenSilently,
  } = useAuth0();

  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'audit'>('dashboard');
  const [apiStatus, setApiStatus] = useState<string>('Checking API...');
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getAccessTokenSilently();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, [getAccessTokenSilently]);

  // Health check on mount
  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((res) => res.json())
      .then((data) => {
        if (data.postgres === 'connected') {
          setApiStatus('✅ API & Database Connected');
        } else {
          setApiStatus('⚠️ API Degraded: ' + data.detail);
        }
      })
      .catch((err) => {
        setApiStatus('❌ API Unreachable: ' + err.message);
      });
  }, [API_BASE]);

  const handleSeed = async () => {
    try {
      setError(null);
      setSeedResult('Seeding...');
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/credentials/seed`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (res.ok || res.status === 201) {
        setSeedResult(`✅ Seed successful: ${data.message || JSON.stringify(data.record)}`);
        // Refresh credentials after seeding
        handleFetchCredentials();
      } else {
        setSeedResult(`❌ Seed failed: ${data.error || res.statusText}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setSeedResult(`❌ Seed error: ${message}`);
      setError(message);
    }
  };

  const handleFetchCredentials = async () => {
    try {
      setError(null);
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/credentials`, { headers });
      const data = await res.json();
      if (res.ok) {
        setCredentials(data);
      } else {
        setError(`Failed to fetch credentials: ${data.error || res.statusText}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    }
  };

  const handleFetchAuditLogs = async () => {
    try {
      setError(null);
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/audit-logs`, { headers });
      const data = await res.json();
      if (res.ok) {
        setAuditLogs(data.data || []);
      } else {
        setError(`Failed to fetch audit logs: ${data.error || res.statusText}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    }
  };

  useEffect(() => {
    if (isAuthenticated && activeTab === 'dashboard') {
      handleFetchCredentials();
    }
  }, [isAuthenticated, activeTab]);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'audit') {
      handleFetchAuditLogs();
    }
  }, [isAuthenticated, activeTab]);

  if (isLoading) {
    return (
      <div className="app-container">
        <div className="loading">Loading authentication...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="app-container">
        <header className="app-header">
          <h1>Clinical Compliance Suite</h1>
          <p className="subtitle">HIPAA-Compliant MAT/MOUD Credential Management</p>
        </header>
        <main className="app-main">
          <div className="login-card">
            <h2>Welcome</h2>
            <p>Please log in with your Auth0 credentials to access the credential management dashboard.</p>
            <p className="compliance-note">
              🔒 Multi-Factor Authentication (MFA) is required per HIPAA compliance standards.
            </p>
            <button 
              type="button" 
              onClick={(e) => {
                e.preventDefault();
                loginWithRedirect();
              }}
            >
              Log In with Auth0
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>Clinical Compliance Suite</h1>
          <div className="user-info">
            <span className="user-email">{user?.email}</span>
            <button className="btn btn-secondary" onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>
              Log Out
            </button>
          </div>
        </div>
        <div className="status-bar">
          <span className={`status-indicator ${apiStatus.includes('✅') ? 'connected' : 'degraded'}`}>
            {apiStatus}
          </span>
        </div>
      </header>

      <nav className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          📋 Credential Dashboard
        </button>
        <button
          className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          📜 Audit Trail
        </button>
      </nav>

      <main className="app-main">
        {error && <div className="error-banner">{error}</div>}

        {activeTab === 'dashboard' && (
          <div className="dashboard">
            <div className="action-bar">
              {import.meta.env.DEV && (
                <button className="btn btn-primary" onClick={handleSeed}>
                  🌱 Seed Test Data
                </button>
              )}
              <button className="btn btn-secondary" onClick={handleFetchCredentials}>
                🔄 Refresh Credentials
              </button>
            </div>

            {seedResult && (
              <div className={`seed-result ${seedResult.includes('✅') ? 'success' : 'error'}`}>
                {seedResult}
              </div>
            )}

            <div className="credentials-table-wrapper">
              <h2>Credentials ({credentials.length})</h2>
              {credentials.length === 0 ? (
                <div className="empty-state">
                  <p>No credentials found. Click "Seed Test Data" to create mock records.</p>
                </div>
              ) : (
                <table className="credentials-table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>DOB</th>
                      <th>SSN</th>
                      <th>License #</th>
                      <th>Expires</th>
                      <th>Created</th>
                      <th>Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credentials.map((cred) => (
                      <tr key={cred.id}>
                        <td>{cred.provider_name}</td>
                        <td>{cred.dob?.substring(0, 10)}</td>
                        <td className={cred.ssn === '[RESTRICTED]' ? 'phi-restricted' : ''}>
                          {cred.ssn}
                        </td>
                        <td className={cred.license_number === '[RESTRICTED]' ? 'phi-restricted' : ''}>
                          {cred.license_number}
                        </td>
                        <td>{cred.expiration_date?.substring(0, 10)}</td>
                        <td>{new Date(cred.created_at).toLocaleDateString()}</td>
                        <td>
                          <UploadCell credentialId={cred.id} getAuthHeaders={getAuthHeaders} API_BASE={API_BASE} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="audit-logs">
            <div className="action-bar">
              <button className="btn btn-secondary" onClick={handleFetchAuditLogs}>
                🔄 Refresh Audit Logs
              </button>
            </div>

            <div className="audit-table-wrapper">
              <h2>Audit Events ({auditLogs.length})</h2>
              {auditLogs.length === 0 ? (
                <div className="empty-state">
                  <p>No audit events found. Seed test data and fetch credentials to generate audit events.</p>
                </div>
              ) : (
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>User ID</th>
                      <th>Action Type</th>
                      <th>Resource ID</th>
                      <th>Occurred At</th>
                      <th>IP Address</th>
                      <th>HTTP Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((event) => (
                      <tr key={event.id}>
                        <td>{event.id}</td>
                        <td className="mono">{event.user_id.substring(0, 20)}...</td>
                        <td><code>{event.action_type}</code></td>
                        <td className="mono">{event.resource_id?.substring(0, 8) || '—'}</td>
                        <td>{new Date(event.occurred_at).toLocaleString()}</td>
                        <td className="mono">{event.ip_address || '—'}</td>
                        <td>
                          <span className={`http-status status-${event.http_status}`}>
                            {event.http_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

