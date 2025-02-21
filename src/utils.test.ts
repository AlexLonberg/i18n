import { test, expect } from 'vitest'
import {
  // collectNamespaceKeyPairs,
  splitKeyByNamespace,
  splitKeyWithNamespace,
  splitKeyIntoParts,
  testNamespacePath,
  templateToTokens
} from './utils.js'

test('splitKeyByNamespace | splitKeyWithNamespace | splitKeyIntoParts', () => {
  // Ключи обязательно должны находится в пространстве имен
  expect(splitKeyByNamespace('key')).toStrictEqual([])
  expect(splitKeyWithNamespace(null, 'key')).toStrictEqual([])

  expect(splitKeyByNamespace('foo')).toStrictEqual([])
  expect(splitKeyByNamespace('foo.bar')).toStrictEqual([['foo', 'bar']])
  expect(splitKeyByNamespace('foo.bar.box')).toStrictEqual([
    ['foo', 'bar.box'],
    ['foo.bar', 'box']
  ])

  expect(splitKeyWithNamespace(null, 'foo.bar.box')).toStrictEqual([
    ['foo', 'bar.box'],
    ['foo.bar', 'box']
  ])

  expect(splitKeyWithNamespace('settings', 'key')).toStrictEqual([
    ['settings', 'key']
  ])

  expect(splitKeyWithNamespace('settings', 'foo.bar.box')).toStrictEqual([
    ['settings', 'foo.bar.box'],
    ['settings.foo', 'bar.box'],
    ['settings.foo.bar', 'box']
  ])

  expect(splitKeyWithNamespace('settings.system', 'foo.bar.box')).toStrictEqual([
    ['settings.system', 'foo.bar.box'],
    ['settings.system.foo', 'bar.box'],
    ['settings.system.foo.bar', 'box']
  ])

  expect(splitKeyIntoParts('foo')).toStrictEqual(['foo'])
  expect(splitKeyIntoParts('foo.bar')).toStrictEqual(['foo', 'foo.bar'])
  expect(splitKeyIntoParts('foo.bar.box')).toStrictEqual(['foo', 'foo.bar', 'foo.bar.box'])
})

test('testNamespacePath', () => {
  // @ts-expect-error
  expect(testNamespacePath()).toBe(false)
  // @ts-expect-error
  expect(testNamespacePath(null)).toBe(false)
  // @ts-expect-error
  expect(testNamespacePath({})).toBe(false)

  expect(testNamespacePath('')).toBe(false)
  expect(testNamespacePath('.')).toBe(false)
  expect(testNamespacePath('.foo')).toBe(false)
  expect(testNamespacePath('foo.')).toBe(false)
  expect(testNamespacePath('foo..bar')).toBe(false)

  expect(testNamespacePath('foo')).toBe(true)
  expect(testNamespacePath('foo.bar')).toBe(true)
})

test('templateToTokens', () => {
  // @ts-expect-error
  expect(templateToTokens()).toStrictEqual([])
  expect(templateToTokens('')).toStrictEqual([{ kind: 'str', value: '' }])
  expect(templateToTokens('  ')).toStrictEqual([{ kind: 'str', value: '  ' }])

  expect(templateToTokens('Hi, {name}!')).toStrictEqual([
    { kind: 'str', value: 'Hi, ' },
    { kind: 'ph', value: 'name' },
    { kind: 'str', value: '!' },
  ])

  expect(templateToTokens("My { } name { is { name} and I'm {age } years } old.")).toStrictEqual([
    { kind: 'str', value: 'My { } name { is ' },
    { kind: 'ph', value: 'name' },
    { kind: 'str', value: " and I'm " },
    { kind: 'ph', value: 'age' },
    { kind: 'str', value: ' years } old.' }
  ])
})
