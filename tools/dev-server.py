#!/usr/bin/env python3
"""Local dev server for Coach.

    python3 tools/dev-server.py [port]        # default 8123

Serves the app with `Cache-Control: no-store` so an edit is always the thing
you reload. In production the service worker handles versioning instead (bump
VERSION in sw.js), which is why the script tags carry no ?v= query.

Also sets the correct MIME type for .webmanifest, which Python's built-in
server doesn't know about — without it the manifest is ignored and the app
can't be installed.
"""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
        ".json": "application/json",
    })

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # a service worker may only control pages at or below its own path
        if self.path.endswith("sw.js"):
            self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):
        # quiet: only surface failures
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("Coach dev server → http://localhost:%d  (serving %s)" % (port, ROOT))
    print("Cache-Control: no-store — edits show up on reload. Ctrl-C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
