# Block Battle Firebase Email Templates

Firebase Console > Authentication > Templates > Password reset bölümünde bu metni kullan.

Action URL:

```text
https://blockbattle.onrender.com/reset-password.html
```

Not: Firebase varsayılan gönderici adresinde `noreply` görünebilir. Bunu tamamen kaldırmak için Firebase Console'da Password reset template içindeki customize domain ayarından doğrulanmış özel gönderici domaini bağlamak gerekir. Koddan tek başına değişmez.

## Password Reset

Sender name:

```text
Block Battle
```

Reply-to:

```text
blockbattle.help@gmail.com
```

Subject:

```text
Block Battle hesabın için şifre yenileme bağlantısı
```

Message:

```text
Merhaba,

Block Battle hesabın için şifre yenileme talebi aldık.

Aşağıdaki güvenli bağlantıya tıklayarak yeni şifreni belirleyebilirsin:

%LINK%

Bu talebi sen oluşturmadıysan bu e-postayı dikkate almayabilirsin. Şifren değiştirilmeyecek ve hesabında herhangi bir işlem yapılmayacaktır.

Güvenliğin için bağlantı kısa süre sonra geçerliliğini yitirir.

Block Battle Ekibi
```

Kısa alternatif:

```text
Merhaba,

Block Battle hesabının şifresini yenilemek için aşağıdaki bağlantıyı kullanabilirsin:

%LINK%

Bu talebi sen oluşturmadıysan herhangi bir işlem yapmana gerek yoktur.

Block Battle Ekibi
```
