// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import type express from 'express'
import { describe, expect, it, vi } from 'vitest'

import * as logging from '../../shared/logging.ts'
import { MockRedisClient } from '../../shared/test/mock-redis-client.ts'
import { citizenApiTokenRateLimit } from '../citizen-api-token-rate-limit.ts'
import type { CitizenApiTokenIdentity } from '../citizen-api-token.ts'

function fakeIdentity(tokenId: string): CitizenApiTokenIdentity {
  return { personId: 'person-1', tokenId, scopes: [] }
}

function fakeReq(
  identity: CitizenApiTokenIdentity | undefined
): express.Request {
  return { citizenApiToken: identity } as unknown as express.Request
}

function fakeRes(): {
  res: express.Response
  status: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
} {
  const send = vi.fn().mockReturnThis()
  const status = vi.fn().mockReturnThis()
  const set = vi.fn().mockReturnThis()
  const res = { status, send, set } as unknown as express.Response
  return { res, status, send, set }
}

describe('citizenApiTokenRateLimit', () => {
  it('passes through a request that carries no citizenApiToken, uncounted', async () => {
    const redis = new MockRedisClient()
    const middleware = citizenApiTokenRateLimit(redis, 1)

    // Well beyond any limit, since it should never be counted at all
    for (let i = 0; i < 10; i++) {
      const req = fakeReq(undefined)
      const { res, status } = fakeRes()
      const next = vi.fn()
      await middleware(req, res, next)
      expect(next).toHaveBeenCalledWith()
      expect(status).not.toHaveBeenCalled()
    }
  })

  it('passes requests through while under the limit', async () => {
    const redis = new MockRedisClient()
    const middleware = citizenApiTokenRateLimit(redis, 3)
    const identity = fakeIdentity('token-1')

    for (let i = 0; i < 3; i++) {
      const req = fakeReq(identity)
      const { res, status } = fakeRes()
      const next = vi.fn()
      await middleware(req, res, next)
      expect(next).toHaveBeenCalledWith()
      expect(status).not.toHaveBeenCalled()
    }
  })

  it('rejects the request that crosses the limit with 429 and a plausible Retry-After', async () => {
    const redis = new MockRedisClient()
    const middleware = citizenApiTokenRateLimit(redis, 3)
    const identity = fakeIdentity('token-1')
    const logWarnSpy = vi.spyOn(logging, 'logWarn')

    for (let i = 0; i < 3; i++) {
      const req = fakeReq(identity)
      const { res } = fakeRes()
      await middleware(req, res, vi.fn())
    }

    const req = fakeReq(identity)
    const { res, status, send, set } = fakeRes()
    const next = vi.fn()
    await middleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(429)
    expect(send).toHaveBeenCalledWith({ error: 'RATE_LIMITED' })

    expect(set).toHaveBeenCalledWith('Retry-After', expect.any(String))
    const retryAfter = Number(set.mock.calls[0]?.[1])
    expect(Number.isInteger(retryAfter)).toBe(true)
    expect(retryAfter).toBeGreaterThanOrEqual(1)
    expect(retryAfter).toBeLessThanOrEqual(60)

    expect(logWarnSpy).toHaveBeenCalledWith(
      expect.any(String),
      req,
      expect.objectContaining({
        eventCode: 'evaka.citizen_api_token.rate_limited',
        tokenId: 'token-1'
      })
    )
    // The token itself must never appear in what gets logged, only its id
    const loggedMeta = logWarnSpy.mock.calls[0]?.[2]
    expect(JSON.stringify(loggedMeta)).not.toContain('person-1')

    logWarnSpy.mockRestore()
  })

  it('disables the limiter entirely when requestsPerMinute is 0', async () => {
    const redis = new MockRedisClient()
    const middleware = citizenApiTokenRateLimit(redis, 0)
    const identity = fakeIdentity('token-1')

    for (let i = 0; i < 20; i++) {
      const req = fakeReq(identity)
      const { res, status } = fakeRes()
      const next = vi.fn()
      await middleware(req, res, next)
      expect(next).toHaveBeenCalledWith()
      expect(status).not.toHaveBeenCalled()
    }
  })

  it('gives each token id its own bucket', async () => {
    const redis = new MockRedisClient()
    const middleware = citizenApiTokenRateLimit(redis, 2)
    const tokenA = fakeIdentity('token-a')
    const tokenB = fakeIdentity('token-b')

    // Exhaust token A's budget
    for (let i = 0; i < 2; i++) {
      const { res } = fakeRes()
      await middleware(fakeReq(tokenA), res, vi.fn())
    }
    const exhaustedA = fakeRes()
    await middleware(fakeReq(tokenA), exhaustedA.res, vi.fn())
    expect(exhaustedA.status).toHaveBeenCalledWith(429)

    // Token B is unaffected: it has not made any requests yet
    const freshB = fakeRes()
    const nextB = vi.fn()
    await middleware(fakeReq(tokenB), freshB.res, nextB)
    expect(nextB).toHaveBeenCalledWith()
    expect(freshB.status).not.toHaveBeenCalled()
  })
})
