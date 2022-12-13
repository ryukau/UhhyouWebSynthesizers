import http.server
from http.server import HTTPServer, BaseHTTPRequestHandler
import socketserver

if __name__ == "__main__":
    port = 8000

    reqHandler = http.server.SimpleHTTPRequestHandler

    reqHandler.extensions_map = {
        ".html": "text/html",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".css": "text/css",
        ".js": "application/x-javascript",
    }

    httpd = socketserver.TCPServer(("", port), reqHandler)

    print(f"Serving HTTP on localhost:{port}")
    httpd.serve_forever()
