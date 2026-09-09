// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package evaka.core.shared.config

import jakarta.servlet.GenericServlet
import jakarta.servlet.ServletRequest
import jakarta.servlet.ServletResponse
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class CitizenApiTokenAccessControlTest {
    private val filter = CitizenApiTokenAccessControl()

    private val childId = "6b0e35d7-1b3d-4a5f-9a1d-6a3f5e1f0c11"
    private val threadId = "9d3a1b52-0f8c-4f1e-9c2a-5c6d7e8f9a01"

    /** Records whether the request made it past the filter. */
    private class RecordingServlet : GenericServlet() {
        var reached = false

        override fun service(req: ServletRequest, res: ServletResponse) {
            reached = true
        }
    }

    private class Result(val reached: Boolean, val status: Int)

    private fun request(method: String, uri: String, tokenId: String?): Result {
        val request =
            MockHttpServletRequest(method, uri).apply {
                tokenId?.let { addHeader(API_TOKEN_ID_HEADER, it) }
            }
        val response = MockHttpServletResponse()
        val servlet = RecordingServlet()
        filter.doFilter(request, response, MockFilterChain(servlet))
        return Result(servlet.reached, response.status)
    }

    private fun withToken(method: String, uri: String) = request(method, uri, tokenId = "token-id")

    private fun withoutToken(method: String, uri: String) = request(method, uri, tokenId = null)

    @Test
    fun `a token-authenticated request reaches an endpoint on the allowlist`() {
        for ((method, uri) in
            listOf(
                "GET" to "/citizen/children",
                "GET" to "/citizen/children/$childId/service-needs",
                "GET" to "/citizen/calendar-events",
                "POST" to "/citizen/preschool-operational-dates",
                "PUT" to "/citizen/messages/threads/$threadId/read",
                "POST" to "/citizen/daily-service-time-notifications/dismiss",
            )) {
            assertTrue(withToken(method, uri).reached, "$method $uri should pass")
        }
    }

    @Test
    fun `a token-authenticated request is refused everywhere else`() {
        // Deny by default, so the filter needs no list of what to protect: credential management,
        // a resource nobody exposed, and an endpoint that does not exist yet are all one case
        for ((method, uri) in
            listOf(
                "GET" to "/citizen/auth/status",
                "GET" to "/citizen/personal-data/weak-login-credentials",
                "GET" to "/citizen/passkeys",
                "DELETE" to "/citizen/passkeys/abc",
                "GET" to "/citizen/api-tokens",
                "PUT" to "/citizen/personal-data/notification-settings",
                "GET" to "/citizen/personal-data/family",
                "GET" to "/citizen/decisions",
                "POST" to "/citizen/reservations",
                "PUT" to "/citizen/messages/threads/$threadId/archive",
                "GET" to "/citizen/an-endpoint-added-next-year",
                "GET" to "/employee/daycares",
            )) {
            val result = withToken(method, uri)
            assertFalse(result.reached, "$method $uri should not reach the controller")
            assertEquals(403, result.status, "for $method $uri")
        }
    }

    @Test
    fun `the allowlist entry is a method and a path together`() {
        // Listing `GET /citizen/reservations` exposes nothing else about that path
        assertTrue(withToken("GET", "/citizen/reservations").reached)
        assertEquals(403, withToken("POST", "/citizen/reservations").status)
        assertEquals(403, withToken("DELETE", "/citizen/reservations").status)
    }

    @Test
    fun `an unrecognised method does not slip past the allowlist`() {
        assertEquals(403, withToken("BREW", "/citizen/children").status)
        assertEquals(403, withToken("BREW", "/citizen/passkeys").status)
    }

    @Test
    fun `the filter sees the path the container will route with`() {
        // The gateway normalises independently, and any disagreement between the two would be a
        // bypass. Here the filter refuses whatever it cannot recognise as a listed endpoint,
        // rather than having to anticipate every spelling of a banned one.
        for (uri in
            listOf(
                "/citizen/children/../passkeys",
                "/citizen/children/%2e%2e/passkeys",
                "/citizen/CHILDREN",
                "/citizen/children;jsessionid=abc",
            )) {
            assertEquals(403, withToken("GET", uri).status, "for $uri")
        }
    }

    @Test
    fun `a request without the token header is not this filter's business`() {
        // Only the api-gw sets the token header, and only for a request authenticated with a
        // token. A citizen's own session may legitimately reach every one of these.
        for ((method, uri) in
            listOf(
                "PUT" to "/citizen/passkeys",
                "PUT" to "/citizen/personal-data/notification-settings",
                "POST" to "/citizen/reservations",
                "GET" to "/citizen/decisions",
                "GET" to "/employee/daycares",
                "GET" to "/health",
            )) {
            assertTrue(withoutToken(method, uri).reached, "$method $uri should pass")
        }
    }
}
