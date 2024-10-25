/* tslint:disable:variable-name no-namespace */
import URI from 'urijs';

import {
  Account,
  Address,
  Asset,
  Contract,
  FeeBumpTransaction,
  Keypair,
  StrKey,
  Transaction,
  nativeToScVal,
  scValToNative,
  xdr
} from '@stellar/stellar-base';

import type { TransactionBuilder } from '@stellar/stellar-base';
// eslint-disable-next-line import/no-named-as-default
import { createHttpClient, DEFAULT_HEADERS } from './axios';
import { Api as FriendbotApi } from '../friendbot';
import * as jsonrpc from './jsonrpc';
import { Api } from './api';
import { assembleTransaction } from './transaction';
import {
  parseRawSendTransaction,
  parseRawSimulation,
  parseRawLedgerEntries,
  parseRawEvents,
  parseRawTransactions,
  parseTransactionInfo,
} from './parsers';
import { HttpClient } from '../http-client';

/**
 * Default transaction submission timeout for RPC requests, in milliseconds
 * @constant {number}
 * @default 60000
 * @memberof module:rpc.Server
 */
export const SUBMIT_TRANSACTION_TIMEOUT = 60 * 1000;

/**
 * Specifies the durability namespace of contract-related ledger entries.
 * @enum {('temporary' | 'persistent')}
 * @memberof module:rpc
 *
 * @see {@link https://developers.stellar.org/docs/learn/smart-contract-internals/state-archival | State Archival docs}
 * @see {@link https://docs.rs/soroban-sdk/latest/soroban_sdk/storage/struct.Storage.html | Rust SDK Storage docs}
 */
export enum Durability {
  Temporary = 'temporary',
  Persistent = 'persistent'
}

/**
 * @typedef {object} GetEventsRequest Describes the complex filter combinations available for event queries.
 * @property {Array.<module:rpc.Api.EventFilter>} filters Filters to use when querying events from the RPC server.
 * @property {number} [startLedger] Ledger number (inclusive) to begin querying events.
 * @property {string} [cursor] Page cursor (exclusive) to begin querying events.
 * @property {number} [limit=100] The maximum number of events that should be returned in the RPC response.
 * @memberof module:rpc.Server
 */

/**
 * @typedef {object} ResourceLeeway Describes additional resource leeways for transaction simulation.
 * @property {number} cpuInstructions Simulate the transaction with more CPU instructions available.
 * @memberof module:rpc.Server
 */

/**
 * @typedef {object} Options Options for configuring connections to RPC servers.
 * @property {boolean} [allowHttp=false] Allow connecting to http servers, default: `false`. This must be set to false in production deployments!
 * @property {number} [timeout=0] Allow a timeout, default: 0. Allows user to avoid nasty lag. You can also use {@link Config} class to set this globally.
 * @property {Record<string, string>} [headers] Additional headers that should be added to any requests to the RPC server.
 * @memberof module:rpc.Server
 */

export namespace RpcServer {
  export interface GetEventsRequest {
    filters: Api.EventFilter[];
    startLedger?: number; // either this or cursor
    endLedger?: number; // either this or cursor
    cursor?: string; // either this or startLedger
    limit?: number;
  }

  export interface ResourceLeeway {
    cpuInstructions: number;
  }

  export interface Options {
    allowHttp?: boolean;
    timeout?: number;
    headers?: Record<string, string>;
  }
}

function findCreatedAccountSequenceInTransactionMeta(
  meta: xdr.TransactionMeta
): string {
  let operations: xdr.OperationMeta[] = [];
  switch (meta.switch()) {
    case 0:
      operations = meta.operations();
      break;
    case 1:
    case 2:
    case 3: // all three have the same interface
      operations = (meta.value() as xdr.TransactionMetaV3).operations();
      break;
    default:
      throw new Error('Unexpected transaction meta switch value');
  }
  const sequenceNumber = operations
    .flatMap(op => op.changes())
    .find(c => c.switch() === xdr.LedgerEntryChangeType.ledgerEntryCreated() &&
              c.created().data().switch() === xdr.LedgerEntryType.account())
    ?.created()
    ?.data()
    ?.account()
    ?.seqNum()
    ?.toString();

  if (sequenceNumber) {
    return sequenceNumber;
  }
  throw new Error('No account created in transaction');
}

/* eslint-disable jsdoc/no-undefined-types */
/**
 * Handles the network connection to a Soroban RPC instance, exposing an
 * interface for requests to that instance.
 *
 * @alias module:rpc.Server
 * @memberof module:rpc
 *
 * @param {string} serverURL Soroban-RPC Server URL (ex. `http://localhost:8000/soroban/rpc`).
 * @param {module:rpc.Server.Options} [opts] Options object
 * @param {boolean} [opts.allowHttp] Allows connecting to insecure http servers
 *    (default: `false`). This must be set to false in production deployments!
 *    You can also use {@link Config} class to set this globally.
 * @param {Record<string, string>} [opts.headers] Allows setting custom headers
 *
 * @see {@link https://developers.stellar.org/docs/data/rpc/api-reference/methods | API reference docs}
 */
export class RpcServer {
  /** RPC Server URL (ex. `http://localhost:8000/soroban/rpc`) */
  public readonly serverURL: URI;
  private readonly httpClient: HttpClient;

  constructor(serverURL: string, opts: RpcServer.Options = {}) {
    this.serverURL = URI(serverURL);
    this.httpClient = createHttpClient();

    if (opts.headers && Object.keys(opts.headers).length !== 0) {
      this.httpClient.interceptors.request.use((config) => {
        // merge any custom headers into the default headers
        // note that this intentionally ignores config.headers
        config.headers = Object.assign({...DEFAULT_HEADERS}, opts.headers);
        return config;
      });
    }

    if (this.serverURL.protocol() !== 'https' && !opts.allowHttp) {
      throw new Error(
        "Cannot connect to insecure Soroban RPC server if `allowHttp` isn't set"
      );
    }
  }

  /**
   * Fetch a minimal set of current info about a Stellar account.
   *
   * Needed to get the current sequence number for the account so you can build
   * a successful transaction with {@link TransactionBuilder}.
   *
   * @param {string} address The public address of the account to load.
   * @returns {Promise<Account>} A promise which resolves to the {@link Account}
   * object with a populated sequence number
   *
   * @see {@link https://developers.stellar.org/docs/data/rpc/api-reference/methods/getLedgerEntries | getLedgerEntries docs}
   *
   * @example
   * const accountId = "GBZC6Y2Y7Q3ZQ2Y4QZJ2XZ3Z5YXZ6Z7Z2Y4QZJ2XZ3Z5YXZ6Z7Z2Y4";
   * server.getAccount(accountId).then((account) => {
   *   console.log("sequence:", account.sequence);
   * });
   */
  public async getAccount(address: string): Promise<Account> {
    const ledgerKey = xdr.LedgerKey.account(
      new xdr.LedgerKeyAccount({
        accountId: Keypair.fromPublicKey(address).xdrPublicKey()
      })
    );

    const resp = await this.getLedgerEntries(ledgerKey);
    if (resp.entries.length === 0) {
      // eslint-disable-next-line prefer-promise-reject-errors
      return Promise.reject({
        code: 404,
        message: `Account not found: ${address}`
      });
    }

    const accountEntry = resp.entries[0].val.account();
    return new Account(address, accountEntry.seqNum().toString());
  }

  /**
   * General node health check.
   *
   * @returns {Promise<Api.GetHealthResponse>} A promise which resolves to the
   * {@link Api.GetHealthResponse} object with the status of the
   * server (e.g. "healthy").
   *
   * @see {@link https://developers.stellar.org/docs/data/rpc/api-reference/methods/getHealth | getLedgerEntries docs}
   *
   * @example
   * server.getHealth().then((health) => {
   *   console.log("status:", health.status);
   * });
   */
  // eslint-disable-next-line require-await
  public async getHealth(): Promise<Api.GetHealthResponse> {
    return jsonrpc.postObject<Api.GetHealthResponse>(
      this.httpClient,
      this.serverURL.toString(),
      'getHealth'
    );
  }

  /**
   * Reads the current value of contract data ledger entries directly.
   *
   * Allows you to directly inspect the current state of a contract. This is a
   * backup way to access your contract data which may not be available via
   * events or {@link module:rpc.Server#simulateTransaction}.
   *
   * @param {string|Address|Contract} contract The contract ID containing the
   *    data to load as a strkey (`C...` form), a {@link Contract}, or an
   *    {@link Address} instance
   * @param {xdr.ScVal} key The key of the contract data to load
   * @param {module:rpc.Durability} [durability=Durability.Persistent] The "durability
   *    keyspace" that this ledger key belongs to, which is either 'temporary'
   *    or 'persistent' (the default), see {@link module:rpc.Durability}.
   * @returns {Promise<Api.LedgerEntryResult>} The current data value
   *
   * @warning If the data entry in question is a 'temporary' entry, it's
   *    entirely possible that it has expired out of existence.
   *
   * @see {@link https://developers.stellar.org/docs/data/rpc/api-reference/methods/getLedgerEntries | getLedgerEntries docs}
   *
   * @example
   * const contractId = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";
   * const key = xdr.ScVal.scvSymbol("counter");
   * server.getContractData(contractId, key, Durability.Temporary).then(data => {
   *   console.log("value:", data.val);
   *   console.log("liveUntilLedgerSeq:", data.liveUntilLedgerSeq);
   *   console.log("lastModified:", data.lastModifiedLedgerSeq);
   *   console.log("latestLedger:", data.latestLedger);
   * });
   */
  // eslint-disable-next-line require-await
  public async getContractData(
    contract: string | Address | Contract,
    key: xdr.ScVal,
    durability: Durability = Durability.Persistent
  ): Promise<Api.LedgerEntryResult> {
    // coalesce `contract` param variants to an ScAddress
    let scAddress: xdr.ScAddress;
    if (typeof contract === 'string') {
      scAddress = new Contract(contract).address().toScAddress();
    } else if (contract instanceof Address) {
      scAddress = contract.toScAddress();
    } else if (contract instanceof Contract) {
      scAddress = contract.address().toScAddress();
    } else {
      throw new TypeError(`unknown contract type: ${contract}`);
    }

    let xdrDurability: xdr.ContractDataDurability;
    switch (durability) {
      case Durability.Temporary:
        xdrDurability = xdr.ContractDataDurability.temporary();
        break;

      case Durability.Persistent:
        xdrDurability = xdr.ContractDataDurability.persistent();
        break;

      default:
        throw new TypeError(`invalid durability: ${durability}`);
    }

    const contractKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        key,
        contract: scAddress,
        durability: xdrDurability
      })
    );

    return this.getLedgerEntries(contractKey).then(
      (r: Api.GetLedgerEntriesResponse) => {
        if (r.entries.length === 0) {
          // eslint-disable-next-line prefer-promise-reject-errors
          return Promise.reject({
            code: 404,
            message: `Contract data not found. Contract: ${Address.fromScAddress(
              scAddress
            ).toString()}, Key: ${key.toXDR(
              'base64'
            )}, Durability: ${durability}`
          });
        }

        return r.entries[0];
      }
    );
  }

  /**
   * Retrieves the WASM bytecode for a given contract.
   *
   * This method allows you to fetch the WASM bytecode associated with a contract
   * deployed on the Soroban network. The WASM bytecode represents the executable
   * code of the contract.
   *
   * @param {string} contractId The contract ID containing the WASM bytecode to retrieve
   * @returns {Promise<Buffer>} A Buffer containing the WASM bytecode
   * @throws {Error} If the contract or its associated WASM bytecode cannot be
   * found on the network.
   *
   * @example
   * const contractId = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";
   * server.getContractWasmByContractId(contractId).then(wasmBuffer => {
   *   console.log("WASM bytecode length:", wasmBuffer.length);
   *   // ... do something with the WASM bytecode ...
   * }).catch(err => {
   *   console.error("Error fetching WASM bytecode:", err);
   * });
   */
  public async getContractWasmByContractId(
    contractId: string
  ): Promise<Buffer> {
    const contractLedgerKey = new Contract(contractId).getFootprint();
    const response = await this.getLedgerEntries(contractLedgerKey);
    if (!response.entries.length || !response.entries[0]?.val) {
      // eslint-disable-next-line prefer-promise-reject-errors
      return Promise.reject({code: 404, message: `Could not obtain contract hash from server`});
    }

    const wasmHash = response.entries[0].val
      .contractData()
      .val()
      .instance()
      .executable()
      .wasmHash();

    return this.getContractWasmByHash(wasmHash);
  }

  /**
   * Retrieves the WASM bytecode for a given contract hash.
   *
   * This method allows you to fetch the WASM bytecode associated with a contract
   * deployed on the Soroban network using the contract's WASM hash. The WASM bytecode
   * represents the executable code of the contract.
   *
   * @param {Buffer} wasmHash The WASM hash of the contract
   * @returns {Promise<Buffer>} A Buffer containing the WASM bytecode
   * @throws {Error} If the contract or its associated WASM bytecode cannot be
   * found on the network.
   *
   * @example
   * const wasmHash = Buffer.from("...");
   * server.getContractWasmByHash(wasmHash).then(wasmBuffer => {
   *   console.log("WASM bytecode length:", wasmBuffer.length);
   *   // ... do something with the WASM bytecode ...
   * }).catch(err => {
   *   console.error("Error fetching WASM bytecode:", err);
   * });
   */
  public async getContractWasmByHash(
    wasmHash: Buffer | string,
    format: undefined | "hex" | "base64" = undefined
  ): Promise<Buffer> {
    const wasmHashBuffer = typeof wasmHash === "string" ? Buffer.from(wasmHash, format) : wasmHash as Buffer;

    const ledgerKeyWasmHash = xdr.LedgerKey.contractCode(
      new xdr.LedgerKeyContractCode({
        hash: wasmHashBuffer,
      })
    );

    const responseWasm = await this.getLedgerEntries(ledgerKeyWasmHash);
    if (!responseWasm.entries.length || !responseWasm.entries[0]?.val) {
      // eslint-disable-next-line prefer-promise-reject-errors
      return Promise.reject({ code: 404, message: "Could not obtain contract wasm from server" });
    }
    const wasmBuffer = responseWasm.entries[0].val.contractCode().code();

    return wasmBuffer;
  }

  /**
   * Reads the current value of arbitrary ledger entries directly.
   *
   * Allows you to directly inspect the current state of contracts, contract's
   * code, accounts, or any other ledger entries.
   *
   * To fetch a contract's WASM byte-code, built the appropriate
   * {@link xdr.LedgerKeyContractCode} ledger entry key (or see
   * {@link Contract.getFootprint}).
   *
   * @param {xdr.ScVal[]} keys One or more ledger entry keys to load
   * @returns {Promise<Api.GetLedgerEntriesResponse>} The current on-chain
   * values for the given ledger keys
   *
   * @see {@link https://developers.stellar.org/docs/data/rpc/api-reference/methods/getLedgerEntries | getLedgerEntries docs}
   * @see RpcServer._getLedgerEntries
   * @example
   * const contractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
   * const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
   *   contractId: StrKey.decodeContract(contractId),
   *   key: xdr.ScVal.scvSymbol("counter"),
   * }));
   *
   * server.getLedgerEntries([key]).then(response => {
   *   const ledgerData = response.entries[0];
   *   console.log("key:", ledgerData.key);
   *   console.log("value:", ledgerData.val);
   *   console.log("liveUntilLedgerSeq:", ledgerData.liveUntilLedgerSeq);
   *   console.log("lastModified:", ledgerData.lastModifiedLedgerSeq);
   *   console.log("latestLedger:", response.latestLedger);
   * });
   */
  // eslint-disable-next-line require-await
  public async getLedgerEntries(
    ...keys: xdr.LedgerKey[]
  ): Promise<Api.GetLedgerEntriesResponse> {
    return this._getLedgerEntries(...keys).then(parseRawLedgerEntries);
  }

  // eslint-disable-next-line require-await
  public async _getLedgerEntries(...keys: xdr.LedgerKey[]) {
    return jsonrpc
      .postObject<Api.RawGetLedgerEntriesResponse>(
        this.httpClient,
        this.serverURL.toString(),
        'getLedgerEntries', {
          keys: keys.map((k) => k.toXDR('base64'))
        }
      );
  }

  /**
   * Fetch the details of a submitted transaction.
   *
   * After submitting a transaction, clients should poll this to tell when the
   * transaction has completed.
   *
   * @param {string} hash Hex-encoded hash of the transaction to check
   * @returns {Promise<Api.GetTransactionResponse>} The status,
   *    result, and other details about the transaction
   *
   * @see {@link https://developers.stellar.org/docs/data/rpc/api-reference/methods/getTransaction | getTransaction docs}
   *
   * @example
   * const transactionHash = "c4515e3bdc0897f21cc5dbec8c82cf0a936d4741cb74a8e158eb51b9fb00411a";
   * server.getTransaction(transactionHash).then((tx) => {
   *   console.log("status:", tx.status);
   *   console.log("envelopeXdr:", tx.envelopeXdr);
   *   console.log("resultMetaXdr:", tx.resultMetaXdr);
   *   console.log("resultXdr:", tx.resultXdr);
   * });
   */
  // eslint-disable-next-line require-await
  public async getTransaction(
    hash: string
  ): Promise<Api.GetTransactionResponse> {
    return this._getTransaction(hash).then((raw) => {
      const foundInfo: Omit<
          Api.GetSuccessfulTransactionResponse,
          keyof Api.GetMissingTransactionResponse
      > = {} as any;

      if (raw.status !== Api.GetTransactionStatus.NOT_FOUND) {
        Object.assign(foundInfo, parseTransactionInfo(raw));
      }

      const result: Api.GetTransactionResponse = {
        status: raw.status,
        latestLedger: raw.latestLedger,
        latestLedgerCloseTime: raw.latestLedgerCloseTime,
        oldestLedger: raw.oldestLedger,
        oldestLedgerCloseTime: raw.oldestLedgerCloseTime,
        ...foundInfo
      };

      return result;
    });
  }

  // eslint-disable-next-line require-await
  public async _getTransaction(
    hash: string
  ): Promise<Api.RawGetTransactionResponse> {
    return jsonrpc.postObject(
      this.httpClient,
      this.serverURL.toString(),
      'getTransaction',
      { hash });
  }

  /**
   * Fetch transactions starting from a given start ledger or a cursor. The end ledger is the latest ledger
   * in that RPC instance.
   *
   * @param {Api.GetTransactionsRequest} request - The request parameters.
   * @returns {Promise<Api.GetTransactionsResponse>} - A promise that resolves to the transactions response.
   *
   * @see https://developers.stellar.org/docs/data/rpc/api-reference/methods/getTransactions
   * @example
   * server.getTransactions({
   *   startLedger: 10000,
   *   limit: 10,
   * }).then((response) => {
   *   console.log("Transactions:", response.transactions);
   *   console.log("Latest Ledger:", response.latestLedger);
   *   console.log("Cursor:", response.cursor);
   * });
   */
  public async getTransactions(request: Api.GetTransactionsRequest): Promise<Api.GetTransactionsResponse> {
    return this._getTransactions(request).then((raw: Api.RawGetTransactionsResponse) => {
      const result: Api.GetTransactionsResponse = {
        transactions: raw.transactions.map(parseRawTransactions),
        latestLedger: raw.latestLedger,
        latestLedgerCloseTimestamp: raw.latestLedgerCloseTimestamp,
        oldestLedger: raw.oldestLedger,
        oldestLedgerCloseTimestamp: raw.oldestLedgerCloseTimestamp,
        cursor: raw.cursor,
      }
      return result
    });
  }

  // Add this private method to the Server class
  private async _getTransactions(request: Api.GetTransactionsRequest): Promise<Api.RawGetTransactionsResponse> {
    return jsonrpc.postObject(
      this.httpClient,
      this.serverURL.toString(),
      'getTransactions',
      request);
  }

  /**
   * Fetch all events that match a given set of filters.
   *
   * The given filters (see {@link module:rpc.Api.EventFilter | Api.EventFilter}
   * for detailed fields) are combined only in a logical OR fashion, and all of
   * the fields in each filter are optional.
   *
   * To page through events, use the `pagingToken` field on the relevant
   * {@link Api.EventResponse} object to set the `cursor` parameter.
   *
   * @param {module:rpc.Server.GetEventsRequest} request Event filters
   * @returns {Promise<Api.GetEventsResponse>} A paginatable set of the events
   * matching the given event filters
   *
   * @see {@link https://developers.stellar.org/docs/data/rpc/api-reference/methods/getEvents | getEvents docs}
   *
   * @example
   * server.getEvents({
   *    startLedger: 1000,
   *    endLedger: 2000,
   *    filters: [
   *     {
   *      type: "contract",
   *      contractIds: [ "deadb33f..." ],
   *      topics: [[ "AAAABQAAAAh0cmFuc2Zlcg==", "AAAAAQB6Mcc=", "*" ]]
   *     }, {
   *      type: "system",
   *      contractIds: [ "...c4f3b4b3..." ],
   *      topics: [[ "*" ], [ "*", "AAAAAQB6Mcc=" ]]
   *     }, {
   *      contractIds: [ "...c4f3b4b3..." ],
   *      topics: [[ "AAAABQAAAAh0cmFuc2Zlcg==" ]]
   *     }, {
   *      type: "diagnostic",
   *      topics: [[ "AAAAAQB6Mcc=" ]]
   *     }
   *    ],
   *    limit: 10,
   * });
   */
  // eslint-disable-next-line require-await
  public async getEvents(
    request: RpcServer.GetEventsRequest
  ): Promise<Api.GetEventsResponse> {
    return this._getEvents(request).then(parseRawEvents);
  }

  // eslint-disable-next-line require-await
  public async _getEvents(
    request: RpcServer.GetEventsRequest
  ): Promise<Api.RawGetEventsResponse> {
    return jsonrpc.postObject(
      this.httpClient,
      this.serverURL.toString(),
      'getEvents',
      {
        filters: request.filters ?? [],
        pagination: {
          ...(request.cursor && { cursor: request.cursor }), // add if defined
          ...(request.limit && { limit: request.limit })
        },
        ...(request.startLedger && {
          startLedger: request.startLedger
        }),
        ...(request.endLedger && {
          endLedger: request.endLedger
        })
      });
  }

  /**
   * Fetch metadata about the network this Soroban RPC server is connected to.
   *
   * @returns {Promise<Api.GetNetworkResponse>} Metadata about the current
   * network this RPC server is connected to
   *
   * @see {@link https://developers.stellar.org/docs/data/rpc/api-reference/methods/getNetwork | getNetwork docs}
   *
   * @example
   * server.getNetwork().then((network) => {
   *   console.log("friendbotUrl:", network.friendbotUrl);
   *   console.log("passphrase:", network.passphrase);
   *   console.log("protocolVersion:", network.protocolVersion);
   * });
   */
  // eslint-disable-next-line require-await
  public async getNetwork(): Promise<Api.GetNetworkResponse> {
    return jsonrpc.postObject(
      this.httpClient,
      this.serverURL.toString(),
      'getNetwork');
  }

  /**
   * Fetch the latest ledger meta info from network which this Soroban RPC
   * server is connected to.
   *
   * @returns {Promise<Api.GetLatestLedgerResponse>}   metadata about the
   *    latest ledger on the network that this RPC server is connected to
   *
   * @see {@link https://developers.stellar.org/docs/data/rpc/api-reference/methods/getLatestLedger | getLatestLedger docs}
   *
   * @example
   * server.getLatestLedger().then((response) => {
   *   console.log("hash:", response.id);
   *   console.log("sequence:", response.sequence);
   *   console.log("protocolVersion:", response.protocolVersion);
   * });
   */
  // eslint-disable-next-line require-await
  public async getLatestLedger(): Promise<Api.GetLatestLedgerResponse> {
    return jsonrpc.postObject(
      this.httpClient,
      this.serverURL.toString(),
      'getLatestLedger');
  }

  /**
   * Submit a trial contract invocation to get back return values, expected
   * ledger footprint, expected authorizations, and expected costs.
   *
   * @param {Transaction | FeeBumpTransaction} tx the transaction to
   *    simulate, which should include exactly one operation (one of
   *    {@link xdr.InvokeHostFunctionOp}, {@link xdr.ExtendFootprintTTLOp}, or
   *    {@link xdr.RestoreFootprintOp}). Any provided footprint or auth
   *    information will be ignored.
   * @returns {Promise<Api.SimulateTransactionResponse>} An object with the
   *    cost, footprint, result/auth requirements (if applicable), and error of
   *    the transaction
   *
   * @see {@link https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/operations-and-transactions | transaction docs}
   * @see {@link https://developers.stellar.org/docs/data/rpc/api-reference/methods/simulateTransaction | simulateTransaction docs}
   * @see module:rpc.Server#prepareTransaction
   * @see module:rpc.assembleTransaction
   *
   * @example
   * const contractId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
   * const contract = new StellarSdk.Contract(contractId);
   *
   * // Right now, this is just the default fee for this example.
   * const fee = StellarSdk.BASE_FEE;
   * const transaction = new StellarSdk.TransactionBuilder(account, { fee })
   *   // Uncomment the following line to build transactions for the live network. Be
   *   // sure to also change the horizon hostname.
   *   //.setNetworkPassphrase(StellarSdk.Networks.PUBLIC)
   *   .setNetworkPassphrase(StellarSdk.Networks.FUTURENET)
   *   .setTimeout(30) // valid for the next 30s
   *   // Add an operation to call increment() on the contract
   *   .addOperation(contract.call("increment"))
   *   .build();
   *
   * server.simulateTransaction(transaction).then((sim) => {
   *   console.log("cost:", sim.cost);
   *   console.log("result:", sim.result);
   *   console.log("error:", sim.error);
   *   console.log("latestLedger:", sim.latestLedger);
   * });
   */
  // eslint-disable-next-line require-await
  public async simulateTransaction(
    tx: Transaction | FeeBumpTransaction,
    addlResources?: RpcServer.ResourceLeeway
  ): Promise<Api.SimulateTransactionResponse> {
    return this._simulateTransaction(tx, addlResources)
      .then(parseRawSimulation);
  }

  // eslint-disable-next-line require-await
  public async _simulateTransaction(
    transaction: Transaction | FeeBumpTransaction,
    addlResources?: RpcServer.ResourceLeeway
  ): Promise<Api.RawSimulateTransactionResponse> {
    return jsonrpc.postObject(
      this.httpClient,
      this.serverURL.toString(),
      'simulateTransaction',
      {
        transaction: transaction.toXDR(),
        ...(addlResources !== undefined && {
          resourceConfig: {
            instructionLeeway: addlResources.cpuInstructions
          }
        })
      }
    );
  }

  /**
   * Submit a trial contract invocation, first run a simulation of the contract
   * invocation as defined on the incoming transaction, and apply the results to
   * a new copy of the transaction which is then returned. Setting the ledger
   * footprint and authorization, so the resulting transaction is ready for
   * signing & sending.
   *
   * The returned transaction will also have an updated fee that is the sum of
   * fee set on incoming transaction with the contract resource fees estimated
   * from simulation. It is advisable to check the fee on returned transaction
   * and validate or take appropriate measures for interaction with user to
   * confirm it is acceptable.
   *
   * You can call the {@link module:rpc.Server#simulateTransaction} method
   * directly first if you want to inspect estimated fees for a given
   * transaction in detail first, then re-assemble it manually or via
   * {@link module:rpc.assembleTransaction}.
   *
   * @param {Transaction | FeeBumpTransaction} tx  the transaction to
   *    prepare. It should include exactly one operation, which must be one of
   *    {@link xdr.InvokeHostFunctionOp}, {@link xdr.ExtendFootprintTTLOp},
   *    or {@link xdr.RestoreFootprintOp}.
   *
   *    Any provided footprint will be overwritten. However, if your operation
   *    has existing auth entries, they will be preferred over ALL auth entries
   *    from the simulation. In other words, if you include auth entries, you
   *    don't care about the auth returned from the simulation. Other fields
   *    (footprint, etc.) will be filled as normal.
   * @returns {Promise<Transaction | FeeBumpTransaction>} A copy of the
   *    transaction with the expected authorizations (in the case of
   *    invocation), resources, and ledger footprints added. The transaction fee
   *    will also automatically be padded with the contract's minimum resource
   *    fees discovered from the simulation.
   * @throws {jsonrpc.Error<any>|Error|Api.SimulateTransactionErrorResponse}
   *    If simulation fails
   *
   * @see module:rpc.assembleTransaction
   * @see {@link https://developers.stellar.org/docs/data/rpc/api-reference/methods/simulateTransaction | simulateTransaction docs}
   *
   * @example
   * const contractId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
   * const contract = new StellarSdk.Contract(contractId);
   *
   * // Right now, this is just the default fee for this example.
   * const fee = StellarSdk.BASE_FEE;
   * const transaction = new StellarSdk.TransactionBuilder(account, { fee })
   *   // Uncomment the following line to build transactions for the live network. Be
   *   // sure to also change the horizon hostname.
   *   //.setNetworkPassphrase(StellarSdk.Networks.PUBLIC)
   *   .setNetworkPassphrase(StellarSdk.Networks.FUTURENET)
   *   .setTimeout(30) // valid for the next 30s
   *   // Add an operation to call increment() on the contract
   *   .addOperation(contract.call("increment"))
   *   .build();
   *
   * const preparedTransaction = await server.prepareTransaction(transaction);
   *
   * // Sign this transaction with the secret key
   * // NOTE: signing is transaction is network specific. Test network transactions
   * // won't work in the public network. To switch networks, use the Network object
   * // as explained above (look for StellarSdk.Network).
   * const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);
   * preparedTransaction.sign(sourceKeypair);
   *
   * server.sendTransaction(transaction).then(result => {
   *   console.log("hash:", result.hash);
   *   console.log("status:", result.status);
   *   console.log("errorResultXdr:", result.errorResultXdr);
   * });
   */
  public async prepareTransaction(tx: Transaction | FeeBumpTransaction) {
    const simResponse = await this.simulateTransaction(tx);
    if (Api.isSimulationError(simResponse)) {
      throw new Error(simResponse.error);
    }

    return assembleTransaction(tx, simResponse).build();
  }

  /**
   * Submit a real transaction to the Stellar network.
   *
   * Unlike Horizon, Soroban RPC does not wait for transaction completion. It
   * simply validates the transaction and enqueues it. Clients should call
   * {@link module:rpc.Server#getTransaction} to learn about transaction
   * success/failure.
   *
   * @param {Transaction | FeeBumpTransaction} transaction  to submit
   * @returns {Promise<Api.SendTransactionResponse>}   the
   *    transaction id, status, and any error if available
   *
   * @see {@link https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/operations-and-transactions | transaction docs}
   * @see {@link https://developers.stellar.org/docs/data/rpc/api-reference/methods/sendTransaction | sendTransaction docs}
   *
   * @example
   * const contractId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
   * const contract = new StellarSdk.Contract(contractId);
   *
   * // Right now, this is just the default fee for this example.
   * const fee = StellarSdk.BASE_FEE;
   * const transaction = new StellarSdk.TransactionBuilder(account, { fee })
   *   // Uncomment the following line to build transactions for the live network. Be
   *   // sure to also change the horizon hostname.
   *   //.setNetworkPassphrase(StellarSdk.Networks.PUBLIC)
   *   .setNetworkPassphrase(StellarSdk.Networks.FUTURENET)
   *   .setTimeout(30) // valid for the next 30s
   *   // Add an operation to call increment() on the contract
   *   .addOperation(contract.call("increment"))
   *   .build();
   *
   * // Sign this transaction with the secret key
   * // NOTE: signing is transaction is network specific. Test network transactions
   * // won't work in the public network. To switch networks, use the Network object
   * // as explained above (look for StellarSdk.Network).
   * const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);
   * transaction.sign(sourceKeypair);
   *
   * server.sendTransaction(transaction).then((result) => {
   *   console.log("hash:", result.hash);
   *   console.log("status:", result.status);
   *   console.log("errorResultXdr:", result.errorResultXdr);
   * });
   */
  // eslint-disable-next-line require-await
  public async sendTransaction(
    transaction: Transaction | FeeBumpTransaction
  ): Promise<Api.SendTransactionResponse> {
    return this._sendTransaction(transaction).then(parseRawSendTransaction);
  }

  // eslint-disable-next-line require-await
  public async _sendTransaction(
    transaction: Transaction | FeeBumpTransaction
  ): Promise<Api.RawSendTransactionResponse> {
    return jsonrpc.postObject(
      this.httpClient,
      this.serverURL.toString(),
      'sendTransaction',
      { transaction: transaction.toXDR() }
    );
  }

  /**
   * Fund a new account using the network's Friendbot faucet, if any.
   *
   * @param {string | Account} address The address or account instance that we
   *    want to create and fund with Friendbot
   * @param {string} [friendbotUrl] Optionally, an explicit address for
   *    friendbot (by default: this calls the Soroban RPC
   *    {@link module:rpc.Server#getNetwork | getNetwork} method to try to
   *    discover this network's Friendbot url).
   * @returns {Promise<Account>} An {@link Account} object for the created
   *    account, or the existing account if it's already funded with the
   *    populated sequence number (note that the account will not be "topped
   *    off" if it already exists)
   * @throws If Friendbot is not configured on this network or request failure
   *
   * @see {@link https://developers.stellar.org/docs/learn/networks#friendbot | Friendbot docs}
   * @see {@link module:Friendbot.Api.Response}
   *
   * @example
   * server
   *    .requestAirdrop("GBZC6Y2Y7Q3ZQ2Y4QZJ2XZ3Z5YXZ6Z7Z2Y4QZJ2XZ3Z5YXZ6Z7Z2Y4")
   *    .then((accountCreated) => {
   *      console.log("accountCreated:", accountCreated);
   *    }).catch((error) => {
   *      console.error("error:", error);
   *    });
   */
  public async requestAirdrop(
    address: string | Pick<Account, 'accountId'>,
    friendbotUrl?: string
  ): Promise<Account> {
    const account = typeof address === 'string' ? address : address.accountId();
    friendbotUrl = friendbotUrl || (await this.getNetwork()).friendbotUrl;
    if (!friendbotUrl) {
      throw new Error('No friendbot URL configured for current network');
    }

    try {
      const response = await this.httpClient.post<FriendbotApi.Response>(
        `${friendbotUrl}?addr=${encodeURIComponent(account)}`
      );

      const meta = xdr.TransactionMeta.fromXDR(
        response.data.result_meta_xdr,
        'base64'
      );
      const sequence = findCreatedAccountSequenceInTransactionMeta(meta);
      return new Account(account, sequence);
    } catch (error: any) {
      if (error.response?.status === 400) {
        if (error.response.detail?.includes('createAccountAlreadyExist')) {
          // Account already exists, load the sequence number
          return this.getAccount(account);
        }
      }
      throw error;
    }
  }

  /**
   * Provides an analysis of the recent fee stats for regular and smart
   * contract operations.
   *
   * @returns {Promise<Api.GetFeeStatsResponse>}  the fee stats
   * @see https://developers.stellar.org/docs/data/rpc/api-reference/methods/getFeeStats
   */
  // eslint-disable-next-line require-await
  public async getFeeStats(): Promise<Api.GetFeeStatsResponse> {
    return jsonrpc.postObject(
      this.httpClient,
      this.serverURL.toString(),
      'getFeeStats');
  }

  /**
   * Provides information about the current version details of the Soroban RPC and captive-core
   *
   * @returns {Promise<Api.GetVersionInfoResponse>} the version info
   * @see https://developers.stellar.org/docs/data/rpc/api-reference/methods/getVersionInfo
   */
  // eslint-disable-next-line require-await
  public async getVersionInfo(): Promise<Api.GetVersionInfoResponse> {
    return jsonrpc.postObject(
      this.httpClient,
      this.serverURL.toString(),
      'getVersionInfo');
  }

  /**
   * Returns a contract's balance of a particular SAC asset, if any.
   *
   * This is a convenience wrapper around {@link Server.getLedgerEntries}.
   *
   * @param {string}  contractId    the contract ID (string `C...`) whose
   *    balance of `sac` you want to know
   * @param {Asset}   sac     the built-in SAC token (e.g. `USDC:GABC...`) that
   *    you are querying from the given `contract`.
   * @param {string}  [networkPassphrase] optionally, the network passphrase to
   *    which this token applies. If omitted, a request about network
   *    information will be made (see {@link getNetwork}), since contract IDs
   *    for assets are specific to a network. You can refer to {@link Networks}
   *    for a list of built-in passphrases, e.g., `Networks.TESTNET`.
   *
   * @returns {Promise<Api.BalanceResponse>}, which will contain the balance
   *    entry details if and only if the request returned a valid balance ledger
   *    entry. If it doesn't, the `balanceEntry` field will not exist.
   *
   * @throws {TypeError} If `contractId` is not a valid contract strkey (C...).
   *
   * @see getLedgerEntries
   * @see https://developers.stellar.org/docs/tokens/stellar-asset-contract
   *
   * @example
   * // assume `contractId` is some contract with an XLM balance
   * // assume server is an instantiated `Server` instance.
   * const entry = (await server.getSACBalance(
   *   new Address(contractId),
   *   Asset.native(),
   *   Networks.PUBLIC
   * ));
   *
   * // assumes BigInt support:
   * console.log(
   *   entry.balanceEntry ?
   *   BigInt(entry.balanceEntry.amount) :
   *   "Contract has no XLM");
   */
  public async getSACBalance(
    contractId: string,
    sac: Asset,
    networkPassphrase?: string
  ): Promise<Api.BalanceResponse> {
      if (!StrKey.isValidContract(contractId)) {
        throw new TypeError(`expected contract ID, got ${contractId}`);
      }

      // Call out to RPC if passphrase isn't provided.
      const passphrase: string = networkPassphrase
        ?? await this.getNetwork().then(n => n.passphrase);

      // Turn SAC into predictable contract ID
      const sacId = sac.contractId(passphrase);

      // Rust union enum type with "Balance(ScAddress)" structure
      const key = xdr.ScVal.scvVec([
        nativeToScVal("Balance", { type: "symbol" }),
        nativeToScVal(contractId, { type: "address" }),
      ]);

      // Note a quirk here: the contract address in the key is the *token*
      // rather than the *holding contract*. This is because each token stores a
      // balance entry for each contract, not the other way around (i.e. XLM
      // holds a reserve for contract X, rather that contract X having a balance
      // of N XLM).
      const ledgerKey = xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
          contract: new Address(sacId).toScAddress(),
          durability: xdr.ContractDataDurability.persistent(),
          key
        })
      );

      const response = await this.getLedgerEntries(ledgerKey);
      if (response.entries.length === 0) {
        return { latestLedger: response.latestLedger };
      }

      const {
        lastModifiedLedgerSeq,
        liveUntilLedgerSeq,
        val
      } = response.entries[0];

      if (val.switch().value !== xdr.LedgerEntryType.contractData().value) {
        return { latestLedger: response.latestLedger };
      }

      const entry = scValToNative(val.contractData().val());

      // Since we are requesting a SAC's contract data, we know for a fact that
      // it should follow the expected structure format. Thus, we can presume
      // these fields exist:
      return {
        latestLedger: response.latestLedger,
        balanceEntry: {
          liveUntilLedgerSeq,
          lastModifiedLedgerSeq,
          amount: entry.amount.toString(),
          authorized: entry.authorized,
          clawback: entry.clawback,
        }
      };
  }
}
