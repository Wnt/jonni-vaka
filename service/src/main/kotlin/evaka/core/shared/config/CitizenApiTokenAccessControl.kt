// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package evaka.core.shared.config

import evaka.core.shared.apiscopes.citizenApiTokenAllows
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpFilter
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.bind.annotation.RequestMethod

/** Set by the api-gw on a token-authenticated request; carries the token id for audit. */
const val API_TOKEN_ID_HEADER = "X-Evaka-Api-Token-Id"

/**
 * Defence in depth: the api-gw is the primary and only complete enforcement point, because it is
 * the one that knows a token's scopes. This filter only checks that a token-authenticated request
 * targets an endpoint on the allowlist at all, which covers the two bypasses the gateway is exposed
 * to and the service is not: a route registered outside the gateway's citizen middleware, and a
 * path the gateway normalises differently from the servlet container that routes it.
 */
class CitizenApiTokenAccessControl : HttpFilter() {
    override fun doFilter(
        request: HttpServletRequest,
        response: HttpServletResponse,
        chain: FilterChain,
    ) {
        if (request.getHeader(API_TOKEN_ID_HEADER) != null && !request.isAllowlistedTarget()) {
            return response.sendError(HttpServletResponse.SC_FORBIDDEN, "Forbidden")
        }
        chain.doFilter(request, response)
    }

    private fun HttpServletRequest.isAllowlistedTarget(): Boolean {
        val requestMethod =
            RequestMethod.entries.firstOrNull { it.name.equals(method, true) } ?: return false
        return citizenApiTokenAllows(requestURI, requestMethod)
    }
}
