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
