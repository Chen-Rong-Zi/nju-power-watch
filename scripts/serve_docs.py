#!/usr/bin/env python3
"""
Simple HTTP server for testing static frontend.
Run from repository root: python scripts/serve_docs.py
"""
import http.server
import socketserver
import webbrowser
import os
from pathlib import Path


PORT = 8000
DIRECTORY = "docs"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Add CORS headers for local testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()


def main():
    # Change to repository root
    repo_root = Path(__file__).parent.parent
    os.chdir(repo_root)
    
    print(f"Starting server at http://localhost:{PORT}")
    print(f"Serving files from: {DIRECTORY}/")
    print(f"Database directory: {repo_root}/database/")
    print("\nPress Ctrl+C to stop the server\n")
    
    # Open browser
    webbrowser.open(f'http://localhost:{PORT}')
    
    # Start server
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped")


if __name__ == "__main__":
    main()
