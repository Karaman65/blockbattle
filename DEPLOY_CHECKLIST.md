# Block Battle - Deploy Checklist

Bu dosya, projeyi production ortamina sorunsuz almak icin son kontrol listesidir.

## 1) Sunucu Environment

- `PORT` tanimli (opsiyonel, varsayilan `3001`)
- `ALLOWED_ORIGINS` production domainleri ile tanimli
  - Ornek: `https://your-domain.com,https://www.your-domain.com`

## 2) Firestore Rules

- `firestore.rules` dosyasi guncel
- Firebase CLI ile deploy edildi:

```bash
firebase deploy --only firestore:rules
```

## 3) Uygulama Saglik Kontrolu

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

- Hata olmadan tamamlanmali

## 5) Online Oyun Smoke Test

- Oda olustur
- Odaya ikinci oyuncu ile katil
- Hizli mac baslat
- Rakip ayrilinca sonuc ekrani geliyor mu kontrol et
- Zaman modunda sure bitisinde sonuc dogru mu kontrol et

## 6) PWA/Cache Testi

- Yeni deploydan sonra sert yenileme (`Ctrl+F5`) ile guncel dosyalar geliyor mu
- Uygulama acilisinda eski UI veya eski JS kalmiyor mu

## 7) Son Kontrol

- CORS hatasi yok
- Socket baglanti hatasi yok
- Oda kurma gecikmesi makul (sunucu soguk acilisinda bile bekleme mesaji dogru)
