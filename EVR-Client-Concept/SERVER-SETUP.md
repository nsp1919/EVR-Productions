# EVR server-side content setup

The site uses authenticated Vercel Functions for the editor and shared content. Vercel Blob stores the content document and photos. Cloudflare R2 stores newly uploaded videos, served from the bucket's public custom domain. Existing Cloudinary video links remain playable.

## Provision storage and admin access

1. In the Vercel project that deploys this folder, create a **Blob** store and connect it to the project. Vercel supplies `BLOB_READ_WRITE_TOKEN`. This store holds shared site content and photos.
2. Set up email codes with **Resend**. Verify a sender domain in Resend, create an API key, then add these Vercel environment variables:
   - `EVR_ADMIN_EMAIL`: the single email address allowed to sign in.
   - `RESEND_API_KEY`: the private Resend API key.
   - `RESEND_FROM_EMAIL`: a sender address on the verified domain, such as `EVR Productions <admin@example.com>`.
3. Create an **Upstash Redis** database and add its REST URL and token to Vercel:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

   Redis stores only a keyed digest of the short-lived sign-in code and rate-limit counters. Codes expire after 10 minutes, can be attempted at most five times, and are deleted when successfully used. Code requests are limited to three per 15 minutes.
4. Set `EVR_SESSION_SECRET` to a randomly generated secret with at least 32 characters. For example, generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` and store it only in Vercel.
5. Create an R2 bucket for website videos. Connect a custom domain to the bucket and enable public reads for that domain; visitors need public playback for published portfolio videos. Set the bucket's CORS policy to allow `PUT` from your deployed site origin and `http://localhost:3000`, allow the `Content-Type` request header, and expose the `ETag` response header. Keep the bucket's S3 API credentials private.
6. Create an R2 API token scoped to this bucket with object read/write access. Add these values to Vercel Environment Variables:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`
   - `R2_PUBLIC_BASE_URL` (for example, `https://media.example.com`)

   Never add the access key or secret to browser code or commit them. Configure a lifecycle rule to remove incomplete multipart uploads after a few days.
7. Apply the variables to Production (and Preview if needed), then redeploy.
8. Open `/admin`, enter the authorized admin email, request the one-time code, then verify it to sign in. To replace media, use the contextual image or video action beside the media. Video uploads are limited to 1 GB; image uploads are limited to 30 MB.

The browser uploads signed 64 MiB multipart chunks directly to R2, so the video bytes do not pass through Vercel. Only the authenticated admin can request upload URLs; R2 credentials stay server-side. Uploads support files up to 1 GB and can resume in the same browser after an interruption. R2's public custom domain serves the original video (not adaptive HLS); use MP4/H.264 for the broadest browser support. The JSON content backup stores playback links, not copies of the videos.

## Private quotation studio

Open the site and navigate to `#/studio`, or sign in at `#/admin` and choose **Open the EVR quotation studio**. The studio uses the EVR admin login and provides separate wedding/celebration and corporate production scopes, editable rates and terms, browser-only drafts, and a print-ready quotation that can be saved as PDF.

EVR's approved rates are not prefilled. Configure and review rates and terms before issuing a quotation; the studio blocks previews when an included service has no rate. Rates, terms, and drafts are stored only in that browser's local storage. They are not uploaded or synchronized, and client details remain on the device until you print or save the PDF. This tool does not create hosted client links or send quotations automatically. Use a secure device and sign out when finished.

The admin email allowlist, email-provider credentials, Redis credentials, and session signing key are never sent to the browser. Editing, photo-upload authorization, and R2 upload authorization require an authenticated session. State-changing API calls reject cross-origin requests and requests without an Origin header. Admin sessions use an HTTP-only, SameSite=Strict cookie that expires after seven days; signing out clears it, and rotating `EVR_SESSION_SECRET` invalidates existing sessions.

Shared content is kept at `evr/site-content-v1.json` in the connected Blob store. Photos upload directly from the browser to Blob using short-lived upload authorization. The editor can migrate the previous `evr-site-content` browser edits when the server-side document is still empty. Legacy browser-local videos must be uploaded again with the R2 video uploader before migrating; existing remote video links, including Cloudinary URLs, do not need to be re-uploaded.

The public website content API is intentionally readable by visitors so the site can display published edits; only authenticated admins can change it. The admin page itself is not private or hidden from visitors, but opening it does not grant edit access. Use Vercel's available firewall/rate-limiting controls if enabled for your plan, and protect the Vercel and Cloudflare accounts with strong unique passwords and multifactor authentication.

## Local development and tests

On Windows, run `run-project.bat` from File Explorer or a Command Prompt to build the browser assets and start the local Vercel development server. Keep its window open while using the site. On first run, Vercel may ask you to sign in or link this folder to the correct project.

1. In the project folder, create a `.env.local` file with local development values:

   ```dotenv
   EVR_ADMIN_EMAIL="your-admin-email@example.com"
   EVR_SESSION_SECRET="paste-a-random-secret-generated-locally"
   RESEND_API_KEY="your-resend-api-key"
   RESEND_FROM_EMAIL="EVR Productions <admin@example.com>"
   UPSTASH_REDIS_REST_URL="https://your-database.upstash.io"
   UPSTASH_REDIS_REST_TOKEN="your-upstash-rest-token"
   BLOB_READ_WRITE_TOKEN="your-vercel-blob-read-write-token"
   CLOUDFLARE_ACCOUNT_ID="your-32-character-account-id"
   R2_ACCESS_KEY_ID="your-r2-access-key-id"
   R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
   R2_BUCKET_NAME="your-r2-bucket-name"
   R2_PUBLIC_BASE_URL="https://media.example.com"
   ```

   Generate the session secret in PowerShell with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```

   Copy the generated value into `.env.local`. Use a separate development database and sender if preferred. Obtain the Blob token from your Vercel Blob store, the Resend key and verified sender from Resend, the Redis REST values from Upstash, and the R2 credentials and custom domain from your Cloudflare account. Never commit `.env.local` or share its contents.
2. From the project folder, build the browser uploader and start the local Vercel development server with `run-project.bat` (or `node run-vercel-dev.js`). This launcher loads `.env.local` into the local server process:

   ```powershell
   npm run build
   node run-vercel-dev.js
   ```

   If prompted, sign in to Vercel and link this folder to the correct Vercel project. The local launcher enables an admin-authentication bypass only for loopback requests in local development; no Resend or Upstash values are needed for local editing. It is disabled for Production and Preview. Do not configure `EVR_LOCAL_ADMIN_BYPASS` in Vercel. Then open the local URL printed by Vercel and visit `/admin`.
3. Use a small test video first and confirm it plays from the configured public media domain.

The local server uses the same server APIs as deployment. Its temporary admin bypass is restricted to localhost and never grants access in Production or Preview; production admin access continues to require email OTP. If you use your production Blob token, local admin changes can update the shared content used by your live website. Avoid Reset/Import while connected to production data, or use a separate development Blob store. The existing Playwright static server is for frontend-only tests; API-backed admin flows need mocked API routes or `vercel dev`.

`.env` and `.env.*` files are ignored by Git, except `.env.example`. Keep secrets out of source control.
