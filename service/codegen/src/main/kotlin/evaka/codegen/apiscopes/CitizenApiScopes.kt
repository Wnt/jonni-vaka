// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package evaka.codegen.apiscopes

import evaka.codegen.api.EndpointMetadata
import evaka.codegen.api.scanEndpoints
import evaka.codegen.fileHeader
import evaka.core.shared.apiscopes.CitizenApiEndpoint
import evaka.core.shared.apiscopes.CitizenApiScope
import evaka.core.shared.apiscopes.citizenScopeOfPathPattern

private const val CITIZEN_PREFIX = "/citizen/"

/**
 * The allowlist is written by hand against path patterns, so a typo or a renamed endpoint would
 * otherwise grant nothing at all while looking exactly like a working entry. The reverse direction
 * is not an error: an unlisted endpoint is simply not exposed.
 */
fun assertAllowlistedEndpointsExist(endpoints: List<EndpointMetadata>) {
    val scanned = endpoints.map { CitizenApiEndpoint(it.httpMethod, it.path) }.toSet()
    val missing =
        CitizenApiScope.entries
            .flatMap { scope ->
                scope.endpoints
                    .filterNot { it in scanned }
                    .map { "${it.method} ${it.pathPattern} (granted by $scope)" }
            }
            .sorted()
    if (missing.isNotEmpty()) {
        error(
            "These endpoints are on the citizen API token allowlist but do not exist. Fix the" +
                " path pattern, or remove the entry if the endpoint is gone:\n" +
                missing.joinToString("\n") { "  - $it" }
        )
    }
}

private fun citizenEndpointScopes(
    endpoints: List<EndpointMetadata>
): List<Triple<String, String, String?>> =
    endpoints
        .filter { it.path.startsWith(CITIZEN_PREFIX) }
        .map {
            Triple(
                it.httpMethod.name,
                it.path,
                citizenScopeOfPathPattern(it.path, it.httpMethod)?.name,
            )
        }
        .distinct()
        .sortedWith(compareBy({ it.second }, { it.first }))

private fun citizenScopeEndpoints(): List<Triple<String, String, String>> =
    CitizenApiScope.entries
        .flatMap { scope ->
            scope.endpoints.map { Triple(scope.name, it.method.name, it.pathPattern) }
        }
        .sortedWith(compareBy({ it.first }, { it.third }, { it.second }))

private const val TS_LINE_LENGTH = 80

private fun inlineObject(fields: List<Pair<String, String>>): String =
    "{ ${fields.joinToString(", ") { "${it.first}: ${it.second}" }} }"

/**
 * Renders an object literal the way the repository's TypeScript formatter would, so that
 * `codegenCheck` and the formatting check cannot disagree about the generated file.
 */
private fun tsObject(
    fields: List<Pair<String, String>>,
    indent: String,
    separator: String,
): String {
    val inline = "$indent${inlineObject(fields)}$separator"
    if (inline.length <= TS_LINE_LENGTH) return inline
    return "$indent{\n" +
        fields.joinToString(",\n") { "$indent  ${it.first}: ${it.second}" } +
        "\n$indent}$separator"
}

private fun <T> tsArray(
    prefixLength: Int,
    items: List<T>,
    fields: (T) -> List<Pair<String, String>>,
): String {
    val inline = "[${items.joinToString(", ") { inlineObject(fields(it)) }}]"
    if (prefixLength + inline.length <= TS_LINE_LENGTH) return inline
    return items
        .mapIndexed { index, item ->
            tsObject(
                fields(item),
                indent = "  ",
                separator = if (index == items.lastIndex) "" else ",",
            )
        }
        .joinToString("\n", prefix = "[\n", postfix = "\n]")
}

private fun tsString(value: String) = "'$value'"

/** The `}[] = ` that precedes every generated array, and counts towards its first line's width. */
private const val TS_ARRAY_PREFIX_LENGTH = 6

fun generateCitizenApiScopes(
    endpoints: List<EndpointMetadata> = scanEndpoints("evaka.core")
): String {
    assertAllowlistedEndpointsExist(endpoints)
    val scopeEndpoints =
        tsArray(TS_ARRAY_PREFIX_LENGTH, citizenScopeEndpoints()) { (scope, method, path) ->
            listOf(
                "scope" to tsString(scope),
                "method" to tsString(method),
                "path" to tsString(path),
            )
        }
    val endpointScopes =
        tsArray(TS_ARRAY_PREFIX_LENGTH, citizenEndpointScopes(endpoints)) { (method, path, scope) ->
            listOf(
                "method" to tsString(method),
                "path" to tsString(path),
                "scope" to (scope?.let { tsString(it) } ?: "null"),
            )
        }
    return """
$fileHeader
/** Scopes that a citizen API token can be granted. */
export const citizenApiScopes = [
${CitizenApiScope.entries.map { it.name }.sorted().joinToString(",\n") { "  '$it'" }}
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
}[] = $scopeEndpoints

/**
 * Every citizen endpoint this version of eVaka has, with the scope that exposes it, or `null` if no
 * token can reach it. This is the audit table: an endpoint added to the citizen API appears here as
 * a `null` row, so a reviewer can see what was added and decide whether it should be exposed.
 */
export const citizenEndpointScopes: readonly {
  method: string
  path: string
  scope: CitizenApiScope | null
}[] = $endpointScopes
"""
        .trimStart()
}
