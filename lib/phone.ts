const DEFAULT_COUNTRY_CODE = "225";

function parsePhoneParts(value: string) {
  const raw = String(value ?? "").trim();

  if (raw.startsWith("+")) {
    const countryRaw = raw.slice(1).replace(/\D/g, "").slice(0, 3);
    const restRaw = raw.slice(1 + countryRaw.length);
    const local = restRaw.replace(/\D/g, "").slice(0, 12);
    return { country: countryRaw, local };
  }

  if (raw.startsWith("00")) {
    const withoutPrefix = raw.slice(2);
    const countryRaw = withoutPrefix.replace(/\D/g, "").slice(0, 3);
    const restRaw = withoutPrefix.slice(countryRaw.length);
    const local = restRaw.replace(/\D/g, "").slice(0, 12);
    return { country: countryRaw, local };
  }

  return {
    country: DEFAULT_COUNTRY_CODE,
    local: raw.replace(/\D/g, "").slice(0, 12),
  };
}

export function formatPhoneInput(value: string) {
  const { country, local } = parsePhoneParts(value);
  const normalizedCountry = country || DEFAULT_COUNTRY_CODE;
  const pairs = local.match(/.{1,2}/g)?.join(" ") ?? "";
  return pairs ? `+${normalizedCountry} ${pairs}` : `+${normalizedCountry}`;
}

export function isCompletePhone(value: string) {
  const { country, local } = parsePhoneParts(value);
  return country.length >= 1 && country.length <= 3 && local.length >= 8;
}
