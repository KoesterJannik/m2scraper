import * as fs from 'fs';
import * as path from 'path';

interface ItemNames { [vnum: string]: string; }
interface ItemDescriptions { [vnum: string]: string; }
interface StatMap { [statId: string]: string; }
interface SiteLang { sets?: { [key: string]: string }; [key: string]: any; }

const dataDir = path.resolve(__dirname, '../../data');

// Load all translation data once at startup
const itemNames: ItemNames = JSON.parse(
  fs.readFileSync(path.join(dataDir, 'item_names.json'), 'utf-8')
);

const itemDescriptions: ItemDescriptions = JSON.parse(
  fs.readFileSync(path.join(dataDir, 'item_desc.json'), 'utf-8')
);

const statMap: StatMap = JSON.parse(
  fs.readFileSync(path.join(dataDir, 'stat_map.json'), 'utf-8')
);

const siteLang: SiteLang = JSON.parse(
  fs.readFileSync(path.join(dataDir, 'site_lang.json'), 'utf-8')
);

/**
 * Get German name for a vnum
 */
export function getGermanName(vnum: number): string | null {
  return itemNames[vnum.toString()] || null;
}

/**
 * Get German description for a vnum
 */
export function getGermanDescription(vnum: number): string | null {
  return itemDescriptions[vnum.toString()] || null;
}

/**
 * Get German set name
 */
export function getGermanSetName(setId: number): string | null {
  if (setId > 0 && siteLang.sets) {
    return siteLang.sets[setId.toString()] || null;
  }
  return null;
}

/**
 * Search vnums by German name (case-insensitive partial match)
 */
export function searchVnumsByName(searchTerm: string): number[] {
  const lower = searchTerm.toLowerCase();
  const results: number[] = [];
  
  for (const [vnum, name] of Object.entries(itemNames)) {
    if (name.toLowerCase().includes(lower)) {
      results.push(parseInt(vnum));
    }
  }
  
  return results;
}

/**
 * Get all item names (for bulk translation)
 */
export function getAllItemNames(): ItemNames {
  return itemNames;
}

/**
 * Search item names and return matching name strings (deduplicated, limited)
 */
export function suggestItemNames(query: string, limit = 20): string[] {
  const lower = query.toLowerCase();
  const seen = new Set<string>();
  const results: string[] = [];

  for (const name of Object.values(itemNames)) {
    if (name.toLowerCase().includes(lower)) {
      const lowerName = name.toLowerCase();
      if (!seen.has(lowerName)) {
        seen.add(lowerName);
        results.push(name);
        if (results.length >= limit) break;
      }
    }
  }

  return results;
}

/**
 * Get all attribute names from stat_map (cleaned for display)
 */
let _cachedAttrNames: string[] | null = null;
export function getAttributeNames(): string[] {
  if (_cachedAttrNames) return _cachedAttrNames;

  const seen = new Set<string>();
  const results: string[] = [];

  for (const desc of Object.values(statMap)) {
    // Strip format specifiers and %% so the remaining text matches actual descriptions
    // e.g. "Ohnmachtschance %d%%" → "Ohnmachtschance"
    // e.g. "%d%% Chance auf durchbohrenden Treffer" → "Chance auf durchbohrenden Treffer"
    const cleaned = desc
      .replace(/%0?\.\d+f/g, '')   // %0.1f etc
      .replace(/%d/g, '')           // %d
      .replace(/%%/g, '')           // %%
      .replace(/[+\-]/g, '')        // + -
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      results.push(cleaned);
    }
  }

  _cachedAttrNames = results;
  return _cachedAttrNames;
}