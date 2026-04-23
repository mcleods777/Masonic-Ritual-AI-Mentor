import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ---------------------------------------------------------------------------
// Audit-record PII guard (SAFETY-01 / D-10)
//
// The audit log is PII-free by construction: `emit(record: AuditRecord)` in
// src/lib/audit-log.ts accepts a TypeScript discriminated union whose member
// types exclude the keys below. That catches every variable-form bypass
// (e.g. `const r = {...}; emit(r);`).
//
// This ESLint rule catches the OTHER bypass form: a literal object expression
// passed directly to emit() with `as never` or `as AuditRecord`. AST
// selector grammar is local and doesn't do data-flow analysis, so it only
// matches the literal-argument shape — but combined with the TS union,
// the two together block both forms.
//
// Selector note: the argument to emit() may be either a bare ObjectExpression
// or an ObjectExpression wrapped in a TSAsExpression (e.g.
// `emit({...} as never)`, as used by the fixture). The descendant combinator
// (space, not `>`) between CallExpression and ObjectExpression catches both
// forms. Because we anchor on `callee.name='emit'` and require an
// ObjectExpression directly inside the call's argument subtree, the rule
// does not false-positive on unrelated nested object literals.
//
// Fixture: src/lib/__tests__/fixtures/banned-emit.ts deliberately violates
// the rule; it's the regression guard for this config block.
//
// Scope: src/** only. scripts/*.ts never call emit() (documented in
// audit-log.ts header); leaving scripts/ unlinted here keeps dev ergonomics
// flexible without weakening the production PII surface.
// ---------------------------------------------------------------------------
const AUDIT_BANNED_KEYS = "prompt|completion|email|text|body";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            `CallExpression[callee.name='emit'] ObjectExpression > ` +
            `Property[key.name=/^(${AUDIT_BANNED_KEYS})$/]`,
          message:
            "Audit records must not carry request/response bodies. " +
            "Hash the value with sha256 and pass promptHash/completionHash instead.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
