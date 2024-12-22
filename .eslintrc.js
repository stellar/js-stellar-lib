module.exports = {
  env: {
    es6: true,
    es2020: true
  },
  extends: ['airbnb-base', 'prettier'],
  plugins: ['@babel', 'prettier', 'prefer-import'],
  parser: '@typescript-eslint/parser',
  rules: {
    // OFF
    'import/prefer-default-export': 0,
    'node/no-unsupported-features/es-syntax': 0,
    'node/no-unsupported-features/es-builtins': 0,
    camelcase: 0,
    'class-methods-use-this': 0,
    'linebreak-style': 0,
    'new-cap': 0,
    'no-param-reassign': 0,
    'no-underscore-dangle': 0,
    'no-use-before-define': 0,
    'prefer-destructuring': 0,
    'lines-between-class-members': 0,

    // WARN
    'prefer-import/prefer-import-over-require': [1],
    'no-console': ['warn', { allow: ['assert'] }],
    'no-debugger': 1,
    'no-unused-vars': 1,
    'arrow-body-style': 1,
    'valid-jsdoc': [
      1,
      {
        requireReturnDescription: false
      }
    ],
    'prefer-const': 1,
    'object-shorthand': 1,
    'require-await': 1,

    // ERROR
    'no-unused-expressions': [2, { allowTaggedTemplates: true }]
  }
};
