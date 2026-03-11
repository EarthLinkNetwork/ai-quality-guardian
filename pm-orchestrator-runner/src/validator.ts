/**
 * Validate an email address.
 *
 * Checks for a non-empty local part, a single '@', and a domain with at least one dot.
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Validate a phone number.
 *
 * Accepts digits optionally prefixed with '+' and separated by dashes, spaces, or parentheses.
 * The digit count (excluding formatting characters) must be between 7 and 15.
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return false;

  // Only allow digits, +, -, spaces, and parentheses
  if (/[^0-9+\-() ]/.test(phone)) return false;

  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 7 && digits.length <= 15;
}
