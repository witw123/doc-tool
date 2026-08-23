"""Windows Explorer-quality local folder selection for the desktop app."""
import os
import ctypes
import platform
from typing import Optional


def _select_windows_folder(initial_path: Optional[str] = None) -> Optional[str]:
    """Use the Vista+ IFileDialog folder picker, not the legacy Tk dialog."""
    from ctypes import POINTER, byref, c_int, c_uint, c_void_p, c_wchar_p
    from ctypes.wintypes import DWORD, HWND, LPCWSTR, LPVOID
    HRESULT = ctypes.c_long

    CLSCTX_INPROC_SERVER = 0x1
    FOS_PICKFOLDERS = 0x20
    FOS_FORCEFILESYSTEM = 0x40
    FOS_PATHMUSTEXIST = 0x800
    SIGDN_FILESYSPATH = 0x80058000
    ERROR_CANCELLED = 0x800704C7

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", ctypes.c_uint32),
            ("Data2", ctypes.c_uint16),
            ("Data3", ctypes.c_uint16),
            ("Data4", ctypes.c_ubyte * 8),
        ]

    def guid(value: str) -> GUID:
        import uuid
        parsed = uuid.UUID(value)
        return GUID(
            parsed.time_low,
            parsed.time_mid,
            parsed.time_hi_version,
            (ctypes.c_ubyte * 8).from_buffer_copy(parsed.bytes[8:]),
        )

    def vtable_method(instance, index, restype, *argtypes):
        table = ctypes.cast(instance, POINTER(POINTER(c_void_p))).contents
        return ctypes.WINFUNCTYPE(restype, c_void_p, *argtypes)(table[index])

    ole32 = ctypes.windll.ole32
    shell32 = ctypes.windll.shell32
    ole32.CoInitializeEx(None, 2)
    dialog = c_void_p()
    shell_item = c_void_p()
    result_item = c_void_p()
    display_name = c_void_p()
    try:
        clsid = guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")
        iid = guid("D57C7288-D4AD-4768-BE02-9D969532D960")
        hr = ole32.CoCreateInstance(byref(clsid), None, CLSCTX_INPROC_SERVER, byref(iid), byref(dialog))
        if hr < 0:
            raise OSError(f"CoCreateInstance failed: 0x{hr & 0xFFFFFFFF:08X}")

        options = c_uint()
        vtable_method(dialog, 10, HRESULT, POINTER(c_uint))(dialog, byref(options))
        options.value |= FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST
        vtable_method(dialog, 9, HRESULT, c_uint)(dialog, options)
        vtable_method(dialog, 17, HRESULT, LPCWSTR)(dialog, "选择本地文件夹")

        if initial_path and os.path.isdir(initial_path):
            parsing_name = shell32.SHCreateItemFromParsingName
            parsing_name.argtypes = [LPCWSTR, LPVOID, POINTER(GUID), POINTER(c_void_p)]
            parsing_name.restype = HRESULT
            shell_iid = guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")
            if parsing_name(initial_path, None, byref(shell_iid), byref(shell_item)) >= 0:
                vtable_method(dialog, 12, HRESULT, c_void_p)(dialog, shell_item)

        hr = vtable_method(dialog, 3, HRESULT, HWND)(dialog, None)
        if hr == ERROR_CANCELLED or hr < 0:
            return None

        hr = vtable_method(dialog, 20, HRESULT, POINTER(c_void_p))(dialog, byref(result_item))
        if hr < 0:
            raise OSError(f"GetResult failed: 0x{hr & 0xFFFFFFFF:08X}")
        hr = vtable_method(result_item, 5, HRESULT, DWORD, POINTER(c_void_p))(result_item, SIGDN_FILESYSPATH, byref(display_name))
        if hr < 0 or not display_name.value:
            raise OSError("无法读取所选文件夹路径")
        selected_path = ctypes.wstring_at(display_name.value)
        ole32.CoTaskMemFree(display_name)
        return os.path.normpath(os.path.abspath(selected_path))
    finally:
        if result_item:
            vtable_method(result_item, 2, c_uint)(result_item)
        if shell_item:
            vtable_method(shell_item, 2, c_uint)(shell_item)
        if dialog:
            vtable_method(dialog, 2, c_uint)(dialog)
        ole32.CoUninitialize()


def _select_tk_folder(initial_path: Optional[str] = None) -> Optional[str]:
    """Fallback for non-Windows development environments."""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError as exc:
        raise RuntimeError("当前 Python 环境缺少 Tk 文件夹选择组件") from exc

    initial_directory = initial_path if initial_path and os.path.isdir(initial_path) else os.path.expanduser("~")
    root = tk.Tk()
    root.withdraw()
    try:
        root.attributes("-topmost", True)
        root.update_idletasks()
        selected_path = filedialog.askdirectory(
            parent=root,
            title="选择本地文件夹",
            initialdir=initial_directory,
            mustexist=True,
        )
    finally:
        root.destroy()

    if not selected_path:
        return None
    return os.path.normpath(os.path.abspath(selected_path))


def select_local_folder(initial_path: Optional[str] = None) -> Optional[str]:
    """Show the local OS folder picker and return an absolute path."""
    if platform.system() == "Windows":
        return _select_windows_folder(initial_path)
    return _select_tk_folder(initial_path)
