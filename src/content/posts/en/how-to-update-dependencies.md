---
title: How to update dependencies of AstroPaper+
pubDatetime: "2023-07-20T15:33:05.569Z"
modDatetime: "2026-07-03T00:00:00.000Z"
slug: how-to-update-dependencies
featured: false
draft: false
ogImage: ../../../assets/images/forrest-gump-quote.png
tags:
  - FAQ
description: How to update project dependencies of AstroPaper+ (fork of AstroPaper by Sat Naing).
---

Updating the dependencies of a project can be tedious. However, neglecting to update project dependencies is not a good idea either 😬. In this post, Sat Naing shares how he usually updates his projects, focusing on AstroPaper+ (a fork of AstroPaper) as an example. The same steps apply to other JS/Node projects too.

![Forrest Gump Fake Quote](@/assets/images/forrest-gump-quote.png)

## Table of contents

## Updating Package Dependencies

There are several ways to update dependencies, and Sat Naing has tried various methods to find the easiest path. One way to do it is by manually updating each package using `npm install package-name@latest`. This method is the most straightforward way of updating. However, it may not be the most efficient option.

Sat's recommended way of updating dependencies is by using the [npm-check-updates package](https://www.npmjs.com/package/npm-check-updates). There's a good [article](https://www.freecodecamp.org/news/how-to-update-npm-dependencies/) from freeCodeCamp about that, so the details of what it is and how to use that package are not covered here. Instead, this post walks through the typical approach Sat uses.

First, install `npm-check-updates` globally.

```bash
npm install -g npm-check-updates
```

Before making any updates, it's a good idea to check all new dependencies that can be updated.

```bash
ncu
```

Most of the time, patch dependencies can be updated without affecting the project at all. Sat usually updates patch dependencies by running either `ncu -i --target patch` or `ncu -u --target patch`. The difference is that `ncu -u --target patch` will update all the patches, while `ncu -i --target patch` will give an option to toggle which package to update. It's up to you to decide which approach to take.

The next part involves updating minor dependencies. Minor package updates usually won't break the project, but it is always good to check the release notes of the respective packages. These minor updates often include some cool features that can be applied to the project.

```bash
ncu -i --target minor
```

Last but not least, there might be some major package updates in the dependencies. So, check the rest of the dependency updates by running

```bash
ncu -i
```

If there are any major updates (or some updates still to make), the above command will output those remaining packages. If the package is a major version update, you have to be very careful since this will likely break the whole project. Therefore, please read the respective release notes (or docs) very carefully and make changes accordingly. If `ncu -i` shows no more packages to be updated, _**Congrats!!!**_ all the dependencies in the project have been successfully updated.

## Updating AstroPaper+ template

Like other open-source projects, AstroPaper+ is evolving with bug fixes, feature updates, and so on. If you're using AstroPaper+ as a template, you can pull in the latest changes either from this fork (`msoltanov/astro-paper-plus`) or from upstream AstroPaper+ (`satnaing/astro-paper`) using the same git workflow. The thing is, you might already have updated the template according to your flavor. Therefore, Sat Naing can't exactly show **"the one-size-fits-all perfect way"** to update the template to the most recent release. However, here are some tips to update the template without breaking your repo. Keep in mind that, most of the time, updating the package dependencies might be sufficient for you.

### Files and Directories to keep in mind

In most cases, the files and directories you might not want to override (as you've likely updated those files) are `src/content/posts/<locale>/`, `astro-paper.config.ts`, `src/content/pages/<locale>/about.md`, and other assets & styles like `public/` and `src/styles/`. If you're someone who only updates the bare minimum of the template, it should be okay to replace everything with the latest AstroPaper+ except the above files and directories. It's like pure Android OS and other vendor-specific OSes like OneUI. The less you modify the base, the less you have to update.

You can manually replace every file one by one, or use git to update everything. The manual replacement process is not covered here — let's take advantage of git instead.

### Updating AstroPaper+ template using git

First, add the upstream repository as a remote. This fork can be used (`msoltanov/astro-paper-plus`), or the original upstream can be referenced:

```bash
# Upstream AstroPaper+
git remote add astro-paper <upstream-url>
# Or this fork
git remote add astro-paper-plus https://github.com/msoltanov/astro-paper-plus.git
```

Checkout to a new branch in order to update the template. If you know what you're doing and you're confident with your git skill, you can omit this step.

```bash
git checkout -b build/update-astro-paper-plus
```

Then, pull the changes from the remote by running

```bash
git pull astro-paper-plus main

# or

git pull astro-paper main
```

If you face `fatal: refusing to merge unrelated histories` error, you can resolve that by running the following command

```bash
git pull astro-paper-plus main --allow-unrelated-histories
```

After running the above command, you're likely to encounter conflicts in your project. You'll need to resolve these conflicts manually and make the necessary adjustments according to your needs. After resolving the conflicts, test your blog thoroughly to ensure everything is working as expected. Check your articles, components, and any customizations you made. Once satisfied with the result, it's time to merge the update branch into your main branch (only if you are updating the template in another branch). Congratulations! The template has been successfully updated to the latest version. Your blog is now up-to-date and ready to shine! 🎉

## Conclusion

In this article, Sat Naing has shared some of his insights and processes for updating dependencies and the AstroPaper+ template. Hopefully this article proves valuable and assists you in managing your projects more efficiently. If you have any alternative or improved approaches for updating dependencies / AstroPaper+, contributions are welcome in the [fork repository](https://github.com/msoltanov/astro-paper-plus) — open an issue, send an email, or start a discussion. Your input and ideas are highly appreciated! Please understand that response times may vary, but every contribution is read and considered. 😬

Thank you for taking the time to read this article, and best of luck with your projects!

---

> **Originally written by [Sat Naing](https://github.com/satnaing) on [satnaing.dev](https://satnaing.dev/). Translated and adapted for the AstroPaper+ fork by [Mekan Soltanov](https://github.com/msoltanov).**
