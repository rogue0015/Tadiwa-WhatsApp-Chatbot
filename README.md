# Fung.ai WhatsApp Helpdesk — Technical Guide & User Manual

> **Last updated:** April 2026 · v1.2.0

---

## 1. Project Overview

Fung.ai Helpdesk is a robust, self-hosted Node.js application that bridges WhatsApp with a browser-based, interactive admin dashboard. The system automatically intercepts incoming messages sent directly to the bot (DMs) or via group mentions, tracks media attachments, and empowers your team to reply to customers in real time. Sent replies are instantly dispatched back to the user's WhatsApp device.

### 🌟 Key Features

| Feature | Description |
|---|---|
| **📲 Seamless WhatsApp Integration** | Receives, logs, and replies to messages using `whatsapp-web.js`. |
| **🔐 Role-Based Security** | Secure `username` + `password` login. Persistent session (`localStorage`) so page refreshes do not suddenly log you out. |
| **🔎 Message Filtering**| Filter tickets instantly by `All`, `Unread`, `Replied`, Date, or dynamically by `Replier` (superadmin only). |
| **🏢 Dynamic Departments** | Assign categories to replies via a structured dropdown consisting of predefined core departments + any active custom departments. |
| **📊 Live Analytics** | Real-time computations on total volume, resolution rate, and visual department breakdown charts to optimize workflows. |
| **👥 User Management** | Powerful dashboard to add new users, delete existing members, and elevate staff to `superadmin` or normal `admin`. |
| **🕵️ Privacy-First Attributions** | Normal `admin`s see "Replied", but only `superadmin`s have the privilege to see precisely *who* replied to a specific message. |
| **📋 Comprehensive System Logs** | Front-end log viewer displaying fully tagged `READ`, `WRITE`, `AUTH`, and backend system events explicitly timestamped. |

---

## 2. Project Structure

```
fung.ai_chatbot/
├── index.js              # Main backend server (Express API + WhatsApp client)
├── package.json          # Node.js dependencies configuration
├── nodemon.json          # Hot-reload configurations
├── README.md             # ← You are here
├── data/
│   ├── database.json     # Primary data store supporting 2 tables: `messages` & `users`
│   ├── log.txt           # Structured historical system and event log
│   ├── files/            # Directory containing all downloaded media attachments
│   └── wwebjs_auth/      # Auto-generated encrypted WhatsApp session cache
└── ui/
    └── index.html        # Single-page Admin Dashboard HTML, CSS, and Client JS
```

---

## 3. Setup & Installation

### Prerequisites
- **OS:** Windows, macOS, or Linux
- **Node.js:** v16 or higher — verify by running `node -v`
- **WhatsApp:** A valid account on a mobile device to act as the master "Linked Device"

### First-Time Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```
   > **Note:** The project runs via `nodemon`, giving it hot-reloading. If you save any file (like `index.js`), the server fully restarts automatically.

### Connecting the WhatsApp Bot

1. With the server running, monitor the terminal output closely.
2. A **QR code** will temporarily render in your console.
3. Open **WhatsApp** on your phone → **Settings / Menu** → **Linked Devices** → **Link a Device**.
4. Scan the QR code shown in your terminal.
5. Wait ~15 seconds. The terminal will explicitly log `ZOU WhatsApp Bot is ready!` and the UI connection beacon (top right) will simultaneously change from Red to **Green**.

> **Important:** Your WhatsApp session is strictly cached inside `data/wwebjs_auth/`. The server remembers you across reboots and automatically links back silently without repeating the QR prompt.

---

## 4. `database.json` — Architecture

The primary flat-file database dynamically migrates arrays and secures operations across **two explicit tables**.

```jsonc
{
  "messages": [ /* ... array of all WhatsApp messages */ ],
  "users":    [ /* ... array of registered accounts */ ]
}
```

### Table 1: `messages`
Maintained automatically when inbound traffic flows from WhatsApp.

| Field | Description |
|---|---|
| `sender` | WhatsApp ID of the client (usually mapped directly to mobile numbers). |
| `msgId` | Highly specific unique message ID hash preventing duplication errors. |
| `media` / `mediaType` | Local filesystem path to extracted images/videos and their MIME protocol formatting. |
| `resolved` | Logical flag marking complete (replied) vs pending (unread) status. |
| `department` | A string representing what team (e.g., `Finance`, `SRC`) processed this ticket. |
| `responded_by` | Tracks exactly which `username` issued the resolution reply. |

### Table 2: `users`
Authoritative identity ledger strictly accessed during `.login` execution.

| Field | Description |
|---|---|
| `username` | Handle utilized to track dashboard activity and login sessions. |
| `password` | Authentication key credential (in a live env, ensure these are heavily encrypted!). |
| `role` | Logical enforcement matrix. Permits either `"admin"` or `"superadmin"`. |
| `createdAt` | ISO representation of the exact creation timestamp to track hierarchy. |

> **⚠️ Security Caveat:** At startup, if the database is unformatted, the system seeds a master backdoor: **`admin` / `admin123`**. For operational security, **log in immediately and delete this default user** after adding a new personal Superadmin.

---

## 5. Comprehensive User Manual

### Accessing the System

Ensure your backend is running (`npm run dev`) and visit:
```
http://localhost:7000
```

### Logging In & Session Handling

- The landing page explicitly locks access until you provide your valid **Username** and **Password**.
- The server validates these coordinates against Table 2 in `database.json`.
- A success event generates a highly durable browser memory cache (`localStorage`). This means you are essentially "remembered" unless you voluntarily log out.
- A failure explicitly logs as a security block in the server (`AUTH ERROR`) without leaking parameters.

---

### Dashboard Modalities & Features

#### 💬 1. Messages Panel
The central command module for processing all external helpdesk tickets.

- **Unread & Active View:** Highlights incoming issues. Select `⏳ Unread` using the top-bar filter arrays to only show users needing immediate assistance.
- **Dynamic Reply System:** Formulate a reply logic under any Unread message.
  - **Dynamic Department Dropdown:** You can assign this ticket to a team preset (like `Sports` or `Education`). If you click **"✏️ Other..."**, a hidden text box smoothly reveals itself, allowing you to establish entirely custom departments that seamlessly add themselves to the preset dropdown for the future!
- **Attribution Control:** If you log in as `<admin>`, the tag will respectfully restrict privacy, displaying `Replied: [Message]`. If you log in as `<superadmin>`, the UI unpacks full visibility, displaying exactly `Replied by Brandon: [Message]`.
- **"Filter by Replier" Super-Module:** Hidden to normal users, if a `superadmin` checks the top menu, a distinct Dropdown materializes populated only with people who have physically responded to tickets. Highly powerful for QA reviews.

#### 📊 2. Analytics Panel
The graphical reporting matrix.

- Aggregates the fundamental scale, measuring `Total Messages` against fully `Replied` instances to spit out an automated `Resolution Rate`.
- Produces a real-time relative progress chart breaking down exactly how many times variables (i.e. 'Customer Support' or manually created Departments) have been stamped onto messages.

#### 👥 3. User Management Panel
Strict Identity & Access execution.

- Creates a real-time ledger displaying all internal employees holding authorization logic.
- Maps visual hierarchy `★ Superadmin` (gold pill) vs `Admin` (purple pill) indicators seamlessly.
- **Add User Mechanism:** Allows quick manual expansion of your team without touching code. Define their `username`, strict `password`, and permission parameter visually.
- **Immediate Deletion:** Permits single-click destruction of credentials via the "Remove" flag (the backend securely prevents you from suiciding your own active login).

#### 📋 4. Terminal Logs
Instead of tracking activity directly inside complex VSCode terminal prompts, `index.html` implements a dedicated live parser rendering `data/log.txt`.

- **Event Coloring Schema:**
  - 🔵 **Blue `[SYSTEM]` / `[AUTH]`:** Boot success, DB polling read loops, valid logouts.
  - 🟢 **Green `[REPLY]` / `[WHATSAPP SENT]`:** Positive confirmations of payload receipt by the WhatsApp web server itself.
  - 🔴 **Red `[SYSTEM ERROR]` / `[AUTH ERROR]`:** Explicit failures, connection losses, and malicious credential attempts.
  - 🟡 **Yellow `[IGNORED]`:** Bot deliberately choosing to block/ignore blank ghost pings or missing text nodes.

---

## 6. End-to-End Troubleshooting

**Q: The WhatsApp offline badge completely refuses to turn green?**
- Start by checking the backend node console. `whatsapp-web.js` fundamentally operates as an invisible, headless browser utilizing Chromium engines. In slower machines, this requires anywhere from `15s to 35s` completely blocking the initial boot logic. **Do not refresh repeatedly.** Wait until `ZOU WhatsApp Bot is ready!` echoes physically.

**Q: Login immediately rejects me with "Invalid username or password"?**
- Verify no hidden white-spaces are accidentally included.
- Go into `database.json` and mechanically view the `users` object syntax. Ensure that a password explicitly exists there mapped alongside `role`.

**Q: Media isn't appearing underneath message clusters?**
- Media requires raw data-path buffering to execute properly. The server explicitly checks for `data/files/` directories, but advanced Windows defender logic or aggressive Git ignores can interrupt buffer streaming. Validate that the folder isn't locked by an operating system limitation.
