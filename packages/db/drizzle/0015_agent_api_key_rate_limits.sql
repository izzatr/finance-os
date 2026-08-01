-- Better Auth's default API-key quota is 10 requests per 24 hours. That is too
-- small for MCP clients, which authenticate each protocol request and each
-- loopback REST call. Upgrade only rows still carrying that exact default so
-- deliberately customized limits remain untouched. Reset the active window so
-- keys already exhausted by discovery become usable immediately after deploy.
UPDATE "api_keys"
SET
  "rate_limit_time_window" = 60000,
  "rate_limit_max" = 300,
  "request_count" = 0,
  "last_request" = NULL,
  "updated_at" = now()
WHERE
  "rate_limit_enabled" = true
  AND "rate_limit_time_window" = 86400000
  AND "rate_limit_max" = 10;