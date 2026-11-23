# LMS WhatsApp Gateway (Free Microservice)

This is a lightweight Baileys-based WhatsApp bridge built specifically for **LMS India SaaS**. It connects directly to the WhatsApp Web WebSocket protocol without requiring heavy browser binaries (like Puppeteer/Chromium), consuming only ~50MB of RAM.

---

## Option A: Run Locally on Your Shop Windows PC (Zero Setup, 100% Free)

1. Open a terminal inside this folder:
   ```bash
   cd whatsapp-service
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the service:
   ```bash
   npm start
   ```
4. It will run on `http://localhost:3001`.
5. Open your LMS Admin portal -> **Advertise / Marketing** screen -> The QR code will appear automatically. Scan it with WhatsApp from your phone (Linked Devices).

---

## Option B: Deploy Free on Render (Runs 24/7 in Cloud)

1. Push this folder or your repository to GitHub.
2. Go to [render.com](https://render.com) and click **New Web Service**.
3. Select your repository and specify Root Directory: `whatsapp-service`.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Select **Free Plan**.
7. Once deployed, Render will give you a public URL (e.g. `https://lms-whatsapp.onrender.com`).
8. In LMS Admin **Advertise / Marketing** screen -> Click **Gateway Settings** -> Paste your Render URL!
