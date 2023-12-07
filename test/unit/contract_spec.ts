import { xdr, Address, ContractSpec, Keypair } from "../..";
import { JSONSchemaFaker } from "json-schema-faker";

import spec from "../spec.json";
import { expect } from "chai";

const publicKey = "GCBVOLOM32I7OD5TWZQCIXCXML3TK56MDY7ZMTAILIBQHHKPCVU42XYW";
const addr = Address.fromString(publicKey);
let SPEC: ContractSpec;
JSONSchemaFaker.format("address", () => {
  let keypair = Keypair.random();
  return keypair.publicKey();
});

JSONSchemaFaker.format("bigint", (value) => {
  let s = JSONSchemaFaker.generate(value);
  return BigInt(s!.toString()!);
  
});

const ints = ["i64", "u64", "i128", "u128", "i256", "u256"];

before(() => {
  SPEC = new ContractSpec(spec);
});

it("throws if no entries", () => {
  expect(() => new ContractSpec([])).to.throw(
    /Contract spec must have at least one entry/i
  );
});

describe("Can round trip custom types", function () {
  function getResultType(funcName: string): xdr.ScSpecTypeDef {
    let fn = SPEC.findEntry(funcName).value();
    if (!(fn instanceof xdr.ScSpecFunctionV0)) {
      throw new Error("Not a function");
    }
    if (fn.outputs().length === 0) {
      return xdr.ScSpecTypeDef.scSpecTypeVoid();
    }
    return fn.outputs()[0];
  }

  async function jsonSchema_roundtrip(
    spec: ContractSpec,
    funcName: string,
    num: number = 100
  ) {
    let funcSpec = spec.jsonSchema(funcName);
    
    for (let i = 0; i < num; i++) {
      let arg = await JSONSchemaFaker.resolve(funcSpec)!;
      // @ts-ignore
      let res = arg.args;
      try {
        let scVal = SPEC.funcArgsToScVals(funcName, res)[0];
        let result = SPEC.funcResToNative(funcName, scVal);
        if (ints.some((i) => funcName.includes(i))) {
          res[funcName] = BigInt(res[funcName]);
          // result = result.toString();
          // if (result.startsWith("0") && result.length > 1) {
          //   result = result.slice(1);
          // }
        }
        if (funcName.startsWith("bytes")) {
          res[funcName] = Buffer.from(res[funcName], "base64");
        }
        expect(res[funcName]).deep.equal(result);
      } catch (e) {
        console.error(
          funcName,
          JSON.stringify(arg, null, 2),
          
          "\n",
          //@ts-ignore
          JSON.stringify(funcSpec.definitions![funcName]["properties"], null, 2)

        );
        throw e;
      }
    }
  }

  describe("Json Schema", () => {
    SPEC = new ContractSpec(spec);
    let names = SPEC.funcs().map((f) => f.name().toString());
    const banned = ["strukt_hel", "not", "woid", "val", "multi_args"];
    names
      .filter((name) => !name.includes("fail"))
      .filter((name) => !banned.includes(name))
      .forEach((name) => {
        it(name, async () => {
          await jsonSchema_roundtrip(SPEC, name);
        });
      });
  });

  function roundtrip(funcName: string, input: any, typeName?: string) {
    let type = getResultType(funcName);
    let ty = typeName ?? funcName;
    let obj: any = {};
    obj[ty] = input;
    let scVal = SPEC.funcArgsToScVals(funcName, obj)[0];
    let result = SPEC.scValToNative(scVal, type);
    expect(result).deep.equal(input);
  }

  it("u32", () => {
    roundtrip("u32_", 1);
  });

  it("i32", () => {
    roundtrip("i32_", -1);
  });

  it("i64", () => {
    roundtrip("i64_", 1n);
  });

  it("strukt", () => {
    roundtrip("strukt", { a: 0, b: true, c: "hello" });
  });

  describe("simple", () => {
    it("first", () => {
      const simple = { tag: "First" } as const;
      roundtrip("simple", simple);
    });
    it("simple second", () => {
      const simple = { tag: "Second" } as const;
      roundtrip("simple", simple);
    });

    it("simple third", () => {
      const simple = { tag: "Third" } as const;
      roundtrip("simple", simple);
    });
  });

  describe("complex", () => {
    it("struct", () => {
      const complex = {
        tag: "Struct",
        values: [{ a: 0, b: true, c: "hello" }],
      } as const;
      roundtrip("complex", complex);
    });

    it("tuple", () => {
      const complex = {
        tag: "Tuple",
        values: [[{ a: 0, b: true, c: "hello" }, { tag: "First" }]],
      } as const;
      roundtrip("complex", complex);
    });

    it("enum", () => {
      const complex = {
        tag: "Enum",
        values: [{ tag: "First" }],
      } as const;
      roundtrip("complex", complex);
    });

    it("asset", () => {
      const complex = { tag: "Asset", values: [addr.toString(), 1n] } as const;
      roundtrip("complex", complex);
    });

    it("void", () => {
      const complex = { tag: "Void" } as const;
      roundtrip("complex", complex);
    });
  });

  it("addresse", () => {
    roundtrip("addresse", addr.toString());
  });

  it("bytes", () => {
    const bytes = Buffer.from("hello");
    roundtrip("bytes", bytes);
  });

  it("bytes_n", () => {
    const bytes_n = Buffer.from("123456789"); // what's the correct way to construct bytes_n?
    roundtrip("bytes_n", bytes_n);
  });

  it("card", () => {
    const card = 11;
    roundtrip("card", card);
  });

  it("boolean", () => {
    roundtrip("boolean", true);
  });

  it("not", () => {
    roundtrip("boolean", false);
  });

  it("i128", () => {
    roundtrip("i128", -1n);
  });

  it("u128", () => {
    roundtrip("u128", 1n);
  });

  it("map", () => {
    const map = new Map();
    map.set(1, true);
    map.set(2, false);
    roundtrip("map", map);

    map.set(3, "hahaha");
    expect(() => roundtrip("map", map)).to.throw(
      /invalid type scSpecTypeBool specified for string value/i
    );
  });

  it("vec", () => {
    const vec = [1, 2, 3];
    roundtrip("vec", vec);
  });

  it("tuple", () => {
    const tuple = ["hello", 1] as const;
    roundtrip("tuple", tuple);
  });

  it("option", () => {
    roundtrip("option", 1);
    roundtrip("option", undefined);
  });

  it("u256", () => {
    roundtrip("u256", 1n);
    expect(() => roundtrip("u256", -1n)).to.throw(
      /expected a positive value, got: -1/i
    );
  });

  it("i256", () => {
    roundtrip("i256", -1n);
  });

  it("string", () => {
    roundtrip("string", "hello");
  });

  it("tuple_strukt", () => {
    const arg = [{ a: 0, b: true, c: "hello" }, { tag: "First" }] as const;

    roundtrip("tuple_strukt", arg);
  });
});

describe("parsing and building ScVals", function () {
  it("Can parse entries", function () {
    let spec = new ContractSpec([GIGA_MAP, func]);
    let fn = spec.findEntry("giga_map");
    let gigaMap = spec.findEntry("GigaMap");
    expect(gigaMap).deep.equal(GIGA_MAP);
    expect(fn).deep.equal(func);
  });
});

export const GIGA_MAP = xdr.ScSpecEntry.scSpecEntryUdtStructV0(
  new xdr.ScSpecUdtStructV0({
    doc: "This is a kitchen sink of all the types",
    lib: "",
    name: "GigaMap",
    fields: [
      new xdr.ScSpecUdtStructFieldV0({
        doc: "",
        name: "bool",
        type: xdr.ScSpecTypeDef.scSpecTypeBool(),
      }),
      new xdr.ScSpecUdtStructFieldV0({
        doc: "",
        name: "i128",
        type: xdr.ScSpecTypeDef.scSpecTypeI128(),
      }),
      new xdr.ScSpecUdtStructFieldV0({
        doc: "",
        name: "u128",
        type: xdr.ScSpecTypeDef.scSpecTypeU128(),
      }),
      new xdr.ScSpecUdtStructFieldV0({
        doc: "",
        name: "i256",
        type: xdr.ScSpecTypeDef.scSpecTypeI256(),
      }),
      new xdr.ScSpecUdtStructFieldV0({
        doc: "",
        name: "u256",
        type: xdr.ScSpecTypeDef.scSpecTypeU256(),
      }),
      new xdr.ScSpecUdtStructFieldV0({
        doc: "",
        name: "i32",
        type: xdr.ScSpecTypeDef.scSpecTypeI32(),
      }),
      new xdr.ScSpecUdtStructFieldV0({
        doc: "",
        name: "u32",
        type: xdr.ScSpecTypeDef.scSpecTypeU32(),
      }),
      new xdr.ScSpecUdtStructFieldV0({
        doc: "",
        name: "i64",
        type: xdr.ScSpecTypeDef.scSpecTypeI64(),
      }),
      new xdr.ScSpecUdtStructFieldV0({
        doc: "",
        name: "u64",
        type: xdr.ScSpecTypeDef.scSpecTypeU64(),
      }),
      new xdr.ScSpecUdtStructFieldV0({
        doc: "",
        name: "symbol",
        type: xdr.ScSpecTypeDef.scSpecTypeSymbol(),
      }),
      new xdr.ScSpecUdtStructFieldV0({
        doc: "",
        name: "string",
        type: xdr.ScSpecTypeDef.scSpecTypeString(),
      }),
    ],
  })
);
const GIGA_MAP_TYPE = xdr.ScSpecTypeDef.scSpecTypeUdt(
  new xdr.ScSpecTypeUdt({ name: "GigaMap" })
);

let func = xdr.ScSpecEntry.scSpecEntryFunctionV0(
  new xdr.ScSpecFunctionV0({
    doc: "Kitchen Sink",
    name: "giga_map",
    inputs: [
      new xdr.ScSpecFunctionInputV0({
        doc: "",
        name: "giga_map",
        type: GIGA_MAP_TYPE,
      }),
    ],
    outputs: [GIGA_MAP_TYPE],
  })
);
