import type { TConfig } from './types.js'
import { concatNamespaceWithKey, splitKeyByNamespace, splitKeyIntoParts, testNamespacePath } from './utils.js'
import { type TErrorDetail, errorMessages } from './errors.js'
import { type TListenerLocale, type TListenerKey, EventEmitter } from './events.js'

// Вспомогательная структура определения круговой зависимости
type TVisitedI18n<TLocale extends string, TValue> = {
  namespace: null | string,
  key: string,
  // Ключ: посещенный I18nRegistry
  // Значение: массив посещенных ключей
  visited: Map<I18nRegistry<TLocale, string, TValue>, string[]>,
  error: boolean
}

const privateI18nRegistryGetKeyIfIntersection = Symbol('I18nRegistry.getKeyIfIntersection')
const privateI18nRegistryGetValue = Symbol('I18nRegistry.getValue')

/**
 * Разделяемый Singleton: Регистрирует пространства имен, логирует ошибки и кеширует запросы в плоскую структуру.
 */
abstract class SharedSingleton<TLocale extends string, TValue> {
  protected readonly _events = new EventEmitter()
  protected readonly _namespaces = new Map<string, { registry: null | I18nRegistry<TLocale, string, TValue>, i18n: null | object }>()
  protected readonly _cache = new Map<string, TValue>()
  protected readonly _errorKeys = new Set<string>()
  protected readonly _defaultLocale: TLocale
  protected readonly _isSupportedLocale: ((locale: string) => boolean)
  protected readonly _root: I18nRoot<TLocale, any, TValue>
  protected _locale: TLocale

  constructor(config: TConfig<TLocale>) {
    this._locale = config.locale
    this._defaultLocale = config.defaultLocale
    this._isSupportedLocale = config.isSupportedLocale
    this._root = this._nsFactory(null)
  }

  // TODO Реализуй два метода _nsFactory()/_rgFactory()
  /**
   * Этот метод должен возвратить пользовательский класс {@link I18nRoot}
   *
   * Реализация должна иметь всего одну строку:
   * ```ts
   * _nsFactory(namespace): YourI18n {
   *   return new YourI18n(shared, namespace)
   * }
   * ```
   */
  protected abstract _nsFactory (namespace: null | string): I18nRoot<TLocale, any, TValue>
  /**
   * То же само что и {@link _nsFactory}, но для пользовательского класса {@link I18nRegistry}.
   */
  protected abstract _rgFactory (namespace: null | string): I18nRegistry<TLocale, any, TValue>

  // TODO Реализуй метод пользовательского регистратора ошибок.
  /**
   * Пользовательский регистратор ошибок.
   */
  abstract errorHandle (error: TErrorDetail): void

  // TODO Реализуй метод для возврата значения из метода I18nRoot._getValue().
  /**
   * Пользовательское значение по умолчанию. Возвращается из {@link getValue()}, если значение не найдено.
   * В качестве маркера может использоваться `Symbol()`.
   */
  abstract getDefaultValue (): unknown

  get events (): EventEmitter {
    return this._events
  }

  get root (): I18nRoot<TLocale, any, TValue> {
    return this._root
  }

  get locale (): TLocale {
    return this._locale
  }

  get defaultLocale (): TLocale {
    return this._defaultLocale
  }

  isSupportedLocale (locale: string): boolean {
    return this._isSupportedLocale(locale)
  }

  /**
   * Изменить текущую локаль:
   *
   * + Проверяет допустимость `locale` и логирует ошибку.
   * + Меняет если локаль не равная текущей и вызывает событие.
   * + Возвращает актуальную локаль.
   */
  changeLocale (locale: TLocale): TLocale {
    if (!this._isSupportedLocale(locale)) {
      this.errorHandle(errorMessages.UnregisteredLocaleError(locale))
    }
    else if (this._locale !== locale) {
      this._locale = locale
      this._cache.clear()
      this._events.emitLocale(this._locale)
    }
    return this._locale
  }

  /**
   * Вызывает событие изменения ключа и удаляет запись из `_errorKeys`.
   */
  changeKey (namespace: string, key: string): void {
    this._errorKeys.delete(concatNamespaceWithKey(namespace, key))
    this._events.emitKey(namespace, key)
  }

  protected _createI18n (fullNamespace: string): object {
    let ns = this._namespaces.get(fullNamespace)
    if (!ns) {
      ns = { registry: null, i18n: null }
    }
    if (!ns.i18n) {
      ns.i18n = this._nsFactory(fullNamespace)
    }
    return ns.i18n
  }

  /**
   * Создает или возвращает namespace {@link I18nRoot}.
   */
  getNamespace (fullNamespace: string): object {
    return this._namespaces.get(fullNamespace)?.i18n ?? this._createI18n(fullNamespace)
  }

  /**
   * Регистрация реестра переводов.
   * Реестр не будет зарегистрирован, если есть хотя бы одно пересечение с ключами.
   *
   * Метод самостоятельно регистрирует ошибку и не нуждается в дальнейшей проверке.
   *
   * @param fullNamespace Полное имя от корня.
   */
  register (fullNamespace: string): null | I18nRegistry<TLocale, string, TValue> {
    const ns = this._namespaces.get(fullNamespace)
    if (ns?.registry) {
      return ns.registry
    }
    if (!testNamespacePath(fullNamespace)) {
      this.errorHandle(errorMessages.NamespaceError(fullNamespace))
      return null
    }
    const name2Key = splitKeyByNamespace(fullNamespace)
    for (const [ns, localKey] of name2Key) {
      const registry = this._namespaces.get(ns)?.registry
      if (!registry) {
        continue
      }
      const key = registry[privateI18nRegistryGetKeyIfIntersection](localKey)
      if (key) {
        this.errorHandle(errorMessages.IntersectionNsError(fullNamespace, registry.namespace, key))
        return null
      }
    }
    this._errorKeys.delete(fullNamespace)
    const registry = this._rgFactory(fullNamespace)
    if (ns) {
      ns.registry = registry
    }
    else {
      this._namespaces.set(fullNamespace, { registry, i18n: null })
    }
    return registry
  }

  /**
   * Проверяет возможность использования ключа, логирует ошибку и, в случае успеха,
   * стирает ошибку(и устаревший кеш), которая могла произойти ранее при отсутствии ключа.
   *
   * @param namespace Пространство имен реестра.
   * @param key       Проверяемый ключ.
   * @param remove    Удалять ли записи ошибок и кеш ключа `key`.
   */
  checkFullKey (namespace: null | string, key: string, remove: boolean): boolean {
    const fullKey = concatNamespaceWithKey(namespace, key)
    const registry = this._namespaces.get(fullKey)?.registry
    if (registry) {
      this.errorHandle(errorMessages.IntersectionError(namespace, key, registry.namespace))
      return false
    }
    if (remove) {
      this._cache.delete(fullKey)
      this._errorKeys.delete(fullKey)
    }
    return true
  }

  /**
   * Проверяет только наличие ключа(от корня) не проверяя реального значения(если ключ заимствован).
   */
  hasFullKey (fullKey: string): boolean {
    const name2Key = splitKeyByNamespace(fullKey)
    for (const [ns, localKey] of name2Key) {
      const registry = this._namespaces.get(ns)?.registry
      if (registry?.hasKey(localKey)) {
        return true
      }
    }
    return false
  }

  /**
   * Поиск значения по всем совпадающим {@link I18nRegistry}. При заимствовании {@link I18nRegistry.use()},
   * выполняется рекурсивный поиск с обнаружением циклических зависимостей и регистрацией ошибок.
   */
  findValue (locale: TLocale, fullKey: string, visitedI18n: TVisitedI18n<TLocale, TValue>): null | { value: TValue, registry: I18nRegistry<TLocale, string, TValue> } {
    // Проходимся по реестрам и ищем подходящее значение.
    const name2Key = splitKeyByNamespace(fullKey)
    for (const [ns, localKey] of name2Key) {
      const registry = this._namespaces.get(ns)?.registry
      if (registry) {
        const visited = visitedI18n.visited.get(registry)
        // Имена реестров в паре со значением могут пересекаться с другими значениями
        if (!visited) {
          visitedI18n.visited.set(registry, [localKey])
        }
        else if (visited.includes(localKey)) {
          visitedI18n.error = true
          this.errorHandle(errorMessages.CircularDependencyError(visitedI18n.namespace, visitedI18n.key, registry.namespace, localKey))
          continue
        }
        else {
          visited.push(localKey)
        }
        const value = registry[privateI18nRegistryGetValue](locale, localKey, visitedI18n)
        if (value) {
          return { value: value.value, registry: value.registry }
        }
      }
    }
    return null
  }

  /**
   * Проверяет ключ и возвращает значение:
   *
   * + Если ошибка уже была, возвратит значение по умолчанию.
   * + Иначе создает контекст и делегирует рекурсивный поиск {@link findValue()}.
   * + Логирует ошибку и сохраняет ключ в списке недоступных {@link _errorKeys}.
   */
  protected _handleKey (fullKey: string, namespace: null | string, key: string): TValue {
    // Ключ был проверен ранее. При добавлении ключей errorKeys[key] удаляются.
    if (this._errorKeys.has(fullKey)) {
      // @ts-expect-error
      return this.getDefaultValue()
    }
    // Проходимся по реестрам и ищем подходящее значение.
    const ctx = { namespace, key, visited: new Map(), error: false }
    const value = this.findValue(this._locale, fullKey, ctx)
    if (value) {
      this._cache.set(fullKey, value.value)
      return value.value
    }
    // Если не найдено регистрируем ошибку.
    // Ключ может существовать, но иметь круговую зависимость. Проверкой избегаем повторную регистрацию ошибки
    //  use('foo.bar', 'bar.foo')
    //  use('bar.foo', 'foo.bar')
    if (!ctx.error) {
      this.errorHandle(errorMessages.UnregisteredKeyError(namespace, key))
    }
    this._errorKeys.add(fullKey)
    // @ts-expect-error
    return this.getDefaultValue()
  }

  /**
   * Возвращает значение из кеша или передает управление методам поиска значений.
   */
  getValue (namespace: null | string, key: string): TValue {
    const fullKey = concatNamespaceWithKey(namespace, key)
    return this._cache.get(fullKey) ?? this._handleKey(fullKey, namespace, key)
  }
}

/**
 * Базовый интерфейс публичного I18nRoot.
 *
 * Для расширяемых классов скопируй весь код в комментариях и придумай имя метода `t(key)`.
 */
abstract class I18nRoot<TLocale extends string, TKey extends string, TValue> {
  protected readonly _shared: SharedSingleton<TLocale, TValue>
  protected readonly _namespace: null | string

  constructor(shared: SharedSingleton<TLocale, TValue>, namespace: null | string) {
    this._shared = shared
    this._namespace = namespace
  }

  // TODO Реализуй этот метод скопировав код ниже - не забудь поменяй I18nRegistry на расширенный класс.
  // Функция должна возвратить пользовательский класс изменив дженерик TKey
  // protected _register<T extends string = TKey> (namespace: string): null | I18nRegistry<TLocale, T, TValue> {
  //   return this._shared.register(namespace)
  // }
  /**
   * Регистрирует или возвращает существующий реестр значений относительно корня.
   *
   * @param fullNamespace Непустая строка. Строка не должна пересекаться с именами переменных в других namespace.
   *
   * ```ts
   * const first = rootI18n.register('settings') // I18nRegistry
   * first.set('system.theme', ...)
   * const second = rootI18n.register('settings.system') // null error
   * ```
   */
  abstract register<T extends string = TKey> (fullNamespace: string): null | I18nRegistry<TLocale, T, TValue>

  // TODO Реализуй этот метод скопировав код ниже - не забудь поменяй I18nRoot на расширенный класс.
  // getRoot<T extends string = TKey> (): I18nRoot<TLocale, T, TValue> {
  //   return this._shared.root
  // }
  /**
   * Ссылка на корневой `i18n`.
   */
  abstract getRoot<T extends string = TKey> (): I18nRoot<TLocale, T, TValue>

  // TODO Реализуй этот метод скопировав код ниже - не забудь поменяй I18nRoot на расширенный класс.
  // getNamespace<T extends string = TKey> (namespace: string): I18nRoot<TLocale, T, TValue> {
  //   return this._shared.getNamespace(namespace)
  // }
  /**
   * Возвращает `namespace` относительно корня.
   *
   * Обратите внимание: Пространство имен могло быть еще не зарегистрировано и до момента внесения изменений нельзя
   * получить `I18n.t()`.
   *
   * @param namespace Имя `namespace`.
   *
   * ```ts
   * const i18n = rootI18n.getNamespace('settings')
   *
   * // Теперь можно получить значение ключа не прибегая к полному имени.
   * const value = i18n.t('lang') // эквивалентно rootI18n.t('settings.lang')
   * ```
   */
  abstract getNamespace<T extends string = TKey> (namespace: string): I18nRoot<TLocale, T, TValue>

  // TODO Скопируй этот код, придумай название метода и получи значение по ключу.
  // /**
  //  * Возвращает значение для ключа на всю глубину разделов относительно текущего namespace.
  //  *
  //  * @param key  Ключ перевода, например `'control.ok' => 'Ok'`
  //  */
  // t (key: TKey): string {
  //   const value: TValue = this._shared.getValue(this.namespace, key) // or defaultValue
  //   return transformTValueToString(value)
  // }

  /**
   * Используй этот метод в своем расширенном классе для получения значений по ключу `key`
   * или заглушки {@link SharedSingleton.getDefaultValue()}, если значение не найдено.
   */
  protected _getValue (key: TKey): TValue {
    return this._shared.getValue(this.namespace, key)
  }

  /**
   * Составное имя текущего `namespace` или `null` если это `namespace` верхнего уровня.
   */
  get namespace (): null | string {
    return this._namespace
  }

  /**
   * Текущий язык приложения.
   */
  get locale (): TLocale {
    return this._shared.locale
  }

  /**
   * Изменить язык приложения.
   *
   * При смене языка полностью очищается кеш и вызывается событие `(name: 'locale', ...)`.
   * События связанные со сменой значений ключа `(name: 'key', ...)` не вызываются.
   *
   * @param locale Допустимое зарегистрированное имя.
   */
  change (locale: TLocale): TLocale {
    return this._shared.changeLocale(locale)
  }

  /**
   * Поддерживается ли `locale`.
   */
  isSupportedLocale (locale: string): boolean {
    return this._shared.isSupportedLocale(locale)
  }

  /**
   * Зарегистрировать слушателя изменения `locale` или установки/изменения `key`.
   *
   * Для события `'key'` нет возможности наблюдения за каждым ключом и событие вызывается для всего диапазона ключей
   * текущего `namespace`. Слушатель получает имя измененного ключа относительно `namespace`.
   *
   * Для события `locale` текущий `namespace` не имеет значения. Изменение `locale`, не вызывают события изменения
   * ключей, но фактически ключ может получить другой перевод.
   *
   * @param name     Один из типов события.
   * @param listener Слушатель.
   */
  on<TName extends 'locale' | 'key'> (name: TName, listener: TName extends 'locale' ? TListenerLocale<TLocale> : TListenerKey<TKey>, once?: undefined | null | boolean): void {
    if (name === 'locale') {
      this._shared.events.onLocale(listener as TListenerLocale<string>, !!once)
    }
    else {
      this._shared.events.onKey(this.namespace, listener as TListenerKey<string>, !!once)
    }
  }

  /**
   * Смотри подробнее {@link on()}.
   */
  once<TName extends 'locale' | 'key'> (name: TName, listener: TName extends 'locale' ? TListenerLocale<TLocale> : TListenerKey<TKey>): void {
    this.on(name, listener, true)
  }

  /**
   * Смотри подробнее {@link on()}.
   */
  off<TName extends 'locale' | 'key'> (name: TName, listener: TName extends 'locale' ? TListenerLocale<TLocale> : TListenerKey<TKey>): void {
    if (name === 'locale') {
      this._shared.events.offLocale(listener as TListenerLocale<string>)
    }
    else {
      this._shared.events.offKey(this.namespace, listener as TListenerKey<string>)
    }
  }
}

/**
 * Интерфейс реестра значений.
 *
 * Пользовательские классы должны реализовать собственные методы установки значений и передать его методу {@link I18nRegistry._setValue()}.
 */
abstract class I18nRegistry<TLocale extends string, TKey extends string, TValue> extends I18nRoot<TLocale, TKey, TValue> {
  protected override readonly _namespace: string
  protected readonly _keyValue = new Map<string, { t: Map<TLocale, TValue> } | { t: null, k: string }>()
  protected readonly _externalListeners = new Map<string, { ls: TListenerKey<string>, ns: null | string }>()

  constructor(shared: SharedSingleton<TLocale, TValue>, namespace: string) {
    super(shared, namespace)
    this._namespace = namespace
  }

  // TODO Реализуй этот метод скопировав код ниже и передай ожидаемое значение в this._setValue(key, value, locale).
  //      Методов может быть несколько и их имена зависят от предпочтений.
  // /**
  //  * Добавляет или заменяет пару `key -> value` для выбранной локали.
  //  *
  //  * @param key    Ключ.
  //  * @param value  Значение.
  //  * @param locale Допустимое зарегистрированное имя.
  //  *
  //  * Пример:
  //  * ```ts
  //  * set('locale.description', 'Select your preferred application language.', 'en_us')
  //  * ```
  //  */
  // set (key: string, value: YourType, locale: TLocale): boolean {
  //   const v: TValue = tansformToTValue(value)
  //   return this._setValue(key, v, locale)
  // }

  /**
   * Составное имя текущего namespace.
   */
  override get namespace (): string {
    return this._namespace
  }

  /**
   * Наличие ключа в текущем реестре.
   *
   * @param localKey Ключ относительно текущего `namespace`.
   */
  hasKey (localKey: string): boolean {
    return this._keyValue.has(localKey)
  }

  /**
   * Возвращает ключ, если найдено пересечение.
   * Этот метод применяется перед регистрацией namespace.
   */
  [privateI18nRegistryGetKeyIfIntersection] (localKey: string): null | string {
    for (const key of this._keyValue.keys()) {
      if (splitKeyIntoParts(key).includes(localKey)) {
        return key
      }
    }
    return null
  }

  /**
   * Поиск значения в текущем реестре.
   *
   * @param locale      Предпочтительная локаль, фактически возвращается доступное значение.
   * @param localKey    Ключ относительно текущего `namespace`.
   * @param visitedI18n Этот объект должен передаваться в рекурсивные вызовы для предотвращения круговой зависимости.
   */
  [privateI18nRegistryGetValue] (locale: TLocale, localKey: string, visitedI18n: TVisitedI18n<TLocale, TValue>): null | { value: TValue, registry: I18nRegistry<TLocale, string, TValue> } {
    const found = this._keyValue.get(localKey)
    if (found) {
      if (found.t) {
        const value = (
          found.t.get(locale) ??
          (locale !== this._shared.defaultLocale ? found.t.get(this._shared.defaultLocale) : null) ??
          found.t.values().next().value
        )
        // NOTE: Значениями не могут быть типы Nullish. Это предотвращает нежелательное
        //       использование found.t.has(locale) и функций подобных isUndefined(record)
        if (value) {
          return { value, registry: this }
        }
      }
      else {
        const external = this._shared.findValue(locale, found.k, visitedI18n)
        if (external) {
          return external
        }
      }
    }
    return null
  }

  /**
   * Добавляет или заменяет пару `key -> value` для выбранного языка.
   * Этот метод должен вызываться пользовательскими расширяемыми методами подобными `set(key, value, locale)`.
   *
   * @param key    Ключ.
   * @param value  Значение.
   * @param locale Допустимое зарегистрированное имя.
   *
   * Пример (сервис `settings` устанавивает описание выбора языка):
   * ```ts
   * set('locale.description', 'Выберите предпочтительный язык приложения.', 'en_us')
   * ```
   */
  protected _setValue (key: string, value: TValue, locale: TLocale): boolean {
    if (!testNamespacePath(key)) {
      this._shared.errorHandle(errorMessages.KeyError(this._namespace, key))
      return false
    }
    if (!this._shared.checkFullKey(this._namespace, key, true)) {
      return false
    }
    const localeMap = this._keyValue.get(key)
    if (localeMap?.t) {
      localeMap.t.set(locale, value)
    }
    else {
      this._keyValue.set(key, { t: new Map([[locale, value]]) })
    }
    const listener = this._externalListeners.get(key)
    if (listener) {
      this._shared.events.offKey(listener.ns, listener.ls)
      this._externalListeners.delete(key)
    }
    this._shared.changeKey(this._namespace, key)
    return true
  }

  protected _setExternalKey (key: string, externalFullKey: string, ns: string, partKey: string): void {
    this._keyValue.set(key, { t: null, k: externalFullKey })
    const listener = this._externalListeners.get(key)
    if (listener) {
      this._shared.events.offKey(listener.ns, listener.ls)
    }
    const ls = (_name: 'key', value: string) => {
      if (value === partKey) {
        this._shared.changeKey(this._namespace, key)
      }
    }
    this._externalListeners.set(key, { ns, ls })
    this._shared.events.onKey(ns, ls, false)
    this._shared.changeKey(this._namespace, key)
  }

  /**
   * Заимствовать ключ внешнего реестра.
   *
   * WARNING: Этот метод удалит все ключи установленные через `set(key, value, locale)`.
   *
   * Заимствание полезно для случаев использования общеупотребительных переводов, например `control.submit:'Отправить'`.
   *
   * @param key             Ключ.
   * @param externalFullKey Внешний ключ. Может не существовать на момент вызова, но это не влияет на результат.
   */
  use (key: string, externalFullKey: string): boolean {
    // Проверим уже установленный ключ. Внешними ключами всегда является строка и легко проверяется на строгим равенством.
    const found = this._keyValue.get(key)
    if (found && !found.t && found.k === externalFullKey) {
      return true
    }

    if (!testNamespacePath(key)) {
      this._shared.errorHandle(errorMessages.KeyError(this.namespace, key))
      return false
    }

    if (!testNamespacePath(externalFullKey)) {
      this._shared.errorHandle(errorMessages.KeyError(null, externalFullKey))
      return false
    }

    // Ключ никогда не находится на верхнем уровне имен реестров: `nsName.your.path.keyName`.
    // Сузим отслеживание изменений, только для namespace верхнего уровня.
    const index = externalFullKey.indexOf('.')
    if (index < 1) {
      this._shared.errorHandle(errorMessages.KeyError(null, externalFullKey))
      return false
    }
    const ns = (externalFullKey.slice(0, index) ?? null) as (string | null)
    const partKey = externalFullKey.slice(index + 1) ?? null
    // Если мы получили невалидный ключ
    if (!ns || !partKey) { // на всякий случай
      this._shared.errorHandle(errorMessages.KeyError(null, externalFullKey))
      return false
    }

    // Ключ указывает на себя
    if (concatNamespaceWithKey(this._namespace, key) === externalFullKey) {
      this._shared.errorHandle(errorMessages.CircularDependencyError(null, externalFullKey, this._namespace, key))
      return false
    }

    // Симулируем поиск ключа для определения круговой зависимости.
    // Сразу устанавливаем собственное посещение:
    //  Если findValue() обнаружит Map.get(this)[i] === key, значит мы вернулись сами к себе.
    // Почему в visited используется массив? Ключи могут указывать на себя через третьи namespace:
    //  ns1.use('first', 'ns2.other')
    //  ns2.use('other', 'ns1.second')
    //  ns1.use('second', 'ns1.first') <- ошибка
    // Ключ 'ns1.second' не конфликтует с 'ns1.first' и при посещении findValue() - visited перезаписал бы пару
    //  [this -> 'second'] на [this -> 'first'], вследствие чего мы бы не нашли собственной круговой зависимости,
    //  так как 'second' уже стерт из visited, и не получили бы искомого значения, так как 'second' еще не установлен.
    //  Сюда бы вернулся null без ошибки.
    //  В этот момент устанавливается 'ns1.second' и тут же вызывает бесконечное обновление ключей changeKey()
    const ctx = { namespace: null, key, visited: new Map([[this, [key]]]), error: false }
    this._shared.findValue(this.locale, externalFullKey, ctx)
    // Ошибка уже зарегистрирована
    if (ctx.error) {
      return false
    }

    if (!this._shared.checkFullKey(null, externalFullKey, false) || !this._shared.checkFullKey(this._namespace, key, true)) {
      return false
    }

    this._setExternalKey(key, externalFullKey, ns, partKey)
    return true
  }
}

export {
  privateI18nRegistryGetKeyIfIntersection,
  privateI18nRegistryGetValue,
  SharedSingleton,
  I18nRoot,
  I18nRegistry
}
