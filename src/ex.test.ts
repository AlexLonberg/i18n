import { test, expect } from 'vitest'
import type { TErrorDetail } from './errors.js'
import { ExI18n } from './ex.js'

function Logger () {
  const errors = [] as TErrorDetail[]
  return {
    log: (error: TErrorDetail) => errors.push(error),
    getLastError: () => errors.length > 0 ? errors[errors.length - 1] : null,
    clear: () => errors.splice(0)
  }
}

test('ExI18n quick start', () => {
  const logger = Logger()

  // Необязательно, но можно типизировать локали и ключи
  const i18n = ExI18n.createInstance<'en-US' | 'ru-RU', string>({
    locale: 'en-US',
    onError: logger.log
  })

  // По желанию типизируем ключи из namespace he.says
  const nsSay = i18n.getNamespace<'hi' | 'bye'>('he.says')

  // TypeScript подскажет имена ключей hi/bye
  let hi = nsSay.t('hi', { name: 'John' })
  expect(hi).toBe('') // 🤔

  nsSay.on('key', (_name: 'key', key: any) => {
    if (key === 'hi')
      hi = nsSay.t('hi', { name: 'John' })
  })
  nsSay.on('locale', (_name: 'locale', _locale: 'en-US' | 'ru-RU') => {
    hi = nsSay.t('hi', { name: 'John' })
  })

  // Зарегистрируем поставщика переводов в любом namespace
  const nsHe = i18n.register('he')!

  nsHe.set('says.hi', { kind: 'tpl', value: 'Hi, {name}!' }, 'en-US')

  expect(hi).toBe('Hi, John!') // 😀

  nsHe.setTemplate('says.hi', 'Привет, {name}!', 'ru-RU')
  i18n.change('ru-RU')
  expect(hi).toBe('Привет, John!') // 🤨

  // Не хотите прощаться, прокинте ключ к желаемому
  nsHe.use('says.bye', 'he.says.hi')
  expect(nsSay.t('bye', { name: 'John' })).toBe('Привет, John!') // 😂
})
