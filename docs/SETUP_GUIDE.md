# Cubby setup guide, step by step

This guide takes you from an empty laptop to Cubby running live on the internet across AWS, Azure and Google Cloud. Do the parts in order. Each part ends with a **Check** so you know it worked before moving on.

| Part | What you'll do | Time |
|---|---|---|
| 0 | Install the tools | 30 min |
| 1 | Run Cubby on your laptop (no clouds yet) | 20 min |
| 2 | Google Cloud: switch on the AI | 25 min |
| 3 | Groq: add the backup AI | 5 min |
| 4 | AWS: file storage and OCR | 25 min |
| 5 | Azure: master key and backup | 35 min |
| 6 | Put it online (Cloud SQL, Cloud Run, Firebase, Scheduler) | 60 min |
| 7 | Troubleshooting | |
| 8 | Costs and cleaning up | |

**Two habits that save hours:**

- **Every time you change `backend/.env`, restart the backend.** Click the backend terminal, press `Ctrl + C`, then run the start command again. Settings are only read at startup.
- **Cloud websites change their buttons often.** If a label in this guide looks slightly different, use the search bar at the top of that cloud's website and type the service name.

**Keep a notes file.** Create a text file somewhere private called `cubby-secrets.txt`. Many steps say "save this to your notes". Never put this file in Git or share it.

---

## Part 0: Install the tools

Install each of these. Accept the default options unless a step says otherwise.

1. **VS Code** (code editor): https://code.visualstudio.com
2. **Python 3.12**: https://www.python.org/downloads/
   - **Windows:** on the first installer screen, tick **"Add python.exe to PATH"** before clicking Install.
3. **Node.js 22 LTS**: https://nodejs.org (pick the LTS button)
4. **Docker Desktop**: https://www.docker.com/products/docker-desktop/
   - After installing, open Docker Desktop once and wait until it says it's running.
   - **Windows:** if it asks to install or update WSL, say yes and restart.
5. **Google Cloud CLI** (`gcloud`): https://cloud.google.com/sdk/docs/install
   - Follow the installer for your system. On Windows, leave "Run gcloud init" ticked at the end. You can close that window; we'll run it properly in Part 2.
6. **Git** (optional but recommended): https://git-scm.com/downloads
7. **An authenticator app on your phone:** Google Authenticator, Microsoft Authenticator or Authy.

**Check:** open a new terminal (on Windows, use PowerShell; on Mac, use Terminal) and run each line. Each should print a version number.

```bash
python --version      # Mac may need: python3 --version
node --version
npm --version
docker --version
gcloud --version
```

If one says "not recognized" or "command not found", close the terminal, open a new one, and try again. If it still fails, reinstall that tool.

---

## Part 1: Run Cubby on your laptop

### 1.1 Unzip and open the project

1. Unzip `cubby.zip` somewhere easy, like `Documents/cubby`.
2. Open VS Code → **File → Open Folder…** → choose the `cubby` folder.
3. Open a terminal inside VS Code: **Terminal → New Terminal**. It starts in the `cubby` folder.

### 1.2 Start the database

In the VS Code terminal:

```bash
docker compose up -d
```

The first time, this downloads PostgreSQL with pgvector (a minute or two).

**Check:** `docker ps` shows a container with `pgvector/pgvector:pg16` and status "Up".

### 1.3 Set up the backend

Still in the terminal:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment (you'll do this every time you open a new backend terminal):

- **Windows (PowerShell):** `.venv\Scripts\activate`
  - If you get a red error about "running scripts is disabled", run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, type `Y`, then try again.
- **Mac/Linux:** `source .venv/bin/activate`

You'll see `(.venv)` at the start of the line. Now install the packages:

```bash
pip install -r requirements.txt
```

### 1.4 Create your `.env` file

1. Copy the template:
   - **Windows:** `copy .env.example .env`
   - **Mac/Linux:** `cp .env.example .env`
2. Generate secrets:
   ```bash
   python scripts/make_secrets.py
   ```
3. It prints three lines (`APP_SECRET=…`, `CRON_SECRET=…`, `LOCAL_MASTER_KEY=…`). In VS Code, open `backend/.env` and replace the three matching empty lines with them. Save the file (`Ctrl + S`).

### 1.5 Start the backend

```bash
uvicorn app.main:app --reload --port 8000
```

**Check:** open http://localhost:8000/api/health in your browser. You should see `{"ok":true,"env":"local"}`. Leave this terminal running.

### 1.6 Start the frontend

1. Open a **second** terminal: **Terminal → New Terminal** (or the `+` button in the terminal panel).
2. Run:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. Open http://localhost:5173.

### 1.7 Try it

1. Click **Create vault**, fill in your details.
2. On the two-factor screen, open your authenticator app → **Add** (+) → **Scan a QR code** → scan the code on screen.
3. Type the 6-digit code the app shows. You'll go through onboarding into your vault.
4. Go to **Documents** and upload any text-based PDF.

**Check:** the document appears, then shows **Needs attention** with a message that AI isn't set up yet. **That's expected.** Upload, encryption, storage and login all work; Part 2 turns on the AI.

---

## Part 2: Google Cloud: switch on the AI

Google renamed Vertex AI to **Gemini Enterprise Agent Platform** in 2026. Your code talks to it exactly as it did with Vertex AI; only the console labels changed.

### 2.1 Create a project

1. Go to https://console.cloud.google.com and sign in.
2. At the top left, click the **project picker** (next to the Google Cloud logo) → **New Project**.
3. Project name: `cubby`. Google suggests a **Project ID** below it (like `cubby-471512`). **Save the Project ID to your notes.** You'll need it many times.
4. Click **Create**, wait for the notification, then pick the new project in the project picker.

### 2.2 Turn on billing (uses free credits)

1. Search bar at the top → type **Billing** → open it.
2. If asked, **Link a billing account** and pick your account (the one with the $300 free trial if you have it).

The AI needs billing switched on even though your usage will be covered by free credits. Part 8 shows how to set a budget alert.

### 2.3 Enable the AI API

1. Search bar → type **Agent Platform** → open it. (If you can't find it, search **aiplatform** in **APIs & Services → Library**. The API is called `aiplatform.googleapis.com`.)
2. Click **Enable** (or **Enable all recommended APIs**). Wait until it finishes.

### 2.4 Let your laptop use Google Cloud

In a **new** terminal (not the ones running Cubby):

```bash
gcloud init
```

- It opens a browser to log in. Use the same Google account.
- When asked to pick a project, choose your `cubby` project ID.
- If it asks about a default region, you can pick `asia-south1` (Mumbai) or skip.

Then run these two (replace `YOUR-PROJECT-ID`):

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR-PROJECT-ID
```

The first opens your browser again. Click **Allow**. This saves login details on your laptop that the backend uses automatically. No key files needed.

### 2.5 Tell Cubby about it

In `backend/.env`, set:

```
LLM_PROVIDER=gemini
GCP_PROJECT_ID=YOUR-PROJECT-ID
GCP_LOCATION=global
```

Save, then **restart the backend** (in its terminal: `Ctrl + C`, then `uvicorn app.main:app --reload --port 8000`).

**Check:**

1. In Cubby, open the document that failed in Part 1 → click **Reprocess**.
2. Within about 20 seconds it should become **Ready**, with a shelf, a summary and any dates it found.
3. Go to **Ask Cubby** and ask a question about it. The answer should have little numbered citation chips.

If it fails, the error message on the document tells you why. See Part 7, "AI errors".

---

## Part 3: Groq: add the backup AI

1. Go to https://console.groq.com and sign in.
2. Left menu → **API Keys** → **Create API Key** → name it `cubby` → **Submit**.
3. Copy the key immediately (it's only shown once). **Save it to your notes.**
4. In `backend/.env`:
   ```
   GROQ_API_KEY=paste-your-key
   LLM_FALLBACK=true
   ```
5. Save and restart the backend.

**Check:** temporarily set `LLM_PROVIDER=groq`, restart, ask Cubby a question. Under the answer it should say "Answered by Groq (backup)". Then set it back to `LLM_PROVIDER=gemini` and restart.

> Embeddings (the search part) always use Gemini. Groq only takes over writing answers, sorting and summaries.

---

## Part 4: AWS: file storage and OCR

### 4.1 Pick the region

1. Go to https://console.aws.amazon.com and sign in.
2. At the **top right**, next to your account name, click the region name → choose **Asia Pacific (Mumbai) ap-south-1**. Stay in this region for everything below.

### 4.2 Create the S3 bucket

1. Search bar → **S3** → open it → **Create bucket**.
2. **Bucket name:** must be unique across all of AWS, lowercase. Use something like `cubby-files-yourname-2026`. **Save it to your notes.**
3. **Object Ownership:** leave **ACLs disabled**.
4. **Block Public Access settings:** leave **Block all public access** ticked.
5. **Bucket Versioning:** leave Disabled.
6. **Default encryption:** leave **SSE-S3**.
7. Scroll down → **Create bucket**.

### 4.3 Create a limited permission policy

This lets Cubby use only your bucket and OCR, nothing else in your AWS account.

1. Search bar → **IAM** → open it.
2. Left menu → **Policies** → **Create policy**.
3. Click the **JSON** tab. Delete everything in the box and paste this, replacing **both** `YOUR-BUCKET-NAME`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME"
    },
    {
      "Effect": "Allow",
      "Action": ["textract:DetectDocumentText"],
      "Resource": "*"
    }
  ]
}
```

4. **Next** → Policy name: `CubbyAppPolicy` → **Create policy**.

### 4.4 Create a user for Cubby

1. IAM left menu → **Users** → **Create user**.
2. User name: `cubby-app`. Leave **"Provide user access to the AWS Management Console"** unticked → **Next**.
3. Choose **Attach policies directly** → in the search box type `CubbyAppPolicy` → tick it → **Next** → **Create user**.

### 4.5 Create its access key

1. Click the new user `cubby-app` → **Security credentials** tab.
2. Scroll to **Access keys** → **Create access key**.
3. Use case: **Application running outside AWS** → **Next** → **Create access key**.
4. You'll see an **Access key** and a **Secret access key**. Click **Download .csv file** and also copy both into your notes. **The secret is only shown once.**

### 4.6 Tell Cubby about it

In `backend/.env`:

```
STORAGE_PRIMARY=s3
OCR_PROVIDER=textract
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET=your-bucket-name
```

Save and restart the backend.

**Check:**

1. In Cubby, open **Trust Center**. Under AWS, **S3** and **Textract** should say **Live** (the status refreshes about once a minute; reload the page if needed).
2. Upload a new document. Then in the AWS console, open your bucket. You'll see a folder with a file in it. Download it if you're curious: it's unreadable gibberish, because it's encrypted. That's the point.
3. Upload a photo of a document (PNG or JPG). It should get read and become **Ready**. That's Textract.

> Documents uploaded before this step stay on your laptop's storage. That's fine for testing.

---

## Part 5: Azure: master key and backup

### 5.1 Create a resource group

A resource group is just a folder for related Azure things.

1. Go to https://portal.azure.com and sign in.
2. Search bar → **Resource groups** → **+ Create**.
3. Subscription: your subscription. Resource group: `cubby-rg`. Region: **(Asia Pacific) Central India**.
4. **Review + create** → **Create**.

### 5.2 Create the storage account (backup copies)

1. Search bar → **Storage accounts** → **+ Create**.
2. **Basics** tab:
   - Resource group: `cubby-rg`
   - Storage account name: lowercase letters and numbers only, 3 to 24 characters, unique worldwide. Example: `cubbybackupyourname`.
   - Region: **Central India**
   - Primary service: **Azure Blob Storage or Azure Data Lake Storage Gen 2** (if asked)
   - Performance: **Standard**
   - Redundancy: **Locally-redundant storage (LRS)** (cheapest)
3. Click **Review + create** → **Create**. Wait for "Your deployment is complete" → **Go to resource**.
4. Left menu → **Data storage → Containers** → **+ Container** (or **+ Add container**).
   - Name: `cubby-backup`
   - Anonymous access level: **Private (no anonymous access)**
   - **Create**.
5. Left menu → **Security + networking → Access keys**.
6. Next to **key1 → Connection string**, click **Show** → copy the whole string (it starts with `DefaultEndpointsProtocol=https;…`). **Save it to your notes.**

### 5.3 Create the Key Vault

1. Search bar → **Key vaults** → **+ Create**.
2. **Basics** tab:
   - Resource group: `cubby-rg`
   - Key vault name: 3 to 24 characters, unique worldwide. Example: `cubby-kv-yourname`.
   - Region: **Central India**
   - Pricing tier: **Standard**
3. **Access configuration** tab: make sure **Azure role-based access control** is selected (it's usually the default).
4. **Review + create** → **Create** → **Go to resource**.
5. On the vault's **Overview** page, copy the **Vault URI** (like `https://cubby-kv-yourname.vault.azure.net/`). **Save it to your notes.**

### 5.4 Give yourself permission to create keys

Even as the owner, you need this role to create keys inside the vault.

1. In your Key Vault, left menu → **Access control (IAM)** → **+ Add** → **Add role assignment**.
2. **Role** tab: search **Key Vault Administrator** → select it → **Next**.
3. **Members** tab: **Assign access to: User, group, or service principal** → **+ Select members** → search your own email → click it → **Select**.
4. **Review + assign** → **Review + assign**.
5. Wait about 2 minutes for it to take effect.

### 5.5 Create the master key

1. In your Key Vault, left menu → **Objects → Keys** → **+ Generate/Import**.
2. Options: **Generate**. Name: `cubby-master-key`. Key type: **RSA**. RSA key size: **2048**.
3. Leave the rest → **Create**.

If you get "not authorized", wait another minute after step 5.4 and refresh.

### 5.6 Create an identity for Cubby (app registration)

This is Cubby's own login to Azure, separate from yours.

1. Search bar → **Microsoft Entra ID** → open it.
2. Left menu → **Manage → App registrations** → **+ New registration**.
3. Name: `cubby-backend`. Supported account types: leave the first option (**single tenant**). Leave Redirect URI empty → **Register**.
4. On its **Overview** page, copy into your notes:
   - **Application (client) ID**
   - **Directory (tenant) ID**
5. Left menu → **Manage → Certificates & secrets** → **Client secrets** tab → **+ New client secret**.
   - Description: `cubby`. Expires: **180 days** (set a calendar reminder to renew it).
   - **Add**.
6. Copy the **Value** column immediately (not the "Secret ID"). **It's only shown once.** Save it to your notes.

### 5.7 Let Cubby use the key (and nothing else)

1. Go back to your **Key Vault** → **Access control (IAM)** → **+ Add** → **Add role assignment**.
2. Role: search **Key Vault Crypto User** → select → **Next**.
3. Members: **+ Select members** → search `cubby-backend` → click it → **Select**.
4. **Review + assign** → **Review + assign**.

This role lets Cubby wrap and unwrap keys, but it can't read secrets, delete keys or change the vault.

### 5.8 Tell Cubby about it

In `backend/.env`:

```
KEY_PROVIDER=azure
STORAGE_BACKUP=azure
AZURE_TENANT_ID=your-directory-tenant-id
AZURE_CLIENT_ID=your-application-client-id
AZURE_CLIENT_SECRET=your-client-secret-value
AZURE_KEY_VAULT_URL=https://cubby-kv-yourname.vault.azure.net/
AZURE_KEY_NAME=cubby-master-key
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...
AZURE_BLOB_CONTAINER=cubby-backup
```

Save and restart the backend.

**Check:**

1. **Trust Center** → under Azure, **Key Vault** and **Blob Storage** both say **Live**.
2. Log out and back in, then open any document. Behind the scenes, Cubby moves your personal key from local mode to Azure Key Vault the first time it's used. The upload steps in Trust Center will now say "master key held in Azure Key Vault".
3. Upload a new document. In the Azure portal, open your storage account → **Containers → cubby-backup**. The encrypted backup copy is there.

**All three clouds are now working from your laptop.** 🎉

---

## Part 6: Put it online

Everything here happens in Google Cloud, in your `cubby` project, in region **asia-south1 (Mumbai)**.

### 6.1 Enable the APIs

1. Google Cloud console → search **APIs & Services** → **Library**.
2. Search and **Enable** each of these, one by one:
   - **Cloud Run Admin API**
   - **Cloud Build API**
   - **Artifact Registry API**
   - **Cloud SQL Admin API**
   - **Cloud Scheduler API**

### 6.2 Create the Cloud SQL database

1. Search bar → **SQL** → **Create instance** → **Choose PostgreSQL**.
2. If asked for an edition, choose **Enterprise**, and for the preset choose **Sandbox** (or **Development**). These are the cheapest.
3. Instance ID: `cubby-db`.
4. Password: click **Generate**, copy it to your notes. (This is the `postgres` admin password.)
5. Database version: **PostgreSQL 16**.
6. Region: **asia-south1 (Mumbai)**. Zonal availability: **Single zone**.
7. If there's a **Machine configuration** section, choose the smallest **Shared core** option.
8. **Create instance**. This takes about 10 minutes. Carry on with 6.3 in the meantime, then come back.

When it's ready:

9. Open `cubby-db` → left menu **Databases** → **Create database** → name `cubby` → **Create**.
10. Left menu **Users** → **Add user account** → **Built-in authentication** → username `cubby` → generate or type a strong password (letters and numbers only makes it easier) → **Add**. **Save this password to your notes.**
11. On the instance **Overview** page, find **Connection name** (like `cubby-471512:asia-south1:cubby-db`). **Save it to your notes.**

### 6.3 Give Cloud Run permission to use the AI and database

Cloud Run runs as a robot account called the **default compute service account**.

1. Search bar → **IAM** → open **IAM** (under IAM & Admin).
2. Find the row whose principal looks like `123456789-compute@developer.gserviceaccount.com`. If you don't see it, tick **Include Google-provided role grants** at the top right.
3. Click the pencil ✏️ on that row → **+ Add another role**, and add each of:
   - **Vertex AI User** (it may be listed as **Agent Platform User**; search "aiplatform.user" if unsure)
   - **Cloud SQL Client**
   - **Cloud Build Service Account** (needed to build from source)
   - **Logs Writer**
4. **Save**.

### 6.4 Prepare production settings

1. In VS Code, copy `backend/env.prod.example.yaml` to `backend/env.prod.yaml` (right-click → Copy, then Paste, then rename).
2. Run `python scripts/make_secrets.py` again and use the **new** `APP_SECRET` and `CRON_SECRET` values. Don't reuse your laptop's.
3. Fill in every value, using your notes:
   - `FRONTEND_ORIGIN`: `https://YOUR-PROJECT-ID.web.app`
   - `DATABASE_URL`: replace `DB_PASSWORD` with the **cubby** user's password from 6.2 step 10, and `YOUR-PROJECT-ID:asia-south1:cubby-db` with your **connection name**.
   - AWS, Azure, Groq and GCP values: same as in your `.env`.
4. Save. `env.prod.yaml` is already in `.gitignore` so it won't be committed.

> If your database password contains special characters like `@`, `#` or `/`, the URL breaks. Use a letters-and-numbers password, or change it in Cloud SQL → Users.

### 6.5 Deploy the backend to Cloud Run

In a terminal, go to the `cubby` folder (the one with `backend` and `frontend` inside) and run this as **one** command. Replace both `YOUR-PROJECT-ID`s. On Windows PowerShell, put it on one line and remove the `\` characters.

```bash
gcloud run deploy cubby-api \
  --source ./backend \
  --region asia-south1 \
  --allow-unauthenticated \
  --add-cloudsql-instances YOUR-PROJECT-ID:asia-south1:cubby-db \
  --env-vars-file ./backend/env.prod.yaml \
  --no-cpu-throttling \
  --memory 1Gi \
  --max-instances 3
```

- If it asks to create an Artifact Registry repository, type `Y`.
- The first build takes 3 to 6 minutes.
- `--no-cpu-throttling` matters: without it, Cloud Run pauses work after sending a response, and document processing would stall after upload.

When it finishes, it prints a **Service URL** like `https://cubby-api-abc123-el.a.run.app`. **Save it to your notes.**

**Check:** open `SERVICE-URL/api/health` in your browser. You should see `{"ok":true,"env":"production"}`.

### 6.6 Deploy the frontend to Firebase Hosting

1. Go to https://console.firebase.google.com → **Create a project** (or **Add project**).
2. In the name box, start typing `cubby` and **pick your existing Google Cloud project** from the dropdown (this links them instead of making a new one). Continue through the steps. Google Analytics is optional; you can turn it off.
3. In a terminal:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
4. In VS Code, open `frontend/.firebaserc` and replace `YOUR-PROJECT-ID` with your project ID. Save.
5. Build and deploy:
   ```bash
   cd frontend
   npm run build
   firebase deploy --only hosting
   ```
6. It prints a **Hosting URL**: `https://YOUR-PROJECT-ID.web.app`.

`frontend/firebase.json` already sends every `/api/...` request to your Cloud Run service, so the site and backend share one address. That's why the login cookie works.

**Check:** open the Hosting URL, create a fresh account (production uses a separate database from your laptop), set up 2FA, upload a document, and ask a question.

### 6.7 Schedule the daily reminders

1. Google Cloud console → search **Cloud Scheduler** → **Create job**.
2. Name: `cubby-pulse`. Region: **asia-south1**.
3. Frequency: `0 8 * * *` (every day at 8:00). Timezone: **India Standard Time (Asia/Kolkata)**.
4. **Continue**. Target type: **HTTP**.
5. URL: `YOUR-SERVICE-URL/api/internal/pulse` (the Cloud Run URL from 6.5, not the web.app one).
6. HTTP method: **POST**.
7. **Add a header**: Name `X-Cron-Secret`, Value: the `CRON_SECRET` from `env.prod.yaml`.
8. **Create**.

**Check:** in the jobs list, click the three dots on `cubby-pulse` → **Force run**. After a few seconds, **Status of last execution** should say **Success**.

**Cubby is live.** 🎉

### Updating later

- **Backend changes:** run the same `gcloud run deploy …` command from 6.5.
- **Frontend changes:** `cd frontend`, `npm run build`, `firebase deploy --only hosting`.
- **Changing a setting in production:** edit `env.prod.yaml` and redeploy the backend.

---

## Part 7: Troubleshooting

**Backend won't start: "LOCAL_MASTER_KEY is empty"**
You skipped 1.4. Run `python scripts/make_secrets.py` and paste the values into `backend/.env`.

**`docker compose up` fails or "port 5432 is already allocated"**
Make sure Docker Desktop is open and running. If you already have PostgreSQL installed on your computer, stop it, or change the left number in `docker-compose.yml` to `"5433:5432"` and the port in `DATABASE_URL` to `5433`.

**`pip install` fails on Windows with "Microsoft Visual C++ required"**
Make sure you're using Python 3.12 (`python --version`). Newer, very recent Python versions sometimes don't have ready-made packages yet.

**Frontend shows a blank page or "Failed to fetch"**
The backend isn't running. Check the backend terminal for a red error.

**"That code didn't work" during 2FA**
Your phone's clock must be accurate. Turn on automatic date and time in your phone settings.

**AI errors on documents ("AI isn't set up yet…", 403, 404, "permission denied")**
- Check `GCP_PROJECT_ID` has no typos and no spaces.
- Re-run `gcloud auth application-default login` and `gcloud auth application-default set-quota-project YOUR-PROJECT-ID`.
- Confirm the Agent Platform API is enabled (2.3) and billing is linked (2.2).
- If the error mentions a model "not found", try `GCP_LOCATION=us-central1`. If it still says not found, Google may have renamed the model: check the current names on Google's "Latest stable models" page and update `GEMINI_MODEL` or `GEMINI_EMBED_MODEL`. If you change `GEMINI_EMBED_MODEL`, press **Reprocess** on each existing document.
- Restart the backend after any change.

**Groq errors ("model not found" or "decommissioned")**
Groq retires models every few months. Check https://console.groq.com/docs/models and update `GROQ_MODEL`.

**AWS: "AccessDenied"**
- The bucket name in the policy (4.3) must exactly match `S3_BUCKET`.
- The bucket's region must be `ap-south-1` to match `AWS_REGION`.

**Azure: "Forbidden" or "not authorized" from Key Vault**
- Role assignments take a few minutes. Wait 5 minutes and restart the backend.
- Check that `cubby-backend` has **Key Vault Crypto User** on the vault (5.7).
- `AZURE_CLIENT_SECRET` must be the secret's **Value**, not its **Secret ID**.

**Azure: "The specified container does not exist"**
The container name must be exactly `cubby-backup` (5.2 step 4), matching `AZURE_BLOB_CONTAINER`.

**Cloud Run deploy fails with a permissions or build error**
Recheck 6.3, especially **Cloud Build Service Account** and **Logs Writer** on the compute service account. Then run the deploy again.

**Cloud Run starts but the site says "Something went wrong (500)"**
Google Cloud console → **Cloud Run** → `cubby-api` → **Logs**. The red line near the bottom says what failed. The usual cause is a wrong `DATABASE_URL` (password or connection name).

**Logged in on the live site but immediately logged out again**
`COOKIE_SECURE` must be `"true"`, and you must use the `web.app` address, not the Cloud Run URL directly.

**Documents stay on "Reading…" forever on the live site**
The deploy is missing `--no-cpu-throttling`. Redeploy with the full command from 6.5.

---

## Part 8: Costs and cleaning up

With light personal use, you should stay within free tiers and trial credits, but set alerts anyway.

- **Google Cloud:** Billing → **Budgets & alerts** → **Create budget** → amount ₹1,000 (or $10) → alert at 50%, 90%, 100%. The biggest cost is Cloud SQL, which runs all the time. Stop it when you're not using it: SQL → `cubby-db` → **Stop**.
- **AWS:** search **Billing and Cost Management** → **Budgets** → **Create budget** → use the **Zero spend budget** template. Textract's free tier covers 1,000 pages a month for the first three months; after that it's charged per page.
- **Azure:** search **Cost Management** → **Budgets** → **+ Add** on your subscription.

**To delete everything later:**

- Google Cloud: delete the `cubby` project (IAM & Admin → Settings → **Shut down**).
- AWS: empty and delete the S3 bucket, delete the `cubby-app` user and `CubbyAppPolicy`.
- Azure: delete the `cubby-rg` resource group (this removes the vault and storage account), and the `cubby-backend` app registration.

> Deleting the Azure key makes every encrypted file unreadable forever. That's a feature for a vault, but export anything you want to keep first (Trust Center → **Export vault**).
