// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import http from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { describe, expect, it } from 'vitest'

import { createProxy } from '../proxy-utils.ts'

/**
 * Proxies one request through `createProxy` to a throwaway upstream and returns the headers that
 * upstream actually saw.
 */
async function forwardedHeaders(
  requestHeaders: Record<string, string>,
  decorate: express.RequestHandler = (_req, _res, next) => next()
): Promise<http.IncomingHttpHeaders> {
  let received: http.IncomingHttpHeaders | undefined
  const upstream = http.createServer((req, res) => {
    received = req.headers
    res.end()
  })
  upstream.listen(0)
  const upstreamPort = (upstream.address() as AddressInfo).port

  const app = express()
  app.use(decorate)
  app.use(
    createProxy({
      url: `http://localhost:${upstreamPort}`,
      getUserHeader: () => '{"type":"citizen_weak","id":"person-1"}'
    })
  )
  const gateway = app.listen(0)
  const gatewayPort = (gateway.address() as AddressInfo).port

  try {
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          port: gatewayPort,
          path: '/citizen/reservations',
          method: 'GET',
          headers: requestHeaders
        },
        (res) => {
          res.resume()
          res.on('end', resolve)
        }
      )
      req.on('error', reject)
      req.end()
    })
  } finally {
    gateway.close()
    upstream.close()
  }
  if (!received) throw new Error('upstream was not reached')
  return received
}

describe('createProxy', () => {
  it('does not forward credentials the gateway sets itself', async () => {
    const headers = await forwardedHeaders({
      authorization: 'Bearer something',
      'x-user': '{"type":"employee","id":"admin"}'
    })

    expect(headers.authorization).not.toBe('Bearer something')
    expect(headers['x-user']).toBe('{"type":"citizen_weak","id":"person-1"}')
  })

  it('does not forward a client-supplied API token id', async () => {
    // The service writes this into the `apiTokenId` MDC key, which is what an incident is traced
    // by, so a session user must not be able to attribute their requests to someone else's token
    const headers = await forwardedHeaders({
      'x-evaka-api-token-id': 'spoofed-token-id'
    })

    expect(headers['x-evaka-api-token-id']).toBeUndefined()
  })

  it('forwards the token id of the token the gateway authenticated', async () => {
    const headers = await forwardedHeaders(
      { 'x-evaka-api-token-id': 'spoofed-token-id' },
      (req, _res, next) => {
        req.citizenApiToken = {
          personId: 'person-1',
          tokenId: 'real-token-id',
          scopes: []
        }
        next()
      }
    )

    expect(headers['x-evaka-api-token-id']).toBe('real-token-id')
  })
})
