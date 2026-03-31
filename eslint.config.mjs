import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const next = require("eslint-config-next/core-web-vitals");

/** Flat config from Next — avoid FlatCompat (circular JSON bug with ESLint 9). */
export default [
  { ignores: [".open-next/**"] },
  ...next,
];
