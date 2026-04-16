# Pilot invitation email

> Paste the body below into Gmail. Subject line is above the `---`.
> Replace `{{pilot-url}}` with the current pilot URL before sending.

**Subject:** Masonic Ritual Mentor — your pilot invitation

---

Brother,

You're being invited into the pilot for **Masonic Ritual Mentor**, an app
that lets you practice your ritual work from memory on your phone or
computer. You speak your lines, the app reads the other officers' parts in
distinct voices, and you get instant word-by-word feedback on what you
missed.

Everything runs privately. Your ritual file is encrypted, decrypted on your
own device, and never stored on a server.

## A short video walkthrough

Before you install, I'd like you to watch this short walkthrough so the app
makes sense when you first open it:

https://youtu.be/CUAuy5SWJcw?si=0WRv_QF8yfhyaYKn

## About the front page — why it looks the way it does

When you open the pilot URL, the first thing you see is a dark landing
page with a glowing square-and-compass that drifts across the screen while
several paragraphs of text flow around it — the words genuinely *reshape*
themselves around the symbol as it moves.

That is not a gimmick. The page is a live demo of a brand-new open-source
text layout standard called **Pretext**, released just days ago by an
engineer at Midjourney. Pretext is the first practical way to get that
kind of organic, obstacle-aware text flow on the open web, and our landing
page is one of the earliest real-world uses of it outside the author's own
demos.

There's a write-up in VentureBeat if you're curious about the background:

https://venturebeat.com/technology/midjourney-engineer-debuts-new-vibe-coded-open-source-standard-pretext-to

I mention it because a few brothers have asked, "Why does the front page
feel different from a normal website?" — that's why.

## The pilot URL

> **{{pilot-url}}**

Please keep this address inside the pilot group.

---

# Install guide

What follows is the full install guide. It's also available in the repo at
`docs/INSTALL-GUIDE.md` with screenshots, if you'd rather read it there.

## Before you start — what you'll need

1. **Your lodge email address.** This is the email I've added to the
   approved list. If you're not sure whether you're on the list, reply to
   this email.
2. **Your encrypted ritual file (the `.mram` file).** You should have
   received this separately (USB stick, direct message, or whatever
   channel our lodge uses). It is not distributed through this app.
3. **The password for your ritual file.** Memorize it. Do not write it
   down next to the file.
4. **The pilot URL above.**

## Part 1 — Sign in (do this first on every device)

1. Open the pilot URL in your web browser. You'll land on the sign-in
   page.
2. Type your lodge email in the box and tap **SEND SIGN-IN LINK**.
3. Check your email inbox. Within a minute or so you should receive a
   message with subject **"Your sign-in link."** Check spam if you don't
   see it.
4. Open the email and tap the amber **Sign in** button inside it. This
   opens the app with you signed in.
5. You are now on the landing page (the dark page with the drifting
   square-and-compass described above). Tap **ENTER THE LODGE**.

The sign-in remembers you for 30 days on this device. The link inside the
email is only good for 24 hours — if you wait longer, just request a new
one.

## Part 2 — Install as an app (recommended but optional)

Once signed in, you can install the site as an app on your phone or
computer so it gets an icon on your home screen and opens in its own
window like a native app. You don't *have* to install — the site works in
any browser tab — but on the phone especially, installing is nicer.

### iPhone (Safari)

1. On the landing page, tap the **Share** button (square with an arrow
   pointing up) at the bottom of Safari.
2. Scroll down and tap **Add to Home Screen**.
3. Confirm the name and tap **Add**.
4. Open **Ritual Mentor** from your Home Screen.

### Android (Chrome or Edge)

1. Tap the **⋮** menu in the top right.
2. Tap **Install app** (or **Add to Home screen** — wording varies).
3. Confirm **Install**.

### Desktop — Microsoft Edge

1. Click **⋯** → **Apps** → **Install this site as an app**. Confirm
   **Install**.

### Desktop — Google Chrome

1. Look at the right end of the address bar for a small monitor-with-arrow
   icon and click it; or
2. **⋮** menu → **Cast, save, and share** → **Install page as app**
   (wording varies by Chrome version).

### Desktop — Safari (Mac)

1. **File → Add to Dock**. Confirm **Add**.

## Part 3 — Load your ritual

1. In the app, go to the **Upload** screen.
2. Select your encrypted `.mram` file.
3. Enter the password when prompted. The file decrypts on your device and
   is never sent to any server.
4. You're now on the **Practice** screen. Select a role, press the
   microphone button, and begin reciting.

Your ritual file stays on this device. To use the app on a second device,
you load the `.mram` file there too.

## Privacy — how the app handles the work

- Your ritual file is encrypted. Without the password, it cannot be read.
- Decryption happens in your browser, on your device. The server never
  sees the decrypted ritual.
- The app never stores your ritual on any server, ever.
- When the app reads lines aloud or evaluates what you've said, small
  pieces of text and audio are sent briefly to voice/AI services
  (Voxtral, Google, Deepgram, Groq). These services have no-retention
  policies — they do not save or train on the data.

## Troubleshooting

**I didn't get the sign-in email.** Wait two minutes, check spam/
promotions. If you use iCloud Private Relay on iPhone, try disabling it
or use your real address. If five minutes pass with nothing, reply to
this email — your address may not be on the approved list yet.

**"Invalid link."** Sign-in links expire in 24 hours. Request a new one.

**No Install option.** Some browser versions don't offer it. The app
works fine in a plain browser tab — installation is optional.

**Ritual file won't decrypt.** Check the password carefully (it's
case-sensitive). If the file itself is corrupted, I'll re-send.

**AI voice or feedback isn't working.** Try a different voice engine from
the dropdown at the top of the rehearsal screen. If none of the cloud
engines work, fall back to the **Browser** voice — it's less natural but
always works.

---

Questions of any kind — reply to this email or call me directly. I can
add your email to the approved list, resend your ritual file, or walk
you through any of these steps by phone.

Sincerely and fraternally,

{{Your name}}
Pilot Lead
