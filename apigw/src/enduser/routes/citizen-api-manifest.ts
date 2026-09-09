// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import type express from 'express'

import { CITIZEN_API_TOKEN_PREFIX } from '../../shared/auth/bearer.ts'
import { appCommit } from '../../shared/config.ts'
import {
  citizenApiScopeEndpoints,
  citizenApiScopes,
  citizenEndpointScopes
} from '../generated/citizen-api-scopes.ts'

/**
 * What this instance's citizen API exposes and which eVaka version it is, so an integrator does not
 * have to guess: municipalities run different versions, and the citizen API is not a stable
 * contract. Unauthenticated because every field comes from the generated endpoint table, which is
 * public source code, and needing a token to read it would mean obtaining one before knowing what
 * to ask for.
 */
export const citizenApiManifest: express.RequestHandler = (_req, res) => {
  res.send({
    apiVersion: appCommit,
    tokenPrefix: CITIZEN_API_TOKEN_PREFIX,
    scopes: citizenApiScopes,
    scopeEndpoints: citizenApiScopeEndpoints,
    endpoints: citizenEndpointScopes
  })
}
