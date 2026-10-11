# Upgrading to Cubby v1.2, step by step

## What's new

**Reading and asking**
- **Document viewer inside Cubby.** PDFs, photos and text files open in the app. Clicking a citation in chat, search or a report slides the document in from the right, opened at the right page with the quoted passage **highlighted**.
- **Answers type out live** instead of appearing after a wait.
- **Floating Cubby** in the corner of every page. On a document page it only answers about that document.
- **Save as note**: keep any chat answer, with its citations, in Studio.

**Organising**
- **ID cards**: passports, Aadhaar, PAN, driving licences and voter IDs are recognised and shown as cards under **Your IDs**, grouped by person.
  - Aadhaar numbers are checked with their official checksum, PAN numbers by format, and passports with their machine-readable lines. Verified cards get a ✓.
  - Numbers are masked (••••7611). **Show** needs your password and hides the number again after 30 seconds.
  - Upload a renewed passport and the old one is marked **Old version** automatically. Reminders only use the current one.
- **Duplicate detection**: uploading the exact same file twice is stopped with a friendly message.
- **"Is this right?"**: when Cubby isn't sure what a document is, it asks you instead of guessing silently.
- **Star** documents, **sort** them, **filter** by name, and **select** several at once to star, move or delete them.
- **Pin** reminders on the Overview to keep them at the top.

**Privacy shield**
- Before any text goes to the AI, long numbers (Aadhaar, account and card numbers), PAN and passport numbers, and passport machine-readable lines are masked down to their last 4 characters. The AI can say "your Aadhaar ending 7611", but never sees the whole number.

**Sharing**
- **Share links** for one document: choose 1 hour to 30 days, an optional view limit, and whether a download button shows.
  - The person opens a clean Cubby page without an account.
  - You get a notification each time it's opened, and can turn it off any time from the document or the Trust Center.

**Studio** (new sidebar item)
- **Notes** in Markdown, with autosave.
- **Reports**: Document summary, Insurance coverage, Identity documents checklist, Year ahead, or "Ask for a report".
  - The ID checklist and Year ahead are built straight from your data, so their numbers are always exact. The others are written by the AI with citations.
- **Vault infographic**: a one-page picture of your vault (shelves, uploads by month, upcoming dates, ID health). Every report and the infographic can be **printed or saved as PDF**.

**Password vault** (new sidebar item)
- Logins, Wi-Fi passwords and secure notes, protected by a separate **vault passphrase**.
  - Encrypted in your browser before saving, so Cubby's servers only see scrambled data, and the AI can never read it.
- Password generator and strength meter. Copied passwords clear from the clipboard after 30 seconds.
- **Check health** finds weak, reused and breached passwords. The breach check uses Have I Been Pwned and sends only 5 characters of each password's fingerprint, never the password.
- Locks after 5 minutes idle, or when you leave the page.

**Reminders by email**
- The daily check now emails a short digest of upcoming expiries and renewals (at 90, 30, 7 and 1 days). It can be turned off in **Settings → Reminders**.

Time needed: about 15 minutes for Part A, 20 for Part B, 10 for Part C.

---

## Part A: Update the code on your laptop

Same routine as v1.1.

1. Stop Cubby: `docker compose down` in the `cubby` folder (**never `-v`**), and `Ctrl + C` in the frontend terminal.
2. In File Explorer, rename your current `cubby` folder to `cubby-v1.1` (delete any older backup first if you like).
3. Unzip `cubby-v1.2.zip` into the same place.
4. Copy these from `cubby-v1.1` into the new `cubby`, same places:
   - `backend\.env`
   - `backend\env.prod.yaml`
   - the `backend\data` folder, if it exists
5. Start the backend:
   ```powershell
   docker compose up -d --build
   docker compose logs -f backend
   ```
   Wait for `Application startup complete.`, then press `Ctrl + C`. The database adds its new tables and columns by itself.
6. Start the frontend. **`npm install` is required this time**, because there are new packages for the PDF viewer and Markdown:
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

### A.7 Refresh your existing documents

Documents uploaded before v1.2 haven't been through ID recognition or the privacy shield yet.

1. Open each ID document (passport, Aadhaar, PAN…) and press **Reprocess**.
2. After about 20 seconds they appear as cards under **Documents → Your IDs**.

Duplicate detection only applies to files uploaded from now on.

---

## Part B: Try everything locally

Open http://localhost:5173 and work through this list. Each line takes a minute or less.

**Documents and IDs**
1. **Documents**: upload a PDF of your passport or Aadhaar. A card should appear under **Your IDs**, with the number masked.
2. Open that card → **Show** → enter your password. The full number appears, and hides itself again after 30 seconds.
3. Upload the same file again. You should see "already in your vault".
4. Star a document. Then press **Select**, pick two documents, and move them to another shelf.

**Asking**
5. **Ask Cubby**: ask a question. The answer types out live.
6. Click a numbered citation. The document slides in, opened at that page with the passage highlighted.
7. Under the answer, click **Save as note**.
8. Go to the **Overview** and click Cubby in the bottom-right corner. Ask something in the little chat.
9. Open a document and ask the floating Cubby again. It should say "About this document".

**Studio**
10. Open the note you saved in step 7.
11. Click **New report → Identity documents checklist**, then **Print or PDF**.
12. Open the **Vault infographic** tab.

**Sharing and passwords**
13. On a document, click **Share** → 1 day → **Create link** → **Copy**. Open the link in a private/incognito window: you'll see the shared page without logging in. Back in Cubby, the bell shows "Your shared link … was opened".
14. **Passwords**: create a vault passphrase. Add a login, try **Generate**, and copy a password. Then **Lock** and unlock again.
15. **Settings → Reminders**: the switch is there.

To see a reminder email locally, run this in a terminal (use your `CRON_SECRET` from `backend\.env`):

```powershell
curl.exe -X POST http://localhost:8000/api/internal/pulse -H "X-Cron-Secret: YOUR_CRON_SECRET"
docker compose logs backend
```

With `EMAIL_PROVIDER=console` the email is printed in the logs. With `azure` it arrives in your inbox. Only reminders for dates within 90 days are sent, and each one only once.

---

## Part C: Put the update online

1. **Backend**, from the `cubby` folder, as one line:
   ```powershell
   gcloud run deploy cubby-api --source ./backend --region asia-south1 --allow-unauthenticated --add-cloudsql-instances cubby-511102:asia-south1:cubby-db --env-vars-file ./backend/env.prod.yaml --no-cpu-throttling --memory 1Gi --max-instances 3
   ```
2. **Frontend:**
   ```powershell
   cd frontend
   npm run build
   firebase deploy --only hosting
   ```
3. **Daily reminder emails** use the Cloud Scheduler job from setup guide step 6.7.
   - If you skipped that step, do it now.
   - If you already made it, there's nothing to change: it now sends emails too.
4. On the live site, **Reprocess** your ID documents (as in A.7) and try a share link from your phone.

---

## Good to know

- **Live typing on the website.** On your laptop, answers type out word by word. On `web.app`, Firebase Hosting may hold the response until it's complete, so answers can appear all at once. They still work either way.
- **Share links are shown once.** Cubby stores only a fingerprint of each link, so copy it when you create it. You can always make a new one.
- **The vault passphrase can't be recovered.** If it's forgotten, **Forgot your vault passphrase?** deletes the saved passwords so you can start again. Documents aren't affected.
- **The breach check** contacts `api.pwnedpasswords.com` from your browser. The website's security settings already allow it.
- **Export** (Trust Center) now includes your Studio notes as Markdown files. Saved passwords aren't exported, because Cubby can't read them.
