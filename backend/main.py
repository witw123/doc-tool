"""
FastAPI application entry point for FileScope Web.
Serves REST API endpoints and static web assets.
"""
import os
import platform
import sys
import subprocess
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response

from backend.models import (
    ScanRequest,
    ScanResponse,
    CompareRequest,
    CompareResponse,
    OpenFolderRequest,
    SelectFolderRequest,
    SelectFolderResponse,
    FilenameExportRequest,
    FilenamePreviewRequest,
    FilenamePreviewResponse,
)
from backend.scanner import DirectoryScanner
from backend.comparator import DirectoryComparator
from backend.filename_exporter import build_filename_export, build_filename_preview
from backend.folder_picker import select_local_folder

app = FastAPI(
    title="FileScope Web API",
    description="High-performance lightweight filename analysis, prefix statistics, and difference comparison tool.",
    version="1.0.0",
)

# Enable CORS for development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Export-File-Count", "X-Export-Leaf-Count", "X-Export-Unmatched-Count"],
)

# Base directories
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")


@app.get("/api/health")
async def health_check():
    """Return server status and basic environment info."""
    return {
        "status": "healthy",
        "system": platform.system(),
        "release": platform.release(),
        "python_version": sys.version.split()[0],
        "working_directory": os.getcwd(),
    }


@app.post("/api/scan", response_model=ScanResponse)
async def scan_directory(request: ScanRequest):
    """Scan a single folder for prefix stats and leaf folder rollup data."""
    try:
        scanner = DirectoryScanner(request)
        result = scanner.scan()
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except NotADirectoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=f"Permission denied: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")


@app.post("/api/compare", response_model=CompareResponse)
async def compare_directories(request: CompareRequest):
    """Compare two folders for filename match, missing files, and path differences."""
    try:
        comparator = DirectoryComparator(request)
        result = comparator.compare()
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except NotADirectoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=f"Permission denied: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Comparison failed: {str(e)}")


@app.post("/api/select-local-folder", response_model=SelectFolderResponse)
def choose_local_folder(request: SelectFolderRequest):
    """Open the native folder picker on the machine running FileScope."""
    try:
        selected_path = select_local_folder(request.initial_path)
        return SelectFolderResponse(selected=bool(selected_path), path=selected_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"打开本地文件夹选择窗口失败: {exc}")


@app.post("/api/export-filename-xlsx")
async def export_filename_xlsx(request: FilenameExportRequest):
    """Export leaf-directory files split into custom filename fields as XLSX."""
    try:
        result = build_filename_export(request.path, request.fields, request.delimiter, request.layout)
        headers = {
            "Content-Disposition": f'attachment; filename="{result.filename}"',
            "X-Export-File-Count": str(result.file_count),
            "X-Export-Leaf-Count": str(result.leaf_count),
            "X-Export-Unmatched-Count": str(result.unmatched_count),
        }
        return Response(
            content=result.content.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except NotADirectoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=f"Permission denied: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel 导出失败: {str(e)}")


@app.post("/api/preview-filename", response_model=FilenamePreviewResponse)
async def preview_filename(request: FilenamePreviewRequest):
    """Preview the leaf-directory filename split rows before exporting."""
    try:
        headers, rows, file_count, leaf_count, unmatched_count = build_filename_preview(
            request.path,
            request.fields,
            request.delimiter,
        )
        return FilenamePreviewResponse(
            success=True,
            headers=headers,
            rows=rows,
            file_count=file_count,
            leaf_count=leaf_count,
            unmatched_count=unmatched_count,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except NotADirectoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=f"Permission denied: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清单预览失败: {str(e)}")


@app.post("/api/open-system-folder")
async def open_system_folder(payload: OpenFolderRequest):
    """Open a directory in the host OS file manager."""
    raw_path = payload.path.strip()
    if not raw_path:
        raise HTTPException(status_code=400, detail="文件夹路径不能为空")

    target_path = os.path.normpath(os.path.abspath(raw_path))
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail=f"文件夹路径不存在: {raw_path}")
    if not os.path.isdir(target_path):
        raise HTTPException(status_code=400, detail=f"路径不是文件夹: {raw_path}")

    try:
        if sys.platform == "win32":
            norm_path = os.path.normpath(target_path)
            # os.startfile is the Windows-supported way to open a folder in the
            # interactive user's Explorer session. The detached process fallback
            # handles machines where the shell association is unavailable.
            try:
                os.startfile(norm_path)
            except (AttributeError, OSError):
                creation_flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                creation_flags |= getattr(subprocess, "DETACHED_PROCESS", 0)
                subprocess.Popen(
                    ["explorer.exe", "/e,", norm_path],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    close_fds=True,
                    creationflags=creation_flags,
                )
        elif sys.platform == "darwin":  # macOS
            subprocess.Popen(["open", target_path])
        else:  # Linux / Unix
            subprocess.Popen(["xdg-open", target_path])

        return {
            "success": True,
            "message": f"已在系统文件管理器中打开: {target_path}",
            "path": target_path,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"调用系统文件管理器失败: {str(e)}")


# Mount static files if static directory exists
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    async def serve_index():
        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return JSONResponse({"message": "FileScope Web is running. static/index.html not found."})
