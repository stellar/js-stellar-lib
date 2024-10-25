/* eslint-disable global-require */
import URI from "urijs";
import { create, HttpClient, HttpResponseHeaders } from "../http-client";

// eslint-disable-next-line prefer-import/prefer-import-over-require , @typescript-eslint/naming-convention
declare const __PACKAGE_VERSION__: string;
export const version = __PACKAGE_VERSION__;

export interface ServerTime {
  serverTime: number;
  localTimeRecorded: number;
}

/**
 * keep a local map of server times
 * (export this purely for testing purposes)
 *
 * each entry will map the server domain to the last-known time and the local
 * time it was recorded, ex:
 *
 * @example
 * "horizon-testnet.stellar.org": {
 *   serverTime: 1552513039,
 *   localTimeRecorded: 1552513052
 * }
 *
 * @constant {Record.<string, ServerTime>}
 * @default {}
 * @memberof module:Horizon
 */
export const SERVER_TIME_MAP: Record<string, ServerTime> = {};
export const DEFAULT_HEADERS: Record<string, string> = {
  "X-Client-Name": "js-stellar-sdk",
  "X-Client-Version": version,
};

function toSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

export function createHttpClient(): HttpClient {
  const httpClient = create({
    headers: DEFAULT_HEADERS,
  });

  httpClient.interceptors.response.use(
    (response) => {
      const hostname = URI(response.config.url!).hostname();
      let serverTime = 0;
      if (response.headers instanceof Headers) {
        const dateHeader = response.headers.get('date');
        if (dateHeader) {
          serverTime = toSeconds(Date.parse(dateHeader));
        }
      } else if (typeof response.headers === 'object' && 'date' in response.headers) {
        const headers = response.headers as HttpResponseHeaders; // Cast response.headers to the correct type
        if (typeof headers.date === 'string') {
          serverTime = toSeconds(Date.parse(headers.date));
        }
      }
      const localTimeRecorded = toSeconds(new Date().getTime());

      if (!Number.isNaN(serverTime)) {
        SERVER_TIME_MAP[hostname] = {
          serverTime,
          localTimeRecorded,
        };
      }
      return response;
    },
  );

  return httpClient;
}

/**
 * Given a hostname, get the current time of that server (i.e., use the last-
 * recorded server time and offset it by the time since then.) If there IS no
 * recorded server time, or it's been 5 minutes since the last, return null.
 * @memberof module:Horizon
 *
 * @param {string} hostname Hostname of a Horizon server.
 * @returns {number} The UNIX timestamp (in seconds, not milliseconds)
 * representing the current time on that server, or `null` if we don't have
 * a record of that time.
 */
export function getCurrentServerTime(hostname: string): number | null {
  const entry = SERVER_TIME_MAP[hostname];

  if (!entry || !entry.localTimeRecorded || !entry.serverTime) {
    return null;
  }

  const { serverTime, localTimeRecorded } = entry;
  const currentTime = toSeconds(new Date().getTime());

  // if it's been more than 5 minutes from the last time, then null it out
  if (currentTime - localTimeRecorded > 60 * 5) {
    return null;
  }

  return currentTime - localTimeRecorded + serverTime;
}
