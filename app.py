"""
FileScope Web - Server Launcher Script
Usage:
    python app.py
    python app.py --port 8080 --host 0.0.0.0
"""
import os
import sys
import argparse
import uvicorn

# Ensure UTF-8 output across Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from tests.make_mock_data import create_mock_environment

def main():
    parser = argparse.ArgumentParser(description="FileScope Web - High Performance Filename Diff & Stats Tool")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host address to bind (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload on code changes")
    parser.add_argument("--no-mock", action="store_true", help="Skip creating mock demo test folders")
    args = parser.parse_args()

    # Automatically create mock dataset if not present
    mock_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_mock_env")
    if not os.path.exists(mock_env_path) and not args.no_mock:
        print("[*] Initializing test demonstration environment...")
        create_mock_environment(mock_env_path)

    print("\n" + "="*60)
    print(" 🚀 FileScope Web is starting!")
    print(f" 📡 Local URL:   http://localhost:{args.port}")
    print(f" 🌐 Network URL: http://{args.host}:{args.port}")
    print("="*60 + "\n")

    uvicorn.run("backend.main:app", host=args.host, port=args.port, reload=args.reload)

if __name__ == "__main__":
    main()
