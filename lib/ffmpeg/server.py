#!/usr/bin/env python3
import http.server
import socketserver
import mimetypes
import sys

PORT = 8000

# Map WASM MIME type correctly for modern browsers
mimetypes.add_type("application/wasm", ".wasm")


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable cache for convenient local testing
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def run():
    handler = CustomHandler
    # Bind to standard local port
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Local server running at: http://localhost:{PORT}")
        print("Press Ctrl+C to terminate.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            sys.exit(0)


if __name__ == "__main__":
    run()
