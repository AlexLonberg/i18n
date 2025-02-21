// #####################################################################################
// # Реализация пользовательского i18n.
// # Этот листинг предназначен для быстрого копирования шаблона реализации `i18n` и не имеет подробных комментариев.
// # Подробные комментарии в ./ex.ts
// #
// # Реализация предполагает:
// #
// # 1. (Необязательно) Обновление/добавление свойств к `Singleton(SharedSingleton)`.
// # 2. Обновление метода I18nImpl.set() для преобразования входного параметра `value` к типу `TValue`.
// # 3. Обновление метода I18n.t() для преобразования типа `TValue` к, предположительно, выходной строке.
// # 4. Обновление статической функции создания корневого `I18n.createInstance()` под свои требования.
// # 5. Методы не помеченные `TODO` являются шаблоном и могут менять только имена классов - !!! оставьте все как есть.
// #####################################################################################
import {
  // type TOptions,
  type TOptionsEx,
  type TConfig,
  type TErrorDetail,
  isString,
  parseOptions,
  concatNamespaceWithKey,
  SharedSingleton,
  I18nRoot,
  I18nRegistry
} from './index.js'

// TODO Обнови TValue до своих типов или явно установи в параметры дженериков и удали это определение.
/**
 * Основной тип значения: Хранится в списках пространств имен.
 */
type TValue = string

/**
 * Разделяемый Singleton: Регистрирует пространства имен, логирует ошибки и кеширует запросы в плоскую структуру.
 */
class Singleton<TLocale extends string, TKey extends string> extends SharedSingleton<TLocale, TValue> {
  protected readonly _onError: ((error: TErrorDetail) => void)
  protected readonly _defaultValue: unknown

  // TODO Обнови параметры onError/defaultValue под свои требования
  //      и не забудь обновить свойства класса и методы errorHandle()/getDefaultValue()
  constructor(config: TConfig<TLocale>, onError: ((error: TErrorDetail) => void), defaultValue: unknown) {
    super(config)
    this._onError = onError
    this._defaultValue = defaultValue
  }

  // TODO Обнови этот метод для своего регистратора ошибок.
  override errorHandle (error: TErrorDetail): void {
    this._onError(error)
  }

  // TODO Обнови этот метод для возврата значения из метода I18nRoot._getValue() или оставь как есть.
  override getDefaultValue (): unknown {
    return this._defaultValue
  }

  protected override _nsFactory (fullNamespace: null | string): I18n<TLocale, TKey> {
    return new I18n(this, fullNamespace)
  }
  protected override _rgFactory (fullNamespace: string): I18nImpl<TLocale, TKey> {
    return new I18nImpl(this, fullNamespace)
  }
}

/**
 * Класс регистрации значений.
 */
class I18nImpl<TLocale extends string, TKey extends string> extends I18nRegistry<TLocale, TKey, TValue> {
  override register<T extends string = TKey> (fullNamespace: string): I18nImpl<TLocale, T> | null {
    // @ts-expect-error
    return this._shared.register(fullNamespace)
  }
  override getRoot<T extends string = TKey> (): I18n<TLocale, T> {
    // @ts-expect-error
    return this._shared.root
  }
  override getNamespace<T extends string = TKey> (namespace: string): I18n<TLocale, T> {
    // @ts-expect-error
    return this._shared.getNamespace(concatNamespaceWithKey(this.namespace, namespace))
  }

  // TODO Обнови и/или добавь методы регистрации значений I18nRegistry.set().
  //      Функция должна преобразовать входное `value` в тип `TValue` и вызвать this._setValue(key, TValue, locale).
  //      Имя метода или их комбинация зависят от предпочтений и не на что не влияют.
  // set (key: string, value: YourType, locale: TLocale): boolean {
  //   const v: TValue = tansformToTValue(value)
  //   return this._setValue(key, v, locale)
  // }
  /**
   * Добавляет или заменяет пару `key -> value` для выбранной локали.
   *
   * @param key    Ключ.
   * @param value  Значение.
   * @param locale Допустимое зарегистрированное имя.
   *
   * Пример:
   * ```ts
   * set('locale.description', 'Select your preferred application language.', 'en_us')
   * ```
   */
  set (key: string, value: string, locale: TLocale): boolean {
    return this._setValue(key, value, locale)
  }
}

/**
 * Основной класс `i18n`.
 */
class I18n<TLocale extends string, TKey extends string> extends I18nRoot<TLocale, TKey, TValue> {
  override register<T extends string = TKey> (fullNamespace: string): I18nImpl<TLocale, T> | null {
    // @ts-expect-error
    return this._shared.register(fullNamespace)
  }
  override getRoot<T extends string = TKey> (): I18n<TLocale, T> {
    // @ts-expect-error
    return this._shared.root
  }
  override getNamespace<T extends string = TKey> (namespace: string): I18n<TLocale, T> {
    // @ts-expect-error
    return this._shared.getNamespace(concatNamespaceWithKey(this.namespace, namespace))
  }

  // TODO Обнови и/или добавь методы получения значений I18n.t().
  //      Функция должна преобразовать `TValue` к ожидаемой строке.
  //      Имя метода или их комбинация зависят от предпочтений и не на что не влияют.
  /**
   * Возвращает значение для ключа на всю глубину разделов относительно текущего namespace.
   *
   * @param key Ключ, например `'control.ok' => 'Ok'`
   */
  t (key: TKey): string {
    return this._getValue(key) // TValue or defaultValue
  }

  // TODO Обнови объект опций под свои требования конструктора Singleton
  //      и не забудь установи правильное значение по умолчанию.
  /**
   * Создает корневой экземпляр `i18n`.
   *
   * @param options Обязательными являются только два параметра {@link TOptions.locale} и {@link TOptions.onError()}.
   */
  static createInstance<TLocale extends string, TKey extends string> (options: TOptionsEx<TLocale, string>): I18n<TLocale, TKey> {
    const config = parseOptions(options)
    const onError = options.onError
    const defaultValue = isString(options.defaultValue) ? options.defaultValue : ''
    return new Singleton(config, onError, defaultValue).root as I18n<TLocale, TKey>
  }
}

export {
  Singleton,
  I18nImpl,
  I18n
}
