import { InpatientCage } from '../types';
import { INITIAL_CAGES } from '../mockData';

export const STANDARD_CAGE_IDS = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
] as const;

export type StandardCageId = (typeof STANDARD_CAGE_IDS)[number];

/**
 * Normalizes any cage ID or label into one of the 12 standard physical cages: A1-A6, B1-B6.
 * Returns null if the record is a historical cag-... ID or unrecognized.
 */
export function normalizeCageId(rawId?: any, rawLabel?: any): StandardCageId | null {
  const strId = String(rawId || '').toUpperCase().trim();
  if (STANDARD_CAGE_IDS.includes(strId as StandardCageId)) {
    return strId as StandardCageId;
  }

  const combined = `${strId} ${String(rawLabel || '').toUpperCase()}`;
  const match = combined.match(/\b([AB])\s*[-_]?\s*([1-6])\b/);
  if (match) {
    const candidate = `${match[1]}${match[2]}` as StandardCageId;
    if (STANDARD_CAGE_IDS.includes(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Checks if an ID is one of the 12 standard physical cages.
 */
export function isStandardCageId(id?: any): boolean {
  return normalizeCageId(id) !== null;
}

/**
 * Sanitizes any cages array to ensure the layout strictly contains ONLY the 12 physical cages
 * (A1-A6, B1-B6) in order, with their ID matching their cage name.
 * Historical records (cag-..., status: 'selesai', etc.) are excluded from active cages.
 */
export function sanitizeCagesList(rawCages: any[]): InpatientCage[] {
  const cageMap = new Map<StandardCageId, InpatientCage>();
  INITIAL_CAGES.forEach((ic) => cageMap.set(ic.id as StandardCageId, { ...ic }));

  if (Array.isArray(rawCages)) {
    rawCages.forEach((c) => {
      if (!c) return;
      const normalizedId = normalizeCageId(c.id, c.label);
      if (!normalizedId) {
        // Exclude cag-... and non-standard IDs from physical cages layout
        return;
      }

      const statusLower = String(c.status || '').toLowerCase();
      // If status is 'selesai' or empty, the cage is currently empty/Available
      if (statusLower === 'selesai' || !c.status) {
        return;
      }

      const defaultCage = cageMap.get(normalizedId)!;
      let obs: any = c.observations;
      if (typeof obs === 'string' && obs.trim()) {
        try {
          obs = JSON.parse(obs);
        } catch {
          obs = [];
        }
      }

      cageMap.set(normalizedId, {
        ...defaultCage,
        ...c,
        id: normalizedId, // ID strictly follows cage name (A1..B6)
        label: defaultCage.label,
        status: c.status === 'Cleaning' ? 'Cleaning' : c.status === 'Occupied' ? 'Occupied' : 'Available',
        observations: Array.isArray(obs) ? obs : [],
      });
    });
  }

  return INITIAL_CAGES.map((ic) => cageMap.get(ic.id as StandardCageId) || ic);
}
