# Play Console — mağaza listelemesi (tr-TR)

Bu dosya listeleme alanlarının **kaynağı**. Play Console'a buradan kopyalanır;
metni orada değiştirirsen burayı da güncelle, yoksa bir dahaki sürümde hangisinin
güncel olduğu belirsiz kalır.

Karakter sınırları Play'in sert kuralları — aşan alan kaydedilmiyor. Sayımı
doğrulamak için:

```bash
node scripts/check-listing.mjs
```

---

## Uygulama adı — sınır 30

```
Remory: İlerleme Günlüğü
```

> Alternatif, sade duruş: `Remory`. Mağaza aramasında ad en güçlü sinyal olduğu
> için açıklayıcı olanı öneriyorum; marka tek başına yeterince tanınana kadar
> "İlerleme Günlüğü" eki arama sonuçlarında iş görür.

## Kısa açıklama — sınır 80

```
Fotoğraf ve ölçümlerle günlük tut, değişimini zaman içinde yan yana gör.
```

## Tam açıklama — sınır 4000

```
Remory, kendi değişimini takip etmen için tasarlanmış bir fotoğraf günlüğü. Her gün bir kare, bir not, birkaç ölçüm — aylar sonra geriye dönüp baktığında aradaki farkı gerçekten görüyorsun.

GÜNDE BİR KAYIT
Her gün için tek bir kayıt tutulur. Fotoğrafını çek, istersen kısa bir not düş, o günün ölçümlerini gir. Karmaşık bir kurulum yok; uygulamayı açıp kaydını eklemen yeterli.

ÖNCE–SONRA KARŞILAŞTIRMA
İki günü seç, yan yana koy. Aradaki süreyi ve ölçüm farklarını da gösteren bir kart üretiliyor; istersen paylaş, istersen galerine kaydet.

ÖLÇÜMLERİNİ TAKİP ET
Kilo, bel, göğüs, vücut yağ oranı ve eklemek istediğin her ölçüm. Kendi ölçüm tiplerini tanımlayabilir, her biri için "artması iyi" mi "azalması iyi" mi olduğunu belirtebilirsin. Değerler zaman içindeki eğriyi gösteren bir grafiğe dönüşüyor; metrik ve emperyal birimler arasında istediğin zaman geçebilirsin.

FOTOĞRAFSIZ GÜNLER DE SAYILIR
Her gün fotoğraf çekmek zorunda değilsin. Bir günü "off day" olarak işaretleyebilir, sadece ölçüm girebilir ya da o günün antrenman programını hareket ve set düzeyinde kaydedebilirsin.

İNTERNET OLMADAN DA ÇALIŞIR
Kaydettiğin anı hemen ekranda görünür. Bağlantı yokken eklediklerin cihazında bekler, internet geldiğinde sessizce senkronize olur — kaydettim mi kaydetmedim mi diye düşünmene gerek kalmaz.

GEÇMİŞİNİ DOLAŞ
Anı akışında zamanda ilerle, yıllık takvimde hangi günlerin dolu olduğunu tek bakışta gör, notlarında ve tarihlerde arama yap. İstatistik ekranı haftalık serini ve ölçüm eğrilerini bir arada gösterir.

HATIRLATMALAR
1, 3, 6 ve 12 ay önce eklediğin anıları hatırlatan bildirimler, günlük kayıt hatırlatması ve serini kaybetmek üzereyken gelen uyarı. Bildirimlerin tamamı cihazının kendisinde planlanır; hangilerini istediğini ayarlardan tek tek açıp kapatabilirsin.

VERİN SENİN
Reklam yok, kullanım takibi yapan analitik yok, verilerin üçüncü taraflara satılmıyor. Fotoğrafların ve ölçümlerin yalnızca kendi hesabınla erişilebilecek şekilde saklanıyor. İstediğin an Profil > Hesabı Sil ile hesabını ve ona bağlı her şeyi kalıcı olarak silebilirsin.

Remory bir koçluk uygulaması değil, sana tavsiye vermiyor ve hedef dayatmıyor. Sadece kendi kaydını tutuyor — yorumu sana bırakıyor.
```

## Yenilikler (v0.3.0) — sınır 500

```
Remory'nin ilk sürümü.

Günlük fotoğraf kaydı, kendi tanımlayabildiğin vücut ölçümleri ve zaman içindeki değişimi gösteren grafikler. İki günü yan yana koyup önce–sonra kartı üretebilir, fotoğrafsız günleri off day veya antrenman günü olarak işaretleyebilirsin.

İnternet yokken eklediklerin cihazında bekler, bağlantı gelince kendiliğinden senkronize olur.
```

---

## Metin dışı listeleme alanları

| Alan | Değer |
|---|---|
| Kategori | Sağlık ve Fitness |
| Etiketler | Günlük, Fitness, Fotoğraf |
| İletişim e-postası | sametkaska5@gmail.com |
| Web sitesi | https://sametkaska5.github.io/remory/ |
| Gizlilik politikası | https://sametkaska5.github.io/remory/gizlilik.html |
| Reklam içerir | Hayır |
| Uygulama içi satın alma | Hayır |

## Doğruluk notu

Play, açıklamanın uygulamanın gerçekten yaptığı şeyi anlatmasını şart koşuyor;
abartılı ya da karşılığı olmayan bir cümle reddedilme sebebi. Yukarıdaki her
madde koddaki bir özelliğe karşılık geliyor. İki ifade özellikle dikkatli
seçildi:

- **"kullanım takibi yapan analitik yok"** — doğru; ama uygulama Sentry ile
  çökme kaydı topluyor. "Hiçbir veri toplanmıyor" demek YANLIŞ olurdu ve veri
  güvenliği beyanıyla çelişirdi.
- **"koçluk uygulaması değil"** — sağlık/fitness kategorisinde tıbbi iddia
  taşımadığını açıkça söylemek, hem doğru hem de incelemede işi kolaylaştırır.
