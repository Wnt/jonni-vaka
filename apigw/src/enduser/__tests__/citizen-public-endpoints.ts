// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CITIZEN_API_TOKEN_PREFIX } from '../../shared/auth/bearer.ts'
import { configFromEnv } from '../../shared/config.ts'
import { GatewayTester } from '../../shared/test/gateway-tester.ts'

/**
 * Public citizen endpoints require no authentication, so they are mounted ahead of the bearer-token
 * middleware and never reach the API token allowlist.
 *
 * This is mounting-order behaviour, so it is tested against a real gateway rather than by calling
 * the scope functions directly with paths the running gateway never produces.
 */
describe('public citizen endpoints and API tokens', () => {
  const publicPath = '/api/citizen/public/club-terms'
  const validToken = `${CITIZEN_API_TOKEN_PREFIX}${'a'.repeat(43)}`

  let tester: GatewayTester

  beforeEach(async () => {
    tester = await GatewayTester.start(configFromEnv(), 'citizen')
  })
  afterEach(async () => {
    await tester?.afterEach()
    await tester?.stop()
    nock.cleanAll()
  })

  const get = async (headers?: Record<string, string>) => {
    tester.nockScope.get('/citizen/public/club-terms').reply(200, [])
    return await tester.client.get(publicPath, {
      headers,
      validateStatus: () => true
    })
  }

  it('serves a public endpoint with no authentication at all', async () => {
    const res = await get()
    expect(res.status).toBe(200)
  })

  it('ignores a bearer token on a public endpoint rather than refusing it', async () => {
    // Nearly every HTTP client is written with a default Authorization header. If a token turned a
    // public endpoint into a 403, every integration would break on exactly the endpoints that are
    // public because they require nothing.
    const res = await get({ Authorization: `Bearer ${validToken}` })
    expect(res.status).toBe(200)
  })

  it('does not validate the token, so a malformed one is harmless here', async () => {
    // Reaching the token middleware at all would reject this before the proxy; reaching the
    // allowlist would reject it for having no scope. Neither may happen.
    const res = await get({ Authorization: 'Bearer not-an-evaka-token' })
    expect(res.status).toBe(200)
  })
})
