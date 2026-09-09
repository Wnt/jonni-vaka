// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import http from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { describe, expect, it } from 'vitest'

import {
  normalizeRequestPath,
  requiredScope,
  requiredScopeForRequest,
  type ScopeRequirement
} from '../citizen-api-token.js'
import {
  citizenApiScopeEndpoints,
  citizenApiScopes,
  citizenEndpointScopes
} from '../generated/citizen-api-scopes.js'

const CHILD_ID = '6b0e35d7-1b3d-4a5f-9a1d-6a3f5e1f0c11'
const THREAD_ID = '9d3a1b52-0f8c-4f1e-9c2a-5c6d7e8f9a01'

describe('requiredScope', () => {
  it('grants a listed endpoint the scope that lists it', () => {
    expect(requiredScope('GET', '/citizen/calendar-events')).toEqual({
      type: 'scope',
      scope: 'CALENDAR_READ'
    })
    expect(
      requiredScope('GET', `/citizen/children/${CHILD_ID}/service-needs`)
    ).toEqual({ type: 'scope', scope: 'CHILDREN_READ' })
  })

  it('forbids everything the allowlist does not name', () => {
    expect(requiredScope('GET', '/citizen/decisions')).toEqual({
      type: 'forbidden'
    })
    expect(
      requiredScope('GET', '/citizen/an-endpoint-added-next-year')
    ).toEqual({ type: 'forbidden' })
  })

  it('forbids an endpoint whose action would refuse a token anyway', () => {
    // The first two check `READ_PLACEMENT`, which forbids weak login, and the third
    // `READ_DAILY_SERVICE_TIMES`, which has no default rules. A token is always a weakly
    // authenticated citizen, so listing any of them would grant a scope that only ever 403s.
    expect(
      requiredScope('GET', `/citizen/children/${CHILD_ID}/placements`)
    ).toEqual({ type: 'forbidden' })
    expect(
      requiredScope('GET', '/citizen/absence-application/application-possible')
    ).toEqual({ type: 'forbidden' })
    expect(
      requiredScope('GET', `/citizen/children/${CHILD_ID}/daily-service-times`)
    ).toEqual({ type: 'forbidden' })
  })

  it('treats the method as part of the entry', () => {
    expect(requiredScope('GET', '/citizen/reservations')).toEqual({
      type: 'scope',
      scope: 'RESERVATIONS_READ'
    })
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
      expect(requiredScope(method, '/citizen/reservations')).toEqual({
        type: 'forbidden'
      })
    }
  })

  it('accepts the method in any case, as HTTP allows', () => {
    expect(requiredScope('get', '/citizen/children')).toEqual({
      type: 'scope',
      scope: 'CHILDREN_READ'
    })
  })

  describe('a path variable matches exactly one segment', () => {
    it('matches a real id', () => {
      expect(
        requiredScope('GET', `/citizen/children/${CHILD_ID}/service-needs`)
      ).toEqual({ type: 'scope', scope: 'CHILDREN_READ' })
      expect(
        requiredScope(
          'GET',
          `/citizen/children/${CHILD_ID}/attendance-summary/2026-09`
        )
      ).toEqual({ type: 'scope', scope: 'CHILDREN_READ' })
      expect(
        requiredScope(
          'GET',
          `/citizen/attachments/${CHILD_ID}/download/liite.pdf`
        )
      ).toEqual({ type: 'scope', scope: 'ATTACHMENTS_READ' })
    })

    it('never spans a separator', () => {
      // Otherwise one entry would quietly cover a whole subtree, which is the failure the
      // allowlist exists to prevent
      expect(
        requiredScope('GET', '/citizen/children/a/b/service-needs')
      ).toEqual({ type: 'forbidden' })
    })

    it('does not match an empty segment', () => {
      expect(requiredScope('GET', '/citizen/children//service-needs')).toEqual({
        type: 'forbidden'
      })
    })

    it('matches a filename with a dot, which is a regex metacharacter', () => {
      // The pattern is compiled to a regex, so a literal `.` must not become "any character"
      expect(
        requiredScope('GET', `/citizen/attachments/${CHILD_ID}/download/a.pdf`)
      ).toEqual({ type: 'scope', scope: 'ATTACHMENTS_READ' })
      expect(requiredScope('GET', '/citizen/calendar-eventsX')).toEqual({
        type: 'forbidden'
      })
    })
  })

  describe('a longer path under a listed one is not covered by it', () => {
    it.each([
      ['GET', '/citizen/children/anything'],
      ['GET', '/citizen/messages/received/anything'],
      ['GET', '/citizen/units/anything'],
      ['GET', '/citizen/reservations/anything'],
      ['POST', `/citizen/children/${CHILD_ID}/placements/terminate`],
      ['POST', '/citizen/preschool-operational-dates/something-else'],
      ['GET', '/citizen/holiday-period/questionnaire/anything']
    ])('%s %s is forbidden', (method, path) => {
      expect(requiredScope(method, path)).toEqual({ type: 'forbidden' })
    })

    it('does not sweep in a sibling that merely starts the same way', () => {
      expect(requiredScope('GET', '/citizen/children-of-someone-else')).toEqual(
        { type: 'forbidden' }
      )
    })
  })

  describe('every excluded resource is genuinely unreachable', () => {
    // Named one by one: "we did not list it" is the argument the privacy assessment rests on, and
    // it should fail loudly if any of these is ever quietly added
    it.each([
      // applications and the decisions that follow from them
      ['GET', '/citizen/applications/by-guardian'],
      ['POST', '/citizen/applications'],
      ['GET', '/citizen/service-applications'],
      ['GET', '/citizen/decisions'],
      ['GET', '/citizen/decisions/pending'],
      ['GET', `/citizen/fee-decisions/${CHILD_ID}/download`],
      ['GET', '/citizen/finance-decisions/by-liable-citizen'],
      ['GET', `/citizen/voucher-value-decisions/${CHILD_ID}/download`],
      // income
      ['GET', '/citizen/income/expiring'],
      ['GET', '/citizen/income-statements'],
      ['GET', '/citizen/income-statements/children'],
      ['GET', '/citizen/income-statements/partner'],
      // a child's documents: their contents, and the listing that names their templates
      ['GET', '/citizen/child-documents'],
      ['GET', '/citizen/child-documents/unanswered'],
      ['GET', `/citizen/child-documents/${CHILD_ID}`],
      ['GET', `/citizen/child-documents/${CHILD_ID}/pdf`],
      ['GET', `/citizen/children/${CHILD_ID}/pedagogical-documents`],
      ['POST', `/citizen/pedagogical-documents/${CHILD_ID}/mark-read`],
      // case handling history
      ['GET', `/citizen/process-metadata/applications/${CHILD_ID}`],
      // other people's data
      ['GET', '/citizen/personal-data/family'],
      ['GET', `/citizen/child-images/${CHILD_ID}`],
      // the credentials guarding the account itself
      ['GET', '/citizen/passkeys'],
      ['POST', '/citizen/passkeys/register'],
      ['DELETE', `/citizen/passkeys/${CHILD_ID}`],
      ['PUT', '/citizen/personal-data/weak-login-credentials'],
      ['DELETE', '/citizen/personal-data/weak-login-credentials'],
      ['GET', '/citizen/api-tokens'],
      ['POST', '/citizen/api-tokens'],
      ['DELETE', `/citizen/api-tokens/${CHILD_ID}`],
      ['GET', '/citizen/auth/status'],
      ['POST', '/citizen/auth/weak-login'],
      ['GET', '/citizen/auth/logout'],
      // changing the citizen's own settings
      ['PUT', '/citizen/personal-data'],
      ['PUT', '/citizen/personal-data/notification-settings'],
      ['PUT', '/citizen/personal-data/preferred-ui-language'],
      ['POST', '/citizen/personal-data/email-verification'],
      // every remaining write
      ['POST', '/citizen/reservations'],
      ['POST', '/citizen/absences'],
      ['POST', '/citizen/absence-application'],
      ['DELETE', `/citizen/absence-application/${CHILD_ID}`],
      [
        'POST',
        `/citizen/holiday-period/questionnaire/fixed-period/${CHILD_ID}`
      ],
      ['POST', '/citizen/calendar-event/reservation'],
      ['DELETE', '/citizen/calendar-event/reservation'],
      ['POST', '/citizen/messages'],
      ['POST', `/citizen/messages/reply-to/${THREAD_ID}`],
      ['PUT', `/citizen/messages/threads/${THREAD_ID}/archive`],
      ['POST', '/citizen/attachments/messages'],
      ['DELETE', `/citizen/attachments/${CHILD_ID}`]
    ])('%s %s is forbidden', (method, path) => {
      expect(requiredScope(method, path)).toEqual({ type: 'forbidden' })
    })
  })

  it('marks a thread read but does not archive it', () => {
    // Two endpoints one segment apart, which is exactly the neighbour a prefix rule would sweep in
    expect(
      requiredScope('PUT', `/citizen/messages/threads/${THREAD_ID}/read`)
    ).toEqual({ type: 'scope', scope: 'MESSAGES_MARK_READ' })
    expect(
      requiredScope('PUT', `/citizen/messages/threads/${THREAD_ID}/archive`)
    ).toEqual({ type: 'forbidden' })
  })

  it('forbids the path that ends in read but marks a message unread', () => {
    // Its handler clears `read_at`, so `MESSAGES_MARK_READ` would grant the opposite direction too
    expect(
      requiredScope(
        'PUT',
        `/citizen/messages/threads/${THREAD_ID}/last-received-message/read`
      )
    ).toEqual({ type: 'forbidden' })
  })

  it('exposes unread counts but not the listing that names documents', () => {
    // Counts and identities yes, document types and content no
    expect(
      requiredScope('GET', '/citizen/child-documents/unread-count')
    ).toEqual({ type: 'scope', scope: 'NOTIFICATIONS_READ' })
    expect(
      requiredScope('GET', '/citizen/pedagogical-documents/unread-count')
    ).toEqual({ type: 'scope', scope: 'NOTIFICATIONS_READ' })
    expect(requiredScope('GET', '/citizen/child-documents/unanswered')).toEqual(
      {
        type: 'forbidden'
      }
    )
  })

  it('charges a query-shaped POST to the read scope that lists it', () => {
    // The endpoint uses POST because the query does not fit in a URL
    expect(
      requiredScope('POST', '/citizen/preschool-operational-dates')
    ).toEqual({ type: 'scope', scope: 'CALENDAR_READ' })
  })

  describe('nothing outside the citizen API is reachable', () => {
    it.each([
      ['GET', '/employee/daycares'],
      ['GET', '/employee-mobile/units'],
      ['GET', `/system/citizen/${CHILD_ID}`],
      ['POST', '/integration/titania/working-time-events'],
      ['GET', '/health'],
      ['GET', '/citizen/'],
      // A public endpoint needs no authentication, so it does not need to be listed either. A
      // request that carries a token nevertheless gets the same answer as everything unlisted.
      ['GET', '/citizen/public/club-terms']
    ])('%s %s is forbidden', (method, path) => {
      expect(requiredScope(method, path)).toEqual({ type: 'forbidden' })
    })
  })

  it('only ever names scopes the catalogue can grant', () => {
    for (const endpoint of citizenApiScopeEndpoints) {
      expect(citizenApiScopes).toContain(endpoint.scope)
    }
  })
})

/**
 * The centrepiece of the whole design: the gateway resolves a request against the generated
 * allowlist, and the service decides the same thing from the table the allowlist was generated
 * from. The two disagreeing is the failure this arrangement depends on not happening.
 *
 * Walking the generated audit table checks every endpoint that actually exists — the exposed ones
 * and, just as importantly, the unexposed ones — rather than the handful anybody thought to write
 * a case for.
 */
describe('the gateway resolves what the service assigned', () => {
  /** A requirement as one comparable word: a scope always contains `:`, `forbidden` never does. */
  const asWord = (required: ScopeRequirement): string =>
    required.type === 'scope' ? required.scope : required.type

  it('agrees with the generated audit table on every citizen endpoint', () => {
    const disagreements = citizenEndpointScopes.flatMap((endpoint) => {
      // A null scope means no token can reach the endpoint, whatever it was granted
      const expected = endpoint.scope ?? 'forbidden'
      const actual = asWord(requiredScope(endpoint.method, endpoint.path))
      return actual === expected
        ? []
        : [
            `${endpoint.method} ${endpoint.path}: gateway says ${actual}, service says ${expected}`
          ]
    })
    expect(disagreements).toEqual([])
  })

  it('checks a table that is actually populated', () => {
    // Guards the test above against passing because the catalogue failed to generate
    expect(citizenEndpointScopes.length).toBeGreaterThan(50)
    expect(citizenApiScopeEndpoints.length).toBeGreaterThan(10)
  })

  it('leaves most of the citizen API unexposed, and says so', () => {
    // The shape of the result, not just its consistency: if a change ever exposed the whole API
    // again, the cross-check above would still pass while this fails
    const exposed = citizenEndpointScopes.filter(
      (endpoint) => endpoint.scope !== null
    )
    expect(exposed.length).toBe(citizenApiScopeEndpoints.length)
    expect(exposed.length).toBeLessThan(citizenEndpointScopes.length / 2)
  })

  it('decides on the same spelling a live request arrives with', () => {
    // Matching is case-sensitive on both sides, so a catalogue path is reachable only when it is
    // spelled exactly as the controller spells it, and every eVaka path is lower-case. Path
    // variables are exempt, because nothing matches on them.
    const mixedCase = citizenApiScopeEndpoints
      .flatMap((endpoint) => endpoint.path.split('/'))
      .filter((segment) => !(segment.startsWith('{') && segment.endsWith('}')))
      .filter((segment) => segment !== segment.toLowerCase())
    expect(mixedCase).toEqual([])
  })
})

describe('normalizeRequestPath', () => {
  it('strips the query string and fragment', () => {
    expect(normalizeRequestPath('/citizen/messages?foo=bar')).toBe(
      '/citizen/messages'
    )
    expect(normalizeRequestPath('/citizen/messages#frag')).toBe(
      '/citizen/messages'
    )
  })

  it('resolves traversal the way the backend will', () => {
    // Left as written, this would be charged to `CALENDAR_READ` here and then normalised into
    // /citizen/passkeys by the servlet container downstream
    expect(normalizeRequestPath('/citizen/calendar-events/../passkeys')).toBe(
      '/citizen/passkeys'
    )
    expect(normalizeRequestPath('/citizen/./messages')).toBe(
      '/citizen/messages'
    )
  })

  it('resolves traversal hidden in percent-encoding', () => {
    expect(normalizeRequestPath('/citizen/messages/%2e%2e/passkeys')).toBe(
      '/citizen/passkeys'
    )
    expect(normalizeRequestPath('/citizen/messages%2F..%2Fpasskeys')).toBe(
      '/citizen/passkeys'
    )
  })

  it('collapses duplicate slashes', () => {
    expect(normalizeRequestPath('/citizen//passkeys')).toBe('/citizen/passkeys')
  })

  it('preserves case, because Spring routes case-sensitively', () => {
    // Lower-casing here would let the gateway resolve a scope for a path Spring routes somewhere
    // else entirely, which is the one thing the two matchers may not disagree about
    expect(normalizeRequestPath('/citizen/PASSKEYS/abc')).toBe(
      '/citizen/PASSKEYS/abc'
    )
    expect(normalizeRequestPath('/CITIZEN/passkeys')).toBe('/CITIZEN/passkeys')
  })

  it('refuses anything it cannot normalise with confidence', () => {
    expect(normalizeRequestPath('/citizen/%zz')).toBeUndefined()
    expect(
      normalizeRequestPath('/citizen/messages\\..\\passkeys')
    ).toBeUndefined()
    expect(normalizeRequestPath('/../etc/passwd')).toBeUndefined()
  })
})

describe('requiredScopeForRequest', () => {
  // requiredScope works on the full path, but express strips the mount prefix from req.path inside
  // a router.use('/citizen', ...) handler. Reading req.path there would make every token request
  // look like it was outside the citizen API.
  const scopeFor = async (
    target: string,
    method: 'get' | 'delete' | 'put' | 'post' = 'get'
  ): Promise<{
    mounted: ScopeRequirement
    observed: Record<string, string>
  }> => {
    const app = express()
    const router = express.Router()
    let captured: {
      mounted: ScopeRequirement
      observed: Record<string, string>
    } | null = null
    // Mounted exactly as app.ts mounts it: no path prefix, on a router that is itself under /api
    router.use((req, _res, next) => {
      captured = {
        mounted: requiredScopeForRequest(req),
        observed: {
          path: req.path,
          baseUrl: req.baseUrl,
          originalUrl: req.originalUrl
        }
      }
      next()
    })
    router.all('/citizen/{*rest}', (_req, res) => res.sendStatus(200))
    app.use('/api/', router)

    const server = app.listen(0)
    try {
      const { port } = server.address() as AddressInfo
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          { port, path: `/api${target}`, method: method.toUpperCase() },
          (res) => {
            res.resume()
            res.on('end', resolve)
          }
        )
        req.on('error', reject)
        req.end()
      })
    } finally {
      server.close()
    }
    if (!captured) throw new Error('middleware did not run')
    return captured
  }

  it('sees the citizen path, with neither the /api mount nor a stripped prefix', async () => {
    const { mounted, observed } = await scopeFor('/citizen/calendar-events')
    expect(observed.path).toBe('/citizen/calendar-events')
    expect(observed.baseUrl).toBe('/api')
    expect(observed.originalUrl).toBe('/api/citizen/calendar-events')
    expect(mounted).toEqual({ type: 'scope', scope: 'CALENDAR_READ' })
  })

  it('charges a traversal attempt to the endpoint it actually reaches', async () => {
    const { mounted } = await scopeFor('/citizen/calendar-events/../passkeys')
    expect(mounted).toEqual({ type: 'forbidden' })
  })

  it('charges an encoded traversal attempt to the endpoint it actually reaches', async () => {
    const { mounted } = await scopeFor(
      '/citizen/calendar-events/%2e%2e/passkeys'
    )
    expect(mounted).toEqual({ type: 'forbidden' })
  })

  it('does not let a change of case reach an unlisted endpoint', async () => {
    // express matches routes case-insensitively, so /citizen/PASSKEYS/x hits the passkey handler
    const { mounted } = await scopeFor('/citizen/PASSKEYS/abc', 'delete')
    expect(mounted).toEqual({ type: 'forbidden' })
  })

  it('does not grant a scope for a spelling Spring would route elsewhere', async () => {
    // Spring maps `/citizen/child-documents/unread-count` but not its upper-case spelling, which
    // it routes to `/citizen/child-documents/{documentId}` instead. Granting `NOTIFICATIONS_READ`
    // here would be the gateway accepting more than the service will route.
    const { mounted } = await scopeFor('/citizen/child-documents/UNREAD-COUNT')
    expect(mounted).toEqual({ type: 'forbidden' })
    expect(
      requiredScope('GET', '/citizen/child-documents/UNREAD-COUNT')
    ).toEqual({ type: 'forbidden' })
  })

  it('matches a live request that carries a real id', async () => {
    const { mounted } = await scopeFor(
      `/citizen/children/${CHILD_ID}/service-needs`
    )
    expect(mounted).toEqual({ type: 'scope', scope: 'CHILDREN_READ' })
  })

  it('does not let a traversal reach a listed endpoint under a different scope', async () => {
    // The allowlist is matched on the normalised path, so a path written to look like one endpoint
    // and resolve to another is charged to the one it resolves to
    const { mounted } = await scopeFor('/citizen/messages/../calendar-events')
    expect(mounted).toEqual({ type: 'scope', scope: 'CALENDAR_READ' })
  })

  it('ignores the query string when deciding the scope', async () => {
    const { mounted } = await scopeFor('/citizen/messages/received?page=2')
    expect(mounted).toEqual({ type: 'scope', scope: 'MESSAGES_READ' })
  })
})
