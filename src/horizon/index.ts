/** @module Horizon */

// Expose all types
export * from "./horizon_api";
export * from "./server_api";

// stellar-sdk classes to expose
export * from "./account_response";

export { HorizonServer as Server } from "./server";
export {
  SERVER_TIME_MAP,
  createHttpClient,
  getCurrentServerTime
} from "./horizon_axios_client";

export default module.exports;
