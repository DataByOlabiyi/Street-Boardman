"""One-off script: renders the Markdown manuals to styled PDFs.
Not part of the app; safe to delete after generating docs/*.pdf.
"""
import markdown
from xhtml2pdf import pisa
import os

BASE = os.path.dirname(os.path.abspath(__file__))

CSS = """
@page {
    size: A4;
    margin: 2.2cm 1.8cm 2.2cm 1.8cm;
    @frame footer_frame {
        -pdf-frame-content: footer_content;
        bottom: 0.8cm; margin-left: 1.8cm; margin-right: 1.8cm; height: 1cm;
    }
}
body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.5;
    color: #1a1a1a;
}
h1 {
    font-size: 20pt;
    color: #084d38;
    border-bottom: 2pt solid #0b6e4f;
    padding-bottom: 6pt;
    margin-top: 22pt;
}
h2 {
    font-size: 14pt;
    color: #0b6e4f;
    margin-top: 18pt;
    margin-bottom: 6pt;
}
h3 {
    font-size: 11.5pt;
    color: #1a1a1a;
    margin-top: 12pt;
    margin-bottom: 4pt;
}
p { margin: 4pt 0 8pt 0; text-align: left; }
ul, ol { margin: 4pt 0 10pt 0; padding-left: 16pt; }
li { margin-bottom: 3pt; }
strong { color: #084d38; }
code {
    font-family: Courier, monospace;
    font-size: 9pt;
    background-color: #f0f2f0;
    color: #0b6e4f;
    padding: 1pt 3pt;
}
pre {
    font-family: Courier, monospace;
    font-size: 9pt;
    background-color: #f5f6f4;
    border: 0.5pt solid #dfe3e0;
    padding: 8pt;
    margin: 6pt 0 10pt 0;
    line-height: 1.35;
}
pre code { background-color: transparent; padding: 0; color: #1a1a1a; }
table {
    width: 100%;
    margin: 8pt 0 14pt 0;
    font-size: 9.5pt;
}
th {
    background-color: #0b6e4f;
    color: #ffffff;
    padding: 5pt 7pt;
    text-align: left;
    border: 0.5pt solid #084d38;
}
td {
    padding: 5pt 7pt;
    border: 0.5pt solid #dfe3e0;
    vertical-align: top;
}
tr:nth-child(even) td { background-color: #f7f8f7; }
blockquote {
    border-left: 3pt solid #0b6e4f;
    margin: 8pt 0;
    padding: 4pt 10pt;
    color: #5f6b66;
    background-color: #f5f6f4;
}
a { color: #0b6e4f; }
hr { border: none; border-top: 0.5pt solid #dfe3e0; margin: 14pt 0; }
#footer_content { font-size: 8pt; color: #5f6b66; text-align: center; }
"""

FOOTER = '<div id="footer_content">StreetBoardman - {title} - Page <pdf:pageNumber/></div>'

def build(md_path, pdf_path, title):
    with open(md_path, "r", encoding="utf-8") as f:
        md_text = f.read()

    body_html = markdown.markdown(
        md_text,
        extensions=["extra", "tables", "fenced_code", "sane_lists", "toc"],
    )

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body>
{FOOTER.format(title=title)}
{body_html}
</body></html>"""

    with open(pdf_path, "wb") as out:
        result = pisa.CreatePDF(html, dest=out)
    if result.err:
        raise RuntimeError(f"Failed to render {pdf_path}: {result.err} error(s)")
    print(f"Wrote {pdf_path}")


if __name__ == "__main__":
    build(
        os.path.join(BASE, "BETTER_MANUAL.md"),
        os.path.join(BASE, "StreetBoardman User Manual.pdf"),
        "User Manual",
    )
    build(
        os.path.join(BASE, "ENGINEER_MANUAL.md"),
        os.path.join(BASE, "StreetBoardman Operational Manual (Engineer).pdf"),
        "Operational Manual (Engineer)",
    )
