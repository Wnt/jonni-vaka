// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package evaka.core.shared.apiscopes

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.springframework.web.bind.annotation.RequestMethod

class CitizenApiScopesTest {
    private val allowedEndpoints = CitizenApiScope.entries.flatMap { it.endpoints }

    @Test
    fun `an endpoint on the allowlist is covered by the scope that lists it`() {
        assertEquals(
            CitizenApiScope.CHILDREN_READ,
            citizenScopeOfPathPattern(
                "/citizen/children/{childId}/service-needs",
                RequestMethod.GET,
            ),
        )
        assertEquals(
            CitizenApiScope.CALENDAR_READ,
            citizenScopeOfPathPattern("/citizen/units", RequestMethod.GET),
        )
    }

    @Test
    fun `an endpoint that is not on the allowlist is covered by nothing`() {
        // An endpoint nobody listed is out of reach, whether it was forgotten, added later, or
        // deliberately left out
        assertNull(citizenScopeOfPathPattern("/citizen/decisions", RequestMethod.GET))
        assertNull(
            citizenScopeOfPathPattern("/citizen/applications/by-guardian", RequestMethod.GET)
        )
        assertNull(citizenScopeOfPathPattern("/citizen/some-future-endpoint", RequestMethod.GET))
    }

    @Test
    fun `the method is part of the entry, not decoration on it`() {
        // A listed GET says nothing about the other methods of the same path
        assertEquals(
            CitizenApiScope.RESERVATIONS_READ,
            citizenScopeOfPathPattern("/citizen/reservations", RequestMethod.GET),
        )
        for (method in
            listOf(
                RequestMethod.POST,
                RequestMethod.PUT,
                RequestMethod.DELETE,
                RequestMethod.HEAD,
            )) {
            assertNull(
                citizenScopeOfPathPattern("/citizen/reservations", method),
                "$method /citizen/reservations should not be exposed",
            )
        }
    }

    @Test
    fun `a path variable matches one real id`() {
        assertEquals(
            CitizenApiScope.CHILDREN_READ,
            citizenScopeOfRequestPath(
                "/citizen/children/6b0e35d7-1b3d-4a5f-9a1d-6a3f5e1f0c11/service-needs",
                RequestMethod.GET,
            ),
        )
        assertEquals(
            CitizenApiScope.CHILDREN_READ,
            citizenScopeOfRequestPath(
                "/citizen/children/6b0e35d7-1b3d-4a5f-9a1d-6a3f5e1f0c11/attendance-summary/2026-09",
                RequestMethod.GET,
            ),
        )
        assertEquals(
            CitizenApiScope.MESSAGES_MARK_READ,
            citizenScopeOfRequestPath(
                "/citizen/messages/threads/9d3a1b52-0f8c-4f1e-9c2a-5c6d7e8f9a01/read",
                RequestMethod.PUT,
            ),
        )
        assertEquals(
            CitizenApiScope.ATTACHMENTS_READ,
            citizenScopeOfRequestPath(
                "/citizen/attachments/2f1c8a44-6d3e-4b7a-8f21-9c0d1e2f3a45/download/liite.pdf",
                RequestMethod.GET,
            ),
        )
    }

    @Test
    fun `a path variable never spans a separator`() {
        // Without this, `{childId}` would swallow `abc/service-needs` and let one entry cover paths
        // nobody listed
        assertFalse(
            citizenApiTokenAllows("/citizen/children/abc/def/service-needs", RequestMethod.GET)
        )
        assertFalse(citizenApiTokenAllows("/citizen/children//service-needs", RequestMethod.GET))
    }

    @Test
    fun `a longer path under a listed one is not covered by it`() {
        assertTrue(citizenApiTokenAllows("/citizen/children", RequestMethod.GET))
        assertFalse(citizenApiTokenAllows("/citizen/children/anything", RequestMethod.GET))
        assertFalse(citizenApiTokenAllows("/citizen/messages/received/anything", RequestMethod.GET))
        assertFalse(
            citizenApiTokenAllows(
                "/citizen/children/6b0e35d7-1b3d-4a5f-9a1d-6a3f5e1f0c11/placements/terminate",
                RequestMethod.POST,
            )
        )
        assertFalse(
            citizenApiTokenAllows(
                "/citizen/holiday-period/questionnaire/fixed-period/1",
                RequestMethod.POST,
            )
        )
    }

    @Test
    fun `an endpoint whose action forbids weak login is not listed`() {
        // A token always authenticates as a weakly authenticated citizen, so listing an endpoint
        // whose action is guarded only by `IsCitizen(allowWeakLogin = false)` would grant a scope
        // that can never be used: the gateway would pass the request and the service would answer
        // 403. `READ_PLACEMENT` forbids weak login outright, and both of the first two check it.
        assertFalse(
            citizenApiTokenAllows(
                "/citizen/children/6b0e35d7-1b3d-4a5f-9a1d-6a3f5e1f0c11/placements",
                RequestMethod.GET,
            )
        )
        assertFalse(
            citizenApiTokenAllows(
                "/citizen/absence-application/application-possible",
                RequestMethod.GET,
            )
        )
        // `READ_DAILY_SERVICE_TIMES` has no default rules at all, so it works only where an
        // `ActionRuleMapping` adds a citizen rule for it — today only Espoo. An endpoint that
        // answers in one municipality and 403s in the next is worse for an integrator than one
        // that is simply not offered.
        assertFalse(
            citizenApiTokenAllows(
                "/citizen/children/6b0e35d7-1b3d-4a5f-9a1d-6a3f5e1f0c11/daily-service-times",
                RequestMethod.GET,
            )
        )
    }

    @Test
    fun `a listed path is not a prefix of a sibling that merely starts the same way`() {
        assertFalse(citizenApiTokenAllows("/citizen/children-of-someone-else", RequestMethod.GET))
        assertFalse(citizenApiTokenAllows("/citizen/units-and-more", RequestMethod.GET))
    }

    @Test
    fun `every resource left out of the allowlist is unreachable`() {
        // Named one by one, because "we did not list it" is the argument the DPIA rests on and it
        // should fail loudly if any of these is ever quietly added
        val excluded =
            listOf(
                // applications and the decisions that follow from them
                RequestMethod.GET to "/citizen/applications/by-guardian",
                RequestMethod.GET to "/citizen/applications/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f",
                RequestMethod.POST to "/citizen/applications",
                RequestMethod.GET to "/citizen/service-applications",
                RequestMethod.GET to "/citizen/decisions",
                RequestMethod.GET to "/citizen/decisions/pending",
                RequestMethod.GET to
                    "/citizen/fee-decisions/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f/download",
                RequestMethod.GET to "/citizen/finance-decisions/by-liable-citizen",
                RequestMethod.GET to
                    "/citizen/voucher-value-decisions/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f/download",
                // income
                RequestMethod.GET to "/citizen/income/expiring",
                RequestMethod.GET to "/citizen/income-statements",
                RequestMethod.GET to "/citizen/income-statements/children",
                RequestMethod.GET to "/citizen/income-statements/partner",
                // a child's documents: their contents, and the listing that names their templates
                RequestMethod.GET to "/citizen/child-documents",
                RequestMethod.GET to "/citizen/child-documents/unanswered",
                RequestMethod.GET to
                    "/citizen/child-documents/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f",
                RequestMethod.GET to
                    "/citizen/child-documents/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f/pdf",
                RequestMethod.GET to
                    "/citizen/children/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f/pedagogical-documents",
                RequestMethod.POST to
                    "/citizen/pedagogical-documents/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f/mark-read",
                // case handling history
                RequestMethod.GET to
                    "/citizen/process-metadata/applications/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f",
                // other people's data
                RequestMethod.GET to "/citizen/personal-data/family",
                RequestMethod.GET to "/citizen/child-images/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f",
                // the credentials guarding the account itself
                RequestMethod.GET to "/citizen/passkeys",
                RequestMethod.POST to "/citizen/passkeys/register",
                RequestMethod.PUT to "/citizen/personal-data/weak-login-credentials",
                RequestMethod.DELETE to "/citizen/personal-data/weak-login-credentials",
                RequestMethod.GET to "/citizen/api-tokens",
                RequestMethod.POST to "/citizen/api-tokens",
                RequestMethod.DELETE to "/citizen/api-tokens/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f",
                RequestMethod.GET to "/citizen/auth/status",
                RequestMethod.POST to "/citizen/auth/weak-login",
                // changing the citizen's own settings
                RequestMethod.PUT to "/citizen/personal-data",
                RequestMethod.PUT to "/citizen/personal-data/notification-settings",
                RequestMethod.PUT to "/citizen/personal-data/preferred-ui-language",
                RequestMethod.POST to "/citizen/personal-data/email-verification",
                // every remaining write
                RequestMethod.POST to "/citizen/reservations",
                RequestMethod.POST to "/citizen/absences",
                RequestMethod.POST to "/citizen/absence-application",
                RequestMethod.DELETE to
                    "/citizen/absence-application/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f",
                RequestMethod.POST to
                    "/citizen/holiday-period/questionnaire/open-range/97c6bd6f-1a1b-4c1d",
                RequestMethod.POST to "/citizen/calendar-event/reservation",
                RequestMethod.DELETE to "/citizen/calendar-event/reservation",
                RequestMethod.POST to "/citizen/messages",
                RequestMethod.POST to
                    "/citizen/messages/reply-to/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f",
                RequestMethod.PUT to
                    "/citizen/messages/threads/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f/archive",
                RequestMethod.POST to "/citizen/attachments/messages",
                RequestMethod.DELETE to "/citizen/attachments/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f",
            )
        for ((method, path) in excluded) {
            assertFalse(citizenApiTokenAllows(path, method), "$method $path should be unreachable")
        }
    }

    @Test
    fun `archiving a thread is excluded while marking it read is not`() {
        // The two live under the same path prefix and differ by one segment
        val thread = "/citizen/messages/threads/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f"
        assertTrue(citizenApiTokenAllows("$thread/read", RequestMethod.PUT))
        assertFalse(citizenApiTokenAllows("$thread/archive", RequestMethod.PUT))
    }

    @Test
    fun `the path that ends in read but marks a message unread is excluded`() {
        // `MessageControllerCitizen.markLastReceivedMessageInThreadUnread` clears `read_at`, so
        // listing it under `messages:mark-read` would let that scope mark messages unread too
        assertFalse(
            citizenApiTokenAllows(
                "/citizen/messages/threads/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f/" +
                    "last-received-message/read",
                RequestMethod.PUT,
            )
        )
    }

    @Test
    fun `unread counts are exposed but the listing that names documents is not`() {
        // Counts and identities yes, document types and content no: `unanswered` returns template
        // names, which can reveal that a child has, say, a support plan
        assertEquals(
            CitizenApiScope.NOTIFICATIONS_READ,
            citizenScopeOfRequestPath("/citizen/child-documents/unread-count", RequestMethod.GET),
        )
        assertEquals(
            CitizenApiScope.NOTIFICATIONS_READ,
            citizenScopeOfRequestPath(
                "/citizen/pedagogical-documents/unread-count",
                RequestMethod.GET,
            ),
        )
        assertFalse(citizenApiTokenAllows("/citizen/child-documents/unanswered", RequestMethod.GET))
    }

    @Test
    fun `nothing outside the citizen API is on the allowlist`() {
        for ((method, path) in
            listOf(
                RequestMethod.GET to "/employee/daycares",
                RequestMethod.GET to "/employee-mobile/units",
                RequestMethod.GET to "/system/citizen/97c6bd6f-1a1b-4c1d-8e2f-3a4b5c6d7e8f",
                RequestMethod.POST to "/integration/titania/working-time-events",
                RequestMethod.GET to "/health",
                RequestMethod.GET to "/citizen/public/club-terms",
            )) {
            assertFalse(citizenApiTokenAllows(path, method), "$method $path should be unreachable")
        }
        for (endpoint in allowedEndpoints) {
            assertTrue(
                endpoint.pathPattern.startsWith("/citizen/"),
                "${endpoint.pathPattern} is not a citizen endpoint",
            )
        }
    }

    @Test
    fun `only the acknowledgement writes are exposed`() {
        // The list of writes is short enough to name in full, and it should stay that way: a new
        // one appearing here means somebody granted a token the ability to act, not just to read
        val writes =
            allowedEndpoints
                .filter { it.method != RequestMethod.GET }
                .map { "${it.method} ${it.pathPattern}" }
                .sorted()
        assertEquals(
            listOf(
                "POST /citizen/daily-service-time-notifications/dismiss",
                "POST /citizen/preschool-operational-dates",
                "PUT /citizen/messages/threads/{threadId}/read",
            ),
            writes,
        )
        // `/citizen/preschool-operational-dates` is a POST only because the query does not fit in
        // a URL, which is why it sits under a read scope
        assertEquals(
            CitizenApiScope.CALENDAR_READ,
            citizenScopeOfPathPattern("/citizen/preschool-operational-dates", RequestMethod.POST),
        )
    }

    @Test
    fun `an endpoint belongs to exactly one scope`() {
        // Two scopes covering the same endpoint would mean revoking one of them does not revoke
        // the access, which is not something a consent screen can express
        assertEquals(allowedEndpoints.size, allowedEndpoints.distinct().size)
    }

    @Test
    fun `every scope grants at least one endpoint`() {
        for (scope in CitizenApiScope.entries) {
            assertTrue(scope.endpoints.isNotEmpty(), "$scope grants nothing")
        }
    }

    @Test
    fun `scope names are a stable vocabulary a citizen could be shown`() {
        // The name travels on the wire and is stored in every granted token, so it is part of the
        // published contract rather than an internal detail
        val pattern = Regex("^[A-Z][A-Z0-9_]*[A-Z0-9]$")
        for (scope in CitizenApiScope.entries) {
            assertTrue(pattern.matches(scope.name), "${scope.name} is not a well-formed scope name")
        }
    }

    @Test
    fun `path patterns are lower case, so a normalised request path can match them`() {
        // The gateway lower-cases the request path before matching, because its own router is
        // case-insensitive. An upper-case literal segment here would be unreachable in production
        // while looking perfectly fine in this table.
        for (endpoint in allowedEndpoints) {
            val literals =
                endpoint.pathPattern.split('/').filterNot { it.startsWith("{") && it.endsWith("}") }
            for (segment in literals) {
                assertEquals(
                    segment.lowercase(),
                    segment,
                    "${endpoint.pathPattern} has a non-lower-case segment",
                )
            }
        }
    }
}
