import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['app.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
];
