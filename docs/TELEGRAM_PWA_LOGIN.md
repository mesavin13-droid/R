# ROAD LIVE: Telegram authorization for Safari / PWA

ROAD LIVE keeps Telegram Mini App authentication using signed `initData` and an HttpOnly session cookie.

The installed Safari PWA cannot read `Telegram.WebApp.initData`. Instead the standalone website supports Telegram OpenID Connect with PKCE, CSRF state, nonce and signature-verified ID tokens (RS256). Both mechanisms map the same Telegram user ID to the same ROAD LIVE account.

## Owner setup

1. In @BotFather select the ROAD LIVE bot, open **Login Widget** and register the allowed origin and callback URL for the production site, e.g. `https://roadlive.vercel.app` and `https://roadlive.vercel.app/api/auth/telegram/callback`.
2. Copy **Client ID** and **Client Secret** from BotFather's Login Widget settings.
3. In the Vercel project set these **server-side** environment variables:
   - `TELEGRAM_LOGIN_CLIENT_ID` – public Telegram client ID
   - `TELEGRAM_LOGIN_CLIENT_SECRET` – private secret; **never set VITE_ prefix**
   - `TELEGRAM_LOGIN_REDIRECT_URI` – `https://roadlive.vercel.app/api/auth/telegram/callback`
4. Preserve existing `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and VAPID settings. Redeploy the approved build.
5. Open the production site in Safari, tap **Войти через Telegram**, and complete login. The user receives the same server session and rights as in the Mini App.
6. To receive native **Web Push on iOS**, install the website on the Home Screen, open the installed PWA, log in (if needed) and grant notifications through the profile UI. iOS/iPadOS 16.4+ supports Web Push for installed web apps. Telegram's embedded browser is a separate environment and may not support background Web Push.

## Security notes

- The server derives a signed, short-lived OIDC state cookie using the existing session secret; PKCE and a one-time callback binding prevent login CSRF/replay.
- The client secret and Telegram bot token never leave the server.
- ID tokens must be signed by Telegram (RS256 JWKS), have the configured audience, valid issuer, expiration and matching nonce.
- Browser users cannot self-assign privileged roles; all roles and bans are verified by the backend.
- The existing channel-membership gate remains enforced for protected actions.
- If any required Telegram OIDC settings are absent, standalone login is disabled; Mini App login continues unchanged.
- Avoid publishing or relying on OIDC until both GitHub CI and a real-device login test succeed.
- GPS-based Web Push requires explicit geolocation consent and a fresh physical GPS fix. Positions older than 8 minutes are ignored by the push recipient filter.

Official docs: https://core.telegram.org/bots/telegram-login
