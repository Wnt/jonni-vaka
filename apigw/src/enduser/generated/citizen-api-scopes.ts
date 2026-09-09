// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

// GENERATED FILE: no manual modifications

/** Scopes that a citizen API token can be granted. */
export const citizenApiScopes = [
  'ABSENCES_READ',
  'ATTACHMENTS_READ',
  'CALENDAR_READ',
  'CHILDREN_READ',
  'HOLIDAY_PERIODS_READ',
  'MESSAGES_MARK_READ',
  'MESSAGES_READ',
  'NOTIFICATIONS_DISMISS',
  'NOTIFICATIONS_READ',
  'PERSONAL_DATA_READ',
  'RESERVATIONS_READ'
] as const

export type CitizenApiScope = (typeof citizenApiScopes)[number]

/**
 * The exact endpoints each scope covers, and the only endpoints a citizen API token can reach at
 * all. `path` is a Spring path pattern, so `{childId}` matches one segment and nothing else is
 * reachable — not a sibling endpoint, and not a longer path under a listed one.
 */
export const citizenApiScopeEndpoints: readonly {
  scope: CitizenApiScope
  method: string
  path: string
}[] = [
  {
    scope: 'ABSENCES_READ',
    method: 'GET',
    path: '/citizen/absence-application'
  },
  {
    scope: 'ATTACHMENTS_READ',
    method: 'GET',
    path: '/citizen/attachments/{attachmentId}/download/{requestedFilename}'
  },
  {
    scope: 'CALENDAR_READ',
    method: 'GET',
    path: '/citizen/calendar-event-times/{eventTimeId}/ics'
  },
  { scope: 'CALENDAR_READ', method: 'GET', path: '/citizen/calendar-events' },
  {
    scope: 'CALENDAR_READ',
    method: 'GET',
    path: '/citizen/calendar-events/{eventId}/ics'
  },
  {
    scope: 'CALENDAR_READ',
    method: 'POST',
    path: '/citizen/preschool-operational-dates'
  },
  { scope: 'CALENDAR_READ', method: 'GET', path: '/citizen/units' },
  { scope: 'CHILDREN_READ', method: 'GET', path: '/citizen/children' },
  {
    scope: 'CHILDREN_READ',
    method: 'GET',
    path: '/citizen/children/{childId}/attendance-summary/{yearMonth}'
  },
  {
    scope: 'CHILDREN_READ',
    method: 'GET',
    path: '/citizen/children/{childId}/service-needs'
  },
  {
    scope: 'HOLIDAY_PERIODS_READ',
    method: 'GET',
    path: '/citizen/holiday-period'
  },
  {
    scope: 'HOLIDAY_PERIODS_READ',
    method: 'GET',
    path: '/citizen/holiday-period/questionnaire'
  },
  {
    scope: 'MESSAGES_MARK_READ',
    method: 'PUT',
    path: '/citizen/messages/threads/{threadId}/read'
  },
  {
    scope: 'MESSAGES_READ',
    method: 'GET',
    path: '/citizen/messages/my-account'
  },
  { scope: 'MESSAGES_READ', method: 'GET', path: '/citizen/messages/received' },
  {
    scope: 'MESSAGES_READ',
    method: 'GET',
    path: '/citizen/messages/recipients'
  },
  {
    scope: 'MESSAGES_READ',
    method: 'GET',
    path: '/citizen/messages/unread-count'
  },
  {
    scope: 'NOTIFICATIONS_DISMISS',
    method: 'POST',
    path: '/citizen/daily-service-time-notifications/dismiss'
  },
  {
    scope: 'NOTIFICATIONS_READ',
    method: 'GET',
    path: '/citizen/child-documents/unread-count'
  },
  {
    scope: 'NOTIFICATIONS_READ',
    method: 'GET',
    path: '/citizen/daily-service-time-notifications'
  },
  {
    scope: 'NOTIFICATIONS_READ',
    method: 'GET',
    path: '/citizen/pedagogical-documents/unread-count'
  },
  {
    scope: 'PERSONAL_DATA_READ',
    method: 'GET',
    path: '/citizen/personal-data/email-verification'
  },
  {
    scope: 'PERSONAL_DATA_READ',
    method: 'GET',
    path: '/citizen/personal-data/notification-settings'
  },
  { scope: 'RESERVATIONS_READ', method: 'GET', path: '/citizen/reservations' }
]

/**
 * Every citizen endpoint this version of eVaka has, with the scope that exposes it, or `null` if no
 * token can reach it. This is the audit table: an endpoint added to the citizen API appears here as
 * a `null` row, so a reviewer can see what was added and decide whether it should be exposed.
 */
export const citizenEndpointScopes: readonly {
  method: string
  path: string
  scope: CitizenApiScope | null
}[] = [
  {
    method: 'GET',
    path: '/citizen/absence-application',
    scope: 'ABSENCES_READ'
  },
  { method: 'POST', path: '/citizen/absence-application', scope: null },
  {
    method: 'GET',
    path: '/citizen/absence-application/application-possible',
    scope: null
  },
  { method: 'DELETE', path: '/citizen/absence-application/{id}', scope: null },
  { method: 'POST', path: '/citizen/absences', scope: null },
  { method: 'GET', path: '/citizen/api-tokens', scope: null },
  { method: 'POST', path: '/citizen/api-tokens', scope: null },
  { method: 'DELETE', path: '/citizen/api-tokens/{id}', scope: null },
  { method: 'POST', path: '/citizen/applications', scope: null },
  {
    method: 'GET',
    path: '/citizen/applications/active-placements/{childId}',
    scope: null
  },
  { method: 'GET', path: '/citizen/applications/by-guardian', scope: null },
  {
    method: 'GET',
    path: '/citizen/applications/by-guardian/notifications',
    scope: null
  },
  { method: 'GET', path: '/citizen/applications/children', scope: null },
  {
    method: 'GET',
    path: '/citizen/applications/duplicates/{childId}',
    scope: null
  },
  {
    method: 'DELETE',
    path: '/citizen/applications/{applicationId}',
    scope: null
  },
  { method: 'GET', path: '/citizen/applications/{applicationId}', scope: null },
  { method: 'PUT', path: '/citizen/applications/{applicationId}', scope: null },
  {
    method: 'POST',
    path: '/citizen/applications/{applicationId}/actions/accept-decision',
    scope: null
  },
  {
    method: 'POST',
    path: '/citizen/applications/{applicationId}/actions/reject-decision',
    scope: null
  },
  {
    method: 'POST',
    path: '/citizen/applications/{applicationId}/actions/send-application',
    scope: null
  },
  {
    method: 'PUT',
    path: '/citizen/applications/{applicationId}/draft',
    scope: null
  },
  {
    method: 'POST',
    path: '/citizen/attachments/applications/{applicationId}',
    scope: null
  },
  {
    method: 'POST',
    path: '/citizen/attachments/income-statements',
    scope: null
  },
  {
    method: 'POST',
    path: '/citizen/attachments/income-statements/{incomeStatementId}',
    scope: null
  },
  { method: 'POST', path: '/citizen/attachments/messages', scope: null },
  {
    method: 'DELETE',
    path: '/citizen/attachments/{attachmentId}',
    scope: null
  },
  {
    method: 'GET',
    path: '/citizen/attachments/{attachmentId}/download/{requestedFilename}',
    scope: 'ATTACHMENTS_READ'
  },
  {
    method: 'GET',
    path: '/citizen/calendar-event-times/{eventTimeId}/ics',
    scope: 'CALENDAR_READ'
  },
  {
    method: 'DELETE',
    path: '/citizen/calendar-event/reservation',
    scope: null
  },
  { method: 'POST', path: '/citizen/calendar-event/reservation', scope: null },
  { method: 'GET', path: '/citizen/calendar-events', scope: 'CALENDAR_READ' },
  {
    method: 'GET',
    path: '/citizen/calendar-events/{eventId}/ics',
    scope: 'CALENDAR_READ'
  },
  { method: 'GET', path: '/citizen/child-documents', scope: null },
  { method: 'GET', path: '/citizen/child-documents/unanswered', scope: null },
  {
    method: 'GET',
    path: '/citizen/child-documents/unread-count',
    scope: 'NOTIFICATIONS_READ'
  },
  { method: 'GET', path: '/citizen/child-documents/{documentId}', scope: null },
  { method: 'PUT', path: '/citizen/child-documents/{documentId}', scope: null },
  {
    method: 'GET',
    path: '/citizen/child-documents/{documentId}/pdf',
    scope: null
  },
  {
    method: 'PUT',
    path: '/citizen/child-documents/{documentId}/read',
    scope: null
  },
  { method: 'GET', path: '/citizen/child-images/{imageId}', scope: null },
  { method: 'GET', path: '/citizen/children', scope: 'CHILDREN_READ' },
  {
    method: 'GET',
    path: '/citizen/children/{childId}/attendance-summary/{yearMonth}',
    scope: 'CHILDREN_READ'
  },
  {
    method: 'GET',
    path: '/citizen/children/{childId}/daily-service-times',
    scope: null
  },
  {
    method: 'GET',
    path: '/citizen/children/{childId}/pedagogical-documents',
    scope: null
  },
  {
    method: 'GET',
    path: '/citizen/children/{childId}/placements',
    scope: null
  },
  {
    method: 'POST',
    path: '/citizen/children/{childId}/placements/terminate',
    scope: null
  },
  {
    method: 'GET',
    path: '/citizen/children/{childId}/service-needs',
    scope: 'CHILDREN_READ'
  },
  {
    method: 'GET',
    path: '/citizen/daily-service-time-notifications',
    scope: 'NOTIFICATIONS_READ'
  },
  {
    method: 'POST',
    path: '/citizen/daily-service-time-notifications/dismiss',
    scope: 'NOTIFICATIONS_DISMISS'
  },
  { method: 'GET', path: '/citizen/decisions', scope: null },
  { method: 'GET', path: '/citizen/decisions/pending', scope: null },
  { method: 'GET', path: '/citizen/decisions/{id}', scope: null },
  { method: 'GET', path: '/citizen/decisions/{id}/download', scope: null },
  { method: 'GET', path: '/citizen/fee-decisions/{id}/download', scope: null },
  {
    method: 'GET',
    path: '/citizen/finance-decisions/by-liable-citizen',
    scope: null
  },
  {
    method: 'GET',
    path: '/citizen/holiday-period',
    scope: 'HOLIDAY_PERIODS_READ'
  },
  {
    method: 'GET',
    path: '/citizen/holiday-period/questionnaire',
    scope: 'HOLIDAY_PERIODS_READ'
  },
  {
    method: 'POST',
    path: '/citizen/holiday-period/questionnaire/fixed-period/{id}',
    scope: null
  },
  {
    method: 'POST',
    path: '/citizen/holiday-period/questionnaire/open-range/{id}',
    scope: null
  },
  { method: 'GET', path: '/citizen/income-statements', scope: null },
  { method: 'POST', path: '/citizen/income-statements', scope: null },
  {
    method: 'GET',
    path: '/citizen/income-statements/child/start-dates/{childId}',
    scope: null
  },
  {
    method: 'GET',
    path: '/citizen/income-statements/child/{childId}',
    scope: null
  },
  {
    method: 'POST',
    path: '/citizen/income-statements/child/{childId}',
    scope: null
  },
  { method: 'GET', path: '/citizen/income-statements/children', scope: null },
  { method: 'GET', path: '/citizen/income-statements/partner', scope: null },
  {
    method: 'GET',
    path: '/citizen/income-statements/start-dates/',
    scope: null
  },
  { method: 'DELETE', path: '/citizen/income-statements/{id}', scope: null },
  {
    method: 'GET',
    path: '/citizen/income-statements/{incomeStatementId}',
    scope: null
  },
  {
    method: 'PUT',
    path: '/citizen/income-statements/{incomeStatementId}',
    scope: null
  },
  {
    method: 'PUT',
    path: '/citizen/income-statements/{incomeStatementId}/update-sent',
    scope: null
  },
  { method: 'GET', path: '/citizen/income/expiring', scope: null },
  { method: 'POST', path: '/citizen/messages', scope: null },
  {
    method: 'GET',
    path: '/citizen/messages/my-account',
    scope: 'MESSAGES_READ'
  },
  { method: 'GET', path: '/citizen/messages/received', scope: 'MESSAGES_READ' },
  {
    method: 'GET',
    path: '/citizen/messages/recipients',
    scope: 'MESSAGES_READ'
  },
  {
    method: 'POST',
    path: '/citizen/messages/reply-to/{threadId}',
    scope: null
  },
  {
    method: 'PUT',
    path: '/citizen/messages/threads/{threadId}/archive',
    scope: null
  },
  {
    method: 'PUT',
    path: '/citizen/messages/threads/{threadId}/last-received-message/read',
    scope: null
  },
  {
    method: 'PUT',
    path: '/citizen/messages/threads/{threadId}/read',
    scope: 'MESSAGES_MARK_READ'
  },
  {
    method: 'GET',
    path: '/citizen/messages/unread-count',
    scope: 'MESSAGES_READ'
  },
  { method: 'GET', path: '/citizen/passkeys', scope: null },
  { method: 'POST', path: '/citizen/passkeys/register', scope: null },
  { method: 'POST', path: '/citizen/passkeys/register/finish', scope: null },
  { method: 'DELETE', path: '/citizen/passkeys/{id}', scope: null },
  { method: 'PUT', path: '/citizen/passkeys/{id}/name', scope: null },
  {
    method: 'GET',
    path: '/citizen/pedagogical-documents/unread-count',
    scope: 'NOTIFICATIONS_READ'
  },
  {
    method: 'POST',
    path: '/citizen/pedagogical-documents/{documentId}/mark-read',
    scope: null
  },
  { method: 'PUT', path: '/citizen/personal-data', scope: null },
  {
    method: 'GET',
    path: '/citizen/personal-data/email-verification',
    scope: 'PERSONAL_DATA_READ'
  },
  {
    method: 'POST',
    path: '/citizen/personal-data/email-verification',
    scope: null
  },
  {
    method: 'POST',
    path: '/citizen/personal-data/email-verification-code',
    scope: null
  },
  { method: 'GET', path: '/citizen/personal-data/family', scope: null },
  {
    method: 'GET',
    path: '/citizen/personal-data/notification-settings',
    scope: 'PERSONAL_DATA_READ'
  },
  {
    method: 'PUT',
    path: '/citizen/personal-data/notification-settings',
    scope: null
  },
  {
    method: 'GET',
    path: '/citizen/personal-data/password-constraints',
    scope: null
  },
  {
    method: 'PUT',
    path: '/citizen/personal-data/preferred-ui-language',
    scope: null
  },
  {
    method: 'DELETE',
    path: '/citizen/personal-data/weak-login-credentials',
    scope: null
  },
  {
    method: 'PUT',
    path: '/citizen/personal-data/weak-login-credentials',
    scope: null
  },
  {
    method: 'POST',
    path: '/citizen/preschool-operational-dates',
    scope: 'CALENDAR_READ'
  },
  {
    method: 'GET',
    path: '/citizen/process-metadata/applications/{applicationId}',
    scope: null
  },
  {
    method: 'GET',
    path: '/citizen/process-metadata/fee-decisions/{feeDecisionId}',
    scope: null
  },
  {
    method: 'GET',
    path: '/citizen/process-metadata/voucher-value-decisions/{voucherValueDecisionId}',
    scope: null
  },
  { method: 'GET', path: '/citizen/public/club-terms', scope: null },
  { method: 'GET', path: '/citizen/public/preschool-terms', scope: null },
  { method: 'GET', path: '/citizen/public/service-needs/options', scope: null },
  {
    method: 'GET',
    path: '/citizen/public/system-notifications/current',
    scope: null
  },
  {
    method: 'GET',
    path: '/citizen/public/units/{applicationType}',
    scope: null
  },
  { method: 'GET', path: '/citizen/reservations', scope: 'RESERVATIONS_READ' },
  { method: 'POST', path: '/citizen/reservations', scope: null },
  { method: 'GET', path: '/citizen/service-applications', scope: null },
  { method: 'POST', path: '/citizen/service-applications', scope: null },
  { method: 'GET', path: '/citizen/service-applications/options', scope: null },
  { method: 'DELETE', path: '/citizen/service-applications/{id}', scope: null },
  { method: 'GET', path: '/citizen/units', scope: 'CALENDAR_READ' },
  {
    method: 'GET',
    path: '/citizen/voucher-value-decisions/{id}/download',
    scope: null
  }
]
