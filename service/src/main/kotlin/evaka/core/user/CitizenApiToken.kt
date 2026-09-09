// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package evaka.core.user

import evaka.core.shared.CitizenApiTokenId
import evaka.core.shared.PersonId
import evaka.core.shared.apiscopes.CitizenApiScope
import evaka.core.shared.domain.HelsinkiDateTime
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * The raw token is shown to the citizen once, when it is created, and only its hash is stored.
 * Scope enforcement happens in the api-gw, so the rest of the service never learns that a request
 * came from a token.
 */
data class CitizenApiToken(
    val id: CitizenApiTokenId,
    val name: String,
    val scopes: List<CitizenApiScope>,
    val createdAt: HelsinkiDateTime,
    val expiresAt: HelsinkiDateTime,
    val lastUsedAt: HelsinkiDateTime?,
)

data class CitizenApiTokenIdentity(
    val personId: PersonId,
    val tokenId: CitizenApiTokenId,
    val scopes: List<CitizenApiScope>,
)

/** Marks a token as an eVaka citizen API token, for log greppability and secret scanners. */
const val CITIZEN_API_TOKEN_PREFIX = "evaka_pat_"

private const val TOKEN_BYTES = 32

private val secureRandom = SecureRandom()

fun generateCitizenApiToken(): String {
    val bytes = ByteArray(TOKEN_BYTES).also { secureRandom.nextBytes(it) }
    return CITIZEN_API_TOKEN_PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

/**
 * A plain SHA-256 rather than the slow hash used for passwords: a token is 256 bits of randomness,
 * so there is no guessable input to iterate over, and the hash is computed on every API request.
 */
fun hashCitizenApiToken(token: String): ByteArray =
    MessageDigest.getInstance("SHA-256").digest(token.toByteArray(Charsets.UTF_8))
