# Upgrading to Cubby v1.1, step by step

## What's new

**For your users**
- No more technical errors. People see plain messages ("Cubby couldn't read this image…"), and unexpected problems show a short reference code instead of a stack trace.
- The Overview shows **Vault health** (Protected / Next up / Needs you) instead of cloud service names.
- The Trust Center explains protection in plain words: locked files, key kept apart, backup copy, two-factor sign-in.
- Document details say "Encrypted", "Backup copy", "Read from a scan" instead of "AWS S3" or "Textract".
- **Forgot password**, with an emailed reset link.
- **Recovery codes**: 10 one-time codes shown right after two-factor setup, for when a phone is lost.
- **Settings**: change password, new recovery codes, move two-factor sign-in to a new phone, and a list of signed-in devices you can sign out.
- **Security emails**: new device signed in, password changed or reset, recovery code used.
- Privacy policy, terms, a friendly 404 page, and a "something broke" screen instead of a blank page.

**For you (the operator)**
- An **Admin** page (only for emails in `ADMIN_EMAILS`) with real health checks of every cloud service, settings warnings, usage numbers, and failed documents with their full technical error.
- A **startup check**: if a production setting is missing (like the Azure values that caused yesterday's 500), the backend refuses to start and names the missing setting. The previous working version keeps running.
- **Rate limits** on login, signup, password reset, chat, search and uploads.
- **Stricter uploads**: a renamed file (say, an `.exe` called `.pdf`) is rejected.
- Security headers on the website, and the API map is hidden in production.

Time needed: about 15 minutes for Part A, 20 for Part B, 15 for Part C.

---

## Part A: Update the code on your laptop

### A.1 Stop Cubby

In a terminal in your `cubby` folder:

```powershell
docker compose down
```

> Use plain `down`. **Never add `-v`**, which deletes your database.

If you run the backend with `uvicorn` instead of Docker, press `Ctrl + C` in that terminal. Also stop the frontend (`Ctrl + C` in its terminal).

### A.2 Keep your old folder as a backup

1. Open File Explorer and go to `C:\Users\Dell\Downloads\cubby\`.
2. Rename the inner `cubby` folder to `cubby-old`.

### A.3 Unzip the new version

1. Unzip `cubby-v1.1.zip` into `C:\Users\Dell\Downloads\cubby\`, so you get a fresh `cubby` folder next to `cubby-old`.
2. Copy these from `cubby-old` into the new `cubby`, into the same places:
   - `backend\.env`
   - `backend\env.prod.yaml`
   - the `backend\data` folder, if it exists (files uploaded while using local storage)

### A.4 Add the new settings

Open `backend\.env` in VS Code and add these lines anywhere:

```
ADMIN_EMAILS=dhruvi.jain.btech2028@atlasskilltech.university
EMAIL_PROVIDER=console
```

`console` means emails are printed in the backend logs instead of being sent. Part B switches on real email.

### A.5 Start it

With Docker Desktop open, in the new `cubby` folder:

```powershell
docker compose up -d --build
docker compose logs -f backend
```

Wait for `Application startup complete.`, then press `Ctrl + C` to stop watching. The database upgrades itself automatically; your account and documents stay.

You may see a block starting with `⚠️ Cubby settings problem` in the logs. Locally that's only a warning, and it tells you exactly which setting is missing.

Then start the frontend in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

> **Not using Docker for the backend?** Then in `backend`: `.venv\Scripts\activate`, then `pip install -r requirements.txt` (there's one new package), then the usual `uvicorn` command.

### A.6 Check it works

Open http://localhost:5173. Then:

1. **Log in again.** Everyone is signed out once, because login sessions now live in the database so they can be listed and revoked.
2. **Admin page:** a new gauge icon at the bottom of the sidebar. Open it and click **Run checks now**. Every service you've set up should say **OK**. Anything **Failing** shows the technical reason in the Detail column.
3. **Recovery codes:** your account was created before this feature, so it has 0 codes. Go to **Settings → New codes**, enter your password, and download or copy them somewhere safe.
4. **Forgot password:** log out, click **Forgot your password?**, and enter your email. Then run:
   ```powershell
   docker compose logs backend
   ```
   You'll see the email printed, including the reset link. Open it to test the reset page.

---

## Part B: Send real emails with Azure Communication Services

This adds a third Azure service (Key Vault, Blob Storage, Communication Services).

### B.1 Create the Email service

1. Go to https://portal.azure.com.
2. Search bar → **Email Communication Services** → **+ Create**.
3. Resource group: `cubby-rg`. Name: something unique like `cubby-email-yourname`. Data location: **India** (or the closest option listed).
4. **Review + create** → **Create** → wait → **Go to resource**.

### B.2 Add a free sending domain

1. In the Email Communication Service, left menu → **Provision domains** (or **Settings → Provision domains**).
2. Click **+ Add domain** → **Azure domain** (the free, Azure-managed one; some screens call it **1-click add**) → confirm.
3. Wait a minute or two until its status shows **Verified / Ready**.
4. Click the new domain. Note the **MailFrom address**, usually `DoNotReply@<something>.azurecomm.net`. **Save it to your notes**; this is your `EMAIL_SENDER`.

### B.3 Create the Communication Services resource

1. Search bar → **Communication Services** → **+ Create**.
2. Resource group: `cubby-rg`. Name: something unique like `cubby-comms-yourname`. Data location: the **same** as in B.1.
3. **Review + create** → **Create** → **Go to resource**.

### B.4 Connect the domain to it

1. In the Communication Services resource, left menu → **Email → Domains**.
2. Click **Connect domain**.
3. Pick your Email service from B.1 and the Azure domain from B.2 → **Connect**.

### B.5 Copy the connection string

1. Still in Communication Services → left menu **Settings → Keys**.
2. Copy the **Primary key → Connection string**. It starts with `endpoint=https://...`. **Save it to your notes.**

### B.6 Turn it on locally

In `backend\.env`:

```
EMAIL_PROVIDER=azure
ACS_CONNECTION_STRING=endpoint=https://...;accesskey=...
EMAIL_SENDER=DoNotReply@xxxxxxxx.azurecomm.net
```

Then restart the backend so it reads the new settings:

```powershell
docker compose up -d --force-recreate backend
```

**Check:**
1. **Admin → Run checks now**: "Communication Services" says OK.
2. Log out → **Forgot your password?** → your email. The email should arrive within a minute.
   - Free Azure domains often land in **spam** at first. Check there and mark it "Not spam".

---

## Part C: Put the update online

### C.1 Update `backend\env.prod.yaml`

Add these lines:

```yaml
ADMIN_EMAILS: "dhruvi.jain.btech2028@atlasskilltech.university"
EMAIL_PROVIDER: "azure"
ACS_CONNECTION_STRING: "endpoint=https://...;accesskey=..."
EMAIL_SENDER: "DoNotReply@xxxxxxxx.azurecomm.net"
```

Then fix yesterday's problem while you're there. Copy every Azure value from `.env` into `env.prod.yaml`, keeping the quotes:

```yaml
AZURE_TENANT_ID: "..."
AZURE_CLIENT_ID: "..."
AZURE_CLIENT_SECRET: "..."
AZURE_KEY_VAULT_URL: "https://....vault.azure.net/"
AZURE_STORAGE_CONNECTION_STRING: "DefaultEndpointsProtocol=https;..."
```

Also check that `APP_SECRET` and `CRON_SECRET` are long random values (from `make_secrets.py`), and that `COOKIE_SECURE` is `"true"`. The new startup check refuses short or default secrets in production.

### C.2 Deploy the backend

From the `cubby` folder, as **one line**:

```powershell
gcloud run deploy cubby-api --source ./backend --region asia-south1 --allow-unauthenticated --add-cloudsql-instances cubby-511102:asia-south1:cubby-db --env-vars-file ./backend/env.prod.yaml --no-cpu-throttling --memory 1Gi --max-instances 3
```

**If it fails** with something like "container failed to start": that's the new startup check doing its job. Your previous version keeps serving users. To see exactly what's missing:

```powershell
gcloud run services logs read cubby-api --region asia-south1 --limit 30
```

Look for `Cubby settings problem:` followed by a list. Fix those lines in `env.prod.yaml` and deploy again.

### C.3 Deploy the frontend

```powershell
cd frontend
npm run build
firebase deploy --only hosting
```

(`.firebaserc` already has your project ID, `cubby-511102`.)

### C.4 Check the live site

1. Open `https://cubby-511102.web.app` and **create your vault**. This should work now that the Azure values are filled in.
2. Set up two-factor sign-in, then **save your recovery codes**.
3. Open the **Admin** page and click **Run checks now**. Aim for OK on every service you use.
4. Upload a PDF and a photo, and ask a question.
5. Test **Forgot password** on the live site. The email's link should point to `cubby-511102.web.app`.

---

## Rate limits, for reference

| Action | Limit |
|---|---|
| Log in | 10 per minute per IP, plus a 15-minute lock after 5 wrong passwords |
| 2FA code | 10 per 5 min per IP, and 8 per 5 min per account |
| Sign up | 5 per hour per IP |
| Forgot / reset password | 5 / 10 per hour per IP |
| Chat | 20 per minute and 300 per day per user |
| Search | 60 per minute per user |
| Uploads | 40 per 10 minutes per user |
| Export | 5 per hour per user |

Each Cloud Run instance counts separately, so with up to 3 instances the real ceiling can be up to 3x these numbers. That's enough to stop abuse and runaway AI costs.
