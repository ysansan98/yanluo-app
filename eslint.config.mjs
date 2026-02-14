import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['services/**', '.agents/**'],
  vue: true,
})
