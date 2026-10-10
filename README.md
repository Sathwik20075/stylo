# Stylo

Add photos of your clothes, then get outfit ideas for the day based on the weather and what you're dressing for.

Everything runs on your own device. Your photos are stored locally and are never uploaded.

Stylo ships two ways from the same code:
- **Desktop app** for Windows, Mac and Linux (built by GitHub for you)
- **Web app** on GitHub Pages (works on phones too)

---

## Desktop app (Windows, Mac, Linux)

### 1. Put the project on GitHub
1. Create a new public repository, for example `stylo`.
2. Upload everything in this folder to the repository root, including the hidden `.github` folder
   (on Mac press Cmd+Shift+. in Finder to show hidden folders).
   Or from a terminal inside this folder:
   ```
   git init
   git add .
   git commit -m "Stylo first version"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/stylo.git
   git push -u origin main
   ```

### 2. Build the installers (test run)
1. In the repository open the **Actions** tab. If asked, click to enable workflows.
2. Choose **Build desktop apps**, click **Run workflow**, then **Run workflow** again.
3. After about 5 to 10 minutes, open the finished run. Under **Artifacts** download:
   - `stylo-windows-latest` (Windows installer, `Stylo Setup 0.1.0.exe`)
   - `stylo-macos-latest` (Mac `.dmg` for Apple Silicon)
   - `stylo-ubuntu-latest` (Linux `.AppImage`)

### 3. Publish a release for download
1. Open **Releases**, then **Draft a new release**.
2. Click **Choose a tag**, type `v0.1.0`, and choose **Create new tag**, then **Publish release**.
3. The workflow starts automatically. When it finishes (about 10 minutes), the release has the three installers
   attached, next to the automatic source code downloads.
4. Keep the `version` in `package.json` the same as the tag (for example `0.1.0` and `v0.1.0`).

Share the release page link. People download the file for their system and install it.

### Intel Macs
The Mac build is for Apple Silicon (M1 and newer), like a typical modern Mac. To also support Intel Macs, change
`"arch": ["arm64"]` to `"arch": ["x64", "arm64"]` in `package.json`.

### First-launch warnings (normal for unsigned apps)
- **Windows:** SmartScreen may say "Windows protected your PC". Click **More info**, then **Run anyway**.
- **Mac:** If it says the app can't be opened, right-click the app, choose **Open**, then **Open** again.
  (Removing this warning needs a paid Apple Developer account for signing.)

### Run it on your own computer (optional)
Install Node.js, then in this folder run `npm install` and `npm start`.
To build installers locally run `npm run dist`; the files appear in `dist/`.

---

## Web app (GitHub Pages)

1. In the repository open **Settings**, then **Pages**.
2. Under "Build and deployment" choose **Deploy from a branch**, pick `main` and `/ (root)`, then **Save**.
3. After a minute it is live at `https://YOUR-USERNAME.github.io/stylo/`.
4. Install it: in Chrome or Edge on Windows/Mac use the install icon in the address bar. On Android use
   "Install app". On iPhone use Share, then "Add to Home Screen".

---

## What it does today (version 0.3.1)

- **For everyone:** the wardrobe covers women's and men's clothes. Tops include blouses and kurtis, bottoms include
  skirts, leggings and palazzos, and dresses, sarees, salwar suits and lehengas count as complete outfits on their own.
  Shoes include heels and flats, and accessories include bags, jewellery and dupattas. There is an "Ethnic and festive"
  collection in the lookbook.
- **Wardrobe with IDs:** every item gets a permanent ID (SH01 shirt, TS01 top or kurti, PT01 pants or leggings,
  SK01 skirt, DR01 dress or saree, JN01 jeans, SHOE01 shoes, JK01 jacket or cardigan, AC01 accessory). IDs are never reused, even after you remove an item.
  Each item records type, kind, colour (picked from the photo, with a colour name), pattern, style and warmth.
- **Lookbook:** the best outfit for every top and bottom pairing, using only clothes you own. Each look shows its
  outfit ID, a rating out of 10, the colours, why it works, cautions, and what changes if you swap the shoes or layer.
  Collections: Everyday casual, College and outings, Smart casual, Formal wear, Minimalist, Streetwear,
  Best colour combinations, Underrated combinations. Empty collections are hidden.
- **Honest ratings:** weak pairings get low scores and appear under "Combinations to skip" with a better option.
  "Rate a combination" scores any top, bottom, shoes and layer you pick.
- **Weather by itself:** when the app opens it finds the forecast for your place automatically. If device location is
  blocked or unavailable (the desktop app cannot read it), search your city once and Stylo remembers it.
- **Today:** three outfits for the occasion and the weather, avoiding what you wore in the last few days.
- **Save as image:** each look can be saved as a picture board of your real item photos with IDs and rating.
- **Profile:** optional skin depth and undertone nudge the colour advice. You choose them yourself, because Stylo
  does not analyse photos of your face.
- **Backup:** download or restore a backup file, and download the wardrobe inventory as a CSV.
  Backups never include your personal face and body photos.

## AI previews on you (optional, needs the preview service)

Each look gets a "Preview on me" button that creates a picture of you wearing it, using your face and
full-body photos and the real photos of the outfit's items. Every preview sits next to the real item photos with a
note that details may differ, so you can check it. If the service is off, paused or over its limit, the app keeps
working and "Save as image" still gives an accurate picture board.

The service is a small Cloudflare Worker in the `worker` folder. It keeps the API key secret, limits usage
(3 previews per device per day, 10 per network address, and a daily cap for everyone), and stores no photos.

### Turn it on
1. **Google AI Studio:** create a Gemini API key and switch the project to a paid plan. Use a paid plan because Google
   states that paid API content is not used to improve its products, which matters for face photos.
   Set a budget alert in Google Cloud.
2. **Install tools:** install Node.js, then run `npm install -g wrangler` and `wrangler login` (free Cloudflare account).
3. **Create storage for the limits:** in the `worker` folder run `wrangler kv namespace create LIMITS` and paste the
   `id` it prints into `wrangler.toml`.
4. **Edit `wrangler.toml`:** set `ALLOWED_ORIGINS` to your web app address with no path, for example
   `https://YOUR-USERNAME.github.io`. Choose `PER_DEVICE` and `DAILY_CAP` (your daily spending limit, counted in previews).
5. **Add secrets:** run `wrangler secret put GEMINI_API_KEY` and paste the key, then `wrangler secret put IP_SALT` and
   type any long random text.
6. **Deploy:** run `wrangler deploy`. It prints an address like `https://stylo-preview.YOUR-NAME.workers.dev`.
7. **Point the app at it:** put that address in `config.js` as `previewApi`, then push to GitHub.
8. **Fill in `privacy.html`:** replace `YOUR-EMAIL@example.com` with your contact address, and have the page reviewed
   for your country's rules before launch.
9. Create a new release tag (for example `v0.3.0`) to rebuild the desktop apps.

### Cost
Google lists this model (`gemini-nano-banana-2.1`) at about $0.034 per generated 1K image, plus a small charge for the
input photos and any thinking the model does. Prices change, so check the current Gemini API pricing page, and
watch your first real previews in Google Cloud billing before raising `DAILY_CAP`.

## Known limits
- Device location does not work in the desktop app. Search your city instead (it is remembered).
- Wardrobe data lives in one app or browser only. The desktop app and the web app do not share data, but you can
  move it between them with a backup file.
- Ratings come from colour and style rules, so they are a well-reasoned guide, not a verdict.
