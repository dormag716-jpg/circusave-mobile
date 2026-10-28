export const colors = {
  primary: '#6B46C1',
  primaryDark: '#4C1D95',
  primaryLight: '#A78BFA',
  primarySoft: '#F5F3FF',
  primaryBorder: '#DDD6FE',
  primaryTint: 'rgba(107, 70, 193, 0.1)',
  onColor: '#FFFFFF',

  success: '#10B981',
  successLight: '#D1FAE5',
  successSoft: '#D1FAE5',
  successText: '#047857',
  successBorder: '#A7F3D0',

  warning: '#F59E0B',
  warningStrong: '#D97706',
  warningSoft: '#FEF3C7',
  warningText: '#92400E',
  warningBorder: '#FCD34D',
  warningBorderMuted: 'rgba(245, 158, 11, 0.333)',

  danger: '#EF4444',
  dangerText: '#991B1B',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',

  info: '#2563EB',
  infoText: '#1E40AF',
  infoSoft: '#EFF6FF',
  infoBorder: '#BFDBFE',

  background: '#F8FAFC',
  card: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  cardBorder: '#E2E8F0',

  textStrong: '#0F172A',
  text: '#1E2937',
  muted: '#64748B',
  subtle: '#94A3B8',
  shadow: '#000000',

  gradientPrimary: ['#6B46C1', '#7C3AED'] as const,

  premiumCanvas: '#F7F5FF',
  premiumGlow: '#E9DDFF',
  premiumMintGlow: '#DDF8EF',
  premiumLavender: '#D9C8FF',
  premiumLavenderSoft: '#EEE8FF',
  premiumLavenderBadge: '#F0EAFE',
  premiumGold: '#FFF4C7',
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
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  medium: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
};
