# EVR server-side content setup

The site uses Vercel Functions for the editor and Cloudflare R2 for uploaded images, videos, and shared website content. Admin email codes continue to use Resend, and Upstash Redis continues to enforce sign-in rate limits.

## Provision Cloudflare storage and admin access

1. Create a Cloudflare R2 bucket for site content and media. Connect a custom domain to the bucket and enable public reads for published images and videos. In the bucket's **Settings → CORS Policy**, allow `PUT` from each exact site origin you use, including `http://localhost:3000`, `http://localhost:3100`, and `https://evr-productions.vercel.app`; allow the `Content-Type` request header and expose `ETag` for multipart video uploads. Example policy:

   ```json
   [
     {
       "AllowedOrigins": [
         "http://localhost:3000",
         "http://localhost:3100",
         "https://evr-productions.vercel.app"
       ],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Add any custom production domain you use as another exact origin. Save the policy, wait briefly for it to apply, then retry the upload.
2. Set up admin sign-in email with **Resend**:
   - In Resend, add and verify the sending domain `mail.evrproductions.in`. Add the exact DNS records Resend provides to GoDaddy; do not remove the existing Vercel website records. A dedicated sending subdomain helps keep website and mail DNS configuration separate.
   - Create a Resend API key with permission to send from the verified domain.
   - In the Vercel project's **Settings → Environment Variables**, set:
     - `EVR_ADMIN_EMAIL` to `evrproductionss@gmail.com`. This is the only address allowed to request and verify a sign-in code.
     - `RESEND_API_KEY` to the private Resend API key.
     - `RESEND_FROM_EMAIL` to `EVR Productions <admin@mail.evrproductions.in>` (or another sender on the domain verified in Resend).
3. Create an **Upstash Redis** database and add its REST URL and token to Vercel:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

   Redis stores only a keyed digest of the short-lived sign-in code and rate-limit counters. Codes expire after 10 minutes, can be attempted at most five times, and are deleted when successfully used. Code requests are limited to three per 15 minutes.
4. Set `EVR_SESSION_SECRET` to a randomly generated secret with at least 32 characters. For example, generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` and store it only in Vercel.
5. Create an R2 API token scoped to this bucket with object read/write access. Add these values to Vercel Environment Variables:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`
   - `R2_PUBLIC_BASE_URL` (for example, `https://media.example.com`)

   Never add the access key or secret to browser code or commit them. Configure a lifecycle rule to remove incomplete multipart uploads after a few days.
6. Apply the variables to Production (and Preview if needed), then redeploy.
7. Redeploy after setting the production variables. Open `/admin`, enter `evrproductionss@gmail.com`, request the one-time code, then verify it to sign in. Other email addresses cannot receive or use a code to sign in. To replace media, use the contextual image or video action beside the media. Video uploads are limited to 1 GB; image uploads are limited to 30 MB.

The browser uploads images and signed 64 MiB multipart video chunks directly to R2, so media bytes do not pass through Vercel. Only the authenticated admin can request upload URLs; R2 credentials stay server-side. Video uploads support files up to 1 GB and can resume in the same browser after an interruption. R2's public custom domain serves the original video (not adaptive HLS); use MP4/H.264 for the broadest browser support. Shared website content is stored in the R2 object `evr/site-content-v1.json`.

## Private quotation studio

Open the site and navigate to `#/studio`, or sign in at `#/admin` and choose **Open the EVR quotation studio**. The studio uses the EVR admin login and provides separate wedding/celebration and corporate production scopes, editable rates and terms, browser-only drafts, and a print-ready quotation that can be saved as PDF.

EVR's approved rates are not prefilled. Configure and review rates and terms before issuing a quotation; the studio blocks previews when an included service has no rate. Rates, terms, and drafts are stored only in that browser's local storage. They are not uploaded or synchronized, and client details remain on the device until you print or save the PDF. This tool does not create hosted client links or send quotations automatically. Use a secure device and sign out when finished.

The admin email allowlist, email-provider credentials, Redis credentials, and session signing key are never sent to the browser. Editing, photo-upload authorization, and R2 upload authorization require an authenticated session. State-changing API calls reject cross-origin requests and requests without an Origin header. Admin sessions use an HTTP-only, SameSite=Strict cookie that expires after seven days; signing out clears it, and rotating `EVR_SESSION_SECRET` invalidates existing sessions.

Shared content is kept at `evr/site-content-v1.json` in the R2 bucket. Photos and videos upload directly from the browser to R2 using short-lived signed upload URLs. The editor can migrate the previous `evr-site-content` browser edits when the server-side document is still empty. Legacy browser-local videos must be uploaded again with the R2 video uploader before migrating; existing remote video links, including Cloudinary URLs, do not need to be re-uploaded. If the current live content document or images still reside in Vercel Blob, migrate them to R2 before disconnecting or deleting that store.

To migrate the existing server-side document and its referenced Vercel Blob images once, first add `CLOUDFLARE_ACCOUNT_ID` and the existing R2 credentials to `.env.local`, keep `BLOB_READ_WRITE_TOKEN` there temporarily, and run `node scripts/migrate-vercel-blob-to-r2.js --confirm` from this folder. The command refuses to overwrite an existing R2 content document. After confirming the site works from R2, remove the old Blob token and store; the app no longer uses Vercel Blob for normal operation.

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

   Copy the generated value into `.env.local`. Use a separate development database and sender if preferred. Obtain the Resend key and verified sender from Resend, the Redis REST values from Upstash, and the R2 credentials and custom domain from your Cloudflare account. Never commit `.env.local` or share its contents.
2. From the project folder, build the browser uploader and start the local Vercel development server with `run-project.bat` (or `node run-vercel-dev.js`). This launcher loads `.env.local` into the local server process:

   ```powershell
   npm run build
   node run-vercel-dev.js
   ```

   If prompted, sign in to Vercel and link this folder to the correct Vercel project. The local launcher enables an admin-authentication bypass only for loopback requests in local development; no Resend or Upstash values are needed for local editing. It is disabled for Production and Preview. Do not configure `EVR_LOCAL_ADMIN_BYPASS` in Vercel. Then open the local URL printed by Vercel and visit `/admin`.
3. Use a small test image and video first and confirm both load from the configured public media domain.

The local server uses the same server APIs as deployment. Its temporary admin bypass is restricted to localhost and never grants access in Production or Preview; production admin access continues to require email OTP. If you use your production R2 credentials, local admin changes can update the shared content used by your live website. Avoid Reset/Import while connected to production data, or use a separate development R2 bucket. The existing Playwright static server is for frontend-only tests; API-backed admin flows need mocked API routes or `vercel dev`.

`.env` and `.env.*` files are ignored by Git, except `.env.example`. Keep secrets out of source control.
