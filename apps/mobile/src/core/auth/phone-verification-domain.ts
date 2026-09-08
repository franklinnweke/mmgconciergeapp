export function isNigerianE164(phone: string | null | undefined): phone is string {
  return Boolean(phone && /^\+234[789]\d{9}$/.test(phone.trim()));
}

export function normalizeNigerianPhone(input: string): string | null {
  const digitsOnly = input.replace(/\D/g, '');
  if (digitsOnly.length === 10 && /^[789]\d{9}$/.test(digitsOnly)) {
    return `+234${digitsOnly}`;
  }
  if (digitsOnly.length === 11 && /^0[789]\d{9}$/.test(digitsOnly)) {
    return `+234${digitsOnly.substring(1)}`;
  }
  if (digitsOnly.length === 13 && /^234[789]\d{9}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }
  return null;
}
