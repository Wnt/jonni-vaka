// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package evaka.core.pis.controllers

import evaka.core.Audit
import evaka.core.AuditId
import evaka.core.EvakaEnv
import evaka.core.shared.CitizenApiTokenId
import evaka.core.shared.apiscopes.CitizenApiScope
import evaka.core.shared.auth.AuthenticatedUser
import evaka.core.shared.db.Database
import evaka.core.shared.domain.BadRequest
import evaka.core.shared.domain.EvakaClock
import evaka.core.shared.domain.HelsinkiDateTime
import evaka.core.shared.domain.NotFound
import evaka.core.shared.security.AccessControl
import evaka.core.shared.security.Action
import evaka.core.user.ApiTokenAccessNotificationEmailService
import evaka.core.user.CitizenApiToken
import evaka.core.user.countCitizenApiTokens
import evaka.core.user.generateCitizenApiToken
import evaka.core.user.getCitizenApiTokens
import evaka.core.user.hashCitizenApiToken
import evaka.core.user.insertCitizenApiToken
import evaka.core.user.revokeCitizenApiToken
import evaka.core.user.upsertCitizenUserForApiToken
import java.time.Duration
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

const val MAX_API_TOKENS_PER_CITIZEN = 10

/** A token always expires. The citizen picks how soon, within this bound. */
val MAX_API_TOKEN_LIFETIME: Duration = Duration.ofDays(180)

/**
 * None of these endpoints is on the citizen API token allowlist, so a token can never reach them:
 * an application acting on a citizen's behalf must not be able to mint itself a wider token, or
 * hide its own access by revoking the others.
 */
@RestController
@RequestMapping("/citizen/api-tokens")
class ApiTokenControllerCitizen(
    private val accessControl: AccessControl,
    private val evakaEnv: EvakaEnv,
    private val apiTokenAccessNotificationEmailService: ApiTokenAccessNotificationEmailService,
) {
    @GetMapping
    fun getApiTokens(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
    ): List<CitizenApiToken> {
        if (!evakaEnv.citizenApiTokensEnabled) throw NotFound()
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Person.READ_API_TOKENS,
                        user.id,
                    )
                    tx.getCitizenApiTokens(user.id)
                }
            }
            .also { Audit.CitizenApiTokensRead.log(targetId = AuditId(user.id)) }
    }

    data class ApiTokenRequest(
        val name: String,
        val scopes: List<CitizenApiScope>,
        val expiresAt: HelsinkiDateTime,
    )

    data class NewApiTokenResponse(
        val id: CitizenApiTokenId,
        /** The only time the raw token is available: it is not stored and cannot be shown again. */
        val token: String,
    )

    @PostMapping
    fun createApiToken(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @RequestBody body: ApiTokenRequest,
    ): NewApiTokenResponse {
        if (!evakaEnv.citizenApiTokensEnabled) throw NotFound()
        val now = clock.now()
        if (body.name.isBlank()) throw BadRequest("Name must not be blank")
        if (body.scopes.isEmpty()) throw BadRequest("At least one scope is required")
        if (!body.expiresAt.isAfter(now)) throw BadRequest("Expiry must be in the future")
        if (body.expiresAt.isAfter(now.plus(MAX_API_TOKEN_LIFETIME))) {
            throw BadRequest("Expiry is too far in the future")
        }

        val token = generateCitizenApiToken()
        return db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Person.CREATE_API_TOKEN,
                        user.id,
                    )
                    if (tx.countCitizenApiTokens(user.id) >= MAX_API_TOKENS_PER_CITIZEN) {
                        throw BadRequest("Too many API tokens")
                    }
                    tx.upsertCitizenUserForApiToken(user.id)
                    val id =
                        tx.insertCitizenApiToken(
                            person = user.id,
                            name = body.name,
                            tokenHash = hashCitizenApiToken(token),
                            scopes = body.scopes.distinct().sortedBy { it.name },
                            expiresAt = body.expiresAt,
                        )
                    apiTokenAccessNotificationEmailService.planNotifications(tx, user.id, now)
                    NewApiTokenResponse(id, token)
                }
            }
            .also { Audit.CitizenApiTokenCreate.log(targetId = AuditId(it.id)) }
    }

    @DeleteMapping("/{id}")
    fun revokeApiToken(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable id: CitizenApiTokenId,
    ) {
        if (!evakaEnv.citizenApiTokensEnabled) throw NotFound()
        db.connect { dbc ->
            dbc.transaction { tx ->
                accessControl.requirePermissionFor(
                    tx,
                    user,
                    clock,
                    Action.Citizen.Person.REVOKE_API_TOKEN,
                    user.id,
                )
                if (!tx.revokeCitizenApiToken(user.id, id, clock.now())) throw NotFound()
            }
        }
        Audit.CitizenApiTokenRevoke.log(targetId = AuditId(id))
    }
}
