import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Las reglas de Next, las de React Hooks —un aviso suyo significa que el React Compiler se salta el
// componente— y las de TypeScript. `lib/api-types.ts` se genera del OpenAPI y no se edita a mano.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // `{ id: _id, ...resto }` descarta un campo a propósito.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true, argsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "lib/api-types.ts"]),
]);

export default eslintConfig;
