/* tslint:disable: variable-name */
import { Asset } from "@stellar/stellar-base";
import { CallBuilder } from "./call_builder";
import { BadRequestError } from "../errors";
import { HorizonApi } from "./horizon_api";
import { ServerApi } from "./server_api";
import { HttpClient } from "../http-client";

const allowedResolutions = [
  60000,
  300000,
  900000,
  3600000,
  86400000,
  604800000,
];

/**
 * Trade Aggregations facilitate efficient gathering of historical trade data.
 *
 * Do not create this object directly, use {@link Horizon.Server#tradeAggregation}.
 *
 * @augments CallBuilder
 * @private
 * @class
 *
 * @param {string} serverUrl serverUrl Horizon server URL.
 * @param {Asset} base base asset
 * @param {Asset} counter counter asset
 * @param {number} start_time lower time boundary represented as millis since epoch
 * @param {number} end_time upper time boundary represented as millis since epoch
 * @param {number} resolution segment duration as millis since epoch. *Supported values are 1 minute (60000), 5 minutes (300000), 15 minutes (900000), 1 hour (3600000), 1 day (86400000) and 1 week (604800000).
 * @param {number} offset segments can be offset using this parameter. Expressed in milliseconds. *Can only be used if the resolution is greater than 1 hour. Value must be in whole hours, less than the provided resolution, and less than 24 hours.
 */
export class TradeAggregationCallBuilder extends CallBuilder<
  ServerApi.CollectionPage<TradeAggregationRecord>
> {
  constructor(
    serverUrl: URI,
    client: HttpClient,
    base: Asset,
    counter: Asset,
    start_time: number,
    end_time: number,
    resolution: number,
    offset: number,
  ) {
    super(serverUrl, client);

    this.url.segment("trade_aggregations");
    if (!base.isNative()) {
      this.url.setQuery("base_asset_type", base.getAssetType());
      this.url.setQuery("base_asset_code", base.getCode());
      this.url.setQuery("base_asset_issuer", base.getIssuer());
    } else {
      this.url.setQuery("base_asset_type", "native");
    }
    if (!counter.isNative()) {
      this.url.setQuery("counter_asset_type", counter.getAssetType());
      this.url.setQuery("counter_asset_code", counter.getCode());
      this.url.setQuery("counter_asset_issuer", counter.getIssuer());
    } else {
      this.url.setQuery("counter_asset_type", "native");
    }
    if (typeof start_time !== "number" || typeof end_time !== "number") {
      throw new BadRequestError("Invalid time bounds", [start_time, end_time]);
    } else {
      this.url.setQuery("start_time", start_time.toString());
      this.url.setQuery("end_time", end_time.toString());
    }
    if (!this.isValidResolution(resolution)) {
      throw new BadRequestError("Invalid resolution", resolution);
    } else {
      this.url.setQuery("resolution", resolution.toString());
    }
    if (!this.isValidOffset(offset, resolution)) {
      throw new BadRequestError("Invalid offset", offset);
    } else {
      this.url.setQuery("offset", offset.toString());
    }
  }

  /**
   * @private
   * @param {number} resolution Trade data resolution in milliseconds
   * @returns {boolean} true if the resolution is allowed
   */
  private isValidResolution(resolution: number): boolean {
    return allowedResolutions.some((allowed) => allowed === resolution);
  }

  /**
   * @private
   * @param {number} offset Time offset in milliseconds
   * @param {number} resolution Trade data resolution in milliseconds
   * @returns {boolean} true if the offset is valid
   */
  private isValidOffset(offset: number, resolution: number): boolean {
    const hour = 3600000;
    return !(offset > resolution || offset >= 24 * hour || offset % hour !== 0);
  }
}

interface TradeAggregationRecord extends HorizonApi.BaseResponse {
  timestamp: number | string;
  trade_count: number | string;
  base_volume: string;
  counter_volume: string;
  avg: string;
  high: string;
  low: string;
  open: string;
  close: string;
}
