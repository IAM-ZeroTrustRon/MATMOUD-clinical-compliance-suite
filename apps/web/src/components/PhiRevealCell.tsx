import { useState, useEffect, useRef } from 'react';

interface PhiRevealCellProps {
  value: string | null;
  /** How long the value stays revealed before auto re-masking, in ms. */
  revealDurationMs?: number;
}

/**
 * Renders a PHI field masked by default. Click to reveal; re-masks
 * automatically after revealDurationMs or when the cell loses focus.
 *
 * Note: this is a display convenience, not a security boundary — the
 * underlying value is still present in component state/memory and the
 * network response the moment the row loads. Real access control is
 * enforced server-side via maskPhiFields() in rbac.ts, which returns
 * '[RESTRICTED]' for Tier 3 users. This component only controls what's
 * on-screen for users who are otherwise authorized to see the value.
 */
export function PhiRevealCell({ value, revealDurationMs = 8000 }: PhiRevealCellProps) {
  const [revealed, setRevealed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  if (value === null || value === '' || value === '[RESTRICTED]') {
    return <span className="phi-cell phi-restricted">{value === '[RESTRICTED]' ? '[RESTRICTED]' : '—'}</span>;
  }

  const handleReveal = () => {
    setRevealed(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setRevealed(false), revealDurationMs);
  };

  const handleHide = () => {
    clearTimeout(timeoutRef.current);
    setRevealed(false);
  };

  if (revealed) {
    return (
      <button type="button" className="phi-cell phi-revealed" onClick={handleHide} onBlur={handleHide}>
        {value}
      </button>
    );
  }

  return (
    <button type="button" className="phi-cell phi-masked" onClick={handleReveal}>
      •••• (click to reveal)
    </button>
  );
}
