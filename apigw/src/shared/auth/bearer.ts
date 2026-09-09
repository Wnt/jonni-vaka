// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import type express from 'express'

/** Marks a token as an eVaka citizen API token, for log greppability and secret scanners. */
export const CITIZEN_API_TOKEN_PREFIX = 'evaka_pat_'

/** 256 bits of randomness, base64url-encoded and unpadded. */
export const CITIZEN_API_TOKEN_PATTERN = new RegExp(
  `^${CITIZEN_API_TOKEN_PREFIX}[A-Za-z0-9_-]{43}$`
)

export function bearerToken(req: express.Request): string | undefined {
  const header = req.header('authorization')
  if (!header) return undefined
  const [scheme, value] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !value) return undefined
  return value
}

/** Says nothing about whether the token is real: only the service can answer that. */
export function hasCitizenApiTokenShape(req: express.Request): boolean {
  const token = bearerToken(req)
  return token !== undefined && CITIZEN_API_TOKEN_PATTERN.test(token)
}
