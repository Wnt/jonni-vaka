// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useCallback, useState } from 'react'
import styled from 'styled-components'

import { string } from 'lib-common/form/fields'
import { object, oneOf, required, validated, value } from 'lib-common/form/form'
import { useBoolean, useForm, useFormFields } from 'lib-common/form/hooks'
import { nonBlank } from 'lib-common/form/validators'
import type { CitizenApiScope } from 'lib-common/generated/api-types/shared'
import { citizenApiScopes } from 'lib-common/generated/api-types/shared'
import type { CitizenApiToken } from 'lib-common/generated/api-types/user'
import HelsinkiDateTime from 'lib-common/helsinki-date-time'
import {
  constantQuery,
  useMutationResult,
  useQueryResult
} from 'lib-common/query'
import { Button } from 'lib-components/atoms/buttons/Button'
import { IconOnlyButton } from 'lib-components/atoms/buttons/IconOnlyButton'
import { SelectF } from 'lib-components/atoms/dropdowns/Select'
import Checkbox from 'lib-components/atoms/form/Checkbox'
import { InputFieldF } from 'lib-components/atoms/form/InputField'
import {
  FixedSpaceColumn,
  FixedSpaceRow
} from 'lib-components/layout/flex-helpers'
import { AlertBox, InfoBox } from 'lib-components/molecules/MessageBoxes'
import BaseModal, {
  ModalButtons
} from 'lib-components/molecules/modals/BaseModal'
import {
  AsyncFormModal,
  MutateFormModal
} from 'lib-components/molecules/modals/FormModal'
import { InformationText, Label, LabelLike, P } from 'lib-components/typography'
import { defaultMargins } from 'lib-components/white-space'
import {
  faCopy,
  faExclamationTriangle,
  faKey,
  faLockAlt,
  faPlus,
  faTrash
} from 'lib-icons'

import ModalAccessibilityWrapper from '../ModalAccessibilityWrapper'
import { renderResult } from '../async-rendering'
import type { User } from '../auth/state'
import { useTranslation } from '../localization'
import { getStrongLoginUri } from '../navigation/const'

import { SectionTitle } from './components'
import {
  apiTokensQuery,
  createApiTokenMutation,
  revokeApiTokenMutation
} from './queries'

/** Kept in sync with MAX_API_TOKENS_PER_CITIZEN in the service */
const maxApiTokens = 10

/** What granting a scope costs the citizen, beyond the data it names. */
interface ScopeConsequences {
  /** The application can change something, not only read. */
  isWrite: boolean
  /**
   * The data behind this scope can concern a guardian other than the citizen themselves, e.g. a
   * shared message thread, or something another guardian wrote or did.
   */
  sharesFamilyData: boolean
  /**
   * Granting it removes a signal the citizen relies on, e.g. the unread badge and email that a
   * read message would otherwise still trigger.
   */
  silencesNotification: boolean
}

const readOnly: ScopeConsequences = {
  isWrite: false,
  sharesFamilyData: false,
  silencesNotification: false
}
const familyReadOnly: ScopeConsequences = {
  ...readOnly,
  sharesFamilyData: true
}
const acknowledgement: ScopeConsequences = { ...readOnly, isWrite: true }

/**
 * Keyed by the generated catalogue, so a scope added to the backend allowlist does not compile
 * here until somebody has said what granting it means.
 */
const scopeConsequences: Record<CitizenApiScope, ScopeConsequences> = {
  PERSONAL_DATA_READ: readOnly,
  CHILDREN_READ: readOnly,
  CALENDAR_READ: familyReadOnly,
  RESERVATIONS_READ: familyReadOnly,
  ABSENCES_READ: familyReadOnly,
  HOLIDAY_PERIODS_READ: familyReadOnly,
  NOTIFICATIONS_READ: readOnly,
  NOTIFICATIONS_DISMISS: acknowledgement,
  MESSAGES_READ: familyReadOnly,
  MESSAGES_MARK_READ: { ...acknowledgement, silencesNotification: true },
  ATTACHMENTS_READ: readOnly
}

/** What the "select all reads" affordance selects. No longer the form's default. */
const allReadScopes: CitizenApiScope[] = citizenApiScopes.filter(
  (scope) => !scopeConsequences[scope].isWrite
)

type ApiTokenPresetKey = 'calendar' | 'messages' | 'custom'

/**
 * Starting points offered in the create-token form. "custom" preselects nothing.
 *
 * Neither preset grants CHILDREN_READ: RESERVATIONS_READ already returns each child's name
 * (ReservationChild), which is also how calendar events and holiday periods get a name for the
 * childId they carry, and MESSAGES_READ returns names directly on the thread (MessageChild).
 */
const apiTokenPresets: readonly {
  key: ApiTokenPresetKey
  scopes: CitizenApiScope[]
}[] = [
  {
    key: 'calendar',
    scopes: [
      'CALENDAR_READ',
      'RESERVATIONS_READ',
      'HOLIDAY_PERIODS_READ',
      'NOTIFICATIONS_READ'
    ]
  },
  { key: 'messages', scopes: ['MESSAGES_READ', 'ATTACHMENTS_READ'] },
  { key: 'custom', scopes: [] }
]

/** Kept in sync with MAX_API_TOKEN_LIFETIME in the service */
const expiryOptions = [
  { days: 30, labelKey: 'days30' },
  { days: 90, labelKey: 'days90' },
  { days: 180, labelKey: 'days180' }
] as const

export default React.memo(function ApiTokensSection({ user }: { user: User }) {
  const i18n = useTranslation()
  const t = i18n.personalDetails.apiTokensSection

  // Every api-token endpoint requires strong authentication, so a weakly
  // authenticated citizen cannot even list their tokens.
  const canManage = user.authLevel === 'STRONG'
  const tokens = useQueryResult(
    canManage ? apiTokensQuery() : constantQuery<CitizenApiToken[]>([])
  )

  const [creating, { on: startCreating, off: stopCreating }] = useBoolean(false)
  const [tokenToRevoke, setTokenToRevoke] = useState<CitizenApiToken | null>(
    null
  )
  // The raw token only ever lives here, in the state of a mounted component.
  // Navigating away or reloading loses it for good, which is the point.
  const [createdToken, setCreatedToken] = useState<string | null>(null)

  const navigateToLogin = useCallback(
    () => window.location.replace(getStrongLoginUri()),
    []
  )

  return (
    <div data-qa="api-tokens-section">
      <SectionTitle>{t.title}</SectionTitle>
      <P>{t.description}</P>
      {!canManage ? (
        <Button
          appearance="inline"
          icon={faLockAlt}
          text={t.strongAuthRequired}
          onClick={navigateToLogin}
          data-qa="api-tokens-login"
        />
      ) : (
        renderResult(tokens, (tokens) => (
          <FixedSpaceColumn $spacing="s">
            <div>
              <Button
                appearance="inline"
                icon={faPlus}
                text={t.createToken}
                onClick={startCreating}
                disabled={tokens.length >= maxApiTokens}
                data-qa="create-api-token"
              />
            </div>
            {tokens.length >= maxApiTokens && (
              <AlertBox
                message={t.limitReached(maxApiTokens)}
                data-qa="api-token-limit"
              />
            )}
            {tokens.length === 0 ? (
              <InfoBox message={t.empty} data-qa="api-tokens-empty" />
            ) : (
              <FixedSpaceColumn $spacing="xs">
                {tokens.map((token) => (
                  <ApiTokenRow
                    key={token.id}
                    token={token}
                    onRevoke={() => setTokenToRevoke(token)}
                  />
                ))}
              </FixedSpaceColumn>
            )}
          </FixedSpaceColumn>
        ))
      )}
      <ModalAccessibilityWrapper>
        {creating && (
          <CreateApiTokenModal
            onClose={stopCreating}
            onCreated={(token) => {
              stopCreating()
              setCreatedToken(token)
            }}
          />
        )}
        {createdToken !== null && (
          <CreatedApiTokenModal
            token={createdToken}
            onClose={() => setCreatedToken(null)}
          />
        )}
        {tokenToRevoke !== null && (
          <MutateFormModal
            data-qa="revoke-api-token-modal"
            type="danger"
            title={t.revokeConfirmTitle}
            text={t.revokeConfirmText(tokenToRevoke.name)}
            icon={faTrash}
            resolveLabel={t.revoke}
            resolveDanger
            rejectLabel={i18n.common.cancel}
            resolveMutation={revokeApiTokenMutation}
            resolveAction={() => ({ id: tokenToRevoke.id })}
            rejectAction={() => setTokenToRevoke(null)}
            onSuccess={() => setTokenToRevoke(null)}
          />
        )}
      </ModalAccessibilityWrapper>
    </div>
  )
})

const ApiTokenRow = React.memo(function ApiTokenRow({
  token,
  onRevoke
}: {
  token: CitizenApiToken
  onRevoke: () => void
}) {
  const i18n = useTranslation()
  const t = i18n.personalDetails.apiTokensSection
  const expired = token.expiresAt.isEqualOrBefore(HelsinkiDateTime.now())

  return (
    <CardFrame data-qa="api-token">
      <CardIcon>
        <FontAwesomeIcon icon={faKey} />
      </CardIcon>
      <CardContent>
        <FixedSpaceColumn $spacing="xxs">
          <NameRow>
            <TokenName data-qa="api-token-name">{token.name}</TokenName>
            <IconOnlyButton
              icon={faTrash}
              aria-label={t.revoke}
              onClick={onRevoke}
              data-qa="revoke-api-token"
            />
          </NameRow>
          <ScopeList scopes={token.scopes} />
          <DetailLines>
            <InformationText data-qa="api-token-created">
              {t.created}: {token.createdAt.toLocalDate().format()}
            </InformationText>
            <InformationText data-qa="api-token-expires">
              {expired ? t.expired : t.expires}:{' '}
              {token.expiresAt.toLocalDate().format()}
            </InformationText>
            <InformationText data-qa="api-token-last-used">
              {t.lastUsed}: {token.lastUsedAt?.format() ?? t.neverUsed}
            </InformationText>
          </DetailLines>
        </FixedSpaceColumn>
      </CardContent>
    </CardFrame>
  )
})

const ScopeList = React.memo(function ScopeList({
  scopes
}: {
  scopes: CitizenApiScope[]
}) {
  const t = useTranslation().personalDetails.apiTokensSection
  return (
    <div data-qa="api-token-scopes">
      <InformationText>{t.permissions}:</InformationText>
      <ScopeItems>
        {scopes.map((scope) => {
          const { isWrite } = scopeConsequences[scope]
          return (
            <li key={scope} data-qa={`api-token-scope-${scope}`}>
              {t.scopes[scope]}{' '}
              <ScopeAccess $write={isWrite}>
                ({isWrite ? t.access.write : t.access.read})
              </ScopeAccess>
            </li>
          )
        })}
      </ScopeItems>
    </div>
  )
})

const createApiTokenForm = object({
  name: validated(required(string()), nonBlank),
  expiresInDays: required(oneOf<number>()),
  scopes: value<CitizenApiScope[]>()
})

const CreateApiTokenModal = React.memo(function CreateApiTokenModal({
  onClose,
  onCreated
}: {
  onClose: () => void
  onCreated: (token: string) => void
}) {
  const i18n = useTranslation()
  const t = i18n.personalDetails.apiTokensSection
  const tc = t.createModal

  const form = useForm(
    createApiTokenForm,
    () => ({
      name: '',
      expiresInDays: {
        domValue: '90',
        options: expiryOptions.map(({ days, labelKey }) => ({
          domValue: String(days),
          value: days,
          label: tc.expiryOptions[labelKey]
        }))
      },
      // No preset is preselected: the citizen picks a starting point, or builds one from scratch
      scopes: []
    }),
    i18n.validationErrors
  )
  const { name, expiresInDays, scopes } = useFormFields(form)

  const { mutateAsync: createApiToken, reset: resetMutation } =
    useMutationResult(createApiTokenMutation)

  const hasWriteScopes = scopes.state.some((s) => scopeConsequences[s].isWrite)
  const hasFamilyDataScopes = scopes.state.some(
    (s) => scopeConsequences[s].sharesFamilyData
  )
  const valid = form.isValid() && scopes.state.length > 0

  return (
    <AsyncFormModal
      data-qa="create-api-token-modal"
      title={tc.title}
      icon={faKey}
      width="wide"
      resolveLabel={tc.create}
      resolveDisabled={!valid}
      resolveAction={() => {
        const { name, expiresInDays, scopes } = form.value()
        return createApiToken({
          body: {
            name,
            scopes,
            // computed from the browser clock, with a small margin so that
            // clock skew cannot push the longest option past the maximum
            // lifetime the service accepts
            expiresAt: HelsinkiDateTime.now()
              .addHours(expiresInDays * 24)
              .subMinutes(5)
          }
        })
      }}
      onSuccess={({ token }) => {
        // drop the raw token from the mutation cache: the only copy left is
        // the one handed to the modal below
        resetMutation()
        onCreated(token)
      }}
      rejectLabel={i18n.common.cancel}
      rejectAction={onClose}
    >
      <FixedSpaceColumn $spacing="s">
        <P $noMargin>{tc.info}</P>
        <FixedSpaceColumn $spacing="xs">
          <Label htmlFor="api-token-name">{tc.nameLabel}</Label>
          <InputFieldF
            id="api-token-name"
            data-qa="api-token-name-input"
            bind={name}
            width="full"
            autoFocus={true}
            hideErrorsBeforeTouched={true}
            placeholder={tc.namePlaceholder}
          />
          <InformationText>{tc.nameInfo}</InformationText>
        </FixedSpaceColumn>
        <FixedSpaceColumn $spacing="xs">
          <Label htmlFor="api-token-expiry">{tc.expiryLabel}</Label>
          <SelectF
            id="api-token-expiry"
            data-qa="api-token-expiry-select"
            bind={expiresInDays}
          />
          <InformationText>{tc.expiryInfo}</InformationText>
        </FixedSpaceColumn>
        <FixedSpaceColumn $spacing="xs">
          <LabelLike>{tc.scopesLabel}</LabelLike>
          <InformationText>{tc.scopesInfo}</InformationText>
          <FixedSpaceRow $spacing="m" $flexWrap="wrap">
            {apiTokenPresets.map((preset) => (
              <Button
                key={preset.key}
                appearance="inline"
                text={tc.presets[preset.key]}
                onClick={() => scopes.set(preset.scopes)}
                data-qa={`preset-${preset.key}`}
              />
            ))}
            <Button
              appearance="inline"
              text={tc.selectAllRead}
              onClick={() => scopes.set(allReadScopes)}
              data-qa="select-all-read-scopes"
            />
          </FixedSpaceRow>
          <ScopeCheckboxList>
            {citizenApiScopes.map((scope) => {
              const { isWrite, silencesNotification } = scopeConsequences[scope]
              const checked = scopes.state.includes(scope)
              return (
                <FixedSpaceColumn $spacing="xxs" key={scope}>
                  <ScopeCheckboxRow>
                    <Checkbox
                      checked={checked}
                      label={t.scopes[scope]}
                      onChange={(checked) =>
                        scopes.set(
                          checked
                            ? [...scopes.state, scope]
                            : scopes.state.filter((sc) => sc !== scope)
                        )
                      }
                      data-qa={`scope-${scope}`}
                    />
                    {isWrite && (
                      <WriteBadge data-qa={`scope-${scope}-write-badge`}>
                        {tc.writeBadge}
                      </WriteBadge>
                    )}
                  </ScopeCheckboxRow>
                  {checked && silencesNotification && (
                    <AlertBox
                      noMargin
                      wide
                      thin
                      message={tc.silencesNotificationWarning}
                      data-qa={`scope-${scope}-warning`}
                    />
                  )}
                </FixedSpaceColumn>
              )
            })}
          </ScopeCheckboxList>
          {scopes.state.length === 0 && (
            <AlertBox
              noMargin
              wide
              message={tc.noScopesSelected}
              data-qa="no-scopes-warning"
            />
          )}
          {hasFamilyDataScopes && (
            <AlertBox
              noMargin
              wide
              title={tc.familyDataWarningTitle}
              message={tc.familyDataWarning}
              data-qa="family-data-scopes-warning"
            />
          )}
          {hasWriteScopes && (
            <AlertBox
              noMargin
              wide
              title={tc.writeWarningTitle}
              message={tc.writeWarning}
              data-qa="write-scopes-warning"
            />
          )}
        </FixedSpaceColumn>
      </FixedSpaceColumn>
    </AsyncFormModal>
  )
})

const CreatedApiTokenModal = React.memo(function CreatedApiTokenModal({
  token,
  onClose
}: {
  token: string
  onClose: () => void
}) {
  const i18n = useTranslation()
  const t = i18n.personalDetails.apiTokensSection.createdModal
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(token).then(
      () => setCopied(true),
      () => setCopied(false)
    )
  }, [token])

  return (
    <BaseModal
      data-qa="created-api-token-modal"
      type="warning"
      title={t.title}
      icon={faExclamationTriangle}
      width="wide"
      close={onClose}
      closeLabel={t.close}
    >
      <FixedSpaceColumn $spacing="s">
        <AlertBox
          noMargin
          wide
          title={t.warningTitle}
          message={t.warning}
          data-qa="api-token-warning"
        />
        <FixedSpaceColumn $spacing="xs">
          <Label htmlFor="created-api-token">{t.tokenLabel}</Label>
          <TokenField
            id="created-api-token"
            data-qa="created-api-token"
            readOnly
            translate="no"
            value={token}
            onFocus={(e) => e.target.select()}
          />
          <div>
            <Button
              appearance="inline"
              icon={faCopy}
              text={copied ? t.copied : t.copy}
              onClick={copy}
              data-qa="copy-api-token"
            />
          </div>
        </FixedSpaceColumn>
        <P $noMargin>{t.usage}</P>
      </FixedSpaceColumn>
      <ModalButtons $justifyContent="center">
        <Button
          primary
          text={t.close}
          onClick={onClose}
          data-qa="close-created-api-token"
        />
      </ModalButtons>
    </BaseModal>
  )
})

const CardFrame = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${defaultMargins.s};
  border: 1px solid ${(p) => p.theme.colors.grayscale.g15};
  border-radius: 4px;
  padding: ${defaultMargins.s};
`

const CardIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  font-size: 20px;
  color: ${(p) => p.theme.colors.grayscale.g100};
`

const CardContent = styled.div`
  flex: 1 0 0;
  min-width: 0;
`

const NameRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${defaultMargins.m};
`

const TokenName = styled(LabelLike)`
  flex: 1 0 0;
  min-width: 0;
  word-break: break-word;
`

const DetailLines = styled.div`
  display: flex;
  flex-direction: column;
  line-height: 24px;
`

const ScopeItems = styled.ul`
  margin: 0;
  padding-left: ${defaultMargins.L};
  line-height: 24px;
`

const ScopeAccess = styled.span<{ $write: boolean }>`
  color: ${(p) =>
    p.$write ? p.theme.colors.status.warning : p.theme.colors.grayscale.g70};
`

const ScopeCheckboxList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${defaultMargins.xs};
`

const ScopeCheckboxRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${defaultMargins.s};
`

const WriteBadge = styled.span`
  flex-shrink: 0;
  padding: 2px ${defaultMargins.xs};
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.grayscale.g0};
  background: ${(p) => p.theme.colors.status.warning};
`

const TokenField = styled.input`
  width: 100%;
  font-family: monospace;
  font-size: 1rem;
  padding: ${defaultMargins.xs};
  border: 1px solid ${(p) => p.theme.colors.grayscale.g35};
  border-radius: 4px;
  background: ${(p) => p.theme.colors.grayscale.g0};
`
