export const colors = {
  primary: '#6B46C1',
  primaryDark: '#4C1D95',
  primaryLight: '#A78BFA',
  primarySoft: '#F5F3FF',
  primaryBorder: '#DDD6FE',

  success: '#10B981',
  successLight: '#D1FAE5',
  successSoft: '#D1FAE5',

  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  danger: '#EF4444',

  background: '#F8FAFC',
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',

  textStrong: '#0F172A',
  text: '#1E2937',
  muted: '#64748B',
  subtle: '#94A3B8',

  gradientPrimary: ['#6B46C1', '#7C3AED'] as const,
};

export const radii = {
  card: 24,
  control: 999,
  pill: 999,
  modal: 28,
};

export const spacing = {
  screenX: 20,
  card: 20,
};

export const shadows = {
  small: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  medium: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
};
