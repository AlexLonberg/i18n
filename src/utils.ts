import type { TStrToken, TOptions, TConfig } from './types.js'

const _reTestNamespacePathError = /(\.\.)|^\.|\.$/
const _reCurlyBracesPair = /\{([^{}]+)\}/g
const re = Object.freeze({
  get testNamespacePathError () {
    _reTestNamespacePathError.lastIndex = 0
    return _reTestNamespacePathError
  },
  get curlyBracesPair () {
    _reCurlyBracesPair.lastIndex = 0
    return _reCurlyBracesPair
  }
} as const)

/**
 * Проверяет, является ли `value` undefined.
 */
function isUndefined (value: any): value is undefined {
  return typeof value === 'undefined'
}

/**
 * Проверяет, является ли `value` строкой.
 */
function isString (value: any): value is string {
  return typeof value === 'string'
}

/**
 * Проверяет, является ли `value` непустой строкой.
 */
function isNonemptyString (value: any): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Проверяет, является ли `value` простым объектом. Это так же может быть массивом.
 */
function isObject (value: any): value is object {
  return typeof value === 'object' && value !== null
}

/**
 * Присоединяет ненулевое `namespace` к ключу `key` через точку `'.'`.
 */
function concatNamespaceWithKey (namespace: null | string, key: string): string {
  return namespace ? `${namespace}.${key}` : key
}

/**
 * Формирует список пар `[namespace, ключ]`, где `namespace` — это часть пути до `key`.
 *
 * Используется в {@link splitKeyByNamespace} и {@link splitKeyWithNamespace}.
 *
 * Например, для `a.b.c` создаются пары:
 * + `'a'   -> 'b.c'`
 * + `'a.b' -> 'c'`
 */
function collectNamespaceKeyPairs (path: string[], index: number): [string, string][] {
  const name2Key: [string, string][] = []
  for (let i = index + 1; i < path.length; ++i) {
    name2Key.push([path.slice(0, i).join('.'), path.slice(i).join('.')])
  }
  return name2Key
}

/**
 * Разбивает составной ключ на пары `[namespace, key]`.
 *
 * @param fullKey Составной ключ вида `foo.bar`.
 *
 * ```ts
 * const name2key = splitKeyByNamespace('a.b.c')
 * // 'a'   -> 'b.c'
 * // 'a.b' -> 'c'
 * ```
 */
function splitKeyByNamespace (fullKey: string): [string, string][] {
  const path = fullKey.split('.')
  return collectNamespaceKeyPairs(path, 0)
}

/**
 * Такое же поведение как у {@link splitKeyByNamespace}, но первое пространство имен начинается с `namespace`.
 */
function splitKeyWithNamespace (namespace: null | string, key: string): [string, string][] {
  const path = key.split('.')
  if (namespace) {
    const nsPath = namespace.split('.')
    return collectNamespaceKeyPairs([...nsPath, ...path], nsPath.length - 1)
  }
  return collectNamespaceKeyPairs(path, 0)
}

/**
 * Разбивает составной ключ на все возможные сегменты.
 *
 * ```ts
 * const keys = splitKeyIntoParts('a.b.c')
 * // ['a', 'a.b', 'a.b.c']
 * ```
 */
function splitKeyIntoParts (fullKey: string): string[] {
  const path = fullKey.split('.')
  const keys: string[] = []
  for (let i = 0; i < path.length; ++i) {
    keys.push(path.slice(0, i + 1).join('.'))
  }
  return keys
}

/**
 * Проверяет имя пространства имен или ключа по:
 *
 * + Строка не должна быть пустой.
 * + В начале и конце строки не должно быть точек.
 * + В середине строки не должно быть идущих подряд две и более точек.
 */
function testNamespacePath (name: string): boolean {
  return isNonemptyString(name) ? !re.testNamespacePathError.test(name) : false
}

/**
 * Разбирает шаблонную строку вида `'Hello, {name}!'` на массив токенов.
 */
function templateToTokens (template: string): TStrToken[] {
  if (!isString(template)) {
    return []
  }
  const tokens: TStrToken[] = []
  let lastIndex = 0
  for (const match of template.matchAll(re.curlyBracesPair)) {
    const value = match[1]?.trim()
    if (!value) {
      continue
    }
    tokens.push({ kind: 'str', value: template.slice(lastIndex, match.index) })
    tokens.push({ kind: 'ph', value })
    lastIndex = match.index + match[0].length
  }
  tokens.push({ kind: 'str', value: template.slice(lastIndex) })
  return tokens
}

/**
 * Разбирает пользовательские опции в параметры конфигурации.
 *
 * @param options Пользовательские опции с обязательным параметром `locale`.
 */
function parseOptions<TLocale extends string> (options: TOptions<TLocale>): TConfig<TLocale> {
  const locale = options.locale
  const defaultLocale = isNonemptyString(options.defaultLocale) ? options.defaultLocale : locale
  let isSupportedLocale = ((_: any) => true)
  if (options.locales) {
    const locales = new Set(options.locales)
    if (locales.size > 0) {
      locales.add(locale)
      locales.add(defaultLocale)
      isSupportedLocale = (value: any) => locales.has(value)
    }
  }
  return { locale, defaultLocale, isSupportedLocale }
}

export {
  isUndefined,
  isString,
  isNonemptyString,
  isObject,
  concatNamespaceWithKey,
  collectNamespaceKeyPairs,
  splitKeyByNamespace,
  splitKeyWithNamespace,
  splitKeyIntoParts,
  testNamespacePath,
  templateToTokens,
  parseOptions
}
