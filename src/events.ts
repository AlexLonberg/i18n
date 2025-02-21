import { concatNamespaceWithKey, splitKeyByNamespace } from './utils.js'

/***
 * Слушатель изменения `locale`.
 */
type TListenerLocale<TLocale extends string> = ((name: 'locale', value: TLocale) => void)
/***
 * Слушатель изменения `key`.
 */
type TListenerKey<TKey extends string> = ((name: 'key', value: TKey) => void)

class Emitter {
  protected readonly _listeners: (TListenerLocale<string> | TListenerKey<string>)[] = []
  protected _listenersOnce: null | (TListenerLocale<string> | TListenerKey<string>)[] = null

  protected _emitterAddOnce (listener: (TListenerLocale<string> | TListenerKey<string>)): void {
    if (!this._listenersOnce) {
      this._listenersOnce = [listener]
    }
    else if (!this._listenersOnce.includes(listener)) {
      this._listenersOnce.push(listener)
    }
  }

  protected _emitterRemoveOnce (listener: (TListenerLocale<string> | TListenerKey<string>)): void {
    if (!this._listenersOnce) {
      return
    }
    for (let i = 0; i < this._listenersOnce.length; ++i) {
      if (this._listenersOnce[i] === listener) {
        this._listenersOnce.splice(i, 1)
        break
      }
    }
    if (this._listenersOnce.length === 0) {
      this._listenersOnce = null
    }
  }

  protected _emitterCopyAndRemoveOnce (): (TListenerLocale<string> | TListenerKey<string>)[] {
    const listeners: (TListenerLocale<string> | TListenerKey<string>)[] = [...this._listeners]
    for (let i = this._listeners.length - 1; i >= 0; --i) {
      if (this._listenersOnce!.includes(this._listeners[i]!)) {
        this._listeners.splice(i, 1)
      }
    }
    this._listenersOnce = null
    return listeners
  }

  on (listener: (TListenerLocale<string> | TListenerKey<string>), once: boolean): void {
    if (!this._listeners.includes(listener)) {
      this._listeners.push(listener)
      if (once) {
        this._emitterAddOnce(listener)
      }
      return
    }
    if (once) {
      this._emitterAddOnce(listener)
    }
    else {
      this._emitterRemoveOnce(listener)
    }
  }

  off (listener: (TListenerLocale<string> | TListenerKey<string>)): void {
    for (let i = 0; i < this._listeners.length; ++i) {
      if (this._listeners[i] === listener) {
        this._listeners.splice(i, 1)
        this._emitterRemoveOnce(listener)
        break
      }
    }
  }


  emit (name: 'locale' | 'key', value: string): void {
    const listeners = this._listenersOnce ? this._emitterCopyAndRemoveOnce() : [...this._listeners]
    for (const listener of listeners) {
      try {
        // @ts-expect-error
        listener(name, value)
      } catch (e) {
        // @ts-expect-error
        console.error(e)
      }
    }
  }
}

class EventEmitter {
  protected readonly _locale = new Emitter()
  protected readonly _namespace = new Map<null | string, Emitter>()
  protected readonly _name2KeyCache = new Map<string, readonly (readonly [string, string])[]>()

  onLocale (listener: TListenerLocale<string>, once: boolean): void {
    this._locale.on(listener, once)
  }

  offLocale (listener: TListenerLocale<string>): void {
    this._locale.off(listener)
  }

  emitLocale (locale: string): void {
    this._locale.emit('locale', locale)
  }

  onKey (namespace: null | string, listener: TListenerKey<string>, once: boolean): void {
    let ns = this._namespace.get(namespace)
    if (!ns) {
      ns = new Emitter()
      this._namespace.set(namespace, ns)
    }
    ns.on(listener, once)
  }

  offKey (namespace: null | string, listener: TListenerKey<string>): void {
    this._namespace.get(namespace)?.off(listener)
  }

  protected _getAffectedNamespaces (fullKey: string): readonly (readonly [string, string])[] {
    const name2Key = splitKeyByNamespace(fullKey)
    this._name2KeyCache.set(fullKey, name2Key)
    return name2Key
  }

  emitKey (namespace: null | string, key: string): void {
    const fullKey = concatNamespaceWithKey(namespace, key)
    const affectedNamespaces = this._name2KeyCache.get(fullKey) ?? this._getAffectedNamespaces(fullKey)
    this._namespace.get(null)?.emit('key', fullKey)
    for (const [ns, localKey] of affectedNamespaces) {
      // Все зарегистрированные слушатели получат часть ключа относительно своего пространства имен
      this._namespace.get(ns)?.emit('key', localKey)
    }
  }
}

export {
  type TListenerLocale,
  type TListenerKey,
  Emitter,
  EventEmitter
}
