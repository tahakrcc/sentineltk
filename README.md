# SentinelTK - Kurulum ve Çalıştırma Rehberi

## Ön Gereksinimler
- Node.js (v18+)
- npm veya yarn

## 1. Backend (Arka Uç) Kurulumu
API sunucusunu ve veritabanını başlatın.

```bash
cd backend
npm install
npm run dev
```
*Sunucu `http://127.0.0.1:3000` adresinde çalışacaktır.*
*Veritabanı `sentinel.db` dosyası olarak oluşturulacaktır.*

## 2. Extension (Uzantı) Kurulumu
Chrome uzantısını derleyin ve tarayıcıya yükleyin.

```bash
cd extension
npm install
npm run dev
```
*Vite, dosyaları izleme modunda derleyecektir.*

### Chrome'a Yükleme
1.  Chrome'u açın ve `chrome://extensions` adresine gidin.
2.  Sağ üstteki **Geliştirici Modu**'nu (Developer Mode) açın.
3.  **Paketlenmemiş öğe yükle** (Load unpacked) butonuna tıklayın.
4.  `sentineltk/extension/dist` klasörünü seçin.

## 3. Test Etme
1.  Uzantıyı yükledikten sonra herhangi bir web sitesine gidin.
2.  Konsolu açın (F12) ve `[SentinelTK]` loglarını izleyin.
3.  Test için bir input alanına tıklayın (örn: `name="cc_number"` olan bir input).
4.  Uzantı simgesine tıklayarak mevcut risk durumunu görün.

## Notlar
- **Gizlilik**: Hiçbir kişisel veri sunucuya gönderilmez. Sadece alan adı ve anonim sinyaller gönderilir.
- **DNR**: "Güvenli Başlangıç" modu şu an simüle edilmiştir.
