"use strict";

// WO-364 W1 — a real (locally-`file:`-installed) ESLint plugin, not a `--rulesdir` flag.
// `next lint`'s CLI supports `--rulesdir`, but `next build`'s own bundled lint pass does
// not — a CI `build` gate that runs `next build` would silently never see a rule wired
// only via `--rulesdir`. A proper plugin, resolved through node_modules like any other
// (see package.json's `file:./eslint-plugin-local-rules` devDependency), works the same
// way for `next lint`, `next build`, and any editor's ESLint integration.
module.exports = {
  rules: {
    "no-bare-admin-from": require("./no-bare-admin-from"),
  },
};
