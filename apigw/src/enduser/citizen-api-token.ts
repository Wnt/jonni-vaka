// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import type express from 'express'

import {
  bearerToken,
  CITIZEN_API_TOKEN_PATTERN
} from '../shared/auth/bearer.ts'
import type { EvakaSessionUser } from '../shared/auth/index.ts'
import { logAuditEvent, logWarn } from '../shared/logging.ts'
import { citizenApiTokenLogin } from '../shared/service-client.ts'

import { citizenApiScopeEndpoints } from './generated/citizen-api-scopes.ts'

/**
 * A citizen API token authenticates as a *weakly authenticated citizen*, exactly like an email +
 * password login, so the service needs no new authorization logic: the identity is the same citizen
 * it always was, and a token only ever narrows what that citizen can reach. Scopes are interpreted
 * here and nowhere else, because the api-gw is already the sole authenticator for citizen requests.
 */

const eventCode = (name: string) => `evaka.citizen_api_token.${name}`

export interface CitizenApiTokenIdentity {
  personId: string
  tokenId: string
  scopes: string[]
}

declare module 'express-serve-static-core' {
  interface Request {
    citizenApiToken?: CitizenApiTokenIdentity
  }
}

export type ScopeRequirement =
  | { type: 'scope'; scope: string }
  | { type: 'forbidden' }

const forbidden: ScopeRequirement = { type: 'forbidden' }

/**
 * Reduces a request target to the path the *backend* will act on, or undefined if that cannot be
 * determined safely. The scope decision must be made on this rather than on the path as written, or
 * `/citizen/messages/../passkeys` passes as `messages:read` and is then normalised into
 * `/citizen/passkeys` further down the stack. Case is preserved, because Spring routes
 * case-sensitively and the scope decision may not accept more than Spring will route.
 */
export function normalizeRequestPath(originalUrl: string): string | undefined {
  const rawPath = originalUrl.split('?')[0]?.split('#')[0] ?? ''
  let decoded: string
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    return undefined
  }
  // A backslash separates path segments on some stacks and not others; refuse to guess
  if (decoded.includes('\\') || decoded.includes('\0')) return undefined

  const segments: string[] = []
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return undefined
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `/${segments.join('/')}`
}

const REGEXP_METACHARACTERS = /[.*+?^${}()|[\]\\]/g

/** A path variable matches exactly one segment; everything else matches itself. */
const segmentPattern = (segment: string): string =>
  segment.startsWith('{') && segment.endsWith('}')
    ? '[^/]+'
    : segment.replace(REGEXP_METACHARACTERS, '\\$&')

/** Anchored, so a pattern matches its own endpoint and nothing longer or shorter. */
const pathPatternToRegExp = (pattern: string): RegExp =>
  new RegExp(`^${pattern.split('/').map(segmentPattern).join('/')}$`)

const allowlist: readonly {
  method: string
  scope: string
  pattern: RegExp
}[] = citizenApiScopeEndpoints.map((endpoint) => ({
  method: endpoint.method,
  scope: endpoint.scope,
  pattern: pathPatternToRegExp(endpoint.path)
}))

/** Anything the allowlist does not name is forbidden, including a path under a listed one. */
export function requiredScope(
  method: string,
  normalizedPath: string
): ScopeRequirement {
  const requestMethod = method.toUpperCase()
  const match = allowlist.find(
    (endpoint) =>
      endpoint.method === requestMethod && endpoint.pattern.test(normalizedPath)
  )
  return match ? { type: 'scope', scope: match.scope } : forbidden
}

/**
 * Reads `req.path`, so this must be mounted without a path prefix: `router.use('/citizen', …)` would
 * strip `/citizen` and make every citizen request look like it came from outside the citizen API.
 */
export function requiredScopeForRequest(
  req: express.Request
): ScopeRequirement {
  const path = normalizeRequestPath(req.path)
  if (path === undefined) return forbidden
  return requiredScope(req.method, path)
}

/** Lower-cased, because express routes `/CITIZEN/…` to the citizen proxy just the same. */
function isCitizenApiRequest(req: express.Request): boolean {
  return (
    normalizeRequestPath(req.path)?.toLowerCase().startsWith('/citizen/') ??
    false
  )
}

/**
 * When a request carries both a token and a session cookie the token wins: it must never be able to
 * borrow the higher trust level of a session that happens to be in the same browser.
 */
export async function citizenApiTokenAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  // Employee and mobile requests keep whatever authentication they already had, rather than being
  // answered as some citizen
  if (!isCitizenApiRequest(req)) return next()

  const token = bearerToken(req)
  if (!token) return next()

  if (!CITIZEN_API_TOKEN_PATTERN.test(token)) {
    res.status(401).send({ error: 'INVALID_TOKEN' })
    return
  }

  try {
    const identity = await citizenApiTokenLogin(req, token)
    if (!identity) {
      logAuditEvent(eventCode('auth_failed'), req, 'Unknown or expired token')
      res.status(401).send({ error: 'INVALID_TOKEN' })
      return
    }

    const user: EvakaSessionUser = {
      id: identity.personId,
      authType: 'citizen-api-token',
      userType: 'CITIZEN_WEAK'
    }
    req.user = user
    req.citizenApiToken = identity
    next()
  } catch (err) {
    next(err)
  }
}

/** Requests authenticated with a session cookie pass through untouched. */
export const requireCitizenApiTokenScope: express.RequestHandler = (
  req,
  res,
  next
) => {
  const identity = req.citizenApiToken
  if (!identity) return next()

  const required = requiredScopeForRequest(req)
  if (required.type === 'scope' && identity.scopes.includes(required.scope)) {
    return next()
  }

  const scope = required.type === 'scope' ? required.scope : undefined
  logWarn('API token request denied', req, {
    eventCode: eventCode('scope_denied'),
    tokenId: identity.tokenId,
    requiredScope: scope ?? 'none (endpoint is not exposed to tokens)'
  })
  res.status(403).send({ error: 'INSUFFICIENT_SCOPE', requiredScope: scope })
}
