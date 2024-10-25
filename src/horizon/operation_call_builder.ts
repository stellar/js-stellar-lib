import { HttpClient } from "../http-client";
import { CallBuilder } from "./call_builder";
import { ServerApi } from "./server_api";

/**
 * Creates a new {@link OperationCallBuilder} pointed to server defined by serverUrl.
 *
 * Do not create this object directly, use {@link Horizon.Server#operations}.
 *
 * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/operations|All Operations}
 *
 * @augments CallBuilder
 * @private
 * @class
 * @param {string} serverUrl Horizon server URL.
 */
export class OperationCallBuilder extends CallBuilder<
  ServerApi.CollectionPage<ServerApi.OperationRecord>
> {
  constructor(serverUrl: URI, client: HttpClient) {
    super(serverUrl, client, "operations");
    this.url.segment("operations");
  }

  /**
   * The operation details endpoint provides information on a single operation. The operation ID provided in the id
   * argument specifies which operation to load.
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/retrieve-an-operation|Operation Details}
   * @param {number} operationId Operation ID
   * @returns {CallBuilder} this OperationCallBuilder instance
   */
  public operation(
    operationId: string,
  ): CallBuilder<ServerApi.OperationRecord> {
    const builder = new CallBuilder<ServerApi.OperationRecord>(
      this.url.clone(),
      this.httpClient
    );
    builder.filter.push([operationId]);
    return builder;
  }

  /**
   * This endpoint represents all operations that were included in valid transactions that affected a particular account.
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/get-operations-by-account-id|Operations for Account}
   * @param {string} accountId For example: `GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD`
   * @returns {OperationCallBuilder} this OperationCallBuilder instance
   */
  public forAccount(accountId: string): this {
    return this.forEndpoint("accounts", accountId);
  }

  /**
   * This endpoint represents all operations that reference a given claimable_balance.
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/cb-retrieve-related-operations|Operations for Claimable Balance}
   * @param {string} claimableBalanceId Claimable Balance ID
   * @returns {OperationCallBuilder} this OperationCallBuilder instance
   */
  public forClaimableBalance(claimableBalanceId: string): this {
    return this.forEndpoint("claimable_balances", claimableBalanceId);
  }

  /**
   * This endpoint returns all operations that occurred in a given ledger.
   *
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/retrieve-a-ledgers-operations|Operations for Ledger}
   * @param {number|string} sequence Ledger sequence
   * @returns {OperationCallBuilder} this OperationCallBuilder instance
   */
  public forLedger(sequence: number | string): this {
    return this.forEndpoint("ledgers", sequence.toString());
  }

  /**
   * This endpoint represents all operations that are part of a given transaction.
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/retrieve-a-transactions-operations|Operations for Transaction}
   * @param {string} transactionId Transaction ID
   * @returns {OperationCallBuilder} this OperationCallBuilder instance
   */
  public forTransaction(transactionId: string): this {
    return this.forEndpoint("transactions", transactionId);
  }

  /**
   * This endpoint represents all operations involving a particular liquidity pool.
   *
   * @param {string} poolId   liquidity pool ID
   * @returns {OperationCallBuilder} this OperationCallBuilder instance
   */
  public forLiquidityPool(poolId: string): this {
    return this.forEndpoint("liquidity_pools", poolId);
  }

  /**
   * Adds a parameter defining whether to include failed transactions.
   *   By default, only operations of successful transactions are returned.
   *
   * @param {boolean} value Set to `true` to include operations of failed transactions.
   * @returns {OperationCallBuilder} this OperationCallBuilder instance
   */
  public includeFailed(value: boolean): this {
    this.url.setQuery("include_failed", value.toString());
    return this;
  }
}
