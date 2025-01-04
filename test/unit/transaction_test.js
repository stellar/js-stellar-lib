const { xdr, rpc } = StellarSdk;

describe("assembleTransaction", () => {
  xit("works with keybump transactions");

  const scAddress = new StellarSdk.Address(
    "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
  ).toScAddress();

  const fnAuth = new xdr.SorobanAuthorizationEntry({
    // Include a credentials w/ a nonce to trigger this
    credentials: new xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: scAddress,
        nonce: new xdr.Int64(0),
        signatureExpirationLedger: 1,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    // And a basic invocation
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function:
        xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
          new xdr.InvokeContractArgs({
            contractAddress: scAddress,
            functionName: "fn",
            args: [],
          }),
        ),
      subInvocations: [],
    }),
  }).toXDR();

  const sorobanTransactionData = new StellarSdk.SorobanDataBuilder()
    .setResources(0, 5, 0, 0)
    .build();

  const simulationResponse = {
    transactionData: sorobanTransactionData.toXDR("base64"),
    events: [],
    minResourceFee: "115",
    results: [
      {
        auth: [fnAuth],
        xdr: xdr.ScVal.scvU32(0).toXDR("base64"),
      },
    ],
    latestLedger: 3,
    cost: {
      cpuInsns: "0",
      memBytes: "0",
    },
  };

  describe("Transaction", () => {
    const networkPassphrase = StellarSdk.Networks.TESTNET;
    const source = new StellarSdk.Account(
      "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
      "1",
    );

    function singleContractFnTransaction(auth) {
      return new StellarSdk.TransactionBuilder(source, { fee: 100 })
        .setNetworkPassphrase(networkPassphrase)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .addOperation(
          StellarSdk.Operation.invokeHostFunction({
            func: xdr.HostFunction.hostFunctionTypeInvokeContract(
              new xdr.InvokeContractArgs({
                contractAddress: scAddress,
                functionName: "hello",
                args: [xdr.ScVal.scvString("hello")],
              }),
            ),
            auth: auth ?? [],
          }),
        )
        .build();
    }

    it("simulate updates the tx data from simulation response", () => {
      const txn = singleContractFnTransaction();
      const result = rpc.assembleTransaction(txn, simulationResponse).build();

      // validate it auto updated the tx fees from sim response fees
      // since it was greater than tx.fee
      expect(result.toEnvelope().v1().tx().fee()).to.equal(215);

      // validate it updated sorobantransactiondata block in the tx ext
      expect(result.toEnvelope().v1().tx().ext().sorobanData()).to.deep.equal(
        sorobanTransactionData,
      );
    });

    it("simulate adds the auth to the host function in tx operation", () => {
      const txn = singleContractFnTransaction();
      const result = rpc.assembleTransaction(txn, simulationResponse).build();

      expect(
        result
          .toEnvelope()
          .v1()
          .tx()
          .operations()[0]
          .body()
          .invokeHostFunctionOp()
          .auth()[0]
          .rootInvocation()
          .function()
          .contractFn()
          .functionName()
          .toString(),
      ).to.equal("fn");

      expect(
        StellarSdk.StrKey.encodeEd25519PublicKey(
          result
            .toEnvelope()
            .v1()
            .tx()
            .operations()[0]
            .body()
            .invokeHostFunctionOp()
            .auth()[0]
            .credentials()
            .address()
            .address()
            .accountId()
            .ed25519(),
        ),
      ).to.equal("GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI");
    });

    it("simulate ignores non auth from simulation", () => {
      const txn = singleContractFnTransaction();
      let simulateResp = JSON.parse(JSON.stringify(simulationResponse));
      simulateResp.results[0].auth = null;
      const result = rpc.assembleTransaction(txn, simulateResp).build();

      expect(
        result
          .toEnvelope()
          .v1()
          .tx()
          .operations()[0]
          .body()
          .invokeHostFunctionOp()
          .auth(),
      ).to.have.length(0);
    });

    it("throws for non-Soroban ops", () => {
      const txn = new StellarSdk.TransactionBuilder(source, {
        fee: 100,
        networkPassphrase,
        v1: true,
      })
        .addOperation(
          StellarSdk.Operation.changeTrust({
            asset: StellarSdk.Asset.native(),
          }),
        )
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      expect(() => {
        rpc
          .assembleTransaction(txn, {
            transactionData: {},
            events: [],
            minResourceFee: "0",
            results: [],
            latestLedger: 3,
          })
          .build();
        expect.fail();
      }).to.throw(/unsupported transaction/i);
    });

    it("works for all Soroban ops", function () {
      [
        StellarSdk.Operation.invokeHostFunction({
          func: xdr.HostFunction.hostFunctionTypeInvokeContract(),
        }),
        StellarSdk.Operation.extendFootprintTtl({ extendTo: 27 }),
        StellarSdk.Operation.restoreFootprint(),
      ].forEach((op) => {
        const txn = new StellarSdk.TransactionBuilder(source, {
          fee: 100,
          networkPassphrase,
          v1: true,
        })
          .setTimeout(StellarSdk.TimeoutInfinite)
          .addOperation(op)
          .build();

        const tx = rpc.assembleTransaction(txn, simulationResponse).build();
        expect(tx.operations[0].type).to.equal(op.body().switch().name);
      });
    });

    it("doesn't overwrite auth if it's present", function () {
      const txn = singleContractFnTransaction([fnAuth, fnAuth, fnAuth]);
      const tx = rpc.assembleTransaction(txn, simulationResponse).build();

      expect(tx.operations[0].auth.length).to.equal(
        3,
        `auths aren't preserved after simulation: ${simulationResponse}, ${tx}`,
      );
    });
  });
});
