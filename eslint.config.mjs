import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: ['services/**', '.agents/**'],
    vue: true,
  },
  {
    files: ['src/**/*.ts', 'src/**/*.vue', '**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
)
