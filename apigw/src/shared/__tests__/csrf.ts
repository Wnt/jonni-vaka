// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import type express from 'express'
import { describe, expect, it } from 'vitest'

import { csrf, InvalidAntiCsrfToken } from '../middleware/csrf.ts'

const VALID_TOKEN = `evaka_pat_${'a'.repeat(43)}`

function check(options: {
  method: string
  path: string
  authorization?: string
  csrfHeader?: boolean
}): Error | undefined {
  const headers: Record<string, string> = {}
  if (options.authorization) headers.authorization = options.authorization
  if (options.csrfHeader) headers['x-evaka-csrf'] = '1'
  const req = {
    method: options.method,
    path: options.path,
    header: (name: string) => headers[name.toLowerCase()]
  } as unknown as express.Request

  let error: Error | undefined
  csrf(
    req,
    {} as express.Response,
    ((err?: Error) => {
      error = err
    }) as express.NextFunction
  )
  return error
}

describe('csrf middleware', () => {
  it('requires the custom header on state-changing requests', () => {
    expect(
      check({ method: 'POST', path: '/citizen/reservations' })
    ).toBeInstanceOf(InvalidAntiCsrfToken)
    expect(
      check({
        method: 'POST',
        path: '/citizen/reservations',
        csrfHeader: true
      })
    ).toBeUndefined()
  })

  it('exempts a citizen API token, which no browser can be made to send cross-origin', () => {
    expect(
      check({
        method: 'POST',
        path: '/citizen/reservations',
        authorization: `Bearer ${VALID_TOKEN}`
      })
    ).toBeUndefined()
  })

  describe('the exemption is narrow', () => {
    // Widening it would let any request that merely carries some bearer-shaped header skip the
    // check, including a cookie-authenticated employee request.
    it('does not apply to employee paths', () => {
      expect(
        check({
          method: 'POST',
          path: '/employee/absences',
          authorization: `Bearer ${VALID_TOKEN}`
        })
      ).toBeInstanceOf(InvalidAntiCsrfToken)
    })

    it('does not apply to a bearer credential of some other shape', () => {
      expect(
        check({
          method: 'POST',
          path: '/citizen/reservations',
          authorization: 'Bearer some.other.jwt'
        })
      ).toBeInstanceOf(InvalidAntiCsrfToken)
    })

    it('does not apply to a non-bearer authorization header', () => {
      expect(
        check({
          method: 'POST',
          path: '/citizen/reservations',
          authorization: `Basic ${VALID_TOKEN}`
        })
      ).toBeInstanceOf(InvalidAntiCsrfToken)
    })
  })
})
