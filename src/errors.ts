import { concatNamespaceWithKey, isNonemptyString } from './utils.js'

/** Коды ошибок. */
const errorCodes = Object.freeze({
  UnregisteredLocaleError: 1,
  NamespaceError: 2,
  KeyError: 3,
  ValueError: 4,
  IntersectionNsError: 5,
  IntersectionError: 6,
  UnregisteredKeyError: 7,
  CircularDependencyError: 8
} as const)

/** Коды ошибок. */
type TErrorCodes = typeof errorCodes
/** Коды ошибок. */
type TErrorCode = TErrorCodes[keyof TErrorCodes]

/**
 * Детали ошибки с кодом и описанием.
 */
type TErrorDetail = {
  code: TErrorCode
  namespace: null | string
  key: string
  message: string
}

/**
 * Предопределенные описания ошибок.
 */
const errorMessages = Object.freeze({
  UnregisteredLocaleError (locale: string): TErrorDetail {
    try {
      locale = `${locale}`
    } catch (_) {
      locale = '(unknown)'
    }
    return {
      code: errorCodes.UnregisteredLocaleError,
      namespace: null,
      key: locale,
      message: `The locale '${locale}' is not registered.`
    }
  },
  NamespaceError (namespace: null | string): TErrorDetail {
    const ns = typeof namespace === 'string' ? namespace : 'null(type)'
    return {
      code: errorCodes.NamespaceError,
      namespace,
      key: '',
      message: `The namespace '${ns}' must be a non-empty string.`
    }
  },
  KeyError (namespace: null | string, key: string): TErrorDetail {
    return {
      code: errorCodes.KeyError,
      namespace,
      key,
      message: `The full key '${concatNamespaceWithKey(namespace, key)}' must have at least two segments separated by a dot.`
    }
  },
  ValueError (namespace: null | string, key: string, valueType: null | string): TErrorDetail {
    valueType = isNonemptyString(valueType) ? ` '${valueType}'` : ''
    return {
      code: errorCodes.ValueError,
      namespace,
      key,
      message: `Unacceptable value type${valueType}.`
    }
  },
  IntersectionNsError (namespace: string, otherNamespace: string, partKey: string): TErrorDetail {
    return {
      code: errorCodes.IntersectionNsError,
      namespace,
      key: '',
      message: `The namespace '${namespace}' intersects with the key '${partKey}' in the namespace '${otherNamespace}'.`
    }
  },
  IntersectionError (namespace: null | string, key: string, otherNamespace: string): TErrorDetail {
    const ns = namespace ?? '(null)'
    return {
      code: errorCodes.IntersectionError,
      namespace,
      key,
      message: `The namespace '${ns}' with the key '${key}' intersects with the namespace '${otherNamespace}'.`
    }
  },
  CircularDependencyError (namespace: null | string, key: string, otherNamespace: string, otherKey: string): TErrorDetail {
    return {
      code: errorCodes.CircularDependencyError,
      namespace,
      key,
      message: `Circular dependency detected for key '${concatNamespaceWithKey(namespace, key)}' with namespace '${otherNamespace}' and key '${otherKey}'.`
    }
  },
  UnregisteredKeyError (namespace: null | string, key: string): TErrorDetail {
    return {
      code: errorCodes.UnregisteredKeyError,
      namespace,
      key,
      message: `The key '${concatNamespaceWithKey(namespace, key)}' is not registered.`
    }
  }
} as const)

/**
 * Базовый класс ошибок.
 */
class I18nError extends Error {
  readonly detail: TErrorDetail

  constructor(detail: TErrorDetail) {
    super(detail.message)
    this.detail = detail
  }

  get code (): TErrorCode {
    return this.detail.code
  }
}

/**
 * Незарегистрированная локаль.
 */
class UnregisteredLocaleError extends I18nError { }

/**
 * Недопустимое имя пространства имен(например пустая строка).
 */
class NamespaceError extends I18nError { }

/**
 * Недопустимое имя пространства имен(например пустая строка).
 */
class KeyError extends I18nError { }

/**
 * Недопустимый тип значений.
 */
class ValueError extends I18nError { }

/**
 * Ошибка регистрации: Пространство имен пересекается с ключом в другом пространстве имен.
 */
class IntersectionNsError extends I18nError { }

/**
 * Ошибка регистрации: Ключ пересекается с пространством имен.
 */
class IntersectionError extends I18nError { }

/**
 * Обнаружена циклическая зависимость при заимствовании ключей.
 */
class CircularDependencyError extends I18nError { }

/**
 * Обращения к незарегистрированному ключу.
 */
class UnregisteredKeyError extends I18nError { }

export {
  errorCodes,
  type TErrorCodes,
  type TErrorCode,
  type TErrorDetail,
  errorMessages,
  I18nError,
  UnregisteredLocaleError,
  NamespaceError,
  KeyError,
  ValueError,
  IntersectionNsError,
  IntersectionError,
  CircularDependencyError,
  UnregisteredKeyError
}
