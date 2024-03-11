import { Networks } from '..'
import { xdr } from '..'

export type XDR_BASE64 = string;
export type u32 = number;
export type i32 = number;
export type u64 = bigint;
export type i64 = bigint;
export type u128 = bigint;
export type i128 = bigint;
export type u256 = bigint;
export type i256 = bigint;
export type Option<T> = T | undefined;
export type Typepoint = bigint;
export type Duration = bigint;

export type ContractClientOptions = {
  /**
   * The public key of the account that will send this transaction. You can
   * override this for specific methods later, like
   * {@link AssembledTransaction#signAndSend} and
   * {@link AssembledTransaction#signAuthEntries}.
   */
  publicKey: string;
  /**
   * A function to sign the transaction using the private key corresponding to
   * the given `publicKey`. You do not need to provide this, for read-only
   * calls, which only need to be simulated. If you do not need to sign and
   * send, there is no need to provide this. If you do not provide it during
   * initialization, you can provide it later when you call
   * {@link AssembledTransaction#signAndSend}.
   *
   * Matches signature of `signTransaction` from Freighter.
   */
  signTransaction?: (
    tx: XDR_BASE64,
    opts?: {
      network?: string;
      networkPassphrase?: string;
      accountToSign?: string;
    }
  ) => Promise<XDR_BASE64>;
  /**
   * A function to sign a specific auth entry for a transaction, using the
   * private key corresponding to the provided `publicKey`. This is only needed
   * for multi-auth transactions, in which one transaction is signed by
   * multiple parties. If you do not provide it during initialization, you can
   * provide it later when you call {@link AssembledTransaction#signAuthEntries}.
   *
   * Matches signature of `signAuthEntry` from Freighter.
   */
  signAuthEntry?: (
    entryXdr: XDR_BASE64,
    opts?: {
      accountToSign?: string;
    }
  ) => Promise<XDR_BASE64>;
  contractId: string;
  networkPassphrase: Networks;
  rpcUrl: string;
  /**
   * If true, will allow HTTP requests to the Soroban network. If false, will
   * only allow HTTPS requests. @default false
   */
  allowHttp: boolean;
  /**
   * This gets filled in automatically from the ContractSpec if you use
   * {@link ContractClient.generate} to create your ContractClient.
   *
   * Background: If the contract you're calling uses the `#[contracterror]`
   * macro to create an `Error` enum, then those errors get included in the
   * on-chain XDR that also describes your contract's methods. Each error will
   * have a specific number.
   *
   * A ContractClient makes method calls with an {@link AssembledTransaction}.
   * When one of these method calls encounters an error, `AssembledTransaction`
   * will first attempt to parse the error as an "official" `contracterror`
   * error, by using this passed-in `errorTypes` object. See
   * {@link AssembledTransaction#parseError}. If `errorTypes` is blank or no
   * matching error is found, then it will throw the raw error.
   * @default {}
   */
  errorTypes?: Record<number, { message: string }>;
};

export type MethodOptions = {
  /**
   * The fee to pay for the transaction. Default: {@link BASE_FEE}
   */
  fee?: number;

  /**
   * The maximum amount of time to wait for the transaction to complete. Default: {@link DEFAULT_TIMEOUT}
   */
  timeoutInSeconds?: number;

  /**
   * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
   */
  simulate?: boolean;
};

export type AssembledTransactionOptions<T = string> = MethodOptions &
  ContractClientOptions & {
    method: string;
    args?: any[];
    parseResultXdr: (xdr: xdr.ScVal) => T;
  };

