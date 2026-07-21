---
pubDatetime: "2026-07-03T00:00:00.000Z"
title: AstroPaper+'da Yeni Yazı Eklemek
author: AstroPaper+
featured: true
draft: false
tags:
  - docs
description: AstroPaper+ temasında yeni yazı oluşturma rehberi — Sat Naing'in AstroPaper'ının yaptığı çatal.
---

Bu rehber, **AstroPaper+** temasında yeni yazılar oluşturmak için gerekli kuralları ve sözleşmeleri anlatır — dosya konumu, ön bilgi (frontmatter) alanları, görseller ve söz dizimi vurgulama. AstroPaper+, [Sat Naing](https://github.com/satnaing) tarafından geliştirilen AstroPaper temasının bir çatalıdır.

## Blog Yazısı Oluşturma

Yeni bir blog yazısı yazmak için `src/content/posts/` dizininde bir Markdown (veya MDX) dosyası oluşturun. Yazılar dil klasörlerine göre düzenlenmiştir. Türkçe bir yazı `src/content/posts/tr/` altında olmalıdır:

```bash
# Örnek: yazı dosya yolları ve karşılık gelen URL'ler

src/content/posts/tr/adding-new-post.md → example.com/tr/posts/adding-new-post
src/content/posts/tr/2026/example-post.md → example.com/tr/posts/2026/example-post
```

> [!TIP]
> `_` ile başlayan dosya ve klasörler yönlendirmeden hariç tutulur. Taslaklar ve dahili materyal için bunları kullanın.

## Frontmatter

Frontmatter, blog yazısı meta verilerinin ana konumudur. Dosyanın başında YAML biçiminde yer alır.

| Alan            | Açıklama                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **title**       | Yazının başlığı. (h1)                                                                                                                                 |
| **description** | Yazının kısa açıklaması. Özet ve SEO meta verileri için kullanılır. Atlanırsa, AstroPaper+ gövdedeki `<!-- more -->` ayracına kadar olan bölümü alır. |
| **pubDatetime** | ISO 8601 formatında yayın tarihi.                                                                                                                     |
| **modDatetime** | Son değiştirilme tarihi. İsteğe bağlı.                                                                                                                |
| **author**      | Yazının yazarı. Varsayılan = `site.author`.                                                                                                           |
| **featured**    | Ana sayfada öne çıkan bölümünde gösterilsin mi?                                                                                                       |
| **draft**       | Yazıyı 'yayınlanmamış' olarak işaretler. Varsayılan false.                                                                                            |
| **tags**        | İlgili anahtar kelimeler. Varsayılan — `others`.                                                                                                      |

Yalnızca `title` ve `pubDatetime` alanları zorunludur. `description` isteğe bağlıdır; atlanırsa AstroPaper+ gövdedeki `<!-- more -->` ayracına kadar olan kısmı aynı amaca kullanır.

## Söz Dizimi Vurgulama

AstroPaper+, varsayılan olarak [Shiki](https://shiki.style/) kullanır ve [@shikijs/transformers](https://shiki.style/packages/transformers) ile ek geliştirmeler sağlar.

```ts
const selamlama = "Merhaba dünya!";
console.log(selamlama);
```

## Sonuç

AstroPaper+, bloglar için minimalist ama güçlü bir temel olarak tasarlandı. en/ru/tr yerelleştirmesiyle, birden fazla dilde yazı yayınlayabilir ve her yazı kendi dilinin URL'sine yerleşir. Projenin kodu GitHub'da: [msoltanov/astro-paper-plus](https://github.com/msoltanov/astro-paper-plus).

---

> **Originally written for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
