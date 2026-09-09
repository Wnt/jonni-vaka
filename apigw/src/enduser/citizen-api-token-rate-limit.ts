// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import type express from 'express'

import { logWarn } from '../shared/logging.ts'
import type { RedisClient } from '../shared/redis-client.ts'

const eventCode = (name: string) => `evaka.citizen_api_token.${name}`

const WINDOW_MS = 60_000

/** Two windows' worth, so a counter outlives every request that should count against it. */
const KEY_EXPIRY_SECONDS = 120

/**
 * Rate-limits requests authenticated with a citizen API token, following the Redis counter pattern
 * of the weak-login rate limit in `enduser/routes/auth-weak-login.ts`. Requests authenticated with a
 * session cookie carry no `req.citizenApiToken` and pass through untouched.
 *
 * The bucket is keyed by token id rather than by citizen: a citizen can hold several tokens, and one
 * that leaks or runs away must not throttle the other integrations they have authorized.
 */
export const citizenApiTokenRateLimit = (
  redis: RedisClient,
  requestsPerMinute: number
) =>
  async function citizenApiTokenRateLimitMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): Promise<void> {
    const identity = req.citizenApiToken
    if (!identity || requestsPerMinute <= 0) {
      next()
      return
    }

    try {
      const { tokenId } = identity
      const windowStart = Math.floor(Date.now() / WINDOW_MS)
      const key = `citizen-api-token-rate:${tokenId}:${windowStart}`

      const value = Number.parseInt((await redis.get(key)) ?? '', 10)
      if (Number.isNaN(value) || value < requestsPerMinute) {
        await redis.multi().incr(key).expire(key, KEY_EXPIRY_SECONDS).exec()
        next()
        return
      }

      const windowEnd = (windowStart + 1) * WINDOW_MS
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowEnd - Date.now()) / 1000)
      )

      logWarn('Citizen API token request hit rate limit', req, {
        eventCode: eventCode('rate_limited'),
        tokenId
      })

      res.set('Retry-After', String(retryAfterSeconds))
      res.status(429).send({ error: 'RATE_LIMITED' })
    } catch (err) {
      next(err)
    }
  }
