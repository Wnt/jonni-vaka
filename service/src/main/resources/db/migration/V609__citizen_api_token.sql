CREATE TABLE citizen_api_token (
    id uuid PRIMARY KEY DEFAULT ext.uuid_generate_v1mc(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    citizen_user_id uuid NOT NULL,
    name text NOT NULL,
    token_hash bytea NOT NULL,
    scopes text[] NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone
);

ALTER TABLE citizen_api_token
    ADD CONSTRAINT fk$citizen_user FOREIGN KEY (citizen_user_id) REFERENCES citizen_user (id) ON DELETE CASCADE,
    ADD CONSTRAINT uniq$citizen_api_token_hash UNIQUE (token_hash),
    ADD CONSTRAINT check$citizen_api_token_scopes_not_empty CHECK (cardinality(scopes) > 0);

CREATE INDEX idx$citizen_api_token_citizen_user_id ON citizen_api_token (citizen_user_id);

CREATE TRIGGER set_timestamp BEFORE UPDATE ON citizen_api_token
    FOR EACH ROW EXECUTE PROCEDURE trigger_refresh_updated_at();
