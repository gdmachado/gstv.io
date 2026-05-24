{{- /* Raw source markdown for a single page. */ -}}
---
url: {{ .Permalink }}
title: {{ .Title }}
{{- with .Date }}
date: {{ .Format "2006-01-02" }}
{{- end }}
{{- with .Params.tags }}
tags: {{ delimit . ", " }}
{{- end }}
{{- with .Description }}
description: {{ . }}
{{- end }}
{{- with .Params.summary }}
summary: {{ . }}
{{- end }}
---

{{ .RawContent }}
