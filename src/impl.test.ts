import { test, expect, vi } from 'vitest'
import { type TErrorDetail, errorCodes } from './errors.js'
import { I18nImpl, I18n } from './impl.js'

function Logger () {
  const errors = [] as TErrorDetail[]
  return {
    log: (error: TErrorDetail) => errors.push(error),
    getLastError: () => errors.length > 0 ? errors[errors.length - 1]! : null,
    clear: () => errors.splice(0)
  }
}

test('I18n more examples', () => {
  const logger = Logger()
  // Необязательно, но мы можем типизировать параметры локали и ключей к доступам значений.
  type TLocale = 'ru_ru' | 'en_us'

  const rootI18n = I18n.createInstance<TLocale, string>({
    // Обязательный параметр
    locale: 'ru_ru',
    // Резервная локаль когда нет перевода в locale. Если не задано, используется locale
    // defaultLocale: 'en_us',
    // Если массив не пуст, locale добавиться автоматически, иначе применяется любая I18n.change(locale)
    locales: ['en_us'],
    // Эта опция зависит от реализации и в нашем случае обязательна и принимает регистратор ошибки
    onError: logger.log,
    // Это значение зависит от реализации и в нашем случае принимает строку и будет маркером ошибки
    defaultValue: '__DEV_ERROR__'
  })

  // Корневой I18nRoot не имеет пространста имен
  expect(rootI18n.namespace).toBe(null)

  expect(rootI18n.locale).toBe('ru_ru')
  expect(rootI18n.isSupportedLocale('ru_ru')).toBe(true)
  expect(rootI18n.isSupportedLocale('en_us')).toBe(true)
  expect(rootI18n.isSupportedLocale('xx_xx')).toBe(false)
  // Попытка переустановить недопустимый locale ни к чему не приведет
  expect(rootI18n.change('oh_no' as 'en_us')).toBe('ru_ru')
  expect(logger.getLastError()?.code).toBe(errorCodes.UnregisteredLocaleError)

  // Пространство имен I18n не зависит от пространств имен I18nRegistry.
  // Ключи в Namespase можно типизировать и сузить до ожидаемых значений
  const i18n = rootI18n.getNamespace<'en' | 'ru'>('settings.locale')
  expect(i18n.namespace).toBe('settings.locale')
  // Независимо от уровня, getNamespace() и register() возвращают пространство имен от корня.
  expect(i18n.getNamespace('xyz').namespace).toBe('xyz')

  // Регистрируем I18nRegistry, позволяющий устанавливать/менять переводы
  const registry = rootI18n.register('settings')! // может возвратить null, если есть о

  // Пустое или недопустимое имя приведет к ошибке. Для регистрации можно использовать любой инстанс
  expect(i18n.register('')).toBe(null)
  expect(logger.getLastError()?.code).toBe(errorCodes.NamespaceError)
  logger.clear()
  expect(rootI18n.register('.foo')).toBe(null)
  expect(logger.getLastError()?.code).toBe(errorCodes.NamespaceError)
  logger.clear()
  expect(registry.register('foo..bar')).toBe(null)
  expect(logger.getLastError()?.code).toBe(errorCodes.NamespaceError)

  // getRoot() возвращает один и тот же корень из любого пространства имен.
  expect(i18n.getRoot()).toBe(rootI18n)
  expect(registry.getRoot()).toBe(rootI18n)
  expect(rootI18n.getRoot()).toBe(rootI18n)

  // До установки перевода значения не доступны.
  // Недоступные ключи кешируются в список ошибок и удаляются после установки ключа.
  expect(i18n.t('ru')).toBe('__DEV_ERROR__')
  expect(logger.getLastError()?.code).toBe(errorCodes.UnregisteredKeyError)
  logger.clear()
  expect(i18n.t('ru')).toBe('__DEV_ERROR__')
  expect(logger.getLastError()).toBe(null) // второй раз ошибка не повторяется

  // @ts-expect-error Методов set() и use() нет в I18n
  expect(() => i18n.set('key', 'value', 'ru_ru')).toThrow()
  registry.set('locale.ru', 'Русский язык', 'ru_ru')
  registry.set('locale.en', 'Английский язык', 'ru_ru')

  expect(i18n.t('ru')).toBe('Русский язык') // ... теперь доступно
  expect(i18n.t('en')).toBe('Английский язык')

  // Пространства имен I18nRegistry не должны конфликтовать с полным или частичным путем к переменной.
  expect(rootI18n.register('settings.locale')).toBe(null)
  expect(rootI18n.register('settings.locale.en')).toBe(null)
  expect(logger.getLastError()?.code).toBe(errorCodes.IntersectionNsError)

  // ... точно так же: имена переменных не могут конфликтовать с полным именем пространства имен
  const foo = rootI18n.register('settings.foo')!
  expect(foo.register('settings.foo.bar')).toBeInstanceOf(I18nImpl)
  // Здесь полный клюя 'settings.foo' + 'bar' пересекается с register('settings.foo.bar')
  foo.set('bar', 'Some Text', 'ru_ru')
  expect(logger.getLastError()?.code).toBe(errorCodes.IntersectionError)

  // Ранее установленные ключи можно менять в любое время
  rootI18n.change('en_us')
  registry.set('locale.en', 'Английский язык', 'en_us')
  expect(i18n.t('en')).toBe('Английский язык')
  registry.set('locale.en', 'English language', 'en_us')
  expect(i18n.t('en')).toBe('English language')
  // ... но перевод останется тем же для ru_ru
  rootI18n.change('ru_ru')
  expect(i18n.t('en')).toBe('Английский язык')

  // Ключи как и namespace не могут иметь недопустимых последовательностей символов или быть пустыми
  logger.clear()
  registry.set('', 'Some Text', 'en_us')
  expect(logger.getLastError()?.code).toBe(errorCodes.KeyError)
  logger.clear()
  registry.set('.', 'Some Text', 'en_us')
  expect(logger.getLastError()?.code).toBe(errorCodes.KeyError)
  logger.clear()
  registry.set('.button', 'Some Text', 'en_us')
  expect(logger.getLastError()?.code).toBe(errorCodes.KeyError)
  logger.clear()
  registry.set('button..ok', 'Some Text', 'en_us')
  expect(logger.getLastError()?.code).toBe(errorCodes.KeyError)
  logger.clear()
  registry.set('button.ok', 'Some Text', 'en_us')
  expect(logger.getLastError()).toBe(null)
})

test('I18n use()', () => {
  const logger = Logger()
  const rootI18n = I18n.createInstance({
    locale: 'ru_ru',
    onError: logger.log,
    defaultValue: '__DEV_ERROR__'
  })

  // Заимствование значений позволяет использовать ключи других реестров.

  const control = rootI18n.register('control')!
  const settings = rootI18n.register('settings')!

  // Заимствуем ключи из другого реестра. Второй параметр может быть только полным путем.
  // При установке ключи могут не существовать и круговая зависимость не проверяется.
  // При заимствовании не используется третий параметр языка и полностью стираются значения set()
  settings.use('autoSave.enabled', 'control.button.on')
  settings.use('autoSave.disabled', 'control.button.off')

  expect(rootI18n.t('settings.autoSave.enabled')).toBe('__DEV_ERROR__')

  // Добавим значения
  control.set('button.on', 'Включить', 'ru_ru')
  control.set('button.off', 'Выключить', 'ru_ru')
  // ... которые теперь станут доступны
  expect(rootI18n.t('settings.autoSave.enabled')).toBe('Включить')
  expect(rootI18n.t('settings.autoSave.disabled')).toBe('Выключить')

  // Проверка круговой зависимости
  logger.clear()
  control.use('button.back_off', 'settings.autoSave.back_disabled')
  settings.use('autoSave.back_disabled', 'control.button.back_off')
  expect(logger.getLastError()?.code).toBe(errorCodes.CircularDependencyError)

  expect(rootI18n.t('settings.autoSave.back_disabled')).toBe('__DEV_ERROR__')
  expect(logger.getLastError()?.code).toBe(errorCodes.UnregisteredKeyError)
})

test('I18n multi use() + locale', () => {
  const logger = Logger()
  const rootI18n = I18n.createInstance({
    locale: 'ru_ru',
    locales: ['en_us'],
    onError: logger.log,
    defaultValue: '__DEV_ERROR__'
  })

  // Заимствование не зависит от конечного I18nRegistry, который так же мог заимствовать ключ

  const ns1 = rootI18n.register('ns1')!
  const ns2 = rootI18n.register('ns2')!
  const ns3 = rootI18n.register('ns3')!
  ns1.set('value', 'ru to en', 'en_us')

  ns1.use('var', 'ns2.var')
  ns2.use('var', 'ns3.var')
  ns3.use('var', 'ns1.value')

  expect(rootI18n.t('ns1.var')).toBe('ru to en')

  logger.clear()
  // Важно - этот ключ не будет установлен - останется прошлый ключ
  ns1.use('value', 'ns1.var')
  expect(logger.getLastError()?.code).toBe(errorCodes.CircularDependencyError)
  expect(rootI18n.t('ns1.var')).toBe('ru to en')
})

test('I18n events', () => {
  const logger = Logger()
  const rootI18n = I18n.createInstance({
    locale: 'ru_ru',
    locales: ['en_us'],
    onError: logger.log,
    defaultValue: '__DEV_ERROR__'
  })

  // События изменения ключа и локали.
  // Важно: Невозможно установить для каждого отдельного ключа собственного слушателя.
  //        Отслеживание возможно на уровне namespace, а слушатель получает имя измененного ключа.

  const ns1 = rootI18n.register('ns1')!
  const ns2 = rootI18n.register('ns2')!
  const i18n1 = rootI18n.getNamespace('ns1')
  const i18n2 = rootI18n.getNamespace('ns2')

  const spy1 = vi.fn()
  const spy2 = vi.fn()
  i18n1.on('locale', spy1)
  i18n1.on('key', spy2)

  expect(i18n1.t('var')).toBe('__DEV_ERROR__')

  ns1.set('var', 'Some Text', 'ru_ru')
  ns1.set('var', 'Some Text', 'en_us')
  expect(spy2).toHaveBeenCalledTimes(2) // локаль не имеет значения, событие происходит при любой записи ключа

  expect(rootI18n.change('ru_ru')).toBe('ru_ru')
  expect(spy1).toHaveBeenCalledTimes(0) // локаль не измененена
  expect(spy2).toHaveBeenCalledTimes(2)
  rootI18n.change('en_us')
  expect(spy1).toHaveBeenCalledTimes(1)
  expect(spy2).toHaveBeenCalledTimes(2) // событие 'locale' не влияет на изменение ключа, но фактически пользователь должен обновить данные

  expect(i18n1.t('var')).toBe('Some Text')

  // События так же работают для заимствованных ключей
  ns2.use('very.long.variable', 'ns1.var')
  expect(i18n2.t('very.long.variable')).toBe('Some Text')
  const i18n3 = rootI18n.getNamespace('ns2.very.long')
  expect(i18n3.t('variable')).toBe('Some Text')

  let keyI18n2 = ''
  let keyI18n3 = ''
  i18n2.on('key', (_, key) => keyI18n2 = key)
  i18n3.on('key', (_, key) => keyI18n3 = key)
  // Меняем значение на заимствованном ключе
  ns1.set('var', 'Update', 'en_us')
  // Каждый Listener получит имя относительно своего namespace
  expect(keyI18n2).toStrictEqual('very.long.variable')
  expect(keyI18n3).toStrictEqual('variable')
})
