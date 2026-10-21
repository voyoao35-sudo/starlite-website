# Separate Telegram notification service

Prepared endpoint: `https://starlite-client.netlify.app/.netlify/functions/telegram-relay`.

This endpoint accepts only signed launch notices containing UID, login, version,
UTC start time, session ID, and confirmation that the launcher notice was accepted.
It sends them to the fixed owner chat. It does not accept arbitrary messages,
destinations, screenshots, hardware inventories, or control commands.

Netlify Functions secrets (runtime only):
- `STARLITE_TELEGRAM_TOKEN`: existing bot token.
- `STARLITE_TELEGRAM_CHAT_ID`: existing owner chat ID.
- `STARLITE_TELEGRAM_RELAY_KEY`: random 32-byte hexadecimal shared key.

Railway variables:
- `STARLITE_TELEGRAM_RELAY_URL`: endpoint above.
- `STARLITE_TELEGRAM_RELAY_KEY`: same shared key.

Never put secret values in Git or launcher files. Obtain user approval before
transferring the existing token/chat ID to the new host. Publish Netlify first,
then deploy the updated backend with relay configuration. Launches still depend
on the existing backend. No launcher reinstall is required.

Verification: `node --test telegram-relay.test.js launch-audit.test.js`.
After deployment, verify the endpoint refuses unsigned requests; send one signed,
clearly labeled test notice to the owner and check a consented actual launch.
Do not claim integration is active before this end-to-end check.

Relay mode does not poll Telegram or handle bot commands. It sends notifications.
The backend records successful sends; failures preserve retry-on-start behavior.
There is no durable relay queue; an ambiguous network failure can duplicate a
notice. Old direct bot credentials on Railway can be removed after verification.
