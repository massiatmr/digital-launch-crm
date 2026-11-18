import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('supabase/functions/detect-booking-from-conversation/index.ts', 'utf8');

describe('detect-booking-from-conversation HTML escaping', () => {
  it('uses the shared escapeHtml helper', () => {
    expect(source).toMatch(/import \{[^}]*escapeHtml[^}]*\} from "\.\.\/_shared\/internalAuth\.ts"/);
  });

  it('never re-declares escapeHtml locally (a local const would shadow the import and hit the TDZ)', () => {
    expect(source).not.toMatch(/(^|\n)\s*(const|let|var|function)\s+escapeHtml\b/);
  });

  it('escapes the Meet link before putting it in the owner notification href', () => {
    const meetRow = source.match(/const meetRow =[\s\S]*?: "";/);
    expect(meetRow).not.toBeNull();
    expect(meetRow![0]).toContain('escapeHtml(meetLink)');
  });
});
