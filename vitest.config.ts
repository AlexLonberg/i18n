/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

// Конфигурация для тестирования в Chromium
export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts'
    ],
    browser: {
      enabled: true,
      provider: 'playwright',
      // viewport: { height: 100, width: 100 },
      // headless: true
      instances: [{ browser: 'chromium' }]
    },
    coverage: {
      enabled: true,
      include: ['src/**/*.ts'],
      provider: 'istanbul',
      reportsDirectory: '.temp/coverage'
    }
  }
})

// // Конфигурация для тестирования в NodeJS
// // Пример комментария для игнорирования @vitest/coverage-v8 https://vitest.dev/guide/coverage.html#ignoring-code
// //   /* v8 ignore next 3 */
// // правда в редакторе я не вижу эффекта.
// export default defineConfig({
//   test: {
//     // https://vitest.dev/config/#setupfiles
//     include: [
//       'src/**/*.test.ts'
//     ],
//     // globals: true
//     // https://vitest.dev/guide/coverage.html
//     coverage: {
//       enabled: true,
//       // Без этой опции использует корень проекта.
//       include: ['src/**/*.ts'],
//       provider: 'v8',
//       // По какой-то причине включение этого параметра 'lcov' | 'lcov.info' вызывает такую ошибку
//       //   Failed to enable coverage. this._config.reporter.find is not a function. Check the output for more details.
//       // ... но можно вообще не использовать этот параметр и пользоваться встроенным в расширение vitest.explorer
//       // для одноразовых тестов с живым просмотром покрытия.
//       // По умолчанию будет создан файл "clover.xml", но только при полном покрытии и запуске через
//       //   `vitest run --coverage --config vitest.config.ts`
//       // ... с этим файлом может работать ryanluker.vscode-coverage-gutters
//       // Вообще встроенный эксплорер покрытия очень даже не плох.
//       // reporter: 'lcov',
//       reportsDirectory: '.temp/coverage'
//     }
//   }
// })
