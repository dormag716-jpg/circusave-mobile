export function getInitials(name?: string | null): string {
  if (!name || typeof name !== 'string') return '?';
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '?';

  const parts = trimmed.split(' ');
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  const firstInitial = parts[0].charAt(0).toUpperCase();
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();

  return `${firstInitial}${lastInitial}`;
}
