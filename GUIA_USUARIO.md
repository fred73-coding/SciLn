# SciLn — User Guide

## What is SciLn?

SciLn is a **decentralized scientific notebook** built on the Nostr protocol. It allows researchers to write, publish, and version scientific notes, collaborate via comments, and build reputation — all without a central server.

Everything you publish is signed with your key and broadcast to a relay network. Your identity is your keypair, not an email or username.

---

## Getting Started

### Creating an Identity

You have two options:

**1. Local Key (⚡ Llave Local)**
- A new Nostr keypair is generated in your browser
- The private key is stored in your browser's localStorage
- **You must back up your public key** — if you clear browser data, the key is lost
- Click **"Llave Local"** in the top-right navbar

**2. Browser Extension (🔑 Extensión)**
- Uses a Nostr-compatible extension (Alby, Nos2x)
- The private key never touches the app — the extension handles signing
- Click **"Extensión"** in the top-right navbar
- Requires a Nostr extension to be installed

### Logging Out

Click your avatar → **"Cerrar Sesión"**. All locally stored keys and data are cleared.

---

## The Feed

The feed shows recent scientific notes from all users on the relay.

### Filtering & Sorting
- **Search**: type keywords to search note content
- **Sort**: recent, top-voted, most discussed, most forked, alphabetical
- **Time range**: 24h, 7d, 30d, 90d, all time
- **Bookmarks only**: toggle to see only your bookmarked posts
- **Categories**: filter by scientific category (Biology, Chemistry, Physics, etc.)

### Cards
Each post appears as a card showing:
- Author avatar and name
- Title and preview
- Category tags
- Vote score
- Comment count
- Version number (for amended posts)

Click the card title to view the full post.

---

## Creating a Post

Click the ✏️ button in the sidebar or navigate to **#/editor**.

### Editor Features
- **Markdown**: full Markdown support via `marked`
- **LaTeX math**: inline `$...$` and block `$$...$$` rendered via KaTeX
- **Image upload**: paste or drag images — they are compressed and embedded as data URLs
- **Categories**: assign scientific categories to your post
- **Word/character count**: live counter at the bottom

### Publishing
1. Write your content
2. Select categories (optional)
3. Click **"Publicar Reporte Firmado 🚀"**
4. The post is signed and sent to the relay

### Drafts
The editor auto-saves your draft every 5 seconds. If you close and reopen the editor, a banner offers to restore the previous draft.

---

## Comments

Comments are threaded, Nostr-native replies to any post.

### Writing a Comment
- Scroll to the comment section at the bottom of a post
- Type in the textarea
- Toggle **"Vista Previa"** to see rendered output
- Click **"Comentar"** to publish

### Threading
- Replies to comments are nested up to 3 levels deep
- Root comments are sorted by oldest first
- Children are sorted by oldest within each thread

---

## Amendments (Enmiendas)

Amendments are versioned updates to a post by the same author. This creates a transparent change history.

### How it works
- When you edit a post you authored, a new version is created
- The old version remains on the relay (Nostr is immutable)
- The chain of versions is tracked and the latest "canonical" version is shown
- Version history is visible in the post detail view

### Fork Detection
If someone else publishes an amendment to your post, it is flagged as a "fork" and displayed separately.

---

## My Lab

The **My Lab** section (`#/my-lab`) is your personal workspace.

### Profile Tab
- Edit your profile (name, institution, ORCID, research interests, etc.)
- Role and position fields cascade: selecting a role category populates available positions
- Click **"Guardar en Red 💾"** to publish your profile as a Nostr Kind 0 event

### My Posts Tab
- View all your published posts
- Filter by status (published, amended)

### Bookmarks Tab
- Bookmark posts by clicking the bookmark icon
- View your bookmarked posts here
- Manage your bookmark list (remove bookmarks)

---

## Voting & Reputation

### Voting
- Click ▲ (upvote) or ▼ (downvote) on any post
- Clicking the same direction removes your vote
- Clicking the opposite direction switches your vote
- Votes are published as Nostr Kind 7 events

### Reputation
Each user has a reputation score equal to the sum of all votes received across their posts. This is displayed on profiles.

---

## Theme

Click the 🌙/☀️ button in the top-right to toggle between light and dark mode.

- **Light**: Solarized light palette (`#fdf6e3` background)
- **Dark**: Solarized dark palette (`#002b36` background)
- The toggle is persisted across sessions
- If no manual toggle is set, the OS preference is used

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "No se detectó ninguna extensión" | Install Alby or Nos2x, or use "Llave Local" instead |
| Posts not showing | Check relay connection status; try refreshing |
| Lost your local key | Unfortunately, local keys cannot be recovered if browser data is cleared |
| Editor not saving | Check if localStorage is available in your browser |
| Connection issues | The app uses `wss://relay.damus.io` — check if it's accessible |
