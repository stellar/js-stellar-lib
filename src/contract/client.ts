import {
  Operation,
  Transaction,
  TransactionBuilder,
  xdr,
  Account,
  hash,
  Address,
} from "@stellar/stellar-base";
import { Spec } from "./spec";
import { Server } from '../rpc';
import { AssembledTransaction } from "./assembled_transaction";
import type { ClientOptions, MethodOptions } from "./types";
import { processSpecEntryStream } from './utils';
import { DEFAULT_TIMEOUT } from "./types";

const CONSTRUCTOR_FUNC = "__constructor";


/**
 * Generate a class from the contract spec that where each contract method
 * gets included with an identical name.
 *
 * Each method returns an {@link module:contract.AssembledTransaction | AssembledTransaction} that can
 * be used to modify, simulate, decode results, and possibly sign, & submit the
 * transaction.
 *
 * @memberof module:contract
 *
 * @class
 * @param {module:contract.Spec} spec {@link Spec} to construct a Client for
 * @param {ClientOptions} options see {@link ClientOptions}
 */
export class Client {
  static async deploy<T = Client>(
    args: Record<string, any> | null,
    options: MethodOptions &
      Omit<ClientOptions, "contractId"> & {
        wasmHash: Buffer | string;
        salt: Buffer;
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    let spec = await specFromWasmHash(
      options.wasmHash,
      options,
      options.format
    );
    const wasmHashBuffer =
      typeof options.wasmHash === "string"
        ? Buffer.from(options.wasmHash, options.format)
        : (options.wasmHash as Buffer);
    let constructorArgs: xdr.ScVal[] = args
      ? spec.funcArgsToScVals(CONSTRUCTOR_FUNC, args)
      : [];
    let address = new Address(options.publicKey!);
    let contractIdPreimage =
      xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          salt: options.salt,
          address: address.toScAddress(),
        })
      );
    let contractId = Address.contract(
      hash(contractIdPreimage.toXDR())
    ).toString();
    console.log("contractId", contractId);
    let func = xdr.HostFunction.hostFunctionTypeCreateContractV2(
      new xdr.CreateContractArgsV2({
        constructorArgs,
        contractIdPreimage,
        executable:
          xdr.ContractExecutable.contractExecutableWasm(wasmHashBuffer),
      })
    );
    let operation = Operation.invokeHostFunction({
      func,
      source: address.toString(),
    });

    return AssembledTransaction.buildWithOp(operation, {
      ...options,
      contractId,
      method: CONSTRUCTOR_FUNC,
      parseResultXdr: (result: xdr.ScVal) =>
        new Client(spec, { ...options, contractId }),
    }) as unknown as AssembledTransaction<T>;
  }

  constructor(
    public readonly spec: Spec,
    public readonly options: ClientOptions
  ) {
    this.spec.funcs().forEach((xdrFn) => {
      const method = xdrFn.name().toString();
      if (method === CONSTRUCTOR_FUNC) {
        return;
      }
      const assembleTransaction = (
        args?: Record<string, any>,
        methodOptions?: MethodOptions
      ) =>
        AssembledTransaction.build({
          method,
          args: args && spec.funcArgsToScVals(method, args),
          ...options,
          ...methodOptions,
          errorTypes: spec.errorCases().reduce(
            (acc, curr) => ({
              ...acc,
              [curr.value()]: { message: curr.doc().toString() },
            }),
            {} as Pick<ClientOptions, "errorTypes">,
          ),
          parseResultXdr: (result: xdr.ScVal) =>
            spec.funcResToNative(method, result),
        });

      // @ts-ignore error TS7053: Element implicitly has an 'any' type
      this[method] =
        spec.getFunc(method).inputs().length === 0
          ? (opts?: MethodOptions) => assembleTransaction(undefined, opts)
          : assembleTransaction;
    });
  }

  /**
   * Generates a Client instance from the provided ClientOptions and the contract's wasm hash.
   * The wasmHash can be provided in either hex or base64 format.
   *
   * @param {Buffer | string} wasmHash The hash of the contract's wasm binary, in either hex or base64 format.
   * @param {ClientOptions} options The ClientOptions object containing the necessary configuration, including the rpcUrl.
   * @param {('hex' | 'base64')} [format='hex'] The format of the provided wasmHash, either "hex" or "base64". Defaults to "hex".
   * @returns {Promise<module:contract.Client>} A Promise that resolves to a Client instance.
   * @throws {TypeError} If the provided options object does not contain an rpcUrl.
   */
  static async fromWasmHash(wasmHash: Buffer | string,
    options: ClientOptions,
    format: "hex" | "base64" = "hex"
  ): Promise<Client> {
    if (!options || !options.rpcUrl) {
      throw new TypeError('options must contain rpcUrl');
    }
    const { rpcUrl, allowHttp } = options;
    const serverOpts: Server.Options = { allowHttp };
    const server = new Server(rpcUrl, serverOpts);
    const wasm = await server.getContractWasmByHash(wasmHash, format);
    return Client.fromWasm(wasm, options);
  }

  /**
   * Generates a Client instance from the provided ClientOptions and the contract's wasm binary.
   *
   * @param {Buffer} wasm The contract's wasm binary as a Buffer.
   * @param {ClientOptions} options The ClientOptions object containing the necessary configuration.
   * @returns {Promise<module:contract.Client>} A Promise that resolves to a Client instance.
   * @throws {Error} If the contract spec cannot be obtained from the provided wasm binary.
   */
  static async fromWasm(wasm: Buffer, options: ClientOptions): Promise<Client> {
    const spec = await specFromWasm(wasm);
    return new Client(spec, options);
  }

  /**
   * Generates a Client instance from the provided ClientOptions, which must include the contractId and rpcUrl.
   *
   * @param {ClientOptions} options The ClientOptions object containing the necessary configuration, including the contractId and rpcUrl.
   * @returns {Promise<module:contract.Client>} A Promise that resolves to a Client instance.
   * @throws {TypeError} If the provided options object does not contain both rpcUrl and contractId.
   */
  static async from(options: ClientOptions): Promise<Client> {
    if (!options || !options.rpcUrl || !options.contractId) {
      throw new TypeError('options must contain rpcUrl and contractId');
    }
    const { rpcUrl, contractId, allowHttp } = options;
    const serverOpts: Server.Options = { allowHttp };
    const server = new Server(rpcUrl, serverOpts);
    const wasm = await server.getContractWasmByContractId(contractId);
    return Client.fromWasm(wasm, options);
  }

  txFromJSON = <T>(json: string): AssembledTransaction<T> => {
    const { method, ...tx } = JSON.parse(json);
    return AssembledTransaction.fromJSON(
      {
        ...this.options,
        method,
        parseResultXdr: (result: xdr.ScVal) =>
          this.spec.funcResToNative(method, result),
      },
      tx,
    );
  };

  txFromXDR = <T>(xdrBase64: string): AssembledTransaction<T> => AssembledTransaction.fromXDR(this.options, xdrBase64, this.spec);

}
async function specFromWasm(wasm: Buffer) {
  const wasmModule = await WebAssembly.compile(wasm);
  const xdrSections = WebAssembly.Module.customSections(
    wasmModule,
    "contractspecv0"
  );
  if (xdrSections.length === 0) {
    throw new Error("Could not obtain contract spec from wasm");
  }
  const bufferSection = Buffer.from(xdrSections[0]);
  const specEntryArray = processSpecEntryStream(bufferSection);
  const spec = new Spec(specEntryArray);
  return spec;
}

async function specFromWasmHash(
  wasmHash: Buffer | string,
  options: Server.Options & { rpcUrl: string },
  format: "hex" | "base64" = "hex"
): Promise<Spec> {
  if (!options || !options.rpcUrl) {
    throw new TypeError("options must contain rpcUrl");
  }
  const { rpcUrl, allowHttp } = options;
  const serverOpts: Server.Options = { allowHttp };
  const server = new Server(rpcUrl, serverOpts);
  const wasm = await server.getContractWasmByHash(wasmHash, format);
  return specFromWasm(wasm);
}
