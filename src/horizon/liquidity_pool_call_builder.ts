import { Asset } from "@stellar/stellar-base";

import { CallBuilder } from "./call_builder";
import { ServerApi } from "./server_api";
import { HttpClient } from "../http-client";

/**
 * Creates a new {@link LiquidityPoolCallBuilder} pointed to server defined by serverUrl.
 *
 * Do not create this object directly, use {@link Horizon.Server#liquidityPools}.
 *
 * @augments CallBuilder
 * @private
 * @class
 * @param {string} serverUrl Horizon server URL.
 */
export class LiquidityPoolCallBuilder extends CallBuilder<
  ServerApi.CollectionPage<ServerApi.LiquidityPoolRecord>
> {
  constructor(serverUrl: URI, client: HttpClient) {
    super(serverUrl, client);
    this.url.segment("liquidity_pools");
  }

  /**
   * Filters out pools whose reserves don't exactly match these assets.
   *
   * @see Asset
   * @returns {LiquidityPoolCallBuilder} current LiquidityPoolCallBuilder instance
   */
  public forAssets(...assets: Asset[]): this {
    const assetList: string = assets
      .map((asset: Asset) => asset.toString())
      .join(",");
    this.url.setQuery("reserves", assetList);
    return this;
  }

  /**
   * Retrieves all pools an account is participating in.
   *
   * @param {string} id   the participant account to filter by
   * @returns {LiquidityPoolCallBuilder} current LiquidityPoolCallBuilder instance
   */
  public forAccount(id: string): this {
    this.url.setQuery("account", id);
    return this;
  }

  /**
   * Retrieves a specific liquidity pool by ID.
   *
   * @param {string} id   the hash/ID of the liquidity pool
   * @returns {CallBuilder} a new CallBuilder instance for the /liquidity_pools/:id endpoint
   */
  public liquidityPoolId(
    id: string,
  ): CallBuilder<ServerApi.LiquidityPoolRecord> {
    if (!id.match(/[a-fA-F0-9]{64}/)) {
      throw new TypeError(`${id} does not look like a liquidity pool ID`);
    }

    const builder = new CallBuilder<ServerApi.LiquidityPoolRecord>(
      this.url.clone(),
      this.httpClient
    );
    builder.filter.push([id.toLowerCase()]);
    return builder;
  }
}
