# Auth email templates

Website registration now calls `/auth/v1/otp` and expects a 6-digit `{{ .Token }}`.

These files are not applied by `npm run build`. Paste them in the Supabase dashboard or the inbox stays the default confirmation link.

1. Open Authentication → Email Templates
2. Confirm signup: `confirmation.html`
3. Magic Link: `magic_link.html`
4. Subject can be: `你的 Utilora 验证码`

Do not keep `{{ .ConfirmationURL }}` in those two templates.
