// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import type express from 'express'

import { hasCitizenApiTokenShape } from '../auth/bearer.ts'

const requiresCsrfCheck = (req: express.Request) => {
  // A citizen API token is sent by a program, with no cookie to ride on. The exemption is narrow —
  // a well-formed eVaka token on a citizen path — so that it cannot strip CSRF protection from a
  // cookie-authenticated request that merely carries some other bearer header.
  if (req.path.startsWith('/citizen/') && hasCitizenApiTokenShape(req)) {
    return false
  }

  switch (req.method) {
    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
      return false
    default:
      return true
  }
}

export class InvalidAntiCsrfToken extends Error {
  constructor() {
    super('Invalid anti-CSRF token')
    this.name = 'InvalidAntiCsrfToken'
  }
}

// Middleware that does CSRF header checks
export const csrf: express.RequestHandler = (req, res, next) => {
  if (requiresCsrfCheck(req)) {
    // For APIs that don't use traditional HTML forms, it's enough to check the existence of a custom header
    // Reference: OWASP  Cross-Site Request Forgery Prevention - Employing Custom Request Headers for AJAX/API
    // https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#employing-custom-request-headers-for-ajaxapi
    const header = req.header('x-evaka-csrf')
    if (!header) return next(new InvalidAntiCsrfToken())
  }
  next()
}
