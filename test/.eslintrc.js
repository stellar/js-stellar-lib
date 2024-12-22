module.exports = {
  env: {
    mocha: true,
  },
  parser: "@typescript-eslint/parser",
  plugins: ["@babel", "prettier", "prefer-import"],
  globals: {
    StellarSdk: true,
    axios: true,
    chai: true,
    sinon: true,
    expect: true,
  },
  rules: {
    "no-unused-vars": 0,
  },
};
