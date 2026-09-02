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


def lan_ip():
    """This Mac's address on the local network, for testing from the phone."""
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))       # no packets sent; just picks the route
        return s.getsockname()[0]
    except Exception:
        return None
    finally:
        s.close()


def main():
    args = [a for a in sys.argv[1:] if a != "--lan"]
    lan = "--lan" in sys.argv
    port = int(args[0]) if args else 8123

    # Default to localhost. --lan opens it to your Wi-Fi so an iPhone on the
    # same network can reach it — handy for testing on the phone, but it does
    # mean anyone else on that network can open it too. Stop it when you're done.
    host = "0.0.0.0" if lan else "127.0.0.1"
    srv = ThreadingHTTPServer((host, port), Handler)

    print("Coach dev server (serving %s)" % ROOT)
    print("  on this Mac:  http://localhost:%d" % port)
    if lan:
        ip = lan_ip()
        if ip:
            print("  on your phone: http://%s:%d   (same Wi-Fi)" % (ip, port))
        else:
            print("  on your phone: could not work out this Mac's Wi-Fi address")
        print("  NOTE: open to your local network while this is running.")
    print("Cache-Control: no-store — edits show up on reload. Ctrl-C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
