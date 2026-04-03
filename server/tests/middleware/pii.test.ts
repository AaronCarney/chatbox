import { stripPii } from '../../src/middleware/pii';

describe('stripPii', () => {
  describe('email patterns', () => {
    it('replaces simple email with [REDACTED_EMAIL]', () => {
      const text = 'Contact me at john.doe@example.com for details';
      expect(stripPii(text)).toBe('Contact me at [REDACTED_EMAIL] for details');
    });

    it('replaces multiple emails', () => {
      const text = 'Emails: alice@company.com and bob.smith@org.net';
      expect(stripPii(text)).toBe('Emails: [REDACTED_EMAIL] and [REDACTED_EMAIL]');
    });

    it('handles email with numbers and special chars', () => {
      const text = 'Send to user123.name+tag@sub.domain.co.uk';
      expect(stripPii(text)).toBe('Send to [REDACTED_EMAIL]');
    });
  });

  describe('phone patterns', () => {
    it('replaces XXX-XXX-XXXX format', () => {
      const text = 'Call me at 555-123-4567 anytime';
      expect(stripPii(text)).toBe('Call me at [REDACTED_PHONE] anytime');
    });

    it('replaces (XXX) XXX-XXXX format', () => {
      const text = 'My number is (555) 123-4567';
      expect(stripPii(text)).toBe('My number is [REDACTED_PHONE]');
    });

    it('replaces (XXX) XXX.XXXX format', () => {
      const text = 'Reach me at (555) 123.4567';
      expect(stripPii(text)).toBe('Reach me at [REDACTED_PHONE]');
    });

    it('replaces XXX.XXX.XXXX format', () => {
      const text = 'Phone: 555.123.4567 for support';
      expect(stripPii(text)).toBe('Phone: [REDACTED_PHONE] for support');
    });

    it('replaces multiple phone numbers', () => {
      const text = 'Primary: 555-123-4567, Secondary: (555) 987-6543';
      expect(stripPii(text)).toBe('Primary: [REDACTED_PHONE], Secondary: [REDACTED_PHONE]');
    });
  });

  describe('SSN patterns', () => {
    it('replaces XXX-XX-XXXX format', () => {
      const text = 'SSN: 123-45-6789 on file';
      expect(stripPii(text)).toBe('SSN: [REDACTED_SSN] on file');
    });

    it('replaces multiple SSNs', () => {
      const text = 'Records for 123-45-6789 and 987-65-4321';
      expect(stripPii(text)).toBe('Records for [REDACTED_SSN] and [REDACTED_SSN]');
    });

    it('SSN takes precedence over phone pattern (order matters)', () => {
      const text = 'SSN 123-45-6789 is different from phone';
      expect(stripPii(text)).toBe('SSN [REDACTED_SSN] is different from phone');
    });
  });

  describe('edge cases', () => {
    it('passes through text without PII unchanged', () => {
      const text = 'This is clean text with no sensitive information';
      expect(stripPii(text)).toBe(text);
    });

    it('handles mixed content', () => {
      const text = 'User john@example.com called 555-123-4567 with SSN 123-45-6789';
      expect(stripPii(text)).toBe('User [REDACTED_EMAIL] called [REDACTED_PHONE] with SSN [REDACTED_SSN]');
    });

    it('handles empty string', () => {
      expect(stripPii('')).toBe('');
    });

    it('does not redact partial patterns', () => {
      const text = 'Almost an email: john@example and almost a phone: 555-123';
      expect(stripPii(text)).toBe(text);
    });
  });
});
