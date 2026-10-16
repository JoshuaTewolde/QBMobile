# Dev server on the local network (port 8000, or pass a port), with correct MIME types for .mjs and no caching.
import http.server, functools, os

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.mjs': 'text/javascript', '.js': 'text/javascript',
                      '.webmanifest': 'application/manifest+json'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import sys
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
http.server.ThreadingHTTPServer(('0.0.0.0', port), functools.partial(Handler, directory=root)).serve_forever()
