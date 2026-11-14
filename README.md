# Aura Audio — Web, HDD Direct Streaming & Android App

Aura Audio คือแอพเล่นเพลงและสตรีมมิ่งออนไลน์ดีไซน์มินิมอล รองรับการซิงค์คลังเพลงหลายเครื่องแบบเรียลไทม์, การอ่านไฟล์ตรงจาก HDD โดยไม่อัปโหลดขึ้นระบบ, การจัดกลุ่มตามโฟลเดอร์/ศิลปิน/แนวเพลง, ระบบ Admin (`admin` / `2535`), การแคสต์ไปยังอุปกรณ์ใกล้เคียง, และแอพสำหรับ **Android (.APK)** ผ่าน **GitHub Actions**

## โครงสร้างโปรเจกต์

- `src/` — React + Vite Frontend (Equalizer 5 ย่าน, Visualizer, IndexedDB/File System Access HDD sync, Cast, Grouping)
- `server.ts` — Express Streaming Server (HTTP 206 Byte-Range, Host HDD Direct Scanner, SSE Real-time Sync & Cast, CORS สำหรับ Android)
- `android/` — โปรเจกต์ Android (Kotlin + `WebViewAssetLoader` + ตัวเลือกไฟล์เสียงในเครื่องมือถือ + รองรับเชื่อมต่อทั้ง Cloud และ LAN HDD)
- `.github/workflows/android-apk.yml` — GitHub Actions Workflow สำหรับสร้างไฟล์ `.apk` อัตโนมัติ

---

## วิธีสร้างไฟล์ติดตั้ง Android (.APK) ด้วย GitHub

1. **ส่งโปรเจกต์ขึ้น GitHub Repository** (Push โค้ดไปยัง branch `main` หรือ `master`)
2. เปิดหน้า GitHub Repository ของคุณ → คลิกแท็บ **Actions**
3. เลือก Workflow ชื่อ **Build Aura Audio Android APK**
   - ระบบจะเริ่ม Build ให้อัตโนมัติเมื่อ Push โค้ด หรือกดปุ่ม **Run workflow** เพื่อสั่ง Build ด้วยตนเอง
4. เมื่อ Build เสร็จเรียบร้อย เข้าไปที่หน้ารันล่าสุด แล้วดาวน์โหลดไฟล์ **`AuraAudio-Android-APK`** (ภายในมีไฟล์ **`AuraAudio-debug.apk`** ที่พร้อมติดตั้งลงมือถือ Android ได้ทันที)
5. หากต้องการออกหน้า **Releases** พร้อมแนบไฟล์ `.apk` อัตโนมัติ ให้สร้าง tag เช่น:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

---

## การเชื่อมต่อแอพ Android กับคลังเพลงของคุณ

- เปิดแอพ **Aura Audio** บน Android → กดไอคอนรูปสมาร์ทโฟน (**แอพ Android / GitHub APK**) ด้านบนขวา
- สามารถเลือกเชื่อมต่อได้ทั้ง:
  1. **Cloud Server URL หลัก** — ใช้คลังเพลงสตรีมกลางชุดเดียวกับหน้าเว็บและแคสต์ระหว่างเครื่องได้ทุกที่
  2. **เซิร์ฟเวอร์ในคอมพิวเตอร์ PC (ผ่าน Wi-Fi บ้าน)** — รันเซิร์ฟเวอร์บน PC ด้วย `npm install && npm run dev` แล้วใส่ IP ของ PC เช่น `http://192.168.1.50:3000` เพื่อสตรีมไฟล์เพลงจาก HDD ของ PC มายังมือถือ Android โดยตรง

## การรันเว็บและเซิร์ฟเวอร์บนเครื่อง (Local PC)

```bash
npm install
npm run dev
```

เปิดใช้งานที่ `http://localhost:3000`
