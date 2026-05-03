# Block Battle - Deploy Checklist

Bu dosya, projeyi production ortamına sorunsuz almak için son kontrol listesidir.

## 1) Sunucu Environment

- `PORT` tanımlı (opsiyonel, varsayilan `3001`)
- `ALLOWED_ORIGINS` production domainleri ile tanımlı
  - Ornek: `https://your-domain.com,https://www.your-domain.com`

## 2) Firestore Rules

- `firestore.rules` dosyasi guncel
- Firebase CLI ile deploy edildi:

```bash
firebase deploy --only firestore:rules
```

## 3) Uygulama Sağlık Kontrolü

- Sunucu ayakta iken:

```bash
npm run health:local
```

- Beklenen: `{"ok":true,...}` JSON cevabi

## 4) Kod Kontrolleri

- Syntax kontrolu:

```bash
npm run check:syntax
```

- Hata olmadan tamamlanmalı

## 5) Online Oyun Smoke Test

- Oda oluştur
- Odaya ikinci oyuncu ile katıl
- Hizli mac baslat
- Rakip ayrılınca sonuç ekranı geliyor mu kontrol et
- Zaman modunda süre bitişinde sonuç doğru mu kontrol et

## 6) PWA/Cache Testi

- Yeni deploydan sonra sert yenileme (`Ctrl+F5`) ile guncel dosyalar geliyor mu
- Uygulama açılışında eski UI veya eski JS kalmıyor mu

## 7) Son Kontrol

- CORS hatasi yok
- Socket bağlantı hatası yok
- Oda kurma gecikmesi makul (sunucu soğuk açılışında bile bekleme mesajı doğru)
