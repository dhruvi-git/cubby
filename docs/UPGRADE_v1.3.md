# Upgrading to Cubby v1.3: Family vaults

## What's new

**Family** (new sidebar item, the heart-handshake icon) is a private group chat for a household's documents, a bit like a WhatsApp group made for paperwork.

- **Families.** Start one (pick a name, an emoji and a colour) and invite people by email. You can be in up to 5 families, each with up to 12 people.
  - Invites show up on the Family page (and in the bell) for anyone who signs in with that email. They also get an email.
  - Invites last 14 days.
- **Chat.** Messages, replies, "Seen by…" read receipts, unread counts, and a dot on the Family icon when something's new.
- **Share documents as cards.** Use **+ → Share a document** in the chat, or the new **Family** button on any document page.
  - The card shows the title, type and shelf, plus a masked ID number and an expiry warning where those apply.
  - Members can **Open** it in the viewer or **Save to my vault**.
  - Whoever shared it, or an admin, can remove it.
- **Document requests.** **+ → Request a document**, for example "Birth certificate" from Mumma, with a note.
  - She gets a notification, and the card in the chat has **Share it** and **I don't have it** buttons.
  - When she shares, the card turns green and the document arrives as a reply.
- **@Cubby in the group.** Type `@Cubby when does our health policy renew?`.
  - Cubby answers in the chat **only from documents shared in this family**, with numbered sources that open the page.
  - It never looks at anyone's personal vault.
- **Shared reminders.** Expiry and renewal dates in shared documents remind **every member** (90, 30, 7 and 1 days before), including in the daily email.
- **People.** Admins can rename the family, make others admins, remove people and delete the family. Anyone can leave.
  - If the last admin leaves, the longest-standing member becomes admin.
  - If everyone leaves, the family and its copies are deleted.

### How it stays private

- Every family gets **its own data key**, wrapped by the same master key in Azure Key Vault as everyone's personal keys.
- Sharing makes a **separate encrypted copy** for the family:
  - The copy is stored on S3, with a backup on Azure Blob.
  - Its searchable passages are copied into Cloud SQL, encrypted with the family key.
- So:
  - Deleting your original doesn't break the chat.
  - Leaving a family takes nothing of the family's with you.
  - Nobody ever touches anyone else's personal key.
- **Full ID numbers never enter a family.** The family copy only ever stores the masked number (••••234K). Anyone who needs the full number can **Save to my vault**, and Cubby reads it again there.
- Messages are encrypted at rest with the family key, just like your chats.
- Only members can open anything. An ex-member immediately loses access.

Time needed: about 10 minutes for Part A, 10 for Part B, 10 for Part C.

---

## Part A: Update the code on your laptop

Same routine as before.

1. Stop Cubby: `docker compose down` in the `cubby` folder (**never `-v`**), and `Ctrl + C` in the frontend terminal.
2. Rename your current `cubby` folder to `cubby-v1.2`.
3. Unzip `cubby-v1.3.zip` into the same place.
4. Copy these from `cubby-v1.2` into the new `cubby`, same places:
   - `backend\.env`
   - `backend\env.prod.yaml`
   - the `backend\data` folder, if it exists
5. Start the backend:
   ```powershell
   docker compose up -d --build
   docker compose logs -f backend
   ```
   Wait for `Application startup complete.`, then press `Ctrl + C`. The seven new family tables are created by themselves. Nothing in your existing data changes.
6. Start the frontend. No new packages this time, but `npm install` is harmless:
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

---

## Part B: Try it locally

A family needs two people, so you need a second account.

1. **Second account.** Open a **private/incognito window** at http://localhost:5173 and sign up with a different email (a second address of yours, or a `+family` alias like `you+family@gmail.com`). Set up 2FA for it too.
2. **Start a family.** In your normal window: **Family → New**, then pick a name and emoji → **Create family**.
3. **Invite.** Click the **ⓘ** button at the top right of the chat → **People** → enter the second account's email → **Invite**. With `EMAIL_PROVIDER=console`, the invite email is printed in `docker compose logs backend`.
4. **Join.** In the incognito window, open **Family**: the invite card is at the top. Click **Join**.
5. **Chat.** Send a message from each side. Within a few seconds it appears on the other, and **Seen by…** shows under your last message.
6. **Share.** In the chat, click **+ → Share a document** and pick one. Or open a document and click **Family**. The card appears for both of you. From the other account, click **Open**, then **Save to my vault**.
7. **Request.** From the second account: **+ → Request a document** → "Birth certificate" → choose you. In your window, the bell shows the request. Click **Share it** on the card and pick a document. The card turns green.
8. **@Cubby.** Type `@Cubby what's in the health policy?` (any question about a shared document). Cubby answers with a source. Click the number to open the page.
9. **Reminders.** Run the daily check as before:
   ```powershell
   curl.exe -X POST http://localhost:8000/api/internal/pulse -H "X-Cron-Secret: YOUR_CRON_SECRET"
   ```
   Both accounts get a reminder for any date within 90 days in a shared document.

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
3. Nothing to change in Azure, AWS, Cloud Scheduler or `env.prod.yaml`.
   - Family files go to the same S3 bucket and Azure backup (under `family/…`).
   - Invite emails use the same Azure Communication Services sender.
4. On the live site, repeat Part B with a second account.

---

## Good to know

- **Invites are matched by email.** Whoever signs in to Cubby with the invited address can accept, so double-check the address before sending.
- **The chat refreshes every 3 seconds** while it's open (and pauses when the tab is in the background). There's no separate realtime server to run or pay for.
- **@Cubby counts toward your chat limit** (20 questions a minute, 300 a day), the same as Ask Cubby.
- **Removing someone** stops their access straight away. Documents they shared stay in the family until the sharer or an admin removes them.
- **Deleting a family** deletes the chat and the family's copies for everyone. Everyone's own originals stay in their vaults.
