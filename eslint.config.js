import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";

export default [
    js.configs.recommended,
    {
        files: ["src/**/*.ts"],
        ignores: ["main.js", "*.js", "dist/**", "build/**"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: "./tsconfig.json",
            },
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2022
            },
            ecmaVersion: 2022,
            sourceType: "module"
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            "no-console": ["warn", { allow: ["warn", "error"] }],
        }
    }
];