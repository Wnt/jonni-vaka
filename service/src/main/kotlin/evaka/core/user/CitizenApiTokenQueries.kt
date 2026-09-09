// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package evaka.core.user

import evaka.core.shared.CitizenApiTokenId
import evaka.core.shared.PersonId
import evaka.core.shared.apiscopes.CitizenApiScope
import evaka.core.shared.db.Database
import evaka.core.shared.domain.HelsinkiDateTime
import java.time.Duration

fun Database.Read.getCitizenApiTokens(person: PersonId): List<CitizenApiToken> = createQuery {
    sql(
        """
SELECT id, name, scopes, created_at, expires_at, last_used_at
FROM citizen_api_token
WHERE citizen_user_id = ${bind(person)} AND revoked_at IS NULL
ORDER BY created_at
"""
    )
}
    .toList()

fun Database.Read.countCitizenApiTokens(person: PersonId): Int = createQuery {
    sql(
        """
SELECT count(*)
FROM citizen_api_token
WHERE citizen_user_id = ${bind(person)} AND revoked_at IS NULL
"""
    )
}
    .exactlyOne()

fun Database.Transaction.upsertCitizenUserForApiToken(person: PersonId) = execute {
    sql("INSERT INTO citizen_user (id) VALUES (${bind(person)}) ON CONFLICT (id) DO NOTHING")
}

fun Database.Transaction.insertCitizenApiToken(
    person: PersonId,
    name: String,
    tokenHash: ByteArray,
    scopes: List<CitizenApiScope>,
    expiresAt: HelsinkiDateTime,
): CitizenApiTokenId = createQuery {
    sql(
        """
INSERT INTO citizen_api_token (citizen_user_id, name, token_hash, scopes, expires_at)
VALUES (${bind(person)}, ${bind(name)}, ${bind(tokenHash)}, ${bind(scopes.map { it.name })}, ${bind(expiresAt)})
RETURNING id
"""
    )
}
    .exactlyOne()

/** Returns false if the token does not exist, belongs to someone else, or is already revoked. */
fun Database.Transaction.revokeCitizenApiToken(
    person: PersonId,
    id: CitizenApiTokenId,
    now: HelsinkiDateTime,
): Boolean = createUpdate {
    sql(
        """
UPDATE citizen_api_token
SET revoked_at = ${bind(now)}
WHERE id = ${bind(id)} AND citizen_user_id = ${bind(person)} AND revoked_at IS NULL
"""
    )
}
    .updateNoneOrOne()

/**
 * `last_used_at` only has to be accurate enough for a citizen to see roughly when an application
 * last touched their data. Updating it on every request would make a polling client rewrite the
 * same row continuously, turning one token into a steady stream of row locks, dead tuples and WAL.
 */
private val LAST_USED_RESOLUTION = Duration.ofMinutes(5)

/** Returns null if the token is unknown, expired or revoked, so the three are indistinguishable. */
fun Database.Transaction.useCitizenApiToken(
    tokenHash: ByteArray,
    now: HelsinkiDateTime,
): CitizenApiTokenIdentity? =
    createQuery {
        sql(
            """
UPDATE citizen_api_token
SET last_used_at = ${bind(now)}
WHERE token_hash = ${bind(tokenHash)}
  AND revoked_at IS NULL
  AND expires_at > ${bind(now)}
  AND (last_used_at IS NULL OR last_used_at < ${bind(now - LAST_USED_RESOLUTION)})
RETURNING id AS token_id, citizen_user_id AS person_id, scopes
"""
        )
    }
        .exactlyOneOrNull()
        // The update matches nothing when last_used_at is already recent enough
        ?: createQuery {
            sql(
                """
SELECT id AS token_id, citizen_user_id AS person_id, scopes
FROM citizen_api_token
WHERE token_hash = ${bind(tokenHash)} AND revoked_at IS NULL AND expires_at > ${bind(now)}
"""
            )
        }
            .exactlyOneOrNull()

/**
 * A revoked or expired row is kept this long because `last_used_at` is the evidence that lets an
 * incident reported after the fact be investigated, and that report needs time to reach us.
 */
private val CITIZEN_API_TOKEN_RETENTION = Duration.ofDays(90)

/** Returns the number of rows deleted, for logging. */
fun Database.Transaction.deleteOldCitizenApiTokens(now: HelsinkiDateTime): Int = createUpdate {
    sql(
        """
DELETE FROM citizen_api_token
WHERE revoked_at < ${bind(now - CITIZEN_API_TOKEN_RETENTION)}
   OR expires_at < ${bind(now - CITIZEN_API_TOKEN_RETENTION)}
"""
    )
}
    .executeAndReturnCount()
