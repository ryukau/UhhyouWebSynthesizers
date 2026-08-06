import http.server
import socketserver
import webbrowser

port = 9540

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

webbrowser.open(f"http://127.0.0.1:{port}/test.html")

httpd.serve_forever()
