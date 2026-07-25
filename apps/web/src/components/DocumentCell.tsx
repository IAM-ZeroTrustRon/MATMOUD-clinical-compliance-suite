import { useState } from 'react';

interface DocumentCellProps {
  credentialId: string;
  hasDocument: boolean;
  apiBase: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onUploaded: () => void;
}

export function DocumentCell({ credentialId, hasDocument, apiBase, getAuthHeaders, onUploaded }: DocumentCellProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const headers = await getAuthHeaders();
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${apiBase}/credentials/${credentialId}/upload`, {
        method: 'POST',
        headers: { Authorization: headers.Authorization },
        body: formData,
      });

      const data = await res.json();
      if (res.ok || res.status === 201) {
        setUploadResult('✅ Uploaded');
        onUploaded();
      } else {
        setUploadResult(`❌ ${data.error || res.statusText}`);
      }
    } catch (err: unknown) {
      setUploadResult(`❌ ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleView = async () => {
    setViewing(true);
    setViewError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiBase}/credentials/${credentialId}/document`, { headers });
      const data = await res.json();

      if (!res.ok) {
        setViewError(data.error || 'Could not retrieve document');
        return;
      }

      // Signed URL is short-lived (5 min) — open immediately, don't store it.
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      setViewError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setViewing(false);
    }
  };

  if (hasDocument) {
    return (
      <div className="document-cell">
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleView} disabled={viewing}>
          {viewing ? 'Opening…' : '📄 View Document'}
        </button>
        {viewError && <span className="upload-result">❌ {viewError}</span>}
      </div>
    );
  }

  return (
    <div className="document-cell upload-cell">
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
