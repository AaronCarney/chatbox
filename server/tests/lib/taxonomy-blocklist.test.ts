import { describe, it, expect } from 'vitest';
import { isBlockedContent, isBlockedTaxon, isAllowedLicense } from '../../src/lib/taxonomy-blocklist.js';

describe('isBlockedContent', () => {
  it('blocks roadkill keywords', () => {
    expect(isBlockedContent('roadkill observation')).toBe(true);
    expect(isBlockedContent('Found Roadkill on highway')).toBe(true);
  });

  it('blocks dead animal keywords', () => {
    expect(isBlockedContent('dead animal found near lake')).toBe(true);
  });

  it('blocks dismembered keywords', () => {
    expect(isBlockedContent('dismembered specimen')).toBe(true);
  });

  it('blocks parasitic infection keywords', () => {
    expect(isBlockedContent('parasitic infection observed')).toBe(true);
  });

  it('allows normal species names', () => {
    expect(isBlockedContent('Monarch Butterfly')).toBe(false);
    expect(isBlockedContent('Danaus plexippus')).toBe(false);
    expect(isBlockedContent('Red-tailed Hawk')).toBe(false);
  });

  it('allows educational terms that are substrings of blocked words', () => {
    expect(isBlockedContent('parasite biology')).toBe(false); // not "parasitic infection"
    expect(isBlockedContent('dead leaves')).toBe(false); // not "dead animal"
  });
});

describe('isBlockedTaxon', () => {
  it('allows standard iconic taxa', () => {
    expect(isBlockedTaxon('Animalia')).toBe(false);
    expect(isBlockedTaxon('Plantae')).toBe(false);
    expect(isBlockedTaxon('Fungi')).toBe(false);
    expect(isBlockedTaxon('Insecta')).toBe(false);
  });

  it('allows empty string', () => {
    expect(isBlockedTaxon('')).toBe(false);
  });
});

describe('isAllowedLicense', () => {
  it('allows CC BY-NC', () => {
    expect(isAllowedLicense('cc-by-nc')).toBe(true);
    expect(isAllowedLicense('CC-BY-NC')).toBe(true);
  });

  it('allows CC BY', () => {
    expect(isAllowedLicense('cc-by')).toBe(true);
  });

  it('allows CC0', () => {
    expect(isAllowedLicense('cc0')).toBe(true);
  });

  it('allows CC BY-SA', () => {
    expect(isAllowedLicense('cc-by-sa')).toBe(true);
  });

  it('allows CC BY-NC-SA', () => {
    expect(isAllowedLicense('cc-by-nc-sa')).toBe(true);
  });

  it('allows null license (iNaturalist default)', () => {
    expect(isAllowedLicense(null)).toBe(true);
  });

  it('rejects all-rights-reserved', () => {
    expect(isAllowedLicense('all-rights-reserved')).toBe(false);
  });

  it('rejects unknown licenses', () => {
    expect(isAllowedLicense('proprietary')).toBe(false);
    expect(isAllowedLicense('cc-by-nd')).toBe(false);
  });
});
