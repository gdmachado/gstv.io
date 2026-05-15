---
title: "{{ replace .Name "-" " " | title }}"
date: {{ .Date }}
# weight: 1
# aliases: ["/first"]
slug: "{{ .Name }}"
tags: []
author: "Gus Machado"
showToc: true
TocOpen: false
draft: true
hidemeta: false
comments: false
description: "One sentence summary used in the post header, metadata, and OG card."
disableShare: false
disableHLJS: false
hideSummary: false
searchHidden: true
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
ShowWordCount: true
ShowRssButtonInSectionTermList: true
UseHugoToc: true
cover:
    image: "images/cover.png" # page bundle image path
    alt: "<alt text>" # specific alt text
    caption: "<text>" # displayed under cover and used on OG card
    relative: true
    hidden: false
# ogEyebrow: "<optional custom OG label>"
# ogCaption: "<optional OG-only caption override>"
---
