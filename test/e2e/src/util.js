const { spawnSync } = require("node:child_process");
const { contract, Keypair, rpc } = require("../../../lib");
const path = require("node:path");

/*
 * Run a Bash command, returning stdout, stderr, and status code.
 */
function run(command) {
  const [cmd, ...args] = command.split(" ");
  const result = spawnSync(cmd, args, { shell: true, encoding: "utf8" });
  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    status: result.status,
  };
}
module.exports.run = run;

const stellar = "./target/bin/stellar";
const basePath = path.resolve(
  `${__dirname}/../test-contracts/target/wasm32-unknown-unknown/release`,
);
const contracts = {
  customTypes: {
    hash: run(
      `${stellar} contract install --wasm ${basePath}/custom_types.wasm`,
    ).stdout,
    path: `${basePath}/custom_types.wasm`,
  },
  increment: {
    hash: run(`${stellar} contract install --wasm ${basePath}/increment.wasm`)
      .stdout,
    path: `${basePath}/increment.wasm`,
    constructorArgs: {
      counter: 0,
    },
  },
  swap: {
    hash: run(`${stellar} contract install --wasm ${basePath}/atomic_swap.wasm`)
      .stdout,
    path: `${basePath}/atomic_swap.wasm`,
  },
  token: {
    hash: run(`${stellar} contract install --wasm ${basePath}/token.wasm`)
      .stdout,
    path: `${basePath}/token.wasm`,
  },
  needsSignature: {
    hash: run(
      `${stellar} contract install --wasm ${basePath}/needs_a_signature.wasm`,
    ).stdout,
    path: `${basePath}/needs_a_signature.wasm`,
  },
  doesSigning: {
    hash: run(
      `${stellar} contract install --wasm ${basePath}/this_one_signs.wasm`,
    ).stdout,
    path: `${basePath}/this_one_signs.wasm`,
  },
};
module.exports.contracts = contracts;

const rpcUrl =
  process.env.SOROBAN_RPC_URL ?? "http://localhost:8000/soroban/rpc";
module.exports.rpcUrl = rpcUrl;
const networkPassphrase =
  process.env.SOROBAN_NETWORK_PASSPHRASE ??
  "Standalone Network ; February 2017";
module.exports.networkPassphrase = networkPassphrase;

async function generateFundedKeypair() {
  const keypair = Keypair.random();
  const server = new rpc.Server(rpcUrl, {
    allowHttp: rpcUrl.startsWith("http://") ?? false,
  });
  await server.requestAirdrop(keypair.publicKey());
  return keypair;
}
module.exports.generateFundedKeypair = generateFundedKeypair;

/**
 * Generates a Client for the contract with the given name.
 * Also generates a new account to use as as the keypair of this contract. This
 * account is funded by friendbot. You can pass in an account to re-use the
 * same account with multiple contract clients.
 *
 * By default, will re-deploy the contract every time. Pass in the same
 * `contractId` again if you want to re-use the a contract instance.
 */
async function clientFor(name, { keypair, contractId } = {}) {
  const internalKeypair = keypair ?? (await generateFundedKeypair());
  
  // Pass the Keypair directly instead of using basicNodeSigner
  const signer = internalKeypair; // Use Keypair directly

  if (contractId) {
    return {
      client: await contract.Client.from({
        contractId,
        networkPassphrase,
        rpcUrl,
        allowHttp: true,
        publicKey: internalKeypair.publicKey(),
        signTransaction: signer, // Pass Keypair here
      }),
      contractId,
      keypair,
    };
  }

  const { wasmHash } = await installContract(name, {
    keypair: internalKeypair,
  });

  const deploy = await contract.Client.deploy(
    contracts[name].constructorArgs ?? null,
    {
      networkPassphrase,
      rpcUrl,
      allowHttp: true,
      wasmHash: wasmHash,
      publicKey: internalKeypair.publicKey(),
      signTransaction: signer, // Pass Keypair here
    },
  );
  const { result: client } = await deploy.signAndSend();

  return {
    keypair: internalKeypair,
    client,
    contractId: client.options.contractId,
  };
}
module.exports.clientFor = clientFor;

async function installContract(name, { keypair } = {}) {
  if (!contracts[name]) {
    throw new Error(
      `Contract ${name} not found. ` +
        `Pick one of: ${Object.keys(contracts).join(", ")}`,
    );
  }

  const internalKeypair = keypair ?? (await generateFundedKeypair());

  let wasmHash = contracts[name].hash;
  if (!wasmHash) {
    wasmHash = run(
      `${stellar} contract install --wasm ${contracts[name].path}`,
    ).stdout;
  }
  return { keypair: internalKeypair, wasmHash };
}
module.exports.installContract = installContract;
