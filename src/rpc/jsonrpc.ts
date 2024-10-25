import { HttpClient } from "../http-client";

export type Id = string | number;

export interface Request<T> {
  jsonrpc: "2.0";
  id: Id;
  method: string;
  params: T;
}

export interface Notification<T> {
  jsonrpc: "2.0";
  method: string;
  params?: T;
}

export type Response<T, E = any> = {
  jsonrpc: "2.0";
  id: Id;
} & ({ error: Error<E> } | { result: T });

export interface Error<E = any> {
  code: number;
  message?: string;
  data?: E;
}

// Check if the given object X has a field Y, and make that available to
// typescript typing.
function hasOwnProperty<X extends {}, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  // eslint-disable-next-line no-prototype-builtins
  return obj.hasOwnProperty(prop);
}

/**
 * Sends the jsonrpc 'params' as a single 'param' object (no array support).
 *
 * @param {string} url URL to the RPC instance
 * @param {string} method RPC method name that should be called
 * @param {(any | null)} [param=null] params that should be supplied to the method
 * @returns {Promise<T>}
 * @private
 */
export async function postObject<T>(
  client: HttpClient,
  url: string,
  method: string,
  param: any = null,
): Promise<T> {
  const response = await client.post<Response<T>>(url, {
    jsonrpc: "2.0",
    // TODO: Generate a unique request id
    id: 1,
    method,
    params: param,
  });
  if (hasOwnProperty(response.data, "error")) {
    throw response.data.error;
  } else {
    return response.data?.result;
  }
}
