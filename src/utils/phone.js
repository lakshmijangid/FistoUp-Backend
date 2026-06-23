// Canonicalise a phone number to E.164 (+91XXXXXXXXXX for Indian numbers) so the
// same number matches no matter how it was typed — "+91 96949 92874", "0969…",
// "9694992874", "919694992874" all collapse to "+919694992874". Storing and
// looking up the canonical form keeps auth lookups consistent across the apps.
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  // Indian mobile numbers are 10 digits; take the last 10 to drop a 0/91 prefix.
  const last10 = digits.slice(-10);
  if (last10.length === 10) return `+91${last10}`;
  // Fallback for anything that isn't a 10-digit number: keep the digits as E.164.
  return `+${digits}`;
}

module.exports = { normalizePhone };
