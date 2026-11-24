import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'api/index.js', 'node_modules/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
