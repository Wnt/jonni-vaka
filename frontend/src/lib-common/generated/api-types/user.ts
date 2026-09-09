// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

// GENERATED FILE: no manual modifications

import type { CitizenApiScope } from './shared'
import type { CitizenApiTokenId } from './shared'
import type { CitizenPasskeyId } from './shared'
import type { EvakaUserId } from './shared'
import HelsinkiDateTime from '../../helsinki-date-time'
import type { JsonOf } from '../../json'

/**
* Generated from evaka.core.user.CitizenApiToken
*/
export interface CitizenApiToken {
  createdAt: HelsinkiDateTime
  expiresAt: HelsinkiDateTime
  id: CitizenApiTokenId
  lastUsedAt: HelsinkiDateTime | null
  name: string
  scopes: CitizenApiScope[]
}

/**
* Generated from evaka.core.user.CitizenPasskey
*/
export interface CitizenPasskey {
  agentName: string
  createdAt: HelsinkiDateTime
  deviceClass: DeviceClass
  id: CitizenPasskeyId
  lastUsedAt: HelsinkiDateTime | null
  name: string
  operatingSystemName: string
}

/**
* Generated from evaka.core.user.DeviceClass
*/
export type DeviceClass =
  | 'PHONE'
  | 'TABLET'
  | 'DESKTOP'
  | 'UNKNOWN'

/**
* Generated from evaka.core.user.EvakaUser
*/
export interface EvakaUser {
  id: EvakaUserId
  name: string
  type: EvakaUserType
}

/**
* Generated from evaka.core.user.EvakaUserType
*/
export type EvakaUserType =
  | 'SYSTEM'
  | 'CITIZEN'
  | 'EMPLOYEE'
  | 'MOBILE_DEVICE'
  | 'UNKNOWN'


export function deserializeJsonCitizenApiToken(json: JsonOf<CitizenApiToken>): CitizenApiToken {
  return {
    ...json,
    createdAt: HelsinkiDateTime.parseIso(json.createdAt),
    expiresAt: HelsinkiDateTime.parseIso(json.expiresAt),
    lastUsedAt: (json.lastUsedAt != null) ? HelsinkiDateTime.parseIso(json.lastUsedAt) : null
  }
}


export function deserializeJsonCitizenPasskey(json: JsonOf<CitizenPasskey>): CitizenPasskey {
  return {
    ...json,
    createdAt: HelsinkiDateTime.parseIso(json.createdAt),
    lastUsedAt: (json.lastUsedAt != null) ? HelsinkiDateTime.parseIso(json.lastUsedAt) : null
  }
}
