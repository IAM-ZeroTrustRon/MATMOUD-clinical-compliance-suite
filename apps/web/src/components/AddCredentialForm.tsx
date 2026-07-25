import { useState } from 'react';

interface AddCredentialFormProps {
  apiBase: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onCreated: () => void;
  onCancel: () => void;
}

export function AddCredentialForm({ apiBase, getAuthHeaders, onCreated, onCancel }: AddCredentialFormProps) {
  const [providerName, setProviderName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [ssn, setSsn] = useState('');
  const [dob, setDob] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!providerName || !licenseNumber || !expirationDate) {
      setError('Provider name, license number, and expiration date are required.');
      return;
    }

    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${apiBase}/credentials`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider_name: providerName,
          license_number: licenseNumber,
          expiration_date: expirationDate,
          ssn: ssn || undefined,
          dob: dob || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Failed to create credential (${res.status})`);
        return;
      }

      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="add-credential-form" onSubmit={handleSubmit}>
      <h3>Add Credential</h3>
      {error && <div className="error-banner">{error}</div>}

      <label>
        Provider Name *
        <input value={providerName} onChange={(e) => setProviderName(e.target.value)} required />
      </label>

      <label>
        License Number *
        <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required />
      </label>

      <label>
        Expiration Date *
        <input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} required />
      </label>

      <label>
        SSN <span className="optional-tag">(optional)</span>
        <input value={ssn} onChange={(e) => setSsn(e.target.value)} placeholder="Leave blank if not required" />
      </label>

      <label>
        Date of Birth <span className="optional-tag">(optional)</span>
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
      </label>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Credential'}
        </button>
      </div>
    </form>
  );
}
