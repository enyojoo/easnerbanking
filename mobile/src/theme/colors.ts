/**
 * Easner Premium Design System - Colors
 * 
 * A sophisticated color palette for a premium banking experience
 */

export const colors = {
  // Primary — matches business `app/globals.css` (--primary: #007acc)
  primary: {
    main: '#007ACC',
    light: '#3399D6',
    dark: '#005A94',
    gradient: ['#007ACC', '#3399D6'] as const,
    gradientDark: ['#005A94', '#007ACC'] as const,
  },

  // Success Colors
  success: {
    main: '#10B981',
    light: '#34D399',
    dark: '#059669',
    gradient: ['#10B981', '#34D399'] as const,
    background: '#ECFDF5',
  },

  // Warning Colors  
  warning: {
    main: '#F59E0B',
    light: '#FBBF24',
    dark: '#D97706',
    gradient: ['#F59E0B', '#FBBF24'] as const,
    background: '#FFFBEB',
  },

  // Error Colors
  error: {
    main: '#EF4444',
    light: '#F87171',
    dark: '#DC2626',
    gradient: ['#EF4444', '#F87171'] as const,
    background: '#FEF2F2',
  },

  // Neutral Colors
  neutral: {
    white: '#FFFFFF',
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
    black: '#000000',
  },

  // Background Colors
  background: {
    primary: '#FFFFFF',
    secondary: '#F8FAFC',
    tertiary: '#F1F5F9',
    dark: '#0F172A',
  },

  // Text Colors
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    tertiary: '#9CA3AF',
    inverse: '#FFFFFF',
    link: '#007ACC',
  },

  // Card Gradients
  cardGradients: {
    premium: ['#1E293B', '#334155'] as const,
    blue: ['#007ACC', '#3399D6'] as const,
    purple: ['#7C3AED', '#A78BFA'] as const,
    green: ['#059669', '#10B981'] as const,
    gold: ['#D97706', '#F59E0B'] as const,
  },

  // Glassmorphism
  glass: {
    background: 'rgba(255, 255, 255, 0.7)',
    border: 'rgba(255, 255, 255, 0.2)',
    backgroundDark: 'rgba(15, 23, 42, 0.8)',
  },

  // Status Colors (for transactions)
  status: {
    pending: '#F59E0B',
    processing: '#007ACC',
    completed: '#10B981',
    failed: '#EF4444',
    cancelled: '#6B7280',
  },

  // Border Colors
  border: {
    light: '#F1F5F9',
    default: '#E2E8F0',
    dark: '#CBD5E1',
  },

  // Frame Colors (for containers like transaction sections)
  frame: {
    background: '#F9F9F9',
    border: '#E2E2E2',
  },

  /**
   * Semantic roles aligned with business `app/globals.css` CSS variables (light mode).
   * Use these for new UI instead of ad-hoc grays; enables a future dark theme swap.
   * | Token | Business variable |
   * |-------|-------------------|
   * | background | --background |
   * | foreground | --foreground |
   * | muted | --muted / secondary surfaces |
   * | mutedForeground | --muted-foreground |
   * | border | --border |
   * | input | --input |
   * | card | --card |
   * | cardForeground | --card-foreground |
   * | destructive | --destructive |
   * | ring | --ring |
   */
  semantic: {
    background: '#FFFFFF',
    foreground: '#111827',
    muted: '#F1F5F9',
    mutedForeground: '#64748B',
    border: '#E2E8F0',
    input: '#E2E8F0',
    card: '#FFFFFF',
    cardForeground: '#111827',
    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',
    ring: '#007ACC',
  },
}

export type Colors = typeof colors

