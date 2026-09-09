// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { request } from '@playwright/test'

import type { CitizenApiScope } from 'lib-common/generated/api-types/shared'
import HelsinkiDateTime from 'lib-common/helsinki-date-time'

import config from '../../config'
import { Fixture } from '../../dev-api/fixtures'
import {
  createCitizenApiToken,
  resetServiceState
} from '../../generated/api-clients'
import type { DevPerson } from '../../generated/api-types'
import CitizenPersonalDetailsPage, {
  CreateApiTokenModal,
  CreatedApiTokenModal,
  RevokeApiTokenModal
} from '../../pages/citizen/citizen-personal-details'
import { test, expect } from '../../playwright'
import type { Page } from '../../utils/page'
import { enduserLogin, enduserLoginWeak } from '../../utils/user'

const mockedTime = HelsinkiDateTime.of(2024, 1, 1, 12, 0)

test.use({
  evakaOptions: {
    mockedTime
  }
})

test.beforeEach(async () => {
  await resetServiceState()
})

async function openPersonalDetailsPage(page: Page, citizen: DevPerson) {
  await enduserLogin(page, citizen, '/personal-details')
  return new CitizenPersonalDetailsPage(page)
}

// Opens the create-token modal, names it, grants every read scope (the same
// button a citizen would click for a read-only integration), and returns the
// raw token shown exactly once on success.
async function createReadOnlyToken(page: Page, name: string): Promise<string> {
  const section = new CitizenPersonalDetailsPage(page).apiTokensSection
  await section.createToken.click()

  const createModal = new CreateApiTokenModal(page)
  await createModal.name.fill(name)
  await createModal.selectAllReadScopes.click()
  await createModal.ok.click()

  const createdModal = new CreatedApiTokenModal(page)
  const token = await createdModal.token.inputValue
  await createdModal.close.click()
  return token
}

/**
 * A path-variable value that cannot correspond to any real thread, child or attachment.
 *
 * Scope enforcement happens in the api-gw, *before* the request ever reaches the service, so a
 * request built around an id like this one answers only the question these tests ask -- "would
 * this be allowed at all?" -- with no side effect and no dependency on what the citizen fixture
 * actually owns.
 */
const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000000'

test.describe('Citizen API tokens', () => {
  test('a citizen can create a read-only api token through the UI', async ({
    evaka
  }) => {
    const citizen = await Fixture.person().saveAdult()
    const personalDetailsPage = await openPersonalDetailsPage(evaka, citizen)
    const section = personalDetailsPage.apiTokensSection

    const token = await createReadOnlyToken(evaka, 'My integration')

    expect(token).toMatch(/^evaka_pat_[A-Za-z0-9_-]{43}$/)
    await expect(section.tokens).toHaveCount(1)
    await expect(section.tokenName(0)).toHaveText('My integration')
  })

  test('the token expiry options are capped at 180 days', async ({ evaka }) => {
    const citizen = await Fixture.person().saveAdult()
    const personalDetailsPage = await openPersonalDetailsPage(evaka, citizen)
    await personalDetailsPage.apiTokensSection.createToken.click()

    // The server caps token lifetime at 180 days (MAX_API_TOKEN_LIFETIME), so no longer option
    // may be offered
    const createModal = new CreateApiTokenModal(evaka)
    await createModal.expiry.assertOptions([
      '30 päivää',
      '90 päivää',
      '180 päivää'
    ])
  })

  test('select-all-read-scopes checks every read scope and leaves the two write scopes unchecked', async ({
    evaka
  }) => {
    const citizen = await Fixture.person().saveAdult()
    const personalDetailsPage = await openPersonalDetailsPage(evaka, citizen)
    await personalDetailsPage.apiTokensSection.createToken.click()

    // One `data-qa="scope-${scope}"` checkbox per constant in the generated catalogue
    const createModal = new CreateApiTokenModal(evaka)
    await createModal.selectAllReadScopes.click()

    const readScopes: CitizenApiScope[] = [
      'PERSONAL_DATA_READ',
      'CHILDREN_READ',
      'CALENDAR_READ',
      'RESERVATIONS_READ',
      'ABSENCES_READ',
      'HOLIDAY_PERIODS_READ',
      'NOTIFICATIONS_READ',
      'MESSAGES_READ',
      'ATTACHMENTS_READ'
    ]
    for (const scope of readScopes) {
      await createModal.scope(scope).waitUntilChecked(true)
    }

    // MESSAGES_MARK_READ and NOTIFICATIONS_DISMISS are the only two scopes flagged as a write
    // in the catalogue -- "select all reads" must never tick them.
    await createModal.scope('MESSAGES_MARK_READ').waitUntilChecked(false)
    await createModal.scope('NOTIFICATIONS_DISMISS').waitUntilChecked(false)

    // The "custom" preset preselects nothing, which doubles as a way to clear a selection
    await createModal.preset('custom').click()
    for (const scope of [
      ...readScopes,
      'MESSAGES_MARK_READ',
      'NOTIFICATIONS_DISMISS'
    ] as CitizenApiScope[]) {
      await createModal.scope(scope).waitUntilChecked(false)
    }
  })

  test('the form opens with nothing preselected', async ({ evaka }) => {
    const citizen = await Fixture.person().saveAdult()
    const personalDetailsPage = await openPersonalDetailsPage(evaka, citizen)
    await personalDetailsPage.apiTokensSection.createToken.click()

    // "select all reads" is no longer the form's default -- opening the modal must not
    // preselect anything, CHILDREN_READ included
    const createModal = new CreateApiTokenModal(evaka)
    await createModal.scope('CHILDREN_READ').waitUntilChecked(false)
    await createModal.scope('PERSONAL_DATA_READ').waitUntilChecked(false)
  })

  test('the calendar and messages presets fill the checkboxes they cover, and stay editable', async ({
    evaka
  }) => {
    const citizen = await Fixture.person().saveAdult()
    const personalDetailsPage = await openPersonalDetailsPage(evaka, citizen)
    await personalDetailsPage.apiTokensSection.createToken.click()
    const createModal = new CreateApiTokenModal(evaka)

    await createModal.preset('calendar').click()
    for (const scope of [
      'CALENDAR_READ',
      'RESERVATIONS_READ',
      'HOLIDAY_PERIODS_READ',
      'NOTIFICATIONS_READ'
    ] as CitizenApiScope[]) {
      await createModal.scope(scope).waitUntilChecked(true)
    }
    await createModal.scope('CHILDREN_READ').waitUntilChecked(false)
    await createModal.scope('MESSAGES_READ').waitUntilChecked(false)
    // family-data alert fires from a preset selection the same way it would from a manual click
    await expect(
      createModal.findByDataQa('family-data-scopes-warning')
    ).toBeVisible()

    // A preset is a starting point, not a mode: the citizen can still add to it by hand
    await createModal.scope('PERSONAL_DATA_READ').check()
    await createModal.scope('PERSONAL_DATA_READ').waitUntilChecked(true)

    await createModal.preset('messages').click()
    await createModal.scope('MESSAGES_READ').waitUntilChecked(true)
    await createModal.scope('ATTACHMENTS_READ').waitUntilChecked(true)
    await createModal.scope('CALENDAR_READ').waitUntilChecked(false)
    // MESSAGES_READ shares family data too -- the warning stays up under this preset as well
    await expect(
      createModal.findByDataQa('family-data-scopes-warning')
    ).toBeVisible()
    // PERSONAL_DATA_READ was picked by hand under the calendar preset, not by any preset, so
    // switching to the messages preset replaces the whole selection and drops it again
    await createModal.scope('PERSONAL_DATA_READ').waitUntilChecked(false)

    await createModal.scope('MESSAGES_MARK_READ').check()
    await expect(
      createModal.findByDataQa('scope-MESSAGES_MARK_READ-warning')
    ).toBeVisible()
  })

  test('a token authenticates a granted read but not a write on the same resource', async ({
    evaka
  }) => {
    const citizen = await Fixture.person().saveAdult()
    await openPersonalDetailsPage(evaka, citizen)
    const token = await createReadOnlyToken(evaka, 'Read only')

    // A fresh request context, created with no relation to `evaka`'s browser context: reusing
    // `evaka.page.request` (or any locator/page-bound request helper) would carry the citizen's own
    // session cookie alongside the bearer token, and the session cookie alone would authenticate
    // the request. That would make every assertion below pass regardless of whether the token or
    // its scopes did anything at all, so the test has to rule the cookie out entirely.
    const api = await request.newContext()
    try {
      const read = await api.get(
        `${config.apiUrl}/citizen/messages/unread-count`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      expect(read.status()).toBe(200)

      // MESSAGES_MARK_READ was never granted -- select-all-read-scopes only grants the read
      // scopes, and mark-read is one of the two scopes flagged as a write in the catalogue -- so
      // marking a thread read on the very same messaging resource must be refused. The thread
      // does not need to exist: the scope check runs before the request ever reaches the
      // service.
      const write = await api.put(
        `${config.apiUrl}/citizen/messages/threads/${NONEXISTENT_ID}/read`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      expect(write.status()).toBe(403)
      expect(await write.json()).toMatchObject({
        error: 'INSUFFICIENT_SCOPE',
        requiredScope: 'MESSAGES_MARK_READ'
      })
    } finally {
      await api.dispose()
    }
  })

  test('credential endpoints are refused for a token, whatever it was granted', async ({
    evaka
  }) => {
    const citizen = await Fixture.person().saveAdult()
    await openPersonalDetailsPage(evaka, citizen)
    const token = await createReadOnlyToken(evaka, 'Every read scope')

    const api = await request.newContext()
    try {
      // Passkeys are how an account is taken over for good, so they are out of reach of every
      // token, no matter what was granted -- there is no scope that could make this a 200.
      const response = await api.get(`${config.apiUrl}/citizen/passkeys`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(response.status()).toBe(403)
    } finally {
      await api.dispose()
    }
  })

  test('the notification-settings endpoint distinguishes GET from PUT, because only GET is on the allowlist', async ({
    evaka
  }) => {
    const citizen = await Fixture.person().saveAdult()
    await openPersonalDetailsPage(evaka, citizen)
    const token = await createReadOnlyToken(evaka, 'Every read scope')

    const api = await request.newContext()
    try {
      // Reading notification settings is useful and harmless, so GET on this path is on the
      // allowlist under PERSONAL_DATA_READ...
      const read = await api.get(
        `${config.apiUrl}/citizen/personal-data/notification-settings`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      expect(read.status()).toBe(200)

      // ...but PUT on the exact same path is a separate allowlist entry, and no scope lists it,
      // so it is refused whatever the token was granted
      const write = await api.put(
        `${config.apiUrl}/citizen/personal-data/notification-settings`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: []
        }
      )
      expect(write.status()).toBe(403)
      expect(await write.json()).toMatchObject({ error: 'INSUFFICIENT_SCOPE' })
    } finally {
      await api.dispose()
    }
  })

  test('family and child image endpoints are refused outright, whatever scope was granted', async ({
    evaka
  }) => {
    const citizen = await Fixture.person().saveAdult()
    await openPersonalDetailsPage(evaka, citizen)
    const token = await createReadOnlyToken(evaka, 'Every read scope')

    // A family member's data and a child's photo are absent from the allowlist entirely, so this
    // is a property of the API rather than of the UI
    const api = await request.newContext()
    try {
      const family = await api.get(
        `${config.apiUrl}/citizen/personal-data/family`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      expect(family.status()).toBe(403)
      expect(await family.json()).toMatchObject({ error: 'INSUFFICIENT_SCOPE' })

      const childImage = await api.get(
        `${config.apiUrl}/citizen/child-images/${NONEXISTENT_ID}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      expect(childImage.status()).toBe(403)
      expect(await childImage.json()).toMatchObject({
        error: 'INSUFFICIENT_SCOPE'
      })
    } finally {
      await api.dispose()
    }
  })

  test('an endpoint under a listed prefix is refused unless it is itself on the allowlist', async ({
    evaka
  }) => {
    const citizen = await Fixture.person().saveAdult()
    await openPersonalDetailsPage(evaka, citizen)
    const token = await createReadOnlyToken(evaka, 'Every read scope')

    const api = await request.newContext()
    try {
      // CHILDREN_READ lists several endpoints under /citizen/children/{childId}/..., e.g.
      // .../service-needs and .../attendance-summary/{yearMonth}, plus the bare /citizen/children
      // list itself. GET /citizen/children needs no specific child to answer -- it just lists
      // whichever children this citizen is a guardian of -- so it succeeds even for a plain adult
      // fixture with none.
      const list = await api.get(`${config.apiUrl}/citizen/children`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(list.status()).toBe(200)

      // GET /citizen/children/{childId}/pedagogical-documents has the same path shape as the
      // listed .../service-needs endpoint but is not itself listed, so CHILDREN_READ does not
      // reach it. A nonexistent childId is fine: the scope check happens in the api-gw, before
      // the request reaches the service.
      const pedagogicalDocuments = await api.get(
        `${config.apiUrl}/citizen/children/${NONEXISTENT_ID}/pedagogical-documents`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      expect(pedagogicalDocuments.status()).toBe(403)
      expect(await pedagogicalDocuments.json()).toMatchObject({
        error: 'INSUFFICIENT_SCOPE'
      })
    } finally {
      await api.dispose()
    }
  })

  test('revoking a token through the UI invalidates it immediately', async ({
    evaka
  }) => {
    const citizen = await Fixture.person().saveAdult()
    const personalDetailsPage = await openPersonalDetailsPage(evaka, citizen)
    const section = personalDetailsPage.apiTokensSection
    const token = await createReadOnlyToken(evaka, 'To be revoked')

    const api = await request.newContext()
    try {
      const beforeRevoke = await api.get(
        `${config.apiUrl}/citizen/personal-data/email-verification`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      expect(beforeRevoke.status()).toBe(200)

      await section.revokeToken(0).click()
      await new RevokeApiTokenModal(evaka).ok.click()
      await expect(section.tokens).toHaveCount(0)

      const afterRevoke = await api.get(
        `${config.apiUrl}/citizen/personal-data/email-verification`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      expect(afterRevoke.status()).toBe(401)
    } finally {
      await api.dispose()
    }
  })

  test('a weakly authenticated citizen sees a prompt to log in again instead of the token list', async ({
    evaka
  }) => {
    const email = 'test@example.com'
    const password = 'aifiefaeC3io?dee'
    await Fixture.person({
      email,
      verifiedEmail: email
    }).saveAdult({
      updateMockVtjWithDependants: [],
      updateWeakCredentials: { username: email, password }
    })

    await enduserLoginWeak(evaka, { username: email, password })
    await evaka.goto(config.enduserUrl + '/personal-details')

    const section = new CitizenPersonalDetailsPage(evaka).apiTokensSection
    // Every api-token endpoint requires strong authentication, so a weak session cannot even list
    // the citizen's existing tokens -- it is offered a way to step up instead.
    await expect(section.loginPrompt).toBeVisible()
    await expect(section.createToken).toBeHidden()
  })

  // No `evaka` (or any other browser) fixture is requested here: this test proves the token works
  // purely through the dev API and a bare HTTP request, with no browser involved at all.
  test('a token created through the dev API works as a bearer without the UI ever being used', async () => {
    const citizen = await Fixture.person().saveAdult()
    const rawToken = `evaka_pat_${'A'.repeat(43)}`
    await createCitizenApiToken({
      id: citizen.id,
      body: {
        name: 'Inserted directly',
        token: rawToken,
        scopes: ['PERSONAL_DATA_READ'],
        expiresAt: mockedTime.addHours(24 * 30)
      }
    })

    const api = await request.newContext()
    try {
      const response = await api.get(
        `${config.apiUrl}/citizen/personal-data/email-verification`,
        { headers: { Authorization: `Bearer ${rawToken}` } }
      )
      expect(response.status()).toBe(200)
    } finally {
      await api.dispose()
    }
  })
})
