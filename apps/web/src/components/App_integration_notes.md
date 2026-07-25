# Integration notes for App.tsx

## New imports
```tsx
import { UserAccessBadge } from './components/UserAccessBadge';
import { ComplianceStatusBadge, ComplianceSummaryStrip } from './components/ComplianceStatus';
import { PhiRevealCell } from './components/PhiRevealCell';
import { AddCredentialForm } from './components/AddCredentialForm';
import { DocumentCell } from './components/DocumentCell';
import { Credential, AuditEvent } from './components/types';
```
Remove the old local `Credential`/`AuditEvent` interfaces and the inline `UploadCell` —
both now live in the imported files. Delete `UploadCell` from App.tsx entirely;
`DocumentCell` replaces it.

## Header — add the badge next to user email
```tsx
<div className="user-info">
  <UserAccessBadge />
  <span className="user-email">{user?.email}</span>
  <button ...>Log Out</button>
</div>
```

## New state
```tsx
const [showAddForm, setShowAddForm] = useState(false);
```

## Action bar — add the button
```tsx
<div className="action-bar">
  <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
    ➕ Add Credential
  </button>
  {import.meta.env.DEV && (
    <button className="btn btn-secondary" onClick={handleSeed}>🌱 Seed Test Data</button>
  )}
  <button className="btn btn-secondary" onClick={handleFetchCredentials}>🔄 Refresh Credentials</button>
</div>

{showAddForm && (
  <AddCredentialForm
    apiBase={API_BASE}
    getAuthHeaders={getAuthHeaders}
    onCreated={() => { setShowAddForm(false); handleFetchCredentials(); }}
    onCancel={() => setShowAddForm(false)}
  />
)}
```

## Summary strip — above the table
```tsx
{credentials.length > 0 && <ComplianceSummaryStrip credentials={credentials} />}
```

## Table — updated columns
```tsx
<thead>
  <tr>
    <th>Provider Name</th>
    <th>DOB</th>
    <th>SSN</th>
    <th>License #</th>
    <th>Status</th>
    <th>Expires</th>
    <th>Created</th>
    <th>Document</th>
  </tr>
</thead>
<tbody>
  {credentials.map((cred) => (
    <tr key={cred.id}>
      <td>{cred.provider_name}</td>
      <td><PhiRevealCell value={cred.dob?.substring(0, 10) ?? null} /></td>
      <td><PhiRevealCell value={cred.ssn} /></td>
      <td>{cred.license_number}</td>
      <td><ComplianceStatusBadge expirationDate={cred.expiration_date} /></td>
      <td>{cred.expiration_date?.substring(0, 10)}</td>
      <td>{new Date(cred.created_at).toLocaleDateString()}</td>
      <td>
        <DocumentCell
          credentialId={cred.id}
          hasDocument={!!cred.document_key}
          apiBase={API_BASE}
          getAuthHeaders={getAuthHeaders}
          onUploaded={handleFetchCredentials}
        />
      </td>
    </tr>
  ))}
</tbody>
```

## Things to double check against the live backend before wiring this in
1. **`GET /credentials` must return `document_key`** so `DocumentCell` knows
   whether to show "View" vs the upload input. Confirm the SELECT in
   `credentials.routes.ts` includes it (it should, per the last verified diff).
2. **`license_number` is not in the masking denylist** in the current backend
   code we reviewed — only `provider_name`, `ssn`, `dob` are. Confirmed
   intentional? A license number isn't classic PHI, but worth a deliberate
   yes/no like the other masking decisions in this project, not a default.
3. **`UserAccessBadge` reads roles from `useAuth0()`'s `user` object — the
   ID token — not the access token.** The backend's `authMiddleware` reads
   roles from the *access* token it receives as a Bearer header. These are
   two different tokens and are only guaranteed to carry the same custom
   claims if the Auth0 Post-Login Action explicitly sets them on both
   (`api.idToken.setCustomClaim` AND `api.accessToken.setCustomClaim`).
   If the Action only sets the access token claim (likely, since that's
   all the backend needs), this badge will show "Role unknown" for
   everyone even though the backend is authorizing correctly. Worth
   checking the Auth0 Action config before assuming this component works
   as-is — this is exactly the kind of two-systems-silently-disagreeing
   issue that's come up repeatedly in this project.
