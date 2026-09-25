export type PetType = 'Cat' | 'Dog' | 'Rabbit' | 'Exotic' | 'Farm Animal';

export function normalizePetType(type: string | undefined): string {
  const t = String(type || '').trim().toLowerCase();
  if (t.includes('kucing') || t === 'cat' || t === 'c' || t === 'feline') return 'Cat';
  if (t.includes('anjing') || t === 'dog' || t === 'd' || t === 'canine') return 'Dog';
  if (t.includes('kelinci') || t === 'rabbit' || t === 'r') return 'Rabbit';
  if (t.includes('eksotik') || t.includes('exotic' ) || t === 'bird' || t === 'hamster' || t === 'reptil' || t === 'burung') return 'Exotic';
  if (t.includes('ternak') || t.includes('farm') || t.includes('sapi') || t.includes('kambing') || t.includes('domba')) return 'Farm Animal';
  return String(type || 'Cat').trim();
}

export function getPetEmoji(type: string | undefined): string {
  const norm = normalizePetType(type);
  switch (norm) {
    case 'Cat':
      return '🐱';
    case 'Dog':
      return '🐶';
    case 'Rabbit':
      return '🐰';
    case 'Exotic':
      return '🦜';
    case 'Farm Animal':
      return '🐄';
    default:
      return '🐾';
  }
}

export function getPetTypeIndonesian(type: string | undefined): string {
  const norm = normalizePetType(type);
  switch (norm) {
    case 'Cat':
      return 'Kucing';
    case 'Dog':
      return 'Anjing';
    case 'Rabbit':
      return 'Kelinci';
    case 'Exotic':
      return 'Eksotik';
    case 'Farm Animal':
      return 'Hewan Ternak';
    default:
      return type || 'Lainnya';
  }
}

export function getPetTypeLabelWithEmoji(type: string | undefined): string {
  return `${getPetEmoji(type)} ${getPetTypeIndonesian(type)}`;
}
