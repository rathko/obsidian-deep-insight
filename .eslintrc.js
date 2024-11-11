module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: [
        '@typescript-eslint'
    ],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2020,
    },
    rules: {
        '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
        '@typescript-eslint/ban-ts-comment': 'off',
        'no-prototype-builtins': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-module-boundary-types': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', { 
            'varsIgnorePattern': 'DeepInsightAISettingTab'
        }],
        'prefer-const': 'warn',
        'no-var': 'error',
        'eqeqeq': ['error', 'always'],
        'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
        'curly': ['error', 'all'],
        'no-unused-expressions': 'error',
        'no-duplicate-imports': 'error'
    },
    env: {
        'node': true,
        'browser': true
    }
};