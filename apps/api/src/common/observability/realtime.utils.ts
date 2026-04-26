export function resolveRealtimeCorsOrigin(): true | string {
  const configuredWebUrl = process.env.WEB_URL?.trim();

  if (!configuredWebUrl) {
    return true;
  }

  try {
    return new URL(configuredWebUrl).origin;
  } catch {
    return true;
  }
}
