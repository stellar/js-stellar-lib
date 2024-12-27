const { expect } = require("chai");
const { clientFor } = require("./util");

describe("cross-contract auth", function () {
  before(async function () {
    const { contractId: signingContractId, keypair } =
      await clientFor("doesSigning");
    const { client: needsSignature } = await clientFor("needsSignature", {
      keypair,
    });

    const tx = await needsSignature.hello({
      to: keypair.publicKey(),
      user_signer: keypair.publicKey(),
      contract_signer: signingContractId,
    });
    this.context = { tx, signingContractId };
  });

  describe("needsNonInvokerSigningBy", function () {
    it("does not assume stellar accounts", async function () {
      expect(this.context.tx.needsNonInvokerSigningBy()[0]).to.equal(
        this.context.signingContractId,
      );
    });
  });

  describe("sign", function () {
    it("doesn't throw error when nonInvokerSigningBy returns a contract", async function () {
      expect(
        async () => await this.context.tx.sign({ force: true }),
      ).to.not.throw();
    });

    it("signs transaction using Keypair", async function () {
      const result = await this.context.tx.sign({
        signTransaction: this.context.keypair,
        force: true,
      });
      expect(result).to.be.undefined;
    });


    it("signs transaction using basicNodeSigner", async function () {
      const signer = contract.basicNodeSigner(this.context.keypair, "Standalone Network ; February 2017");
      const result = await this.context.tx.sign({
        signTransaction: signer.signTransaction,
        force: true,
      });
      expect(result).to.be.undefined;
    });
  });

  describe("signAuthEntries with custom authorizeEntry", function () {
    it("allows signing twice", function (done) {
      function authorizeEntry(entry) {
        return entry;
      }
      this.context.tx
        .signAuthEntries({
          address: this.context.signingContractId,
          authorizeEntry,
        })
        .then(() => {
          this.context.tx
            .signAuthEntries({
              address: this.context.signingContractId,
              authorizeEntry,
            })
            .then(() => done());
        })
        .catch((err) => done(err));
    });
  });
});
