module.exports = {
  env: {
    mocha: true,
  },
  globals: {
    StellarSdk: true,
    axios: true,
    chai: true,
    sinon: true,
    expect: true,
    Horizon.AxiosClient: true,
  },
  rules: {
    "no-unused-vars": 0,
  },
};
