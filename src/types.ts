import type { TErrorDetail } from './errors.js'

/**
 * Тип токена:
 * + `str` - Часть текста.
 * + `ph`  - Имя переменной заполнителя в некоторой части строки.
 */
type TStrTokenKind = 'str' | 'ph'

/**
 * Токен
 */
type TStrToken = { kind: TStrTokenKind, value: string }

/**
 * Контейнер шаблонной строки для унификации с {@link TStrToken},
 * где `value` строка с фигурными парами скобок вида `'Hello, {name}!'`.
 */
type TStrTemplate = { kind: 'tpl', value: string }

/**
 * Опции.
 */
type TOptions<TLocale extends string> = {
  /**
   * Обязательное поле locale.
   */
  locale: TLocale
  /**
   * Необязательное поле locale, которое будет найдено в случае отсутствия установленной locale.
   * По умолчанию `TOptions.locale`.
   */
  defaultLocale?: undefined | null | TLocale
  /**
   * Необязательный список допустимых locale.
   * Значения этого списка проверяются только в функциях смены языка `I18nRoot.change()`, но не используются
   * регистраторами. По умолчанию разрешены любые идентификаторы.
   */
  locales?: TLocale[]
}

/**
 * Параметры.
 */
type TConfig<TLocale extends string> = {
  locale: TLocale
  defaultLocale: TLocale
  isSupportedLocale (locale: string): boolean
}

type TOptionsEx<TLocale extends string, TNullValue> = TOptions<TLocale> & {
  /**
   * Обязательная функция логирования ошибок.
   * I18n не поднимает ошибок и это единственный способ их получить.
   */
  onError: ((error: TErrorDetail) => void)
  /**
   * Необязательное поле значения по умолчанию для отсутствующего ключа.
   * Это поле не используется потребителем и предназначено для проверки в методах подобных `I18n.t()`.
   *
   * Расширяемые классы могут по своему интерпретировать это значение, но пользователю предпочтительно возвращать
   * строку, даже если она пуста.
   *
   * ```ts
   * // Пример реализации
   * class MyI18n extends I18nRoot {
   *   t(key: TKey): string {
   *     const value = this._getValue(key)
   *     if(value === this._shared.getDefaultValue()) {
   *        // ... что то делаем
   *     }
   *   }
   *
   *   static createInstance({..., defaultValue: Symbol()})
   * }
   * ```
   */
  defaultValue?: undefined | null | TNullValue
}

export {
  type TStrTokenKind,
  type TStrToken,
  type TStrTemplate,
  type TOptions,
  type TOptionsEx,
  type TConfig
}
