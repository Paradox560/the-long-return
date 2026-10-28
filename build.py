#!/usr/bin/env python3
"""Build the dependency-free HTML reading edition of The Long Return.

Usage: python3 build.py [--source design-document.md] [--output dist]
The deliberately small Markdown renderer escapes raw HTML and supports the
document's headings, tables, lists, quotations, links, emphasis, and code.
"""

from __future__ import annotations

import argparse
import html
import math
from pathlib import Path
import re
import shutil
import unicodedata
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
LIST = re.compile(r"^( *)([-+*]|\d+[.)])\s+(.*)$")
HEADING = re.compile(r"^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$")
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})([^`]*)$")
INLINE = re.compile(
    r"(`+)(.+?)\1|\[([^\]\n]+)\]\(([^\s)]+)(?:\s+\"([^\"]*)\")?\)"
    r"|\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!\w)_([^_\n]+)_(?!\w)",
    re.DOTALL,
)


def safe_url(value: str) -> str:
    value = html.unescape(value.strip("<>"))
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in ("", "http", "https", "mailto"):
        return "#"
    if any(ord(character) < 32 for character in value):
        return "#"
    return value


def inline(value: str) -> str:
    """Render inline Markdown without ever passing through source HTML."""
    result, position = [], 0
    for match in INLINE.finditer(value):
        result.append(html.escape(value[position:match.start()]))
        code_marker, code, label, url, title, bold, bold_alt, italic, italic_alt = match.groups()
        if code_marker:
            result.append("<code>" + html.escape(code) + "</code>")
        elif label is not None:
            title_attribute = f' title="{html.escape(title, quote=True)}"' if title else ""
            result.append(
                f'<a href="{html.escape(safe_url(url), quote=True)}"{title_attribute}>'
                + inline(label) + "</a>"
            )
        elif bold is not None or bold_alt is not None:
            result.append("<strong>" + inline(bold if bold is not None else bold_alt) + "</strong>")
        else:
            result.append("<em>" + inline(italic if italic is not None else italic_alt) + "</em>")
        position = match.end()
    result.append(html.escape(value[position:]))
    return "".join(result).replace("\\|", "|")


def plain(value: str) -> str:
    return re.sub(r"[`*_]", "", re.sub(r"\[([^]]+)\]\([^)]+\)", r"\1", value))


def cells(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|") and not line.endswith("\\|"):
        line = line[:-1]
    return [cell.strip() for cell in re.split(r"(?<!\\)\|", line)]


def table_separator(line: str) -> bool:
    parts = cells(line)
    return len(parts) > 1 and all(re.fullmatch(r":?-{3,}:?", part) for part in parts)


class Renderer:
    def __init__(self) -> None:
        self.contents: list[tuple[str, str]] = []
        self.ids: dict[str, int] = {}
        self.current_heading = "the design document"

    def identifier(self, text: str) -> str:
        normalized = unicodedata.normalize("NFKD", plain(text)).encode("ascii", "ignore").decode()
        base = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-") or "section"
        count = self.ids.get(base, 0) + 1
        self.ids[base] = count
        return base if count == 1 else f"{base}-{count}"

    @staticmethod
    def starts_block(lines: list[str], index: int) -> bool:
        line = lines[index]
        return bool(
            HEADING.match(line) or FENCE.match(line) or LIST.match(line)
            or re.match(r"^ {0,3}>\s?", line)
            or re.fullmatch(r"\s*(?:-{3,}|\*{3,}|_{3,})\s*", line)
            or (index + 1 < len(lines) and "|" in line and table_separator(lines[index + 1]))
        )

    def render(self, lines: list[str]) -> str:
        result, index = [], 0
        while index < len(lines):
            line = lines[index]
            if not line.strip():
                index += 1
                continue
            fence = FENCE.match(line)
            if fence:
                marker, language = fence.groups()
                code = []
                index += 1
                while index < len(lines) and not re.fullmatch(r"\s*" + re.escape(marker[0]) + "{" + str(len(marker)) + r",}\s*", lines[index]):
                    code.append(lines[index])
                    index += 1
                language = re.sub(r"[^a-zA-Z0-9_-]", "", language.strip())
                attribute = f' class="language-{language}"' if language else ""
                result.append(f'<pre tabindex="0"><code{attribute}>' + html.escape("\n".join(code)) + "</code></pre>")
                index += 1
                continue
            heading = HEADING.match(line)
            if heading:
                level, text = len(heading.group(1)), heading.group(2)
                if level == 2:
                    # Keep numbered source headings, but typeset their index
                    # separately so the web edition does not repeat it.
                    text = re.sub(r"^\d{1,2}[.)]\s+", "", text)
                identifier = self.identifier(text)
                self.current_heading = plain(text)
                number = ""
                if level == 2:
                    self.contents.append((identifier, plain(text)))
                    number = f'<span class="section-index" aria-hidden="true">{len(self.contents):02d}</span>'
                result.append(f'<h{level} id="{identifier}">{number}{inline(text)}</h{level}>')
                index += 1
                continue
            if index + 1 < len(lines) and "|" in line and table_separator(lines[index + 1]):
                headers = cells(line)
                alignments = cells(lines[index + 1])
                rows = []
                index += 2
                while index < len(lines) and lines[index].strip() and "|" in lines[index]:
                    rows.append(cells(lines[index]))
                    index += 1
                columns = len(headers)
                label = html.escape(f"Table: {self.current_heading}", quote=True)
                output = [f'<div class="table-scroll" tabindex="0" role="region" aria-label="{label}"><table><thead><tr>']
                for header in headers:
                    output.append(f'<th scope="col">{inline(header)}</th>')
                output.append("</tr></thead><tbody>")
                for row in rows:
                    output.append("<tr>")
                    for column in range(columns):
                        alignment = alignments[column] if column < len(alignments) else ""
                        css_class = ""
                        if alignment.endswith(":"):
                            css_class = ' class="align-center"' if alignment.startswith(":") else ' class="align-right"'
                        value = row[column] if column < len(row) else ""
                        output.append(f"<td{css_class}>{inline(value)}</td>")
                    output.append("</tr>")
                output.append("</tbody></table></div>")
                result.append("".join(output))
                continue
            if re.match(r"^ {0,3}>\s?", line):
                quote = []
                while index < len(lines) and re.match(r"^ {0,3}>\s?", lines[index]):
                    quote.append(re.sub(r"^ {0,3}>\s?", "", lines[index]))
                    index += 1
                result.append("<blockquote>" + self.render(quote) + "</blockquote>")
                continue
            list_match = LIST.match(line)
            if list_match:
                base_indent = len(list_match.group(1))
                ordered = list_match.group(2)[0].isdigit()
                tag = "ol" if ordered else "ul"
                start = int(re.match(r"\d+", list_match.group(2)).group()) if ordered else 1
                start_attribute = f' start="{start}"' if ordered and start != 1 else ""
                output = [f"<{tag}{start_attribute}>"]
                while index < len(lines):
                    item_match = LIST.match(lines[index])
                    if not item_match or len(item_match.group(1)) != base_indent or item_match.group(2)[0].isdigit() != ordered:
                        break
                    content_indent = item_match.start(3)
                    item = [item_match.group(3)]
                    index += 1
                    while index < len(lines):
                        candidate = lines[index]
                        next_match = LIST.match(candidate)
                        if next_match and len(next_match.group(1)) <= base_indent:
                            break
                        if candidate.strip() and len(candidate) - len(candidate.lstrip()) < content_indent:
                            break
                        item.append(candidate[content_indent:] if candidate.strip() else "")
                        index += 1
                    output.append("<li>" + self.render(item) + "</li>")
                output.append(f"</{tag}>")
                result.append("".join(output))
                continue
            if re.fullmatch(r"\s*(?:-{3,}|\*{3,}|_{3,})\s*", line):
                result.append("<hr>")
                index += 1
                continue
            paragraph = [line]
            index += 1
            while index < len(lines) and lines[index].strip() and not self.starts_block(lines, index):
                paragraph.append(lines[index])
                index += 1
            paragraph_html = []
            for paragraph_index, paragraph_line in enumerate(paragraph):
                paragraph_html.append(inline(paragraph_line.strip()))
                if paragraph_index < len(paragraph) - 1:
                    paragraph_html.append("<br>" if paragraph_line.endswith("  ") else " ")
            result.append("<p>" + "".join(paragraph_html) + "</p>")
        return "\n".join(result)


def build(source: Path, output: Path) -> None:
    markdown = source.read_text(encoding="utf-8")
    lines = markdown.splitlines()
    lines = [line for line in lines if not re.fullmatch(r"\s*<!--.*?-->\s*", line)]
    # The title lives in the publication header, leaving one accessible h1.
    for index, line in enumerate(lines):
        if not line.strip():
            continue
        if line.startswith("# "):
            del lines[index]
        break
    # These source-format metadata lines are already typeset on the cover.
    cover_metadata = {
        "**A single-player open-world RPG with an AI dungeon master**",
        "Game design document · Version 0.1 · October 26, 2026",
    }
    for index in range(min(6, len(lines)) - 1, -1, -1):
        if lines[index].strip() in cover_metadata:
            del lines[index]
    renderer = Renderer()
    article = renderer.render(lines)
    words = len(re.findall(r"\b[\w’-]+\b", markdown))
    reading_minutes = max(1, math.ceil(words / 230))
    reading_time = f"{reading_minutes} minute" + ("s" if reading_minutes != 1 else "")
    toc = "\n".join(
        f'<li><a href="#{identifier}"><span class="toc-number" aria-hidden="true">{number:02d}</span>'
        f'<span>{html.escape(title)}</span></a></li>'
        for number, (identifier, title) in enumerate(renderer.contents, 1)
    )
    css = (ROOT / "presentation.css").read_text(encoding="utf-8")
    javascript = (ROOT / "presentation.js").read_text(encoding="utf-8")
    page = f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="description" content="A detailed design document for a single-player, open-world RPG with an AI dungeon master. Exploration, creative freedom, and a world that remembers.">
  <title>The Long Return — Game Design Document</title>
  <style>{css}</style>
</head>
<body id="top">
  <a class="skip-link" href="#document">Skip to the document</a>
  <div class="page-shell">
    <header class="masthead">
      <a class="wordmark" href="#top" aria-label="The Long Return, back to top">THE LONG RETURN<span class="wordmark-rule" aria-hidden="true"></span></a>
      <div class="document-actions">
        <a class="source-link" href="design-document.txt" download="the-long-return-design-document.md">Download document<span class="action-arrow" aria-hidden="true">↗</span></a>
        <button class="print-button" type="button" data-print hidden>Print / save PDF</button>
      </div>
    </header>
    <section class="cover" aria-labelledby="document-title">
      <div class="cover-title">
        <p class="eyebrow"><span class="edition-mark" aria-hidden="true"></span> Game design document / v0.1</p>
        <h1 id="document-title">The Long<br><em>Return.</em></h1>
        <p class="cover-deck">An exploration-first, single-player open-world RPG guided by an AI dungeon master.</p>
      </div>
      <div class="cover-note">
        <p class="cover-premise">Discover a world.<br>Leave your mark.<br>Return to its consequences.</p>
        <dl class="publication-meta">
          <div><dt>Edition</dt><dd>Design proposal</dd></div>
          <div><dt>Published</dt><dd><time datetime="2026-10-26">October 26, 2026</time></dd></div>
          <div><dt>Reading time</dt><dd>About {reading_time}</dd></div>
        </dl>
      </div>
    </section>
    <details class="mobile-contents">
      <summary>In this document <span>{len(renderer.contents):02d} sections</span></summary>
      <nav aria-label="Document contents"><ol>{toc}</ol></nav>
    </details>
    <div class="reading-layout">
      <aside class="contents-sidebar">
        <div class="contents-sticky">
          <p class="contents-label">In this document <span>{len(renderer.contents):02d}</span></p>
          <nav aria-label="Document contents"><ol>{toc}</ol></nav>
          <p class="sidebar-note">A living world, grounded<br>in persistent history.</p>
        </div>
      </aside>
      <main id="document" tabindex="-1">
        <article class="document-body" aria-labelledby="document-title">{article}</article>
        <footer class="document-footer">
          <p>The Long Return<span>Design document · v0.1</span></p>
          <a href="#top">Back to the beginning <span aria-hidden="true">↑</span></a>
        </footer>
      </main>
    </div>
    <footer class="publication-footer"><span>THE LONG RETURN</span><span>October 2026 / Design proposal</span></footer>
  </div>
  <script>{javascript}</script>
</body>
</html>
'''
    output.mkdir(parents=True, exist_ok=True)
    (output / "index.html").write_text(page, encoding="utf-8")
    legacy_download = output / "design-document.md"
    if legacy_download.is_file() and legacy_download.resolve() != source.resolve():
        legacy_download.unlink()
    shutil.copyfile(source, output / "design-document.txt")
    print(f"Built {output / 'index.html'}")
    print(f"{len(renderer.contents)} sections; {words:,} words; about {reading_time}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "design-document.md")
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    arguments = parser.parse_args()
    if not arguments.source.is_file():
        parser.error(f"Markdown source does not exist: {arguments.source}")
    build(arguments.source, arguments.output)
