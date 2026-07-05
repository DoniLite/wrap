import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        // Pins the tsconfig root for this package explicitly — see the
        // comment in packages/wrap/eslint.config.ts for why this is
        // required in this monorepo.
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
