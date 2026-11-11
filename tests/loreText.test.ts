import { describe, expect, it } from 'vitest';
import { loreHeading, loreText } from '../shared/loreText';

describe('lore text clean-up (display only)', () => {
  it('drops citations, source tags and file references', () => {
    expect(loreText('Kaelmar was never covered by the Loom. (A: Place in the world)')).toBe('Kaelmar was never covered by the Loom.');
    expect(loreText('Aetheris and Kaelmar share species. See Kaelmar_Setting_Bible.md: Peoples and creatures.')).toBe('Aetheris and Kaelmar share species.');
    expect(loreText('- What the Watchers want. [UNDEFINED]')).toBe('- What the Watchers want.');
    expect(loreText('| The Shattering | The Elders broke the Ethereal Crystal. See COS-902. |')).toBe('| The Shattering | The Elders broke the Ethereal Crystal. |');
  });
  it('removes source phrases but keeps the lore around them', () => {
    expect(loreText('**Strengths and flaws as described by the cards:** Stubborn.')).toBe('**Strengths and flaws:** Stubborn.');
    expect(loreText('Three gods are dead, and their remains are places in the cards:')).toBe('Three gods are dead, and their remains are places:');
    expect(loreText('The Drowned City is probably the Abyssal Hollow, but the bibles do not say so.')).toBe('The Drowned City is probably the Abyssal Hollow.');
    expect(loreText('| Age | What the cards say |')).toBe('| Age | What is told |');
  });
  it('drops sentences that are only about the source or the rules books', () => {
    expect(loreText('Wizard (Evoker) or Sorcerer\n\nThis is a setting-facing calling, not a new official character class. Verify any selected subclass.')).toBe('Wizard (Evoker) or Sorcerer');
    expect(loreText('Exact borders and coordinates are UNDEFINED.')).toBe('');
  });
  it('keeps secrecy markers and plain lore untouched', () => {
    expect(loreHeading('The sealed warning [SECRET]')).toBe('The sealed warning [SECRET]');
    expect(loreHeading('D&D adaptation [SOURCE-PROVIDED; OPTIONAL RULES WHERE NOT CORE]')).toBe('D&D adaptation');
    expect(loreHeading('Culture and names from the source')).toBe('Culture and names');
    const lore = 'A sunless sea between Aetheris and Kaelmar.\n\n- Crews light no lanterns over the trench.';
    expect(loreText(lore)).toBe(lore);
  });
});

describe('lore text clean-up: lineage notes', () => {
  it('turns a card note into a plain statement', () => {
    expect(loreText('Moonborn appear in Aetheris character cards as Wildborn druids who move between worlds.')).toBe('Moonborn are Wildborn druids who move between worlds.');
  });
});

describe('lore text clean-up: futures', () => {
  it('speaks of a possible future as a date, not a book', () => {
    expect(loreText('The 927 AB novel is a possible future, not the current world.')).toBe('927 AB is a possible future, not the current world.');
  });
});
