// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CITIZEN_API_TOKEN_PREFIX } from '../../shared/auth/bearer.ts'
import { appCommit, configFromEnv } from '../../shared/config.ts'
import { GatewayTester } from '../../shared/test/gateway-tester.ts'
import {
  citizenApiScopeEndpoints,
  citizenApiScopes,
  citizenEndpointScopes
} from '../generated/citizen-api-scopes.ts'

const MANIFEST_PATH = '/api/citizen/public/api-manifest'

const validToken = `${CITIZEN_API_TOKEN_PREFIX}${'a'.repeat(43)}`

interface Manifest {
  apiVersion: string
  tokenPrefix: string
  scopes: string[]
  scopeEndpoints: { scope: string; method: string; path: string }[]
  endpoints: { method: string; path: string; scope: string | null }[]
}

describe('citizen API manifest', () => {
  let tester: GatewayTester
  /** Every request that reached the service, so a test can assert that none did. */
  let serviceRequests: string[]

  beforeEach(async () => {
    tester = await GatewayTester.start(configFromEnv(), 'citizen')
    serviceRequests = []
    // Catch-all interceptors rather than none: an unmatched request would fail the test too, but
    // this says *which* call was made, which is the whole point of the assertion below
    for (const method of ['GET', 'POST']) {
      tester.nockScope
        .intercept(/.*/, method)
        .times(10)
        .reply(200, (uri: string) => {
          serviceRequests.push(`${method} ${uri}`)
          return {}
        })
    }
  })
  afterEach(async () => {
    await tester?.afterEach()
    await tester?.stop()
    nock.cleanAll()
  })

  const get = async (headers?: Record<string, string>) =>
    await tester.client.get<Manifest>(MANIFEST_PATH, {
      headers,
      validateStatus: () => true
    })

  it('answers an entirely unauthenticated request', async () => {
    // No session cookie, no token, no CSRF header: an integrator has to be able to find out what to
    // ask for before it has anything to ask with
    const res = await get()
    expect(res.status).toBe(200)
    expect(serviceRequests).toEqual([])
  })

  it('reports the version of eVaka this instance is running', async () => {
    // The same value /api/version reports, and the reason the endpoint exists: municipalities run
    // different versions and the citizen API is not a stable contract between them
    const res = await get()
    expect(res.data.apiVersion).toBe(appCommit)
  })

  it('describes the whole scope vocabulary of this version', async () => {
    const res = await get()
    expect(res.data.tokenPrefix).toBe(CITIZEN_API_TOKEN_PREFIX)
    expect(res.data.scopes).toEqual([...citizenApiScopes])
  })

  it('names the exact endpoints each scope covers', async () => {
    // An integrator has to be able to see what a scope actually grants before asking a citizen to
    // grant it, and to see that nothing else is reachable
    const res = await get()
    expect(res.data.scopeEndpoints).toEqual([...citizenApiScopeEndpoints])
    for (const endpoint of res.data.scopeEndpoints) {
      expect(res.data.scopes).toContain(endpoint.scope)
    }
  })

  it('lists every citizen endpoint the generated catalogue knows', async () => {
    const res = await get()
    expect(res.data.endpoints.length).toBe(citizenEndpointScopes.length)
    expect(res.data.endpoints).toEqual([...citizenEndpointScopes])
  })

  it('publishes the endpoints no token can reach, as an explicit null', async () => {
    // The unreachable ones are the more useful half of the table: an integrator can tell "this
    // instance is too old" apart from "that is deliberately not exposed" without asking anyone
    const res = await get()
    const unexposed = res.data.endpoints.filter(
      (endpoint) => endpoint.scope === null
    )
    expect(unexposed.length).toBeGreaterThan(0)
    expect(unexposed.map((endpoint) => endpoint.path)).toContain(
      '/citizen/personal-data/family'
    )
    expect(
      res.data.endpoints.filter((endpoint) => endpoint.scope !== null).length
    ).toBe(citizenApiScopeEndpoints.length)
  })

  it('serves a token-carrying request without asking the service about the token', async () => {
    // The manifest needs no authentication, so a request that happens to carry a token must not
    // cost a token-validation round-trip — nor be answered differently because of it
    const withToken = await get({ authorization: `Bearer ${validToken}` })
    expect(withToken.status).toBe(200)
    expect(serviceRequests).toEqual([])

    const withoutToken = await get()
    expect(withToken.data).toEqual(withoutToken.data)
  })

  it('is not proxied to the service, which knows nothing about it', async () => {
    await get()
    expect(serviceRequests).toEqual([])
  })
})
