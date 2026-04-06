const BLOCKED_KEYWORDS = ['roadkill', 'dead animal', 'dismembered', 'parasitic infection'];

const BLOCKED_ICONIC_TAXA: string[] = [];

export function isBlockedContent(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKED_KEYWORDS.some(kw => lower.includes(kw));
}

export function isBlockedTaxon(iconicTaxonName: string): boolean {
  return BLOCKED_ICONIC_TAXA.includes(iconicTaxonName);
}

export function isAllowedLicense(licenseCode: string | null): boolean {
  if (!licenseCode) return true;
  const allowed = ['cc-by-nc', 'cc-by', 'cc0', 'cc-by-sa', 'cc-by-nc-sa'];
  return allowed.includes(licenseCode.toLowerCase());
}
