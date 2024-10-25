import { create, HttpClient } from "../http-client";

// eslint-disable-next-line prefer-import/prefer-import-over-require, global-require, @typescript-eslint/naming-convention
declare const __PACKAGE_VERSION__: string;
export const version = __PACKAGE_VERSION__;
export const DEFAULT_HEADERS = {
  'X-Client-Name': 'js-soroban-client',
  'X-Client-Version': version
}

export function createHttpClient(): HttpClient {
  return create({ headers: DEFAULT_HEADERS });
};