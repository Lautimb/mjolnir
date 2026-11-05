import { describe, expect, it } from 'vitest'
import type { HttpResponse } from '@mjolnir/plugin-sdk'
import {
  addToHistory,
  buildRequest,
  collectionTree,
  displayBody,
  emptyRequest,
  parseRequestFile,
  requestName,
  requestPath,
  serializeRequest,
  type Environment,
  type RequestSpec,
} from './model'

const environment: Environment = {
  id: 'dev',
  name: 'Dev',
  variables: [
    { name: 'base', value: 'https://api.dev.io', enabled: true },
    { name: 'token', value: 'abc', enabled: true },
    { name: 'off', value: 'x', enabled: false },
  ],
}

const response = (overrides: Partial<HttpResponse>): HttpResponse => ({
  url: 'https://a.io',
  status: 200,
  statusText: 'OK',
  headers: [],
  body: { encoding: 'utf8', data: '' },
  redirects: [],
  durationMs: 1,
  ...overrides,
})

describe('buildRequest', () => {
  it('replaces environment variables in the url, headers and body, and reports the missing ones', () => {
    const spec: RequestSpec = {
      method: 'POST',
      url: '{{base}}/users/{{ id }}',
      headers: [
        { name: 'Authorization', value: 'Bearer {{token}}', enabled: true },
        { name: 'X-Off', value: '{{off}}', enabled: false },
      ],
      body: { kind: 'json', text: '{"token":"{{token}}"}' },
    }
    expect(buildRequest(spec, environment)).toEqual({
      request: {
        method: 'POST',
        url: 'https://api.dev.io/users/{{ id }}',
        headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' },
        body: { encoding: 'utf8', data: '{"token":"abc"}' },
      },
      missing: ['id'],
    })
  })

  it('keeps an explicit content type and drops the body of GET requests', () => {
    const json = { ...emptyRequest(), method: 'PUT', url: 'https://a.io', headers: [{ name: 'content-type', value: 'application/vnd+json', enabled: true }] }
    expect(buildRequest({ ...json, body: { kind: 'json', text: '{}' } }, null).request.headers).toEqual({ 'content-type': 'application/vnd+json' })
    expect(buildRequest({ ...emptyRequest(), url: 'https://a.io', body: { kind: 'text', text: 'x' } }, null).request.body).toBeUndefined()
  })
})

describe('displayBody', () => {
  it('pretty prints JSON and leaves other text as is', () => {
    const json = response({ headers: [['content-type', 'application/problem+json']], body: { encoding: 'utf8', data: '{"a":1}' } })
    expect(displayBody(json)).toEqual({ kind: 'text', text: '{\n  "a": 1\n}', truncated: false, json: true })
    const broken = response({ headers: [['Content-Type', 'application/json']], body: { encoding: 'utf8', data: '{' } })
    expect(displayBody(broken)).toMatchObject({ text: '{', json: false })
  })

  it('does not try to show binary bodies', () => {
    expect(displayBody(response({ body: { encoding: 'base64', data: 'AAAA' } }))).toEqual({ kind: 'binary', bytes: 3 })
  })
})

describe('request files', () => {
  it('round-trips a request through its file format', () => {
    const spec: RequestSpec = {
      method: 'POST',
      url: '{{base}}/users',
      headers: [
        { name: 'Accept', value: 'application/json', enabled: true },
        { name: 'X-Debug', value: '1', enabled: false },
      ],
      body: { kind: 'json', text: '{}' },
    }
    expect(parseRequestFile(serializeRequest(spec))).toEqual(spec)
    expect(serializeRequest(emptyRequest())).toBe('{\n  "method": "GET",\n  "url": ""\n}\n')
  })

  it('rejects files that are not requests', () => {
    expect(parseRequestFile('nope')).toBeNull()
    expect(parseRequestFile('{"method":"GET"}')).toBeNull()
    expect(parseRequestFile('{"method":"GET","url":"x","headers":[{"name":1}]}')).toBeNull()
    expect(parseRequestFile('{"method":"GET","url":"x","body":{"kind":"xml"}}')).toBeNull()
  })

  it('maps names to paths inside the collection folder', () => {
    expect(requestPath('users/list')).toBe('.mjolnir/http/users/list.json')
    expect(requestPath(' Get users.json ')).toBe('.mjolnir/http/Get users.json')
    for (const name of ['', '../x', 'a//b', 'a/.', 'C:x', 'a\\b']) expect(requestPath(name), name).toBeNull()
    expect(requestName('.mjolnir/http/users/list.json')).toBe('users/list')
  })

  it('groups the files of a repo into folders', () => {
    const entry = (path: string) => ({ path, size: 1, modifiedMs: 0 })
    const tree = collectionTree([entry('.mjolnir/http/users/list.json'), entry('.mjolnir/http/health.json'), entry('.mjolnir/http/notes.txt'), entry('.mjolnir/http/users/create.json')])
    expect(tree.requests).toEqual([{ name: 'health', path: '.mjolnir/http/health.json' }])
    expect(tree.folders).toMatchObject([{ name: 'users', path: 'users', requests: [{ name: 'create' }, { name: 'list' }] }])
  })
})

describe('addToHistory', () => {
  it('keeps the newest entries first, up to the limit', () => {
    const entry = (id: string) => ({ id, at: 0, request: emptyRequest(), status: 200, durationMs: 1 })
    expect(addToHistory([entry('a'), entry('b')], entry('c'), 2).map((item) => item.id)).toEqual(['c', 'a'])
  })
})
