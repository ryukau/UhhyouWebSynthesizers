import http.server
import socketserver
import webbrowser
import os

port = 9540
os.chdir("../..")

reqHandler = http.server.SimpleHTTPRequestHandler

reqHandler.extensions_map = {
    ".html": "text/html",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".css": "text/css",
    ".js": "application/x-javascript",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".woff2": "application/font-woff2",
}

httpd = socketserver.TCPServer(("", port), reqHandler)

print(f"Serving HTTP on localhost:{port}")
webbrowser.open(f"http://127.0.0.1:{port}/test/specialmath/specialmath.html")

httpd.serve_forever()
