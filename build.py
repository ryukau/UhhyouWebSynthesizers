import time
import jinja2
import json

with open("index.json", "r", encoding="utf-8") as fi:
    data = json.load(fi)

env = jinja2.Environment(loader=jinja2.FileSystemLoader("."))
composed = env.get_template("template.html").render(
    last_modified=time.strftime('%F'),
    languages={
        "en": "English",
        "ja": "日本語",
    },
    introduction=data["introduction"],
    sections=data["sections"],
)

with open("index.html", "w", encoding="utf-8") as fi:
    fi.write(composed)
