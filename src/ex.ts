// #####################################################################################
// # Реализация пользовательского i18n.
// # Этот листинг описывает механизм переопределения классов и расширение пользовательского i18n.
// # Краткий шаблон для копирования в файле ./impl.ts
// #####################################################################################
import {
  // type TOptions,
  type TOptionsEx,
  type TConfig,
  type TStrToken,
  type TStrTemplate,
  type TErrorDetail,
  isString,
  isObject,
  concatNamespaceWithKey,
  templateToTokens,
  parseOptions,
  errorMessages,
  SharedSingleton,
  I18nRoot,
  I18nRegistry
} from './index.js'

//
// Расширение пользовательского i18n методами set(key, value, locale) и t(key, ...args).
//
// Краткое описание архитектуры зависимостей трех классов смотрите в README.md
//
// Что в этом листинге:
//
// + Создание унифицированных классов ExStringRecord/ExTokensRecord для хранения различных типов значений
// + Расширение разделяемого SharedSingleton с добавлением собственных параметром конструктору и реализация методов.
// + Реализация метода установки значений I18nRegistry.set(), преобразующего входной тип в унифицированное значение.
// + Реализация метода I18nRoot.t(), преобразующего унифицированное значение в выходную строку.
// + Определение I18nRoot.createInstance() для создания корневого экземпляра.
//
// Большая половина строк это банальное копирование с заменой типов зависимых SharedSingleton/I18nRegistry/I18nRoot
//

/**
 * Унифицированный вариант строки.
 */
class ExStringRecord {
  protected readonly _text: string
  constructor(text: string) {
    this._text = text
  }
  get isString (): true {
    return true
  }
  get isTokens (): false {
    return false
  }
  get (): string {
    return this._text
  }
}

/**
 * Унифицированный вариант токенизированной строки принимающей подстановочные переменные.
 */
class ExTokensRecord {
  protected readonly _segments: string[] = []
  protected readonly _positions: { name: string, index: number }[] = []

  constructor(tokens: (string | TStrToken)[]) {
    for (let i = 0; i < tokens.length; ++i) {
      const item = tokens[i]!
      if (isString(item)) {
        this._segments[i] = item
      }
      else if (item.kind === 'str') {
        this._segments[i] = item.value
      }
      else if (item.kind === 'ph') {
        this._positions.push({ name: item.value, index: i })
        this._segments[i] = '' // этот индекс будет заполнен подстановочным значением.
      }
      else {
        // Если что-то пошло не так
        this._segments[i] = ''
      }
    }
  }

  get isString (): false {
    return false
  }

  get isTokens (): true {
    return true
  }

  get (variables: Record<string, string>): string {
    // Копировать массив нет никакого смысла. При каждом обращении он перезаписывает
    // все индексы, и прошлого значения мы получить не можем.
    for (const item of this._positions) {
      this._segments[item.index] = variables[item.name] ?? item.name
    }
    return this._segments.join('')
  }
}

/**
 * Основной тип значения: Хранится в списках пространств имен.
 */
type TValue = ExStringRecord | ExTokensRecord

/**
 * Разделяемый ExSingleton: Регистрирует пространства имен, логирует ошибки и кеширует запросы в плоскую структуру.
 */
class ExSingleton<TLocale extends string, TKey extends string> extends SharedSingleton<TLocale, TValue> {
  protected readonly _onError: ((error: TErrorDetail) => void)
  protected readonly _markerNonValue: symbol
  protected readonly _defaultValue: string

  // NOTE
  // SharedSingleton - единственный класс который может расширять собственные свойства и конструктор.
  //
  // Параметры `onError/markerNonValue/defaultValue` необязательны и определяются из предпочтений.
  // В нашем случае:
  //  + onError - пользовательский регистратор ошибок для реализации обязательной errorHandle().
  //  + markerNonValue - маркер отсутствующего ключа для реализации getDefaultValue().
  //  + defaultValue - пользовательское значение по умолчанию, которое мы получим из зависимого ExI18n.
  //
  // Конструктору можно добавить любые параметры, например функции преобразования входных значений,
  // но в нашем случае это проще сделать напрямую в методе I18nRegistry.set().
  constructor(config: TConfig<TLocale>, onError: ((error: TErrorDetail) => void), markerNonValue: symbol, defaultValue: string) {
    super(config)
    this._onError = onError
    this._markerNonValue = markerNonValue
    this._defaultValue = defaultValue
  }

  // NOTE Два метода _nsFactory()/_rgFactory() должны вернуть расширенные пользователем классы I18nRoot/I18nRegistry.
  // В теле этих методов ничего не меняется кроме возвращаемого типа.
  protected override _nsFactory (fullNamespace: null | string): ExI18n<TLocale, TKey> {
    return new ExI18n(this, fullNamespace)
  }
  protected override _rgFactory (fullNamespace: string): ExI18nImpl<TLocale, TKey> {
    return new ExI18nImpl(this, fullNamespace)
  }

  // NOTE Эта функция будет использована внутренними методами для регистрации ошибок.
  override errorHandle (error: TErrorDetail): void {
    this._onError(error)
  }

  // NOTE Эта функция не имеет никакого значения для внутренних методов, но она должна возвратить любое значение,
  // когда ключ не найден - значение передается в I18nRoot._getValue().
  // Установим маркер, а для значения по умолчанию реализуем getCustomDefaultValue().
  override getDefaultValue (): /* symbol */ unknown {
    return this._markerNonValue
  }

  // NOTE Вспомогательный метод позволяющий получить реальное пользовательское значение по умолчанию.
  // В методе I18nRoot._getValue() проверим _markerNonValue, после чего вернем подходящее значение.
  getCustomDefaultValue (): string {
    return this._defaultValue
  }
}

/**
 * Класс регистрации значений.
 */
class ExI18nImpl<TLocale extends string, TKey extends string> extends I18nRegistry<TLocale, TKey, TValue> {
  // NOTE
  // Классам I18nRoot/I18nRegistry нежелательно иметь собственных конструкторов.
  // Их цель привязаться к пространсту имен, но не хранить данные в собственных полях кроме разделяемого ExSingleton.
  // Здесь, в ExI18nImpl, мы ничего не будем делать с конструктором, но сделаем это в ExI18n.

  // NOTE
  // Все три функции register/getRoot/getNamespace ничего не делают и делегируют вызов фабрике из ExSingleton.
  // Основная задача: преобразование типа TKey к желаемому типу в TypeScript.
  // Типы TLocale и TValue могут быть статичны, но TKey зависит от пространств имен и определить его
  // не представляется возможным.
  // В любой реализации I18n эти методы копируются как есть с заменой расширенных классов ExI18nImpl/ExI18n.
  override register<T extends string = TKey> (fullNamespace: string): ExI18nImpl<TLocale, T> | null {
    // @ts-expect-error
    return this._shared.register(fullNamespace)
  }
  override getRoot<T extends string = TKey> (): ExI18n<TLocale, T> {
    // @ts-expect-error
    return this._shared.root
  }
  override getNamespace<T extends string = TKey> (namespace: string): ExI18n<TLocale, T> {
    // @ts-expect-error
    return this._shared.getNamespace(concatNamespaceWithKey(this.namespace, namespace))
  }

  // NOTE Придумай любые set<Name>() методы установки значений. Имена можно выбирать из предпочтений.
  // Основная задача: преобразовать входное значение любого типа к унифицированному TValue.
  /**
   * Добавляет или заменяет пару `key -> value` для выбранной локали.
   *
   * @param key    Ключ.
   * @param value  Строка, шаблон или последовательность токенов.
   * @param locale Допустимое зарегистрированное имя.
   *
   * Пример:
   * ```ts
   * set('locale.description', 'Select your preferred application language.', 'en_us')
   * ```
   */
  set (key: string, value: string | TStrTemplate | TStrToken[] | TValue, locale: TLocale): boolean {
    // Преобразуем входной тип к ожидаемому TValue и делегируем установку I18nRegistry._setValue()
    if (isString(value)) {
      return this._setValue(key, new ExStringRecord(value), locale)
    }
    if (Array.isArray(value)) {
      return this._setValue(key, new ExTokensRecord(value), locale)
    }
    if ((value instanceof ExStringRecord) || (value instanceof ExTokensRecord)) {
      return this._setValue(key, value, locale)
    }
    if (isObject(value) && value.kind === 'tpl') {
      return this._setValue(key, new ExTokensRecord(templateToTokens(value.value)), locale)
    }
    // Зарегистрируем ошибку и возвратим false
    // Выше мы определили собственный errorHandle() и можем передать все что принимает наш метод,
    // но для унификации передадим предопределенную ошибку
    this._shared.errorHandle(errorMessages.ValueError(this.namespace, key, null))
    return false
  }

  // NOTE Создадим еще один метод, который будет принимать только шаблонную строку.
  // Мы можем создавать любые методы без ограничений и использовать только единственный this._setValue(...).
  /**
   * Добавляет или заменяет пару `key -> value` для выбранной локали.
   *
   * @param key       Ключ.
   * @param template  Шаблонная строка вида `'Hello, {name}!'`.
   * @param locale    Допустимое зарегистрированное имя.
   */
  setTemplate (key: string, template: string, locale: TLocale): boolean {
    return this._setValue(key, new ExTokensRecord(templateToTokens(template)), locale)
  }
}

/**
 * Основной класс `i18n`.
 */
class ExI18n<TLocale extends string, TKey extends string> extends I18nRoot<TLocale, TKey, TValue> {
  // NOTE
  // Нам не нужно переопределять конструктор чтобы получить доступ к this._shared:ExSingleton,
  // но мы не получим поддержку типов TypeScript, и доступ к кастомным методам ExSingleton,
  // придется либо глушить ошибки либо приводить тип (this._shared as ExSingleton).myMethod()
  // Но мы можем задекларировать тип не используя переопределения конструктора.
  // Копируем сигнатуру базового класса с добавлением declare и обновленным типом ExSingleton:
  declare protected readonly _shared: ExSingleton<TLocale, TKey>

  // NOTE
  // Как и в ExI18nImpl здесь дублируется копирование трех методов. Этот шаблон везде одинаков.
  override register<T extends string = TKey> (fullNamespace: string): ExI18nImpl<TLocale, T> | null {
    // @ts-expect-error
    return this._shared.register(fullNamespace)
  }
  override getRoot<T extends string = TKey> (): ExI18n<TLocale, T> {
    // @ts-expect-error
    return this._shared.root
  }
  override getNamespace<T extends string = TKey> (namespace: string): ExI18n<TLocale, T> {
    // @ts-expect-error
    return this._shared.getNamespace(concatNamespaceWithKey(this.namespace, namespace))
  }

  // NOTE
  // Придумай методы с любыми именами для получения значений и используй this._getValue(key).
  // Основная задача: преобразовать `TValue` к ожидаемой строке.
  /**
   * Возвращает значение для ключа на всю глубину разделов относительно текущего `namespace`.
   *
   * @param key       Ключ перевода, например `'control.ok' => 'Ok'`
   * @param variables Переменные если ожидается шаблонная строка.
   */
  t (key: TKey, variables?: undefined | null | Record<string, string>): string {
    // Для получения требуется вызвать один метод
    const value = this._getValue(key) // TValue or defaultValue
    // В нашей реализации предусмотрен symbol как маркер отсутствующего ключа.
    // Проверим что мы получили фактически и вернем значение по умолчанию.
    if (value === this._shared.getDefaultValue()) {
      return this._shared.getCustomDefaultValue()
    }
    // Здесь точно ожидаемый тип TValue
    return value.isString ? value.get() : value.get(variables ?? {})
  }

  // NOTE
  // Статический метод необязателен и это может быть любая функция с желаемыми параметрами.
  // Основной класс SharedSingleton требует только TConfig<TLocale>, остальные параметры мы сами определили выше.
  /**
   * Создает корневой экземпляр `i18n`.
   *
   * @param options Обязательными являются только два параметра {@link TOptions.locale} и {@link TOptions.onError()}.
   */
  static createInstance<TLocale extends string, TKey extends string> (options: TOptionsEx<TLocale, string>): ExI18n<TLocale, TKey> {
    const config = parseOptions(options)
    const onError = options.onError
    const defaultValue = isString(options.defaultValue) ? options.defaultValue : ''
    // SharedSingleton создаст корневой экземпляр I18nRoot, приведем его к расширенному типу.
    return new ExSingleton(config, onError, Symbol(), defaultValue).root as ExI18n<TLocale, TKey>
  }
}

export {
  ExStringRecord,
  ExTokensRecord,
  ExSingleton,
  ExI18nImpl,
  ExI18n
}
