// @ts-check
import {defineConfig} from 'eslint/config';
import tseslint from 'typescript-eslint';

// House rules for src/ and test/. The
// typescript-eslint no-unused-vars variant is used because the base rule
// does not understand TS syntax (interface method params etc.).
const houseRules = {
  "array-callback-return": [
    "error",
    {
      "checkForEach": false
    }
  ],
  "eqeqeq": ["error", "always"],
  "max-depth": ["warn", 4],
  "max-lines": ["warn", 500],
  "max-lines-per-function": ["warn", {"max": 100}],
  "no-console": "warn",
  "no-const-assign": "error",
  "no-else-return": ["error", {allowElseIf: false}],
  "no-plusplus": [
    "error",
    {
      "allowForLoopAfterthoughts": true
    }
  ],
  "no-unused-vars": "off",
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      "argsIgnorePattern": "next"
    }
  ],
  "no-var": "error",
  "no-warning-comments": "off"
};

export default defineConfig(
  [
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
    {
      files: [
        "src/**/*.ts",
        "test/**/*.ts"
      ],
      ignores: ['node_modules/**', "**/.*", "**/dist/"],
      linterOptions: {
        reportUnusedInlineConfigs: "error",
        reportUnusedDisableDirectives: true
      },
      rules: houseRules
    },
  ]
);
