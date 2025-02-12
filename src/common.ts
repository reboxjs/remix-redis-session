// Shared helper functions for session storage

/**
 * Converts an expiry Date to seconds from now.
 *
 * @param expires - The Date at which the session expires.
 * @returns The number of seconds until expiry.
 */
export function expiresToSeconds(expires: Date): number {
  const now = new Date();
  const expiresDate = new Date(expires);
  const secondsDelta = Math.round((expiresDate.getTime() - now.getTime()) / 1000);
  return secondsDelta < 0 ? 0 : secondsDelta;
}

/**
 * Formats a Redis key based on the application name and id.
 *
 * @param appName - The name of your application.
 * @param id - The session id.
 * @returns The formatted Redis key.
 */
export function formatKey(appName: string, id: string): string {
  return `${appName}:Sessions:${id}`;
} 