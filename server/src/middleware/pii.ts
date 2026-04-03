export function stripPii(text: string): string {
  // Process in order: SSN first (more specific), then email, then phone
  // SSN pattern: XXX-XX-XXXX
  let result = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
  
  // Email pattern: standard email format
  result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
  
  // Phone patterns: must handle multiple formats
  // Format: XXX-XXX-XXXX or XXX.XXX.XXXX
  result = result.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED_PHONE]');
  
  // Format: (XXX) XXX-XXXX or (XXX) XXX.XXXX
  result = result.replace(/\(\d{3}\)\s?\d{3}[-.]?\d{4}/g, '[REDACTED_PHONE]');
  
  return result;
}
