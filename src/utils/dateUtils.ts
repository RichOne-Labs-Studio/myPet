/**
 * Date & Time Utility for Vier Pet Care
 * Provides standard, accurate date and time formatting for Google Spreadsheet & UI display.
 */

/**
 * Returns formatted registration timestamp containing both date and time:
 * Format: "YYYY-MM-DD HH:mm:ss" (e.g., "2026-09-22 14:35:10")
 * This format is standard, unambiguous, and recognized by Google Sheets as a valid datetime.
 */
export function getRegistrationTimestamp(date: Date = new Date()): string {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Formats a date string or timestamp for readable Indonesian display:
 * Example: "22/09/2026 14:35 WIB"
 */
export function formatDateTimeDisplay(val?: string | null): string {
  if (!val || typeof val !== 'string' || !val.trim()) return '-';
  const clean = val.trim();

  // If already in "YYYY-MM-DD HH:mm:ss" format
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(clean)) {
    const [datePart, timePart] = clean.split(' ');
    const [y, m, d] = datePart.split('-');
    const [hh, mm] = timePart.split(':');
    return `${d}/${m}/${y} ${hh}:${mm} WIB`;
  }

  // If ISO string like "2026-09-22T07:00:00.000Z"
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes} WIB`;
  }

  return clean;
}

/**
 * Checks if a date string / timestamp belongs to today.
 */
export function isToday(val?: string | null): boolean {
  if (!val || typeof val !== 'string' || !val.trim()) return true;
  const clean = val.trim();
  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();

  // Match YYYY-MM-DD
  const matchYMD = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchYMD) {
    const y = parseInt(matchYMD[1], 10);
    const m = parseInt(matchYMD[2], 10);
    const d = parseInt(matchYMD[3], 10);
    return y === todayY && m === todayM && d === todayD;
  }

  // Match DD/MM/YYYY
  const matchDMY = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (matchDMY) {
    const d = parseInt(matchDMY[1], 10);
    const m = parseInt(matchDMY[2], 10);
    const y = parseInt(matchDMY[3], 10);
    return y === todayY && m === todayM && d === todayD;
  }

  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return (
      parsed.getFullYear() === todayY &&
      parsed.getMonth() + 1 === todayM &&
      parsed.getDate() === todayD
    );
  }

  return true;
}

/**
 * Extracts just the time portion "HH:mm WIB" from a timestamp string or returns current time
 */
export function formatTimeOnly(val?: string | null): string {
  if (!val) {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
  }

  if (typeof val === 'string' && val.includes('WIB')) {
    return val;
  }

  const parsed = new Date(val);
  if (!isNaN(parsed.getTime())) {
    return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')} WIB`;
  }

  if (typeof val === 'string' && val.includes(' ')) {
    const timePart = val.split(' ')[1];
    if (timePart) {
      const parts = timePart.split(':');
      if (parts.length >= 2) {
        return `${parts[0]}:${parts[1]} WIB`;
      }
    }
  }

  return val;
}

/**
 * Sanitizes and converts any datetime string containing AM/PM to 24-hour format.
 * E.g., "22/09/2026 02:30:15 PM" -> "22/09/2026 14:30:15"
 */
export function convertAmPmTo24h(val?: string | null): string {
  if (!val || typeof val !== 'string') return val || '';
  const clean = val.trim();
  const upper = clean.toUpperCase();
  if (!upper.includes('AM') && !upper.includes('PM')) {
    return clean;
  }

  const timeRegex = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i;
  const match = clean.match(timeRegex);
  if (match) {
    let hour = parseInt(match[1], 10);
    const minute = match[2];
    const second = match[3] || '00';
    const ampm = match[4].toUpperCase();

    if (ampm === 'PM' && hour < 12) {
      hour += 12;
    } else if (ampm === 'AM' && hour === 12) {
      hour = 0;
    }

    const hourStr = String(hour).padStart(2, '0');
    const hasSeconds = !!match[3];
    const newTime = `${hourStr}:${minute}${hasSeconds ? `:${second}` : ''}`;
    
    // Replace the matched time and AM/PM part
    let result = clean.replace(timeRegex, newTime).replace(/\s*(AM|PM)/gi, '').trim();
    // Keep WIB if it was there
    if (upper.includes('WIB') && !result.includes('WIB')) {
      result = `${result} WIB`;
    }
    return result;
  }

  return clean;
}

/**
 * Formats an expiration date string (e.g. "2027-06-30" or ISO string) to readable Indonesian format.
 * Example: "2027-06-30" or "2027-06-30T07:00:00.000Z" -> "30 Juni 2027"
 */
export function formatExpirationDate(val?: string | null): string {
  if (!val || typeof val !== 'string' || !val.trim()) return '-';
  const clean = val.trim();

  // If already in YYYY-MM-DD or containing it
  const matchYMD = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchYMD) {
    const y = matchYMD[1];
    const m = matchYMD[2];
    const d = parseInt(matchYMD[3], 10);
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const mIdx = parseInt(m, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return `${d} ${months[mIdx]} ${y}`;
    }
  }

  // Fallback for full ISO string
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const d = parsed.getDate();
    const mIdx = parsed.getMonth();
    const y = parsed.getFullYear();
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    if (mIdx >= 0 && mIdx < 12) {
      return `${d} ${months[mIdx]} ${y}`;
    }
  }

  return clean;
}

/**
 * Sanitizes any ISO date string to local "YYYY-MM-DD HH:mm:ss" format.
 * E.g., "2026-09-23T20:16:43.000Z" -> "2026-09-23 20:16:43" (local timezone)
 */
export function sanitizeIsoToLocalString(val?: any): any {
  if (typeof val !== 'string' || !val.trim()) return val;
  const clean = val.trim();

  // Check if it's a full ISO string (contains T and Z, or T and offset)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(clean)) {
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      const hours = String(parsed.getHours()).padStart(2, '0');
      const minutes = String(parsed.getMinutes()).padStart(2, '0');
      const seconds = String(parsed.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
  }

  return val;
}
