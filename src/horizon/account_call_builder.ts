import { Asset } from "@stellar/stellar-base";
import { CallBuilder } from "./call_builder";
import { ServerApi } from "./server_api";
import { HttpClient } from "../http-client";

/**
 * Creates a new {@link AccountCallBuilder} pointed to server defined by `serverUrl`.
 *
 * Do not create this object directly, use {@link Horizon.Server#accounts}.
 *
 * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/list-all-accounts|All Accounts}
 *
 * @augments CallBuilder
 * @private
 * @class
 * @param {string} serverUrl Horizon server URL.
 */
export class AccountCallBuilder extends CallBuilder<
  ServerApi.CollectionPage<ServerApi.AccountRecord>
> {
  constructor(serverUrl: URI, client: HttpClient) {
    super(serverUrl, client);
    this.url.segment("accounts");
  }

  /**
   * Returns information and links relating to a single account.
   * The balances section in the returned JSON will also list all the trust lines this account has set up.
   *
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/retrieve-an-account|Account Details}
   * @param {string} id For example: `GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD`
   * @returns {CallBuilder} a new CallBuilder instance for the /accounts/:id endpoint
   */
  public accountId(id: string): CallBuilder<ServerApi.AccountRecord> {
    const builder = new CallBuilder<ServerApi.AccountRecord>(this.url.clone(), this.httpClient);
    builder.filter.push([id]);
    return builder;
  }

  /**
   * This endpoint filters accounts by signer account.
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/list-all-accounts|Accounts}
   * @param {string} id For example: `GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD`
   * @returns {AccountCallBuilder} current AccountCallBuilder instance
   */
  public forSigner(id: string): this {
    this.url.setQuery("signer", id);
    return this;
  }

  /**
   * This endpoint filters all accounts who are trustees to an asset.
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/list-all-accounts|Accounts}
   * @see Asset
   * @param {Asset} asset For example: `new Asset('USD','GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD')`
   * @returns {AccountCallBuilder} current AccountCallBuilder instance
   */
  public forAsset(asset: Asset): this {
    this.url.setQuery("asset", `${asset}`);
    return this;
  }

  /**
   * This endpoint filters accounts where the given account is sponsoring the account or any of its sub-entries..
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/list-all-accounts|Accounts}
   * @param {string} id For example: `GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD`
   * @returns {AccountCallBuilder} current AccountCallBuilder instance
   */
  public sponsor(id: string): this {
    this.url.setQuery("sponsor", id);
    return this;
  }

  /**
   * This endpoint filters accounts holding a trustline to the given liquidity pool.
   *
   * @param {string} id The ID of the liquidity pool. For example: `dd7b1ab831c273310ddbec6f97870aa83c2fbd78ce22aded37ecbf4f3380fac7`.
   * @returns {AccountCallBuilder} current AccountCallBuilder instance
   */
  public forLiquidityPool(id: string): this {
    this.url.setQuery("liquidity_pool", id);
    return this;
  }
}
