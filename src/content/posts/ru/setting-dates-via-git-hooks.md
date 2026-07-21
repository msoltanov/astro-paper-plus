---
author: Саймон Смале
pubDatetime: "2024-01-03T20:40:08Z"
modDatetime: "2024-01-08T18:59:05Z"
title: Как использовать Git-хуки для установки дат создания и изменения
featured: false
draft: false
tags:
  - docs
  - FAQ
canonicalURL: https://smale.codes/posts/setting-dates-via-git-hooks/
description: Как использовать Git-хуки для установки дат создания и изменения в AstroPaper+
---

В этом посте я объясню, как использовать pre-commit Git-хук для автоматического заполнения полей `pubDatetime` и `modDatetime` во frontmatter записей блога на AstroPaper+ (AstroPaper+ — форк AstroPaper+).

## Table of contents

## Иметь их везде

[Git-хуки](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks) отлично подходят для автоматизации задач вроде [добавления](https://gist.github.com/SSmale/3b380e5bbed3233159fb7031451726ea) или [проверки](https://itnext.io/using-git-hooks-to-enforce-branch-naming-policy-ffd81fa01e5e) имени ветки в сообщениях коммитов или [блокировки коммитов с открытыми секретами](https://gist.github.com/SSmale/367deee757a9b2e119d241e120249000). Самый большой их минус — клиентские хуки привязаны к машине. Можно обойти это, держа папку `hooks` и вручную копируя файлы в `.git/hooks` или создавая симлинки, но всё это требует помнить про настройку, а я в этом не силён. Поскольку проект использует npm, мы можем задействовать пакет [Husky](https://typicode.github.io/husky/) (он уже установлен в AstroPaper+) для автоматической установки хуков.

> Обновление! В upstream AstroPaper+ v4.3.0 pre-commit-хук был удалён в пользу GitHub Actions. AstroPaper+ наследует это изменение; если хотите вернуть Husky, можно легко [установить Husky](https://typicode.github.io/husky/get-started.html) самостоятельно.

## Хук

Так как мы хотим, чтобы этот хук запускался во время коммита для обновления дат и попадал в наши изменения, мы будем использовать хук `pre-commit`. Он уже настроен в этом проекте AstroPaper+, но если бы его не было, нужно выполнить `npx husky add .husky/pre-commit 'echo "This is our new pre-commit hook"'`. Перейдите в файл `hooks/pre-commit` и добавьте один или оба приведённых ниже сниппета.

### Обновление даты изменения при редактировании файла

```shell
# Изменённые файлы — обновляем modDatetime
git diff --cached --name-status |
grep -i '^M.*\.md$' |
while read _ file; do
  filecontent=$(cat "$file")
  frontmatter=$(echo "$filecontent" | awk -v RS='---' 'NR==2{print}')
  draft=$(echo "$frontmatter" | awk '/^draft: /{print $2}')

  if [ "$draft" = "false" ]; then
    echo "$file modDateTime updated"
    cat $file | sed "/---.*/,/---.*/s|^modDatetime:.*$|modDatetime: \"$(date -u +%FT%TZ)\"|/" > tmp
    mv tmp $file
    git add $file
  fi

  if [ "$draft" = "first" ]; then
    echo "First release of $file, draft set to false and modDateTime removed"
    cat $file | sed "/---.*/,/---.*/s/^modDatetime:.*$/modDatetime:/" | sed "/---.*/,/---.*/s/^draft:.*$/draft: false/" > tmp
    mv tmp $file
    git add $file
  fi
done

```

`git diff --cached --name-status` возвращает файлы, подготовленные к коммиту. Вывод выглядит примерно так:

```shell
A   src/content/blog/setting-dates-via-git-hooks.md

```

Буква в начале означает выполненное действие — в примере выше файл добавлен (`A`). Изменённые файлы имеют `M`. Мы передаём этот вывод в grep, где в каждой строке ищем изменённые файлы. Строка должна начинаться с `M` (`^(M)`), иметь любое количество символов после (`.*`) и заканчиваться расширением `.md` (`.(md)$`). Это отфильтрует строки, которые не являются изменёнными markdown-файлами: `egrep -i "^(M).*\.(md)$"`.

> #### Улучшение — более явное
>
> Можно искать только markdown-файлы в каталоге `blog`, поскольку именно в них есть нужный frontmatter.

Регулярка захватит две части — букву и путь к файлу. Мы передадим этот список в цикл while, чтобы пройтись по совпадающим строкам, присваивая букву в `a` и путь в `b`. Пока `a` мы будем игнорировать. Чтобы узнать статус черновика файла, нужен его frontmatter. В коде ниже мы используем `cat` для получения содержимого файла, затем `awk` делит файл по разделителю frontmatter (`---`) и берёт второй блок (тот самый frontmatter между `---`). Дальше снова используем `awk`, чтобы найти ключ `draft` и вывести его значение:

```shell
filecontent=$(cat "$file")
frontmatter=$(echo "$filecontent" | awk -v RS='---' 'NR==2{print}')
draft=$(echo "$frontmatter" | awk '/^draft: /{print $2}')

```

Теперь, когда у нас есть значение `draft`, мы делаем одну из 3 вещей: устанавливаем `modDatetime` в текущее время (когда `draft = false`: `if [ "$draft" = "false" ]; then`), очищаем `modDatetime` и ставим `draft = false` (когда `draft` = `first`: `if [ "$draft" = "first" ]; then`), или ничего не делаем (во всех остальных случаях).

Следующая часть с командой `sed` для меня немного магическая — я нечасто её использую; она была скопирована из [другого блог-поста](https://mademistakes.com/notes/adding-last-modified-timestamps-with-git/). По сути она ищет внутри frontmatter-тегов (`---`) файла ключ `pubDatetime:`, берёт всю строку и заменяет её на `pubDatetime: "$(date -u +%FT%TZ)"` — тот же ключ с текущим временем, обёрнутым в кавычки, чтобы в файл попадала YAML-строка с явным таймзонным маркером `Z`. Эта замена выполняется в контексте всего файла, поэтому мы записываем результат во временный файл (`> tmp`), затем перемещаем (`mv`) новый файл поверх старого, перетирая его. После этого он добавляется в git, готовый к коммиту, как если бы мы внесли изменение сами.

> #### ПРИМЕЧАНИЕ
>
> Чтобы `sed` сработал, в frontmatter уже должен быть ключ `modDatetime`. Чтобы приложение собралось с пустой датой, нужно внести ещё несколько правок — см. [ниже](#%D0%B8%D0%B7%D0%BC%D0%B5%D0%BD%D0%B5%D0%BD%D0%B8%D1%8F-%D0%B4%D0%BB%D1%8F-%D0%BF%D1%83%D1%81%D1%82%D0%BE%D0%B3%D0%BE-moddatetime).

### Добавление даты для новых файлов

Добавление даты для нового файла — тот же процесс, что и выше, только теперь мы ищем строки, в которых файлы были добавлены (`A`), и заменяем значение `pubDatetime`:

```shell
# Новые файлы — добавляем/обновляем pubDatetime
git diff --cached --name-status | egrep -i "^(A).*\.(md)$" | while read a b; do
  cat $b | sed "/---.*/,/---.*/s|^pubDatetime:.*$|pubDatetime: \"$(date -u +%FT%TZ)\"|/" > tmp
  mv tmp $b
  git add $b
done

```

> #### Улучшение — один цикл
>
> Можно использовать переменную `a`, чтобы переключаться внутри цикла и либо обновлять `modDatetime`, либо добавлять `pubDatetime` за один проход.

## Заполнение frontmatter

Если ваша IDE поддерживает сниппеты, можно создать пользовательский сниппет для заполнения frontmatter. В upstream AstroPaper+ v4 и выше есть готовый сниппет для VSCode.

<video autoplay muted="muted" controls plays-inline="true" class="border border-skin-line">
  <source src="#" type="video/mp4">
</video>

## Изменения для пустого `modDatetime`

Чтобы Astro мог скомпилировать markdown и сделать свою магию, ему нужно знать, чего ожидать во frontmatter. Это задаётся через конфиг в `src/content/config.ts`. Чтобы разрешить ключу быть там без значения, нужно отредактировать строку 10 и добавить функцию `.nullable()`:

```ts
const blog = defineCollection({
  type: "content",
  schema: ({ image }) =>
    z.object({
      author: z.string().default(SITE.author),
      pubDatetime: z.date(),
      // [!code --]
      modDatetime: z.date().optional(),
      // [!code ++]
      modDatetime: z.date().optional().nullable(),
      title: z.string(),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      tags: z.array(z.string()).default(["others"]),
      ogImage: image().or(z.string()).optional(),
      description: z.string(),
      canonicalURL: z.string().optional(),
      readingTime: z.string().optional(),
    }),
});
```

Чтобы IDE не ругалась в файлах движка блога, я также сделал следующее:

1. Добавил `| null` в строку 15 в `src/layouts/Layout.astro`, чтобы получилось:

```typescript
export interface Props {
  title?: string;
  author?: string;
  description?: string;
  ogImage?: string;
  canonicalURL?: string;
  pubDatetime?: Date;
  modDatetime?: Date | null;
}
```

2. Добавил `| null` в строку 5 в `src/components/Datetime.tsx`, чтобы получилось:

```typescript
interface DatetimesProps {
  pubDatetime: string | Date;
  modDatetime: string | Date | undefined | null;
}
```
