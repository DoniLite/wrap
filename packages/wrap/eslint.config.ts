import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        // Pins the tsconfig root for this package explicitly. Without it,
        // typescript-eslint infers the root from every eslint.config.ts
        // loaded in the process; in this monorepo that's both this file
        // and packages/create-wrap/template's, which throws
        // "multiple candidate TSConfigRootDirs" once an editor/IDE loads
        // both configs in the same session.
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
