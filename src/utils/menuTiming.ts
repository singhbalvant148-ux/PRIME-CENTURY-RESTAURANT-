import { MenuItem } from '../types/pos';

export interface TimingCheckResult {
  isAvailable: boolean;
  isWithinHours: boolean;
  scheduleLabel: string;
  currentFormattedTime: string;
}


/**
 * Checks if a menu item can be ordered.
 * All meal-time restrictions (Breakfast, Lunch, Dinner, Soups, etc.)
 * have been removed across all hours, timezones, and ordering flows.
 * Every available dish is orderable 24/7.
 */
export function isMenuItemAvailableByTime(
  _item?: MenuItem,
  _customTimeStr?: string | null
): TimingCheckResult {
  return {
    isAvailable: true,
    isWithinHours: true,
    scheduleLabel: 'All Day',
    currentFormattedTime: '',
  };
}

