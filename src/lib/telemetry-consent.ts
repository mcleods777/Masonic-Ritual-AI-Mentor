// Telemetry opt-out is stored in a non-httpOnly cookie so both client and
// server can read it. It is not signed — forging it only means "don't track
// me," which is the conservative default we'd honor anyway.

export const TELEMETRY_OPTOUT_COOKIE = "mram-telemetry-optout";
export const OPTOUT_COOKIE_VALUE = "1";
export const OPTOUT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2; // 2 years

export function isOptedOutFromCookieValue(value: string | undefined): boolean {
  return value === OPTOUT_COOKIE_VALUE;
}

export function isOptedOutClient(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${TELEMETRY_OPTOUT_COOKIE}=${OPTOUT_COOKIE_VALUE}`));
}

export function setOptOutClient(optOut: boolean): void {
  if (typeof document === "undefined") return;
  if (optOut) {
    document.cookie = `${TELEMETRY_OPTOUT_COOKIE}=${OPTOUT_COOKIE_VALUE}; path=/; max-age=${OPTOUT_MAX_AGE_SECONDS}; samesite=lax`;
  } else {
    document.cookie = `${TELEMETRY_OPTOUT_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
}
