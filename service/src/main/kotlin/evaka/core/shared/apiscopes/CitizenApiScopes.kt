// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package evaka.core.shared.apiscopes

import evaka.core.ConstList
import org.springframework.util.AntPathMatcher
import org.springframework.web.bind.annotation.RequestMethod

data class CitizenApiEndpoint(val method: RequestMethod, val pathPattern: String)

private fun endpoints(method: RequestMethod, patterns: Array<out String>) = patterns.map {
    CitizenApiEndpoint(method, it)
}

private fun get(vararg patterns: String) = endpoints(RequestMethod.GET, patterns)

private fun post(vararg patterns: String) = endpoints(RequestMethod.POST, patterns)

private fun put(vararg patterns: String) = endpoints(RequestMethod.PUT, patterns)

/**
 * The only endpoints a citizen API token can reach, grouped by the scope that grants them. An
 * endpoint added to the citizen API stays unreachable with every existing and future token until it
 * is listed here.
 *
 * Rules for adding an entry:
 * 1. The endpoint's access-control action must permit weak login and have a default rule of its
 *    own, because a token authenticates as a weakly authenticated citizen: an action guarded by
 *    `IsCitizen(allowWeakLogin = false)`, or one that gets a citizen rule only from a
 *    municipality's `ActionRuleMapping`, answers 403 to every token. Nothing verifies this at build
 *    time, because the action is named in the controller method body rather than in an annotation,
 *    so read the action's rules in `evaka.core.shared.security.Action` first.
 * 2. Reads, plus acknowledgements that change nothing the citizen would have to undo.
 * 3. Nothing that identifies another person, exposes a child's documents or assessments, or reaches
 *    the credentials guarding the account itself.
 * 4. One endpoint per entry: a longer path under a listed one is not covered by it.
 *
 * A constant's name should read as something a citizen can consent to, and naming it after the
 * action it permits is preferred over a resource plus a verb. The name is the wire value, is stored
 * in every granted token, and is generated into the frontend and the api-gw, so renaming one
 * invalidates tokens citizens already hold. Path patterns are the ones Spring routes with; codegen
 * fails the build if one names a nonexistent endpoint.
 */
@ConstList("citizenApiScopes")
enum class CitizenApiScope(val endpoints: List<CitizenApiEndpoint>) {
    PERSONAL_DATA_READ(
        get(
            "/citizen/personal-data/email-verification",
            "/citizen/personal-data/notification-settings",
        )
    ),
    CHILDREN_READ(
        get(
            "/citizen/children",
            "/citizen/children/{childId}/attendance-summary/{yearMonth}",
            "/citizen/children/{childId}/service-needs",
        )
    ),
    CALENDAR_READ(
        get(
            "/citizen/calendar-event-times/{eventTimeId}/ics",
            "/citizen/calendar-events",
            "/citizen/calendar-events/{eventId}/ics",
            "/citizen/units",
        ) + post("/citizen/preschool-operational-dates")
    ),
    RESERVATIONS_READ(get("/citizen/reservations")),
    ABSENCES_READ(get("/citizen/absence-application")),
    HOLIDAY_PERIODS_READ(get("/citizen/holiday-period", "/citizen/holiday-period/questionnaire")),
    NOTIFICATIONS_READ(
        get(
            "/citizen/child-documents/unread-count",
            "/citizen/daily-service-time-notifications",
            "/citizen/pedagogical-documents/unread-count",
        )
    ),
    NOTIFICATIONS_DISMISS(post("/citizen/daily-service-time-notifications/dismiss")),
    MESSAGES_READ(
        get(
            "/citizen/messages/my-account",
            "/citizen/messages/received",
            "/citizen/messages/recipients",
            "/citizen/messages/unread-count",
        )
    ),
    // `PUT …/{threadId}/last-received-message/read` looks like it belongs here, but its
    // handler marks the message *unread*, which is not what this scope promises.
    MESSAGES_MARK_READ(put("/citizen/messages/threads/{threadId}/read")),
    // Message attachments in practice: every other attachment parent is guarded by
    // `IsCitizen(allowWeakLogin = false)`, so a token gets 403 for those however it was
    // granted.
    ATTACHMENTS_READ(get("/citizen/attachments/{attachmentId}/download/{requestedFilename}")),
}

/**
 * An endpoint belongs to exactly one scope, or revoking that scope would not revoke the access.
 *
 * Lazy because the enum constants are built from the `get`/`post`/`put` helpers in this same file:
 * reading `entries` while that is still running would see none of them.
 */
private val scopeByEndpoint: Map<CitizenApiEndpoint, CitizenApiScope> by lazy {
    buildMap {
        CitizenApiScope.entries.forEach { scope ->
            scope.endpoints.forEach { endpoint ->
                val previous = put(endpoint, scope)
                require(previous == null) {
                    "${endpoint.method} ${endpoint.pathPattern} is listed under both $previous and" +
                        " $scope"
                }
            }
        }
    }
}

fun citizenScopeOfPathPattern(pathPattern: String, httpMethod: RequestMethod): CitizenApiScope? =
    scopeByEndpoint[CitizenApiEndpoint(httpMethod, pathPattern)]

private val pathMatcher = AntPathMatcher()

fun citizenScopeOfRequestPath(requestPath: String, httpMethod: RequestMethod): CitizenApiScope? =
    scopeByEndpoint.entries
        .firstOrNull { (endpoint, _) ->
            endpoint.method == httpMethod && pathMatcher.match(endpoint.pathPattern, requestPath)
        }
        ?.value

/** Says nothing about *which* scope: the service does not know a token's scopes. */
fun citizenApiTokenAllows(requestPath: String, httpMethod: RequestMethod): Boolean =
    citizenScopeOfRequestPath(requestPath, httpMethod) != null
