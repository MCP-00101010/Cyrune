#!/usr/bin/env python3
"""
Cyrune Host — native messaging host for Portal, Relay, and Arcade.
Handles file read/write and file-picker dialogs for the Firefox extension.
"""

import sys
import json
import struct
import os
import shutil
import time
import base64
import binascii
import mimetypes
import urllib.request
import urllib.parse
import urllib.error
import hashlib
import math
import tempfile
import stat
import re
import platform
import subprocess
import secrets
import importlib.util
import threading
import queue
from functools import wraps
from pathlib import Path
from contextlib import contextmanager
from html.parser import HTMLParser
import ctypes
from ctypes import wintypes

HOST_DIR = os.path.dirname(os.path.abspath(__file__))


def default_config_path():
    override = str(os.environ.get('CYRUNE_HOST_CONFIG', '') or '').strip()
    if override:
        return os.path.abspath(os.path.expanduser(override))
    if sys.platform == 'win32':
        base = os.environ.get('LOCALAPPDATA') or os.path.expanduser('~\\AppData\\Local')
    else:
        base = os.environ.get('XDG_CONFIG_HOME') or os.path.expanduser('~/.config')
    return os.path.join(base, 'Cyrune', 'Host', 'config.json')


CONFIG_PATH = default_config_path()
CYRUNE_REPO_ROOT = os.path.dirname(HOST_DIR)


def default_nexus_data_root():
    override = str(os.environ.get('CYRUNE_NEXUS_DATA', '') or '').strip()
    if override:
        return os.path.abspath(os.path.expanduser(override))
    if sys.platform == 'win32':
        base = os.environ.get('LOCALAPPDATA') or os.path.expanduser('~\\AppData\\Local')
    else:
        base = os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share')
    return os.path.join(base, 'Cyrune', 'Nexus')


NEXUS_DATA_ROOT = default_nexus_data_root()
NEXUS_SETTINGS_PATH = os.path.join(NEXUS_DATA_ROOT, 'settings.json')
NEXUS_HISTORY_PATH = os.path.join(NEXUS_DATA_ROOT, 'settings-history.json')
NEXUS_VALIDATION_PATH = os.path.join(NEXUS_DATA_ROOT, 'validation.json')
NEXUS_EVENTS_PATH = os.path.join(NEXUS_DATA_ROOT, 'events.json')
NEXUS_SETTINGS_SCHEMA_VERSION = 2
MAX_NEXUS_SETTINGS_BYTES = 64 * 1024
MAX_NEXUS_DOCUMENT_BYTES = 512 * 1024
MAX_NEXUS_HISTORY = 100
MAX_NEXUS_EVENTS = 200
MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
MAX_FAVICON_BYTES = 1024 * 1024
MAX_APPLICATION_ICON_BYTES = 480 * 1024
MAX_FAVICON_HTML_BYTES = 1024 * 1024
MAX_DATABASE_BACKUPS = 30
DATABASE_BACKUP_MIN_INTERVAL_SECONDS = 60
SECRET_TARGET_PREFIX = 'Morpheus WebHub/'
THEME_ID_PATTERN = re.compile(r'^[a-z0-9][a-z0-9_-]{0,79}$', re.IGNORECASE)
APPLICATION_KEY_PATTERN = re.compile(r'^app_[a-zA-Z0-9_-]{12,75}$')
GAME_KEY_PATTERN = re.compile(r'^game_[a-zA-Z0-9_-]{12,75}$')
EMUGUI_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{1,120}$')
GAME_SYSTEM_ID_PATTERN = re.compile(r'^[a-z0-9][a-z0-9_-]{0,47}$')
APPLICATION_URI_SCHEMES = {
    'steam', 'goggalaxy', 'com.epicgames.launcher', 'uplay', 'origin',
    'origin2', 'ea', 'battlenet', 'xbox', 'ms-xbl', 'heroic'
}
MAX_INTERNET_SHORTCUT_BYTES = 64 * 1024
MAX_GAME_BINDINGS = 512
MAX_EMUGUI_RPC_REQUEST_BYTES = 2 * 1024 * 1024
MAX_EMUGUI_RPC_RESPONSE_BYTES = 32 * 1024 * 1024
MAX_EMUGUI_ASSET_BYTES = 4 * 1024 * 1024
MAX_EMUGUI_TRANSFER_CHUNK_BYTES = 384 * 1024
MAX_EMUGUI_TRANSFERS = 4
EMUGUI_TRANSFER_TTL_SECONDS = 180
EMUGUI_MODULE = None
EMUGUI_MODULE_PATH = ''
EMUGUI_TRANSFERS = {}
CATALOGUE_BINDINGS = None
CATALOGUE_BINDINGS_PATH = None
CATALOGUE_TRANSPORT = None
GAME_BINDING_LOCK = threading.RLock()
GAME_BINDING_LOCK_DEPTH = threading.local()
PORTAL_ASSET_WRITE_SESSIONS = {}

HOST_COMPONENT_MANIFEST_PATH = os.path.join(HOST_DIR, 'component.json')
try:
    with open(HOST_COMPONENT_MANIFEST_PATH, 'r', encoding='utf-8') as _host_manifest_file:
        HOST_COMPONENT_MANIFEST = json.load(_host_manifest_file)
except (OSError, json.JSONDecodeError):
    HOST_COMPONENT_MANIFEST = {}
HOST_VERSION = str(HOST_COMPONENT_MANIFEST.get('version') or 'Unknown')
HOST_PROTOCOLS = dict(HOST_COMPONENT_MANIFEST.get('protocols') or {})
HOST_CAPABILITIES = list(HOST_COMPONENT_MANIFEST.get('capabilities') or [])


# ---------------------------------------------------------------------------
# Native messaging protocol (stdin/stdout, 4-byte length-prefixed JSON)
# ---------------------------------------------------------------------------

def read_message(max_bytes=None):
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    length = struct.unpack('=I', raw)[0]
    if max_bytes is not None and length > max_bytes:
        raise ValueError('Native message exceeds its protocol limit')
    data = sys.stdin.buffer.read(length)
    return json.loads(data.decode('utf-8'))


def send_message(obj):
    encoded = json.dumps(obj, ensure_ascii=False).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def reply_ok(**kwargs):
    send_message({'ok': True, **kwargs})


def reply_err(msg):
    send_message({'ok': False, 'error': msg})


# ---------------------------------------------------------------------------
# Windows Credential Manager secrets
# ---------------------------------------------------------------------------

class FILETIME(ctypes.Structure):
    _fields_ = [
        ('dwLowDateTime', wintypes.DWORD),
        ('dwHighDateTime', wintypes.DWORD)
    ]


class CREDENTIALW(ctypes.Structure):
    _fields_ = [
        ('Flags', wintypes.DWORD),
        ('Type', wintypes.DWORD),
        ('TargetName', wintypes.LPWSTR),
        ('Comment', wintypes.LPWSTR),
        ('LastWritten', FILETIME),
        ('CredentialBlobSize', wintypes.DWORD),
        ('CredentialBlob', ctypes.POINTER(ctypes.c_byte)),
        ('Persist', wintypes.DWORD),
        ('AttributeCount', wintypes.DWORD),
        ('Attributes', ctypes.c_void_p),
        ('TargetAlias', wintypes.LPWSTR),
        ('UserName', wintypes.LPWSTR)
    ]


PCREDENTIALW = ctypes.POINTER(CREDENTIALW)
PPCREDENTIALW = ctypes.POINTER(PCREDENTIALW)
CRED_TYPE_GENERIC = 1
CRED_PERSIST_LOCAL_MACHINE = 2


def _credential_api():
    if sys.platform != 'win32':
        raise RuntimeError('Secret storage currently supports Windows only')
    advapi32 = ctypes.WinDLL('Advapi32', use_last_error=True)
    advapi32.CredWriteW.argtypes = [PCREDENTIALW, wintypes.DWORD]
    advapi32.CredWriteW.restype = wintypes.BOOL
    advapi32.CredReadW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(PCREDENTIALW)]
    advapi32.CredReadW.restype = wintypes.BOOL
    advapi32.CredDeleteW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD]
    advapi32.CredDeleteW.restype = wintypes.BOOL
    advapi32.CredEnumerateW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(PPCREDENTIALW)]
    advapi32.CredEnumerateW.restype = wintypes.BOOL
    advapi32.CredFree.argtypes = [ctypes.c_void_p]
    advapi32.CredFree.restype = None
    return advapi32


def _secret_target_name(key):
    key = (key or '').strip()
    if not key:
        raise ValueError('Secret key is required')
    if len(key) > 200 or any(ch in key for ch in '\r\n\0'):
        raise ValueError('Secret key is invalid')
    return SECRET_TARGET_PREFIX + key


def secret_status():
    return {
        'available': sys.platform == 'win32',
        'provider': 'windows-credential-manager' if sys.platform == 'win32' else '',
        'error': '' if sys.platform == 'win32' else 'Secret storage currently supports Windows only'
    }


def secret_set(key, value):
    advapi32 = _credential_api()
    target = _secret_target_name(key)
    blob = (value or '').encode('utf-16-le')
    blob_buffer = ctypes.create_string_buffer(blob)
    credential = CREDENTIALW()
    credential.Type = CRED_TYPE_GENERIC
    credential.TargetName = target
    credential.CredentialBlobSize = len(blob)
    credential.CredentialBlob = ctypes.cast(blob_buffer, ctypes.POINTER(ctypes.c_byte))
    credential.Persist = CRED_PERSIST_LOCAL_MACHINE
    credential.UserName = 'Cyrune Host'
    if not advapi32.CredWriteW(ctypes.byref(credential), 0):
        raise ctypes.WinError(ctypes.get_last_error())


def secret_get(key):
    advapi32 = _credential_api()
    target = _secret_target_name(key)
    credential_ptr = PCREDENTIALW()
    if not advapi32.CredReadW(target, CRED_TYPE_GENERIC, 0, ctypes.byref(credential_ptr)):
        error = ctypes.get_last_error()
        if error == 1168:
            return ''
        raise ctypes.WinError(error)
    try:
        credential = credential_ptr.contents
        if not credential.CredentialBlob or not credential.CredentialBlobSize:
            return ''
        raw = ctypes.string_at(credential.CredentialBlob, credential.CredentialBlobSize)
        return raw.decode('utf-16-le')
    finally:
        advapi32.CredFree(credential_ptr)


def secret_delete(key):
    advapi32 = _credential_api()
    target = _secret_target_name(key)
    if not advapi32.CredDeleteW(target, CRED_TYPE_GENERIC, 0):
        error = ctypes.get_last_error()
        if error != 1168:
            raise ctypes.WinError(error)


def secret_list():
    advapi32 = _credential_api()
    count = wintypes.DWORD()
    credentials = PPCREDENTIALW()
    if not advapi32.CredEnumerateW(SECRET_TARGET_PREFIX + '*', 0, ctypes.byref(count), ctypes.byref(credentials)):
        error = ctypes.get_last_error()
        if error == 1168:
            return []
        raise ctypes.WinError(error)
    try:
        keys = []
        for i in range(count.value):
            target = credentials[i].contents.TargetName or ''
            if target.startswith(SECRET_TARGET_PREFIX):
                keys.append(target[len(SECRET_TARGET_PREFIX):])
        return sorted(keys)
    finally:
        advapi32.CredFree(credentials)


# ---------------------------------------------------------------------------
# File picker — try tkinter, fall back to PowerShell on Windows
# ---------------------------------------------------------------------------

def _picker_filetypes(accept=''):
    if accept == 'image':
        return [('Image files', '*.png *.jpg *.jpeg *.gif *.webp *.svg *.bmp'), ('All files', '*.*')]
    if accept == 'json':
        return [('JSON files', '*.json'), ('All files', '*.*')]
    if accept == 'application':
        if sys.platform == 'win32':
            return [('Applications', '*.exe *.com *.lnk *.url'), ('All files', '*.*')]
        if sys.platform == 'darwin':
            return [('Applications', '*.app'), ('All files', '*.*')]
        return [('Applications', '*.desktop'), ('All files', '*.*')]
    return [('All files', '*.*')]


def _windows_filter_string(accept=''):
    if accept == 'image':
        return 'Image Files (*.png,*.jpg,*.jpeg,*.gif,*.webp,*.bmp)|*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp|All Files (*.*)|*.*'
    if accept == 'json':
        return 'JSON Files (*.json)|*.json|All Files (*.*)|*.*'
    if accept == 'application':
        return 'Applications (*.exe,*.com,*.lnk,*.url)|*.exe;*.com;*.lnk;*.url|All Files (*.*)|*.*'
    return 'All Files (*.*)|*.*'


def open_file_picker(accept='', title='Select file'):
    """
    Open a system file dialog and return the selected path or None.
    """
    filetypes_tk = _picker_filetypes(accept)

    # --- try tkinter (cross-platform) ---
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes('-topmost', True)
        path = filedialog.askopenfilename(title=title, filetypes=filetypes_tk)
        root.destroy()
        if path:
            return path
    except Exception:
        pass

    # --- Windows fallback: PowerShell file dialog ---
    if sys.platform == 'win32':
        try:
            import subprocess
            filter_str = _windows_filter_string(accept)
            ps_script = (
                'Add-Type -AssemblyName System.Windows.Forms;'
                '$d = New-Object System.Windows.Forms.OpenFileDialog;'
                '$d.Title = $args[0];'
                '$d.Filter = $args[1];'
                'if ($d.ShowDialog() -eq \'OK\') { Write-Output $d.FileName }'
            )
            result = subprocess.run(
                ['powershell', '-STA', '-NonInteractive', '-Command', ps_script, str(title or 'Select file')[:160], filter_str],
                capture_output=True, text=True, timeout=60
            )
            path = result.stdout.strip()
            if path:
                return path
        except Exception:
            pass

    return None


def save_file_picker(accept='json', title='Choose file', default_name='cyrune-portal.json'):
    filetypes_tk = _picker_filetypes(accept)

    # --- Windows first: PowerShell save dialog in STA mode ---
    if sys.platform == 'win32':
        try:
            import subprocess
            filter_str = _windows_filter_string(accept)
            safe_default_name = (default_name or '').replace("'", "''")
            ps_script = (
                'Add-Type -AssemblyName System.Windows.Forms;'
                '$d = New-Object System.Windows.Forms.SaveFileDialog;'
                f'$d.Title = \'{title}\';'
                f'$d.Filter = \'{filter_str}\';'
                f'$d.FileName = \'{safe_default_name}\';'
                '$d.CheckPathExists = $true;'
                '$d.OverwritePrompt = $false;'
                '$d.AddExtension = $true;'
                '$d.DefaultExt = \'json\';'
                '$d.RestoreDirectory = $true;'
                'if ($d.ShowDialog() -eq \'OK\') { Write-Output $d.FileName }'
            )
            result = subprocess.run(
                ['powershell', '-STA', '-NonInteractive', '-Command', ps_script],
                capture_output=True, text=True, timeout=60
            )
            path = result.stdout.strip()
            if path:
                return path
        except Exception:
            pass

    # --- try tkinter (cross-platform) ---
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes('-topmost', True)
        path = filedialog.asksaveasfilename(
            title=title,
            filetypes=filetypes_tk,
            defaultextension='.json' if accept == 'json' else '',
            initialfile=default_name or ''
        )
        root.destroy()
        if path:
            return path
    except Exception:
        pass

    return None


def file_to_data_url(path):
    mime, _ = mimetypes.guess_type(path)
    if not mime:
        mime = 'application/octet-stream'
    with open(path, 'rb') as f:
        data = base64.b64encode(f.read()).decode('ascii')
    return f'data:{mime};base64,{data}'


class FaviconLinkParser(HTMLParser):
    def __init__(self, base_url):
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != 'link':
            return
        data = {str(k).lower(): (v or '') for k, v in attrs}
        rel_tokens = set((data.get('rel') or '').lower().split())
        if not rel_tokens.intersection({'icon', 'shortcut', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'mask-icon'}):
            return
        href = (data.get('href') or '').strip()
        if not href:
            return
        self.links.append({
            'url': urllib.parse.urljoin(self.base_url, href),
            'rel': ' '.join(sorted(rel_tokens)),
            'type': (data.get('type') or '').strip().lower(),
            'sizes': (data.get('sizes') or '').strip().lower()
        })


def _request_headers(accept):
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0 CyruneHost/1.0',
        'Accept': accept,
        'Accept-Language': 'en-US,en;q=0.8'
    }


def _read_response_limited(response, max_bytes):
    chunks = []
    total = 0
    while True:
        chunk = response.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise ValueError('Response was too large')
        chunks.append(chunk)
    return b''.join(chunks)


def _guess_mime_from_url(url, content_type=''):
    mime = (content_type or '').split(';', 1)[0].strip().lower()
    if mime:
        return mime
    path = urllib.parse.urlparse(url or '').path or ''
    guessed, _ = mimetypes.guess_type(path)
    return guessed or 'image/x-icon'


def _favicon_size_score(sizes):
    if not sizes or sizes == 'any':
        return 48
    best = 0
    for part in sizes.split():
        pieces = part.lower().split('x', 1)
        if len(pieces) != 2:
            continue
        try:
            best = max(best, min(int(pieces[0]), int(pieces[1])))
        except ValueError:
            continue
    if best >= 128:
        return 80
    if best >= 64:
        return 70
    if best >= 32:
        return 55
    if best >= 16:
        return 35
    return 20


def _favicon_candidate_score(candidate, index):
    rel = candidate.get('rel', '')
    type_name = candidate.get('type', '')
    url = candidate.get('url', '')
    score = 0
    if 'apple-touch-icon' in rel:
        score += 90
    if 'icon' in rel:
        score += 80
    if 'mask-icon' in rel:
        score += 35
    score += _favicon_size_score(candidate.get('sizes', ''))
    if 'svg' in type_name or url.lower().split('?', 1)[0].endswith('.svg'):
        score += 12
    elif 'png' in type_name or url.lower().split('?', 1)[0].endswith('.png'):
        score += 10
    elif 'webp' in type_name or url.lower().split('?', 1)[0].endswith('.webp'):
        score += 9
    elif 'ico' in type_name or url.lower().split('?', 1)[0].endswith('.ico'):
        score += 7
    return score - index


def _download_favicon_candidate(url, max_bytes):
    parsed = urllib.parse.urlparse(url or '')
    if parsed.scheme not in ('http', 'https'):
        raise ValueError('Only http and https favicon URLs are supported')
    request = urllib.request.Request(
        url,
        headers=_request_headers('image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,image/*;q=0.8,*/*;q=0.4')
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        content_type = (response.headers.get('Content-Type') or '').split(';', 1)[0].strip().lower()
        data = _read_response_limited(response, max_bytes)
    if not data:
        raise ValueError('Favicon was empty')
    mime = _guess_mime_from_url(url, content_type)
    if not (mime.startswith('image/') or mime in ('application/octet-stream', 'binary/octet-stream')):
        raise ValueError(f'Favicon URL did not return an image ({mime})')
    if mime in ('application/octet-stream', 'binary/octet-stream'):
        mime = _guess_mime_from_url(url)
    return {
        'dataUrl': f'data:{mime};base64,{base64.b64encode(data).decode("ascii")}',
        'iconUrl': url,
        'contentType': mime,
        'bytes': len(data)
    }


def fetch_favicon(url, max_bytes=MAX_FAVICON_BYTES):
    parsed = urllib.parse.urlparse(url or '')
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise ValueError('Only http and https page URLs are supported')

    page_url = urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path or '/', '', parsed.query, ''))
    origin = urllib.parse.urlunparse((parsed.scheme, parsed.netloc, '', '', '', ''))
    candidates = []
    errors = []

    try:
        request = urllib.request.Request(page_url, headers=_request_headers('text/html,application/xhtml+xml;q=0.9,*/*;q=0.3'))
        with urllib.request.urlopen(request, timeout=20) as response:
            content_type = (response.headers.get('Content-Type') or '').split(';', 1)[0].strip().lower()
            charset = response.headers.get_content_charset() or 'utf-8'
            if content_type and 'html' not in content_type and 'xml' not in content_type:
                raise ValueError(f'Page did not return HTML ({content_type})')
            html = _read_response_limited(response, MAX_FAVICON_HTML_BYTES).decode(charset, errors='replace')
        parser = FaviconLinkParser(response.geturl() or page_url)
        parser.feed(html)
        candidates.extend(parser.links)
    except Exception as exc:
        errors.append(str(exc))

    fallback_paths = [
        '/favicon.ico',
        '/favicon.png',
        '/favicon.svg',
        '/apple-touch-icon.png',
        '/apple-touch-icon-precomposed.png',
        '/favicon-32x32.png',
        '/favicon-16x16.png',
        '/android-chrome-192x192.png',
        '/android-chrome-512x512.png'
    ]
    candidates.extend({'url': urllib.parse.urljoin(origin, path), 'rel': 'fallback icon', 'type': '', 'sizes': ''} for path in fallback_paths)

    seen = set()
    unique = []
    for candidate in candidates:
        candidate_url = (candidate.get('url') or '').strip()
        if not candidate_url or candidate_url in seen:
            continue
        seen.add(candidate_url)
        unique.append({**candidate, 'url': candidate_url})

    sorted_candidates = sorted(enumerate(unique), key=lambda pair: _favicon_candidate_score(pair[1], pair[0]), reverse=True)
    for _, candidate in sorted_candidates:
        try:
            return _download_favicon_candidate(candidate['url'], max_bytes)
        except Exception as exc:
            errors.append(f'{candidate["url"]}: {exc}')

    raise ValueError('No favicon found' + (f': {errors[-1]}' if errors else ''))


def download_url_to_file(url, path, temp_path, max_bytes=MAX_DOWNLOAD_BYTES):
    parsed = urllib.parse.urlparse(url or '')
    if parsed.scheme not in ('http', 'https'):
        raise ValueError('Only http and https image URLs can be cached as assets')

    request = urllib.request.Request(
        url,
        headers=_request_headers('image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/*;q=0.8,*/*;q=0.5')
    )
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    os.makedirs(os.path.dirname(os.path.abspath(temp_path)), exist_ok=True)
    written = 0
    content_type = ''
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            content_type = (response.headers.get('Content-Type') or '').split(';', 1)[0].strip().lower()
            if content_type and not content_type.startswith('image/'):
                raise ValueError(f'URL did not return an image ({content_type})')
            with open(temp_path, 'wb') as f:
                while True:
                    chunk = response.read(128 * 1024)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > max_bytes:
                        raise ValueError('Image is too large to cache')
                    f.write(chunk)
        if written <= 0:
            raise ValueError('Downloaded image was empty')
        os.replace(temp_path, path)
        return {'bytes': written, 'contentType': content_type}
    finally:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass


def hash_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as source:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def hash_text(content):
    return hashlib.sha256((content or '').encode('utf-8')).hexdigest()


def get_file_info(path, include_hash=False):
    normalized = str(path or '').strip()
    if not normalized:
        return {
            'exists': False,
            'version': None,
            'modifiedMs': None,
            'size': None
        }
    try:
        file_stat = os.stat(normalized)
        if not os.path.isfile(normalized):
            return {
                'exists': False,
                'version': None,
                'modifiedMs': None,
                'size': None
            }
        info = {
            'exists': True,
            'version': f'{file_stat.st_mtime_ns}:{file_stat.st_size}',
            'modifiedMs': int(file_stat.st_mtime_ns / 1_000_000),
            'size': file_stat.st_size
        }
        if include_hash:
            for _attempt in range(3):
                content_hash = hash_file(normalized)
                verified_stat = os.stat(normalized)
                if (
                    verified_stat.st_mtime_ns == file_stat.st_mtime_ns
                    and verified_stat.st_size == file_stat.st_size
                ):
                    info['contentHash'] = content_hash
                    break
                file_stat = verified_stat
                info.update({
                    'version': f'{file_stat.st_mtime_ns}:{file_stat.st_size}',
                    'modifiedMs': int(file_stat.st_mtime_ns / 1_000_000),
                    'size': file_stat.st_size
                })
            else:
                info['contentHash'] = hash_file(normalized)
        return info
    except FileNotFoundError:
        return {
            'exists': False,
            'version': None,
            'modifiedMs': None,
            'size': None
        }


def file_chunk_read_version(info):
    version = info.get('version') if isinstance(info, dict) else None
    content_hash = info.get('contentHash') if isinstance(info, dict) else None
    if not version or not content_hash:
        return None
    return f'{version}:{content_hash}'


def resolve_theme_path(themes_dir, theme_id):
    directory = os.path.abspath(str(themes_dir or '').strip())
    identifier = str(theme_id or '').strip()
    if not directory or not THEME_ID_PATTERN.fullmatch(identifier):
        raise ValueError('Theme ID must contain only letters, numbers, hyphens, or underscores')
    target = os.path.abspath(os.path.join(directory, f'{identifier}.json'))
    if os.path.commonpath([directory, target]) != directory:
        raise ValueError('Theme path escapes the configured themes directory')
    return target


def read_file_chunk(path, offset=0, length=512 * 1024, expected_version=None):
    offset = max(0, int(offset or 0))
    length = max(1, min(768 * 1024, int(length or 512 * 1024)))
    before = get_file_info(path, include_hash=True)
    if not before['exists']:
        return {
            'chunk': '', 'offset': offset, 'nextOffset': offset,
            'totalSize': 0, 'done': True, 'fileInfo': before,
            'readVersion': None
        }
    read_version = file_chunk_read_version(before)
    if expected_version and read_version != expected_version:
        raise RuntimeError('Shared database changed during chunked read; retry required')
    with open(path, 'rb') as source:
        source.seek(offset)
        data = source.read(length)
    after = get_file_info(path, include_hash=True)
    if read_version != file_chunk_read_version(after):
        raise RuntimeError('Shared database changed during chunked read; retry required')
    next_offset = offset + len(data)
    total_size = before.get('size') or 0
    return {
        'chunk': base64.b64encode(data).decode('ascii'),
        'offset': offset,
        'nextOffset': next_offset,
        'totalSize': total_size,
        'done': next_offset >= total_size,
        'fileInfo': before,
        'readVersion': read_version
    }


@contextmanager
def database_write_lock(path, timeout_seconds=15):
    lock_path = f'{os.path.abspath(path)}.lock'
    os.makedirs(os.path.dirname(lock_path), exist_ok=True)
    lock_file = open(lock_path, 'a+b')
    deadline = time.monotonic() + timeout_seconds
    locked = False
    try:
        while not locked:
            try:
                lock_file.seek(0)
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                locked = True
            except (OSError, IOError):
                if time.monotonic() >= deadline:
                    raise TimeoutError('Timed out waiting for the shared database write lock')
                time.sleep(0.05)
        # Locking a byte beyond EOF is supported on Windows. Initialise only
        # after taking ownership: concurrent first writers must not write into
        # a range another process has already locked.
        if os.fstat(lock_file.fileno()).st_size == 0:
            lock_file.write(b'\0')
            lock_file.flush()
        yield
    finally:
        if locked:
            try:
                lock_file.seek(0)
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
            except (OSError, IOError):
                pass
        lock_file.close()


def atomic_write_text(path, content):
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    existing_mode = None
    try:
        existing_mode = stat.S_IMODE(os.stat(path).st_mode)
    except FileNotFoundError:
        pass
    fd, temp_path = tempfile.mkstemp(prefix=f'.{os.path.basename(path)}.', suffix='.tmp', dir=directory)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='') as target:
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        if existing_mode is not None:
            os.chmod(temp_path, existing_mode)
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


NEXUS_EVENT_SUMMARIES = {
    'settings-conflict': 'A stale Nexus settings revision was rejected.',
    'settings-saved': 'Authoritative Nexus settings were updated.',
    'status-failed': 'A Nexus status snapshot could not be produced.'
}


def _record_nexus_event_unlocked(component, code, severity='info'):
    """Persist one bounded operational event without paths, payloads or exception text."""
    if component not in {'portal', 'widgets', 'arcade', 'relay', 'host', 'nexus'}:
        raise ValueError('Unsupported event component')
    if code not in NEXUS_EVENT_SUMMARIES or severity not in {'info', 'attention', 'error'}:
        raise ValueError('Unsupported operational event')
    events = []
    try:
        if os.path.getsize(NEXUS_EVENTS_PATH) <= 256 * 1024:
            with open(NEXUS_EVENTS_PATH, 'r', encoding='utf-8') as source:
                loaded = json.load(source)
            if isinstance(loaded, list):
                events = [item for item in loaded if isinstance(item, dict)][-MAX_NEXUS_EVENTS + 1:]
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        events = []
    events.append({
        'component': component,
        'code': code,
        'severity': severity,
        'summary': NEXUS_EVENT_SUMMARIES[code],
        'timestamp': int(time.time() * 1000)
    })
    atomic_write_text(NEXUS_EVENTS_PATH, json.dumps(events, ensure_ascii=False, indent=2) + '\n')


def record_nexus_event(component, code, severity='info'):
    with database_write_lock(NEXUS_EVENTS_PATH):
        _record_nexus_event_unlocked(component, code, severity)


def sanitized_nexus_events():
    try:
        if os.path.getsize(NEXUS_EVENTS_PATH) > 256 * 1024:
            return []
        with open(NEXUS_EVENTS_PATH, 'r', encoding='utf-8') as source:
            events = json.load(source)
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return []
    sanitized = []
    for event in events[-MAX_NEXUS_EVENTS:]:
        if not isinstance(event, dict):
            continue
        component = event.get('component')
        code = event.get('code')
        severity = event.get('severity')
        timestamp = event.get('timestamp')
        if (component in {'portal', 'widgets', 'arcade', 'relay', 'host', 'nexus'}
                and code in NEXUS_EVENT_SUMMARIES and severity in {'info', 'attention', 'error'}
                and isinstance(timestamp, int) and not isinstance(timestamp, bool) and timestamp >= 0):
            sanitized.append({'component': component, 'code': code, 'severity': severity,
                              'summary': NEXUS_EVENT_SUMMARIES[code], 'timestamp': timestamp})
    return sanitized


def write_file_if_unchanged(path, content, expected_version=None, expected_hash=''):
    with database_write_lock(path):
        current_info = get_file_info(path, include_hash=True)
        incoming_hash = hash_text(content)
        version_matches = current_info['version'] == expected_version
        creating_new = expected_version is None and not current_info['exists']
        baseline_content_unchanged = bool(
            expected_hash and current_info.get('contentHash') == expected_hash
        )
        if not version_matches and not creating_new and not baseline_content_unchanged:
            if current_info.get('contentHash') == incoming_hash:
                return {
                    'conflict': False,
                    'alreadyCurrent': True,
                    'fileInfo': current_info
                }
            return {'conflict': True, 'fileInfo': current_info}

        if current_info['exists'] and os.path.splitext(path)[1].lower() == '.json':
            with open(path, 'r', encoding='utf-8') as source:
                existing_content = source.read()
            if replacement_looks_dangerously_smaller(content, existing_content):
                raise ValueError('Refusing to overwrite a large shared database with a much smaller browser cache')

        backup_path = backup_database_file(path)
        atomic_write_text(path, content)
        return {
            'conflict': False,
            'fileInfo': get_file_info(path, include_hash=True),
            'backupPath': backup_path
        }


def summarize_hub_content(content):
    summary = {
        'valid': False,
        'bytes': len(content or ''),
        'boards': 0,
        'bookmarks': 0,
        'folders': 0,
        'titles': 0,
        'importItems': 0
        , 'schemaVersion': 0
        , 'tabs': 0
        , 'sets': 0
        , 'tags': 0
        , 'settings': 0
    }
    try:
        data = json.loads(content or '{}')
    except Exception:
        return summary

    summary['valid'] = isinstance(data, dict)
    if not isinstance(data, dict):
        return summary

    boards = data.get('boards')
    summary['boards'] = len(boards) if isinstance(boards, list) else 0
    summary['schemaVersion'] = int(data.get('schemaVersion') or 0)
    summary['sets'] = len(data.get('sets')) if isinstance(data.get('sets'), list) else 0
    summary['tags'] = len(data.get('tags')) if isinstance(data.get('tags'), list) else 0
    summary['settings'] = len(data.get('settings')) if isinstance(data.get('settings'), dict) else 0
    if isinstance(boards, list):
        summary['tabs'] = sum(len(board.get('tabs', [])) for board in boards if isinstance(board, dict) and isinstance(board.get('tabs'), list))

    import_manager = data.get('importManager')
    import_items = import_manager.get('items') if isinstance(import_manager, dict) else None
    summary['importItems'] = len(import_items) if isinstance(import_items, list) else 0

    def walk(value):
        if isinstance(value, list):
            for item in value:
                walk(item)
            return
        if not isinstance(value, dict):
            return
        item_type = value.get('type')
        if item_type == 'bookmark':
            summary['bookmarks'] += 1
        elif item_type == 'folder':
            summary['folders'] += 1
        elif item_type == 'title':
            summary['titles'] += 1
        for child in value.values():
            walk(child)

    walk(boards)
    walk(import_items)
    return summary


def hub_content_count(summary):
    return (
        summary.get('boards', 0)
        + summary.get('bookmarks', 0)
        + summary.get('folders', 0)
        + summary.get('titles', 0)
        + summary.get('importItems', 0)
    )


def replacement_looks_dangerously_smaller(new_content, existing_content):
    existing = summarize_hub_content(existing_content)
    incoming = summarize_hub_content(new_content)
    existing_count = hub_content_count(existing)
    incoming_count = hub_content_count(incoming)
    if not existing.get('valid'):
        return False
    if existing.get('bytes', 0) < 100000 or existing_count < 50:
        return False
    if not incoming.get('valid'):
        return True
    if incoming.get('bytes', 0) >= existing.get('bytes', 0) * 0.25:
        return False
    if incoming_count >= existing_count * 0.5:
        return False
    return True


def backup_database_file(path, force=False):
    normalized = str(path or '').strip()
    if not normalized or not os.path.isfile(normalized):
        return None
    if os.path.getsize(normalized) <= 0:
        return None
    if os.path.splitext(normalized)[1].lower() != '.json':
        return None

    backup_dir = os.path.join(os.path.dirname(os.path.abspath(normalized)), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(normalized))[0]
    existing_backups = sorted(
        (
            os.path.join(backup_dir, name)
            for name in os.listdir(backup_dir)
            if name.startswith(f'{stem}.before-write.') and name.endswith('.json')
        ),
        key=lambda item: os.path.getmtime(item),
        reverse=True
    )
    if not force and existing_backups and time.time() - os.path.getmtime(existing_backups[0]) < DATABASE_BACKUP_MIN_INTERVAL_SECONDS:
        return existing_backups[0]
    timestamp = time.strftime('%Y%m%d-%H%M%S')
    backup_path = os.path.join(backup_dir, f'{stem}.before-write.{timestamp}.json')
    suffix = 1
    while os.path.exists(backup_path):
        backup_path = os.path.join(backup_dir, f'{stem}.before-write.{timestamp}-{suffix}.json')
        suffix += 1
    shutil.copy2(normalized, backup_path)

    backups = [backup_path, *existing_backups]
    for old_path in backups[MAX_DATABASE_BACKUPS:]:
        try:
            os.remove(old_path)
        except Exception:
            pass
    return backup_path


def database_backup_dir(database_path):
    normalized = os.path.abspath(str(database_path or '').strip())
    if not normalized or os.path.splitext(normalized)[1].lower() != '.json':
        raise ValueError('A JSON database path is required')
    return os.path.join(os.path.dirname(normalized), 'backups')


def resolve_database_backup_path(database_path, name):
    backup_dir = os.path.abspath(database_backup_dir(database_path))
    safe_name = os.path.basename(str(name or '').strip())
    stem = os.path.splitext(os.path.basename(str(database_path)))[0]
    if safe_name != name or not safe_name.startswith(f'{stem}.before-write.') or not safe_name.endswith('.json'):
        raise ValueError('Invalid database backup name')
    target = os.path.abspath(os.path.join(backup_dir, safe_name))
    if os.path.commonpath([backup_dir, target]) != backup_dir:
        raise ValueError('Backup path escapes the configured backup directory')
    return target


def list_database_backups(database_path):
    backup_dir = database_backup_dir(database_path)
    if not os.path.isdir(backup_dir):
        return []
    stem = os.path.splitext(os.path.basename(str(database_path)))[0]
    output = []
    for name in os.listdir(backup_dir):
        if not name.startswith(f'{stem}.before-write.') or not name.endswith('.json'):
            continue
        try:
            path = resolve_database_backup_path(database_path, name)
            with open(path, 'r', encoding='utf-8') as source:
                content = source.read()
            summary = summarize_hub_content(content)
            info = get_file_info(path, include_hash=True)
            output.append({
                'name': name,
                'size': info.get('size'),
                'modifiedMs': info.get('modifiedMs'),
                'version': info.get('version'),
                'contentHash': info.get('contentHash'),
                'integrity': 'ok' if summary.get('valid') else 'invalid-json',
                'summary': summary
            })
        except Exception as error:
            output.append({'name': name, 'integrity': f'unreadable: {error}', 'summary': {}})
    return sorted(output, key=lambda item: item.get('modifiedMs') or 0, reverse=True)


def read_database_backup_chunk(database_path, name, offset=0, length=512 * 1024, expected_version=None):
    path = resolve_database_backup_path(database_path, name)
    result = read_file_chunk(path, offset, length, expected_version)
    if int(offset or 0) == 0:
        with open(path, 'r', encoding='utf-8') as source:
            result['summary'] = summarize_hub_content(source.read())
    return result


def load_config():
    try:
        raw = Path(CONFIG_PATH).read_bytes()
    except FileNotFoundError:
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError('The Host configuration is invalid; restore its backup')
    if 'emuguiRoot' in data:
        with game_binding_write_lock():
            upgraded = _data_upgrades().config_document(data)
            _data_upgrades().transaction_module().upgrade(
                Path(CONFIG_PATH).with_name('config-v1-upgrade.json'),
                [(Path(CONFIG_PATH), raw, upgraded)], apply=True)
            data = upgraded
    return data


def configured_portal_database_path(required=False):
    """Resolve the one Host-owned Portal database target."""
    configured = str(load_config().get('databasePath', '') or '').strip()
    path = os.path.realpath(configured) if configured else ''
    if required and not path:
        raise ValueError('The Portal database is not configured')
    return path


def portal_storage_config():
    """Return only the Portal storage field Relay needs during compatibility cutover."""
    return {'databasePath': configured_portal_database_path()}


def set_portal_database_path(path):
    candidate = str(path or '').strip()
    if candidate:
        candidate = os.path.realpath(candidate)
        if os.path.splitext(candidate)[1].lower() != '.json':
            raise ValueError('The Portal database must be a JSON file')
    save_config({'databasePath': candidate})
    return portal_storage_config()


def portal_database_file_info(include_hash=False):
    return get_file_info(configured_portal_database_path(required=True), include_hash=include_hash)


def portal_database_read_chunk(offset=0, length=512 * 1024, expected_version=None):
    return read_file_chunk(
        configured_portal_database_path(required=True),
        offset,
        length,
        expected_version
    )


def portal_database_write(content, expected_version=None, expected_hash=''):
    return write_file_if_unchanged(
        configured_portal_database_path(required=True),
        content,
        expected_version=expected_version,
        expected_hash=expected_hash
    )


def portal_themes_dir():
    database_path = configured_portal_database_path(required=True)
    return os.path.join(os.path.dirname(database_path), 'themes')


def list_portal_themes():
    directory = portal_themes_dir()
    if not os.path.isdir(directory):
        return []
    themes = []
    for name in sorted(os.listdir(directory))[:256]:
        if not name.lower().endswith('.json'):
            continue
        theme_id = name[:-5]
        try:
            path = resolve_theme_path(directory, theme_id)
            with open(path, 'r', encoding='utf-8') as source:
                content = source.read(256 * 1024 + 1)
            if len(content) > 256 * 1024:
                continue
            theme = json.loads(content)
            if isinstance(theme, dict):
                themes.append(theme)
        except (OSError, UnicodeError, ValueError, json.JSONDecodeError):
            continue
    return themes


def write_portal_theme(theme_id, content):
    serialized = str(content or '')
    if len(serialized.encode('utf-8')) > 256 * 1024:
        raise ValueError('Theme content exceeds the 256 KiB limit')
    parsed = json.loads(serialized)
    if not isinstance(parsed, dict) or str(parsed.get('id', '')) != str(theme_id or ''):
        raise ValueError('Theme content does not match its identifier')
    path = resolve_theme_path(portal_themes_dir(), theme_id)
    atomic_write_text(path, serialized)
    return get_file_info(path)


def _portal_asset_root():
    database_path = configured_portal_database_path()
    return os.path.dirname(database_path) if database_path else os.path.join(CYRUNE_REPO_ROOT, 'Portal')


def require_portal_asset_path(path, temporary=False):
    root = os.path.realpath(_portal_asset_root())
    candidate = os.path.realpath(str(path or '').strip())
    if not candidate:
        raise ValueError('Portal asset path is missing')
    relative = os.path.relpath(candidate, root).replace('\\', '/')
    allowed_prefixes = ('backgrounds/', 'assets/backgrounds/')
    if relative.startswith('../') or relative == '..' or not relative.startswith(allowed_prefixes):
        raise ValueError('Portal asset path is outside the managed background store')
    name = os.path.basename(candidate)
    if temporary:
        if '.tmp-' not in name:
            raise ValueError('Portal temporary asset path is invalid')
        name = name.split('.tmp-', 1)[0]
    extension = os.path.splitext(name)[1].lower().lstrip('.')
    if extension not in {'avif', 'bmp', 'gif', 'jpg', 'jpeg', 'png', 'svg', 'webp'}:
        raise ValueError('Portal asset type is unsupported')
    return candidate


def _portal_asset_slug(value, fallback):
    slug = re.sub(r'[^a-z0-9]+', '-', str(value or fallback or 'asset').strip().lower())
    slug = re.sub(r'-+', '-', slug).strip('-')[:80]
    return slug or fallback or 'asset'


def create_portal_asset_target(collection_name='', item_name='', extension='webp'):
    configured_database = configured_portal_database_path()
    safe_extension = _portal_asset_slug(extension, 'webp').replace('-', '')
    if safe_extension == 'jpeg':
        safe_extension = 'jpg'
    if safe_extension not in {'avif', 'bmp', 'gif', 'jpg', 'png', 'svg', 'webp'}:
        raise ValueError('Portal asset type is unsupported')
    collection = _portal_asset_slug(collection_name, 'collection')
    item = _portal_asset_slug(item_name, 'background')
    suffix = f'{time.strftime("%Y%m%d%H%M%S")}-{secrets.token_hex(3)}'
    relative_path = '/'.join([
        *([] if configured_database else ['assets']),
        'backgrounds', collection, f'{item}-background-{suffix}.{safe_extension}'
    ])
    final_path = require_portal_asset_path(os.path.join(_portal_asset_root(), *relative_path.split('/')))
    temp_path = require_portal_asset_path(f'{final_path}.tmp-{suffix}', temporary=True)
    public_path = Path(final_path).as_uri() if configured_database else relative_path
    return {
        'finalPath': final_path,
        'tempPath': temp_path,
        'relativePath': relative_path,
        'publicPath': public_path
    }


def cleanup_portal_asset_write_sessions(max_sessions=8):
    now = time.monotonic()
    stale = [identifier for identifier, session in PORTAL_ASSET_WRITE_SESSIONS.items()
             if now - session['createdAt'] > 300]
    while len(PORTAL_ASSET_WRITE_SESSIONS) - len(stale) >= max_sessions:
        remaining = [identifier for identifier in PORTAL_ASSET_WRITE_SESSIONS if identifier not in stale]
        stale.append(min(remaining, key=lambda identifier: PORTAL_ASSET_WRITE_SESSIONS[identifier]['createdAt']))
    for identifier in stale:
        session = PORTAL_ASSET_WRITE_SESSIONS.pop(identifier, None)
        if not session:
            continue
        try:
            os.remove(session['tempPath'])
        except FileNotFoundError:
            pass


def begin_portal_asset_write(collection_name='', item_name='', extension='webp'):
    cleanup_portal_asset_write_sessions()
    target = create_portal_asset_target(collection_name, item_name, extension)
    session_id = f'asset_{secrets.token_urlsafe(18)}'
    os.makedirs(os.path.dirname(target['tempPath']), exist_ok=True)
    with open(target['tempPath'], 'wb'):
        pass
    PORTAL_ASSET_WRITE_SESSIONS[session_id] = {**target, 'bytes': 0, 'createdAt': time.monotonic()}
    return {
        'sessionId': session_id,
        'publicPath': target['publicPath'],
        'relativePath': target['relativePath'],
        'chunkChars': 512 * 1024
    }


def require_portal_asset_write_session(session_id):
    identifier = str(session_id or '')
    session = PORTAL_ASSET_WRITE_SESSIONS.get(identifier)
    if not session:
        raise ValueError('Unknown Portal asset write session')
    if time.monotonic() - session['createdAt'] > 300:
        PORTAL_ASSET_WRITE_SESSIONS.pop(identifier, None)
        try:
            os.remove(session['tempPath'])
        except FileNotFoundError:
            pass
        raise ValueError('Portal asset write session expired')
    return identifier, session


def append_portal_asset_write(session_id, chunk):
    _identifier, session = require_portal_asset_write_session(session_id)
    encoded = str(chunk or '')
    if len(encoded) > 1024 * 1024:
        raise ValueError('Portal asset chunk is too large')
    data = base64.b64decode(encoded.encode('ascii'), validate=True)
    if session['bytes'] + len(data) > MAX_DOWNLOAD_BYTES:
        raise ValueError('Portal asset exceeds the managed size limit')
    with open(session['tempPath'], 'ab') as target:
        target.write(data)
    session['bytes'] += len(data)
    return len(data)


def finish_portal_asset_write(session_id):
    identifier, session = require_portal_asset_write_session(session_id)
    try:
        os.makedirs(os.path.dirname(session['finalPath']), exist_ok=True)
        os.replace(session['tempPath'], session['finalPath'])
        return {
            'fileInfo': get_file_info(session['finalPath']),
            'publicPath': session['publicPath'],
            'relativePath': session['relativePath']
        }
    except Exception:
        try:
            os.remove(session['tempPath'])
        except FileNotFoundError:
            pass
        raise
    finally:
        PORTAL_ASSET_WRITE_SESSIONS.pop(identifier, None)


def abort_portal_asset_write(session_id):
    identifier, session = require_portal_asset_write_session(session_id)
    PORTAL_ASSET_WRITE_SESSIONS.pop(identifier, None)
    try:
        os.remove(session['tempPath'])
    except FileNotFoundError:
        pass


def cache_portal_asset_url(url, collection_name='', item_name='', extension='webp', max_bytes=MAX_DOWNLOAD_BYTES):
    target = create_portal_asset_target(collection_name, item_name, extension)
    bounded_max = min(MAX_DOWNLOAD_BYTES, max(1, int(max_bytes or MAX_DOWNLOAD_BYTES)))
    result = download_url_to_file(url, target['finalPath'], target['tempPath'], bounded_max)
    return {
        'fileInfo': get_file_info(target['finalPath']),
        'publicPath': target['publicPath'],
        'relativePath': target['relativePath'],
        **result
    }


def save_config(config):
    with game_binding_write_lock():
        return _save_config_locked(config)


def _save_config_locked(config):
    config = config or {}
    current_config = load_config()
    arcade_root = config.get('arcadeRoot', current_config.get('arcadeRoot', ''))
    arcade_root = str(arcade_root or '').strip()
    approved = config.get('approvedDirectories')
    if approved is None:
        approved = current_config.get('approvedDirectories', {})
    if not isinstance(approved, dict):
        approved = {}
    safe_approved = {}
    for handle, entry in list(approved.items())[:64]:
        if not re.fullmatch(r'[a-zA-Z0-9_-]{12,80}', str(handle)) or not isinstance(entry, dict):
            continue
        path = os.path.realpath(str(entry.get('path', '') or ''))
        purpose = str(entry.get('purpose', '') or '')
        if not path or purpose not in {'git', 'recent-files'}:
            continue
        safe_approved[str(handle)] = {
            'path': path, 'purpose': purpose, 'label': str(entry.get('label', '') or os.path.basename(path) or path)[:160],
            'approvedAt': int(entry.get('approvedAt', 0) or 0)
        }
    applications = config.get('approvedApplications')
    if applications is None:
        applications = current_config.get('approvedApplications', {})
    if not isinstance(applications, dict):
        applications = {}
    safe_applications = {}
    for app_key, entry in list(applications.items())[:256]:
        if not APPLICATION_KEY_PATTERN.fullmatch(str(app_key)) or not isinstance(entry, dict):
            continue
        kind = str(entry.get('kind', '') or '')
        if kind == 'protocol-link':
            try:
                target_uri = _validated_application_uri(entry.get('targetUri', ''))
            except ValueError:
                continue
            safe_applications[str(app_key)] = {
                'targetUri': target_uri,
                'kind': kind,
                'label': str(entry.get('label', '') or urllib.parse.urlsplit(target_uri).scheme or 'Application')[:160],
                'approvedAt': int(entry.get('approvedAt', 0) or 0),
                'iconDataUrl': str(entry.get('iconDataUrl', '') or '')[:700000]
            }
            continue
        path = os.path.realpath(str(entry.get('path', '') or ''))
        if not path or kind not in {'executable', 'shortcut', 'uri-shortcut', 'app-bundle', 'desktop-entry'}:
            continue
        safe_applications[str(app_key)] = {
            'path': path,
            'kind': kind,
            'label': str(entry.get('label', '') or os.path.splitext(os.path.basename(path))[0] or 'Application')[:160],
            'approvedAt': int(entry.get('approvedAt', 0) or 0),
            'iconDataUrl': str(entry.get('iconDataUrl', '') or '')[:700000]
        }
    if current_config.get('approvedGames'):
        get_catalogue_bindings()  # Complete the recoverable cutover before dropping old approvals.
    database_path = config.get('databasePath')
    if database_path is None:
        database_path = current_config.get('databasePath', '')
    data = {
        'databasePath': database_path or '',
        'arcadeRoot': os.path.realpath(arcade_root) if arcade_root else '',
        'schemaVersion': 1,
        'approvedDirectories': safe_approved,
        'approvedApplications': safe_applications
    }
    atomic_write_text(CONFIG_PATH, json.dumps(data, ensure_ascii=False, indent=2) + '\n')


# ---------------------------------------------------------------------------
# Cyrune Nexus settings, documents, and sanitized project status
# ---------------------------------------------------------------------------

NEXUS_DEFAULT_SETTINGS = {
    'schemaVersion': NEXUS_SETTINGS_SCHEMA_VERSION,
    'revision': 0,
    'updatedAt': 0,
    'region': {'country': 'GB', 'city': '', 'timeZone': 'Europe/London', 'locationMode': 'manual',
               'latitude': None, 'longitude': None},
    'units': {'system': 'metric', 'temperature': 'celsius', 'distance': 'kilometres',
              'speed': 'kilometres-per-hour', 'mass': 'kilograms', 'volume': 'litres',
              'pressure': 'hectopascals'},
    'language': {'primary': 'en-GB', 'secondary': '', 'interface': 'en-GB', 'content': 'en-GB'},
    'formatting': {'date': 'day-month-year', 'clock': '24-hour', 'currency': 'GBP', 'weekStart': 'monday'},
    'behaviour': {'externalLinks': 'new-tab', 'confirmPrivilegedActions': True, 'restoreLastView': True},
    'accessibility': {'scale': '100', 'reducedMotion': False, 'highContrast': False},
    'privacy': {'allowOptionalNetwork': True, 'allowApproximateLocation': False, 'allowPreciseLocation': False},
    'overrides': {'portal-widgets': {}, 'arcade': {}}
}

NEXUS_SETTING_ENUMS = {
    'region.locationMode': {'manual', 'approximate', 'precise'},
    'units.system': {'metric', 'imperial', 'custom'},
    'units.temperature': {'celsius', 'fahrenheit'},
    'units.distance': {'kilometres', 'miles'},
    'units.speed': {'kilometres-per-hour', 'miles-per-hour'},
    'units.mass': {'kilograms', 'pounds'},
    'units.volume': {'litres', 'gallons-uk', 'gallons-us'},
    'units.pressure': {'hectopascals', 'inches-of-mercury'},
    'formatting.date': {'day-month-year', 'month-day-year', 'year-month-day', 'locale'},
    'formatting.clock': {'12-hour', '24-hour', 'locale'},
    'formatting.weekStart': {'monday', 'sunday', 'saturday', 'locale'},
    'behaviour.externalLinks': {'new-tab', 'current-tab', 'component-default'},
    'accessibility.scale': {'90', '100', '110', '125'}
}

NEXUS_SETTING_STRING_LIMITS = {
    'region.country': 2, 'region.city': 80, 'region.timeZone': 80,
    'language.primary': 35, 'language.secondary': 35, 'language.interface': 35,
    'language.content': 35, 'formatting.currency': 3
}

NEXUS_SETTING_BOOLEANS = {
    'behaviour.confirmPrivilegedActions', 'behaviour.restoreLastView',
    'accessibility.reducedMotion', 'accessibility.highContrast',
    'privacy.allowOptionalNetwork', 'privacy.allowApproximateLocation',
    'privacy.allowPreciseLocation'
}

NEXUS_SETTING_NUMBERS = {
    'region.latitude': (-90.0, 90.0),
    'region.longitude': (-180.0, 180.0)
}

NEXUS_COMPONENT_SETTING_PATHS = {
    'portal-widgets': (
        'region.country', 'region.city', 'region.timeZone', 'region.locationMode',
        'region.latitude', 'region.longitude',
        'units.system', 'units.temperature', 'units.distance', 'units.speed', 'units.mass',
        'units.volume', 'units.pressure',
        'language.primary', 'language.secondary', 'language.interface', 'language.content',
        'formatting.date', 'formatting.clock', 'formatting.currency', 'formatting.weekStart',
        'behaviour.externalLinks', 'behaviour.confirmPrivilegedActions', 'behaviour.restoreLastView',
        'accessibility.scale', 'accessibility.reducedMotion', 'accessibility.highContrast',
        'privacy.allowOptionalNetwork', 'privacy.allowApproximateLocation', 'privacy.allowPreciseLocation'
    ),
    'arcade': (
        'region.country', 'region.timeZone',
        'units.system', 'units.temperature', 'units.distance', 'units.speed', 'units.mass',
        'units.volume', 'units.pressure',
        'language.primary', 'language.secondary', 'language.interface', 'language.content',
        'formatting.date', 'formatting.clock', 'formatting.currency', 'formatting.weekStart',
        'behaviour.externalLinks', 'behaviour.confirmPrivilegedActions', 'behaviour.restoreLastView',
        'accessibility.scale', 'accessibility.reducedMotion', 'accessibility.highContrast',
        'privacy.allowOptionalNetwork'
    )
}

NEXUS_COMPONENT_OVERRIDE_PATHS = {
    component: frozenset(paths) - {'privacy.allowApproximateLocation', 'privacy.allowPreciseLocation'}
    for component, paths in NEXUS_COMPONENT_SETTING_PATHS.items()
}

NEXUS_DOCUMENTS = {
    'portal': {'todo': ('Portal', 'Portal-TODO.md'), 'changelog': ('Portal', 'Portal-CHANGELOG.md')},
    'widgets': {'todo': ('Widgets', 'Widgets-TODO.md'), 'changelog': ('Widgets', 'Widgets-CHANGELOG.md')},
    'arcade': {'todo': ('Arcade', 'Arcade-TODO.md'), 'changelog': ('Arcade', 'Arcade-CHANGELOG.md')},
    'relay': {'todo': ('Relay', 'Relay-TODO.md'), 'changelog': ('Relay', 'Relay-CHANGELOG.md')},
    'host': {'todo': ('Host', 'Host-TODO.md'), 'changelog': ('Host', 'Host-CHANGELOG.md')},
    'nexus': {'todo': ('Nexus', 'Nexus-TODO.md'), 'changelog': ('Nexus', 'Nexus-CHANGELOG.md')},
    'project': {'todo': ('CYRUNE-MONOREPO-TODO.md',), 'project': ('PROJECT.md',), 'changelog': ('CHANGELOG.md',)}
}


def _clone_json(value):
    return json.loads(json.dumps(value, ensure_ascii=False))


def _setting_leaf_paths(value, prefix=''):
    paths = []
    if not isinstance(value, dict):
        return [prefix] if prefix else []
    for key, child in value.items():
        if key in {'schemaVersion', 'revision', 'updatedAt'} and not prefix:
            continue
        path = f'{prefix}.{key}' if prefix else key
        paths.extend(_setting_leaf_paths(child, path))
    return paths


def _validate_nexus_setting_value(path, value):
    if path in NEXUS_SETTING_BOOLEANS:
        if not isinstance(value, bool):
            raise ValueError(f'Nexus setting {path} must be true or false')
    elif path in NEXUS_SETTING_ENUMS:
        if value not in NEXUS_SETTING_ENUMS[path]:
            raise ValueError(f'Nexus setting {path} has an unsupported value')
    elif path in NEXUS_SETTING_NUMBERS:
        if value is not None:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f'Nexus setting {path} must be a finite coordinate or null')
            lower, upper = NEXUS_SETTING_NUMBERS[path]
            if value < lower or value > upper:
                raise ValueError(f'Nexus setting {path} is outside its supported range')
            value = float(value)
    elif path in NEXUS_SETTING_STRING_LIMITS:
        if not isinstance(value, str) or len(value) > NEXUS_SETTING_STRING_LIMITS[path] or any(ord(ch) < 32 for ch in value):
            raise ValueError(f'Nexus setting {path} is invalid')
    if path == 'region.country':
        if not re.fullmatch(r'[A-Za-z]{2}', value):
            raise ValueError('Nexus region country must be a two-letter code')
        value = value.upper()
    if path.startswith('language.'):
        language_pattern = re.compile(r'^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$')
        if value or path != 'language.secondary':
            if not language_pattern.fullmatch(value):
                raise ValueError(f'Nexus language {path.split(".", 1)[1]} must be a BCP 47 language tag')
    if path == 'formatting.currency':
        if not re.fullmatch(r'[A-Za-z]{3}', value):
            raise ValueError('Nexus currency must be a three-letter code')
        value = value.upper()
    if path == 'region.timeZone' and not re.fullmatch(r'(?:UTC|[A-Za-z0-9._+-]+(?:/[A-Za-z0-9._+-]+)+)', value):
        raise ValueError('Nexus time zone must be UTC or an IANA time-zone name')
    return value


def _validate_nexus_location(settings, label='Nexus'):
    region = settings['region']
    privacy = settings['privacy']
    if region['locationMode'] == 'approximate' and not privacy['allowApproximateLocation']:
        raise ValueError(f'{label} approximate location mode requires its privacy permission')
    if region['locationMode'] == 'precise' and not privacy['allowPreciseLocation']:
        raise ValueError(f'{label} precise location mode requires its privacy permission')
    has_latitude = region['latitude'] is not None
    has_longitude = region['longitude'] is not None
    if has_latitude != has_longitude:
        raise ValueError(f'{label} precise coordinates require both latitude and longitude')
    if has_latitude and not privacy['allowPreciseLocation']:
        raise ValueError(f'{label} precise coordinates require their privacy permission')


def _migrate_nexus_settings_v1(candidate):
    migrated = _clone_json(candidate)
    migrated['schemaVersion'] = 2
    migrated['overrides'] = {}
    return migrated


NEXUS_SETTINGS_MIGRATIONS = {1: _migrate_nexus_settings_v1}


def migrate_nexus_settings(candidate):
    migrated = _clone_json(candidate)
    version = migrated.get('schemaVersion', 1)
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        raise ValueError('Unsupported Nexus settings schema version')
    if version > NEXUS_SETTINGS_SCHEMA_VERSION:
        raise ValueError('Nexus settings were written by a newer Cyrune release')
    while version < NEXUS_SETTINGS_SCHEMA_VERSION:
        migrate = NEXUS_SETTINGS_MIGRATIONS.get(version)
        if not migrate:
            raise ValueError('A required Nexus settings migration is unavailable')
        migrated = migrate(migrated)
        next_version = migrated.get('schemaVersion')
        if next_version != version + 1:
            raise ValueError('A Nexus settings migration did not advance exactly one version')
        version = next_version
    return migrated


def validate_nexus_settings(candidate):
    if not isinstance(candidate, dict):
        raise ValueError('Nexus settings must be an object')
    try:
        encoded = json.dumps(candidate, ensure_ascii=False).encode('utf-8')
    except (TypeError, ValueError) as error:
        raise ValueError('Nexus settings must be JSON-compatible') from error
    if len(encoded) > MAX_NEXUS_SETTINGS_BYTES:
        raise ValueError('Nexus settings payload is too large')
    candidate = migrate_nexus_settings(candidate)
    allowed_top = set(NEXUS_DEFAULT_SETTINGS)
    unknown_top = set(candidate) - allowed_top
    if unknown_top:
        raise ValueError(f'Unknown Nexus settings section: {sorted(unknown_top)[0]}')
    schema_version = candidate.get('schemaVersion')
    if schema_version != NEXUS_SETTINGS_SCHEMA_VERSION:
        raise ValueError('Unsupported Nexus settings schema version')
    output = _clone_json(NEXUS_DEFAULT_SETTINGS)
    for section, defaults in NEXUS_DEFAULT_SETTINGS.items():
        if not isinstance(defaults, dict) or section == 'overrides':
            continue
        supplied = candidate.get(section, {})
        if not isinstance(supplied, dict):
            raise ValueError(f'Nexus settings section {section} must be an object')
        unknown = set(supplied) - set(defaults)
        if unknown:
            raise ValueError(f'Unknown Nexus setting: {section}.{sorted(unknown)[0]}')
        for key, default in defaults.items():
            path = f'{section}.{key}'
            value = supplied.get(key, default)
            output[section][key] = _validate_nexus_setting_value(path, value)
    _validate_nexus_location(output)

    supplied_overrides = candidate.get('overrides', {})
    if not isinstance(supplied_overrides, dict):
        raise ValueError('Nexus component overrides must be an object')
    unknown_components = set(supplied_overrides) - set(NEXUS_COMPONENT_OVERRIDE_PATHS)
    if unknown_components:
        raise ValueError(f'Unsupported Nexus settings override component: {sorted(unknown_components)[0]}')
    for component, supplied_sections in supplied_overrides.items():
        if not isinstance(supplied_sections, dict):
            raise ValueError(f'Nexus settings overrides for {component} must be an object')
        normalized = {}
        for section, supplied_values in supplied_sections.items():
            if section not in NEXUS_DEFAULT_SETTINGS or section == 'overrides' or not isinstance(supplied_values, dict):
                raise ValueError(f'Unsupported Nexus settings override section: {component}.{section}')
            for key, value in supplied_values.items():
                path = f'{section}.{key}'
                if path not in NEXUS_COMPONENT_OVERRIDE_PATHS[component]:
                    raise ValueError(f'Unsupported Nexus settings override: {component}.{path}')
                normalized.setdefault(section, {})[key] = _validate_nexus_setting_value(path, value)
        effective = {key: _clone_json(value) for key, value in output.items()
                     if isinstance(value, dict) and key != 'overrides'}
        for section, values in normalized.items():
            effective[section].update(values)
        if effective['privacy']['allowOptionalNetwork'] and not output['privacy']['allowOptionalNetwork']:
            raise ValueError('A component override cannot relax the global optional-network permission')
        _validate_nexus_location(effective, f'Nexus {component} override')
        output['overrides'][component] = normalized
    return output


def load_nexus_settings():
    try:
        with open(NEXUS_SETTINGS_PATH, 'r', encoding='utf-8') as source:
            payload = json.load(source)
    except FileNotFoundError:
        return _clone_json(NEXUS_DEFAULT_SETTINGS)
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f'The authoritative Nexus settings are unreadable: {error}') from error
    settings = validate_nexus_settings(payload)
    revision = payload.get('revision', 0)
    updated_at = payload.get('updatedAt', 0)
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        raise ValueError('The authoritative Nexus settings revision is invalid')
    if not isinstance(updated_at, int) or isinstance(updated_at, bool) or updated_at < 0:
        raise ValueError('The authoritative Nexus settings timestamp is invalid')
    settings['revision'] = revision
    settings['updatedAt'] = updated_at
    return settings


def nexus_component_settings(component):
    component_id = str(component or '').strip().lower()
    paths = NEXUS_COMPONENT_SETTING_PATHS.get(component_id)
    if not paths:
        raise ValueError('Unsupported Cyrune settings consumer')
    settings = load_nexus_settings()
    values = {}
    sources = {}
    overrides = settings.get('overrides', {}).get(component_id, {})
    for path in paths:
        section, key = path.split('.', 1)
        overridden = key in overrides.get(section, {})
        value = overrides.get(section, {}).get(key, settings[section][key])
        if path == 'privacy.allowOptionalNetwork':
            value = bool(settings['privacy']['allowOptionalNetwork'] and value)
        values.setdefault(section, {})[key] = _clone_json(value)
        sources[path] = 'component' if overridden else 'global'
    if component_id == 'portal-widgets' and (
            not settings['privacy']['allowPreciseLocation']
            or values.get('region', {}).get('latitude') is None
            or values.get('region', {}).get('longitude') is None):
        values.get('region', {}).pop('latitude', None)
        values.get('region', {}).pop('longitude', None)
        sources.pop('region.latitude', None)
        sources.pop('region.longitude', None)
    return {
        'profileSchemaVersion': 2,
        'settingsSchemaVersion': settings['schemaVersion'],
        'component': component_id,
        'revision': settings['revision'],
        'updatedAt': settings['updatedAt'],
        'values': values,
        'sources': sources
    }


def arcade_optional_network_allowed():
    """Return Arcade's authoritative effective optional-network permission."""
    try:
        profile = nexus_component_settings('arcade')
        return profile.get('values', {}).get('privacy', {}).get('allowOptionalNetwork') is True
    except Exception:
        return False


def _nexus_changed_keys(before, after):
    keys = []
    for path in _setting_leaf_paths(after):
        parts = path.split('.')
        left = before
        right = after
        for part in parts:
            left = left.get(part) if isinstance(left, dict) else None
            right = right.get(part) if isinstance(right, dict) else None
        if left != right:
            keys.append(path)
    return keys[:64]


def _append_nexus_history(record):
    history = []
    try:
        with open(NEXUS_HISTORY_PATH, 'r', encoding='utf-8') as source:
            loaded = json.load(source)
        if isinstance(loaded, list):
            history = [item for item in loaded if isinstance(item, dict)][-MAX_NEXUS_HISTORY + 1:]
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        history = []
    history.append(record)
    atomic_write_text(NEXUS_HISTORY_PATH, json.dumps(history, ensure_ascii=False, indent=2) + '\n')


def load_nexus_history():
    try:
        with open(NEXUS_HISTORY_PATH, 'r', encoding='utf-8') as source:
            loaded = json.load(source)
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return []
    if not isinstance(loaded, list):
        return []
    history = []
    for item in loaded[-MAX_NEXUS_HISTORY:]:
        if not isinstance(item, dict):
            continue
        revision = item.get('revision')
        updated_at = item.get('updatedAt')
        if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
            continue
        if not isinstance(updated_at, int) or isinstance(updated_at, bool) or updated_at < 0:
            continue
        changed_keys = [str(key)[:160] for key in item.get('changedKeys', []) if isinstance(key, str)][:64]
        history.append({'revision': revision, 'updatedAt': updated_at, 'changedKeys': changed_keys})
    return history


def save_nexus_settings(candidate, expected_revision):
    if not isinstance(expected_revision, int) or isinstance(expected_revision, bool) or expected_revision < 0:
        raise ValueError('Expected Nexus settings revision is invalid')
    validated = validate_nexus_settings(candidate)
    with database_write_lock(NEXUS_SETTINGS_PATH):
        current = load_nexus_settings()
        if current['revision'] != expected_revision:
            try:
                record_nexus_event('nexus', 'settings-conflict', 'attention')
            except OSError:
                pass
            return {'conflict': True, 'settings': current, 'storage': nexus_storage_status()}
        saved = validated
        saved['revision'] = current['revision'] + 1
        saved['updatedAt'] = int(time.time() * 1000)
        if os.path.isfile(NEXUS_SETTINGS_PATH):
            backup_dir = os.path.join(NEXUS_DATA_ROOT, 'backups')
            backup_path = os.path.join(backup_dir, f'settings.revision-{current["revision"]}.json')
            with open(NEXUS_SETTINGS_PATH, 'r', encoding='utf-8') as source:
                atomic_write_text(backup_path, source.read())
            backups = sorted(Path(backup_dir).glob('settings.revision-*.json'), key=lambda item: item.stat().st_mtime_ns, reverse=True)
            for obsolete in backups[10:]:
                try:
                    obsolete.unlink()
                except OSError:
                    pass
        atomic_write_text(NEXUS_SETTINGS_PATH, json.dumps(saved, ensure_ascii=False, indent=2) + '\n')
        changed_keys = _nexus_changed_keys(current, saved)
        history_recorded = True
        try:
            _append_nexus_history({'revision': saved['revision'], 'updatedAt': saved['updatedAt'], 'changedKeys': changed_keys})
        except OSError:
            history_recorded = False
        try:
            record_nexus_event('nexus', 'settings-saved')
        except OSError:
            pass
        return {'conflict': False, 'settings': saved, 'changedKeys': changed_keys,
                'historyRecorded': history_recorded, 'storage': nexus_storage_status()}


def nexus_storage_status():
    info = get_file_info(NEXUS_SETTINGS_PATH, include_hash=True)
    return {'location': NEXUS_SETTINGS_PATH, **info}


def authorize_nexus_page(page_url):
    parsed = urllib.parse.urlsplit(str(page_url or ''))
    if parsed.scheme.casefold() != 'file' or parsed.netloc not in {'', 'localhost'} or parsed.query:
        return False
    path = urllib.request.url2pathname(parsed.path or '')
    if sys.platform == 'win32' and re.match(r'^/[a-zA-Z]:[\\/]', path):
        path = path[1:]
    expected = os.path.realpath(os.path.join(CYRUNE_REPO_ROOT, 'Nexus', 'index.html'))
    return os.path.normcase(os.path.realpath(path)) == os.path.normcase(expected)


def _nexus_document_path(component, document_type):
    component_id = str(component or '').strip().lower()
    kind = str(document_type or '').strip().lower()
    relative_parts = NEXUS_DOCUMENTS.get(component_id, {}).get(kind)
    if not relative_parts:
        raise ValueError('Unsupported Nexus component document')
    path = os.path.realpath(os.path.join(CYRUNE_REPO_ROOT, *relative_parts))
    if os.path.commonpath([os.path.realpath(CYRUNE_REPO_ROOT), path]) != os.path.realpath(CYRUNE_REPO_ROOT):
        raise ValueError('Nexus document escaped the project root')
    return component_id, kind, path


def read_nexus_document(component, document_type):
    component_id, kind, path = _nexus_document_path(component, document_type)
    info = get_file_info(path)
    if not info['exists'] or (info.get('size') or 0) > MAX_NEXUS_DOCUMENT_BYTES:
        raise ValueError('Nexus component document is missing or too large')
    with open(path, 'r', encoding='utf-8') as source:
        markdown = source.read(MAX_NEXUS_DOCUMENT_BYTES + 1)
    if len(markdown.encode('utf-8')) > MAX_NEXUS_DOCUMENT_BYTES:
        raise ValueError('Nexus component document is too large')
    return {'component': component_id, 'documentType': kind, 'markdown': markdown,
            'modifiedMs': info.get('modifiedMs'), 'size': info.get('size')}


def _find_vscode_executable():
    candidates = []
    if sys.platform == 'win32':
        candidates.extend([shutil.which('code.exe'), shutil.which('Code.exe')])
        for variable, parts in (
                ('LOCALAPPDATA', ('Programs', 'Microsoft VS Code', 'Code.exe')),
                ('PROGRAMFILES', ('Microsoft VS Code', 'Code.exe')),
                ('PROGRAMFILES(X86)', ('Microsoft VS Code', 'Code.exe'))):
            base = str(os.environ.get(variable, '') or '').strip()
            if base:
                candidates.append(os.path.join(base, *parts))
    else:
        candidates.extend([
            shutil.which('code'),
            '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
        ])
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return os.path.realpath(candidate)
    raise FileNotFoundError('Visual Studio Code is not installed in a supported location')


def open_nexus_todo(component):
    component_id, _kind, path = _nexus_document_path(component, 'todo')
    if not os.path.isfile(path):
        raise FileNotFoundError('The requested Cyrune TODO is unavailable')
    executable = _find_vscode_executable()
    subprocess.Popen(
        [executable, '--reuse-window', path],
        cwd=CYRUNE_REPO_ROOT,
        close_fds=True,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    )
    return {'opened': True, 'component': component_id, 'editor': 'Visual Studio Code'}


def _read_component_version(component_id):
    try:
        if component_id not in {'portal', 'widgets', 'arcade', 'relay', 'host', 'nexus'}:
            return 'Unknown'
        manifest = json.loads(Path(CYRUNE_REPO_ROOT, component_id.capitalize(), 'component.json').read_text(encoding='utf-8'))
        return str(manifest.get('version') or 'Unknown')
    except (OSError, ValueError, json.JSONDecodeError):
        return 'Unknown'


def _read_component_contract(component_id):
    try:
        if component_id not in {'portal', 'widgets', 'arcade', 'relay', 'host', 'nexus'}:
            return {}, []
        manifest = json.loads(Path(CYRUNE_REPO_ROOT, component_id.capitalize(), 'component.json').read_text(encoding='utf-8'))
        protocols = manifest.get('protocols') if isinstance(manifest.get('protocols'), dict) else {}
        capabilities = manifest.get('capabilities') if isinstance(manifest.get('capabilities'), list) else []
        return ({str(key): value for key, value in protocols.items()
                 if isinstance(value, int) and not isinstance(value, bool) and 0 < value <= 100},
                [str(value)[:64] for value in capabilities if isinstance(value, str)][:40])
    except (OSError, ValueError, json.JSONDecodeError):
        return {}, []


def _component_updated_ms(component_id):
    try:
        output = _run_git(CYRUNE_REPO_ROOT, ['log', '-1', '--format=%ct', '--', component_id.capitalize()]).strip()
        if output.isdigit():
            return int(output) * 1000
    except Exception:
        pass
    path = os.path.join(CYRUNE_REPO_ROOT, component_id.capitalize())
    try:
        return int(os.stat(path).st_mtime_ns / 1_000_000)
    except OSError:
        return 0


def nexus_repository_status():
    path = os.path.realpath(CYRUNE_REPO_ROOT)
    sampled_at = int(time.time() * 1000)
    try:
        status = _run_git(path, ['status', '--porcelain=v2', '--branch'])
    except Exception:
        return {'available': False, 'errorCode': 'repository-status-unavailable', 'sampledAt': sampled_at}
    branch = ''
    detached = False
    ahead = behind = staged = unstaged = untracked = 0
    for line in status.splitlines():
        if line.startswith('# branch.head '):
            branch = line[len('# branch.head '):].strip()
            detached = branch == '(detached)'
        elif line.startswith('# branch.ab '):
            match = re.search(r'\+(\d+)\s+-(\d+)', line)
            if match:
                ahead, behind = int(match.group(1)), int(match.group(2))
        elif line.startswith('? '):
            untracked += 1
        elif line.startswith(('1 ', '2 ', 'u ')):
            parts = line.split()
            xy = parts[1] if len(parts) > 1 else '..'
            staged += int(len(xy) >= 1 and xy[0] not in {'.', ' '})
            unstaged += int(len(xy) >= 2 and xy[1] not in {'.', ' '})
    try:
        commit = _run_git(path, ['log', '-1', '--format=%H%x1f%h%x1f%ct%x1f%s']).strip().split('\x1f')
    except Exception:
        commit = []
    try:
        remote = _run_git(path, ['remote', 'get-url', 'origin']).strip()
    except Exception:
        remote = ''
    return {
        'available': True,
        'branch': branch or 'HEAD', 'detached': detached, 'ahead': ahead, 'behind': behind,
        'staged': staged, 'unstaged': unstaged, 'untracked': untracked,
        'clean': staged == 0 and unstaged == 0 and untracked == 0,
        'lastCommit': {'hash': commit[0] if len(commit) > 0 else '',
                       'shortHash': commit[1] if len(commit) > 1 else '',
                       'timestamp': int(commit[2]) * 1000 if len(commit) > 2 and commit[2].isdigit() else 0,
                       'subject': commit[3][:300] if len(commit) > 3 else ''},
        'remoteUrl': _git_remote_link(remote), 'sampledAt': sampled_at
    }


def nexus_repository_remote_status():
    """Compare the current checkout branch with fixed origin without mutating Git state."""
    path = os.path.realpath(CYRUNE_REPO_ROOT)
    sampled_at = int(time.time() * 1000)
    branch = _run_git(path, ['branch', '--show-current']).strip()
    if (not re.fullmatch(r'[A-Za-z0-9._/-]{1,200}', branch)
            or branch.startswith(('/', '-')) or branch.endswith('/')
            or '..' in branch or '//' in branch or '@{' in branch):
        raise ValueError('The current Cyrune branch cannot be checked remotely')
    local_head = _run_git(path, ['rev-parse', 'HEAD']).strip().lower()
    if not re.fullmatch(r'[0-9a-f]{40,64}', local_head):
        raise RuntimeError('The local Cyrune commit could not be identified')
    try:
        tracking_head = _run_git(
            path, ['rev-parse', '--verify', f'refs/remotes/origin/{branch}']
        ).strip().lower()
    except Exception:
        tracking_head = ''
    remote_ref = f'refs/heads/{branch}'
    output = _run_git_remote(path, ['ls-remote', 'origin', remote_ref])
    remote_head = ''
    for line in output.splitlines():
        parts = line.split('\t', 1)
        if len(parts) == 2 and parts[1] == remote_ref and re.fullmatch(r'[0-9a-fA-F]{40,64}', parts[0]):
            remote_head = parts[0].lower()
            break
    tracking_valid = bool(re.fullmatch(r'[0-9a-f]{40,64}', tracking_head))
    return {
        'available': True,
        'sampledAt': sampled_at,
        'branch': branch,
        'localHead': local_head[:12],
        'trackingHead': tracking_head[:12] if tracking_valid else '',
        'remoteHead': remote_head[:12] if remote_head else '',
        'branchAvailable': bool(remote_head),
        'headMatchesRemote': bool(remote_head) and local_head == remote_head,
        'trackingCurrent': bool(remote_head) and tracking_valid and tracking_head == remote_head
    }


def _default_arcade_data_root():
    override = str(os.environ.get('CYRUNE_ARCADE_DATA', '') or '').strip()
    if override:
        return os.path.abspath(os.path.expanduser(override))
    if sys.platform == 'win32':
        base = os.environ.get('LOCALAPPDATA') or os.path.expanduser('~\\AppData\\Local')
    else:
        base = os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share')
    return os.path.join(base, 'Cyrune', 'Arcade')


def _sanitized_validation_receipt():
    try:
        if os.path.getsize(NEXUS_VALIDATION_PATH) > 128 * 1024:
            return None
        with open(NEXUS_VALIDATION_PATH, 'r', encoding='utf-8') as source:
            receipt = json.load(source)
        if not isinstance(receipt, dict):
            return None
        sanitized = {}
        schema_version = receipt.get('schemaVersion')
        timestamp = receipt.get('timestamp')
        commit = str(receipt.get('commit', '') or '')
        if isinstance(schema_version, int) and not isinstance(schema_version, bool) and 0 < schema_version <= 100:
            sanitized['schemaVersion'] = schema_version
        if isinstance(timestamp, int) and not isinstance(timestamp, bool) and timestamp >= 0:
            sanitized['timestamp'] = timestamp
        if re.fullmatch(r'[0-9a-fA-F]{7,64}', commit):
            sanitized['commit'] = commit
        allowed_components = {'Portal', 'Widgets', 'Arcade', 'Relay', 'Host', 'Nexus'}
        allowed_test_groups = allowed_components | {'Migration', 'Packaging', 'Tooling'}
        versions = receipt.get('versions')
        if isinstance(versions, dict):
            sanitized['versions'] = {
                key: str(value)[:40] for key, value in versions.items()
                if key in allowed_components and re.fullmatch(r'(?:[0-9]+\.[0-9]+\.[0-9]+|Unversioned)', str(value or ''))
            }
        tests = receipt.get('tests')
        if isinstance(tests, dict):
            sanitized_tests = {}
            for key, value in tests.items():
                if key not in allowed_test_groups:
                    continue
                if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 1_000_000:
                    sanitized_tests[key] = value
                elif isinstance(value, dict):
                    counts = {name: count for name, count in value.items()
                              if name in {'passed', 'failed', 'skipped'} and isinstance(count, int)
                              and not isinstance(count, bool) and 0 <= count <= 1_000_000}
                    if counts:
                        sanitized_tests[key] = counts
            sanitized['tests'] = sanitized_tests
        checks = receipt.get('checks')
        if isinstance(checks, dict):
            allowed_checks = {'syntax', 'manifest', 'versions', 'packaging', 'lint', 'infrastructure'}
            allowed_states = {'passed', 'failed', 'skipped', 'unavailable'}
            sanitized['checks'] = {
                key: (value if isinstance(value, bool) else str(value))
                for key, value in checks.items()
                if key in allowed_checks and (isinstance(value, bool) or str(value) in allowed_states)
            }
        return sanitized or None
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None


def _nexus_health(state, code, summary, guidance, sampled_at):
    return {
        'state': state,
        'code': code,
        'summary': summary,
        'guidance': guidance,
        'sampledAt': sampled_at
    }


def _json_object_metadata(path, max_bytes=64 * 1024 * 1024):
    info = get_file_info(path)
    if not info.get('exists'):
        return {'valid': False, 'schemaVersion': None, 'reason': 'missing'}
    if (info.get('size') or 0) > max_bytes:
        return {'valid': None, 'schemaVersion': None, 'reason': 'too-large'}
    try:
        with open(path, 'r', encoding='utf-8') as source:
            payload = json.load(source)
    except (OSError, UnicodeError, json.JSONDecodeError):
        return {'valid': False, 'schemaVersion': None, 'reason': 'invalid-json'}
    if not isinstance(payload, dict):
        return {'valid': False, 'schemaVersion': None, 'reason': 'not-object'}
    schema_version = payload.get('schemaVersion')
    if not isinstance(schema_version, int) or isinstance(schema_version, bool) or schema_version < 0:
        schema_version = None
    return {'valid': True, 'schemaVersion': schema_version, 'reason': 'ok'}


def _portal_backup_health(database_path):
    result = {'managed': True, 'count': 0, 'status': 'missing', 'newestModifiedMs': None}
    try:
        backup_dir = database_backup_dir(database_path)
        stem = os.path.splitext(os.path.basename(str(database_path)))[0]
        candidates = []
        if os.path.isdir(backup_dir):
            for name in os.listdir(backup_dir):
                if name.startswith(f'{stem}.before-write.') and name.endswith('.json'):
                    path = resolve_database_backup_path(database_path, name)
                    candidates.append((os.path.getmtime(path), path))
        candidates.sort(reverse=True)
        result['count'] = min(len(candidates), MAX_DATABASE_BACKUPS)
        if not candidates:
            return result
        newest_path = candidates[0][1]
        info = get_file_info(newest_path)
        result['newestModifiedMs'] = info.get('modifiedMs')
        metadata = _json_object_metadata(newest_path)
        result['status'] = 'healthy' if metadata.get('valid') is True else (
            'unverified' if metadata.get('valid') is None else 'invalid'
        )
    except (OSError, ValueError):
        result['status'] = 'unreadable'
    return result


def _nexus_backup_health():
    result = {'managed': True, 'count': 0, 'status': 'missing', 'newestModifiedMs': None}
    try:
        backup_dir = Path(NEXUS_DATA_ROOT, 'backups')
        candidates = sorted(
            backup_dir.glob('settings.revision-*.json'),
            key=lambda item: item.stat().st_mtime_ns,
            reverse=True
        ) if backup_dir.is_dir() else []
        result['count'] = min(len(candidates), 10)
        if not candidates:
            return result
        info = get_file_info(candidates[0])
        result['newestModifiedMs'] = info.get('modifiedMs')
        metadata = _json_object_metadata(candidates[0], max_bytes=256 * 1024)
        result['status'] = 'healthy' if metadata.get('valid') is True else 'invalid'
    except OSError:
        result['status'] = 'unreadable'
    return result


def nexus_project_status():
    sampled_at = int(time.time() * 1000)
    component_names = {'portal': 'Portal', 'widgets': 'Widgets', 'arcade': 'Arcade',
                       'relay': 'Relay', 'host': 'Host', 'nexus': 'Nexus'}
    components = []
    for component_id, name in component_names.items():
        protocols, capabilities = _read_component_contract(component_id)
        components.append({
            'id': component_id, 'name': name, 'version': _read_component_version(component_id),
            'updatedMs': _component_updated_ms(component_id), 'sampledAt': sampled_at,
            'protocols': protocols, 'capabilities': capabilities
        })
    portal_path = str(load_config().get('databasePath', '') or '')
    portal_info = get_file_info(portal_path, include_hash=True)
    portal_record = {
        'location': 'Configured external database' if portal_path else 'Not configured',
        **portal_info,
        'sampledAt': sampled_at
    }
    if portal_info.get('exists') and (portal_info.get('size') or 0) <= 64 * 1024 * 1024:
        try:
            with open(portal_path, 'r', encoding='utf-8') as source:
                portal_record['summary'] = summarize_hub_content(source.read())
        except (OSError, UnicodeError):
            portal_record['summary'] = {'valid': False}
    portal_summary = portal_record.get('summary') if isinstance(portal_record.get('summary'), dict) else {}
    portal_record['schema'] = {
        'valid': portal_summary.get('valid') if portal_summary else None,
        'version': portal_summary.get('schemaVersion') if portal_summary.get('valid') else None
    }
    portal_record['backup'] = _portal_backup_health(portal_path) if portal_path else {
        'managed': True, 'count': 0, 'status': 'missing', 'newestModifiedMs': None
    }
    if not portal_path:
        portal_record['health'] = _nexus_health(
            'unavailable', 'portal-database-unconfigured', 'Portal database is not configured',
            'Open Cyrune Portal through Relay and select or create its authoritative database.', sampled_at
        )
    elif not portal_info.get('exists'):
        portal_record['health'] = _nexus_health(
            'unavailable', 'portal-database-missing', 'Portal database is missing',
            'Confirm the Portal database selection in Relay or restore the expected file from backup.', sampled_at
        )
    elif portal_summary.get('valid') is not True:
        portal_record['health'] = _nexus_health(
            'unavailable', 'portal-database-invalid', 'Portal database could not be validated',
            'Open Portal recovery and restore a known-good retained database backup.', sampled_at
        )
    elif portal_record['backup']['status'] in {'invalid', 'unreadable'}:
        portal_record['health'] = _nexus_health(
            'attention', 'portal-backup-unhealthy', 'Portal database is healthy but its newest backup is not',
            'Create and verify a fresh Portal backup before relying on the retained backup timeline.', sampled_at
        )
    elif portal_record['backup']['count'] == 0:
        portal_record['health'] = _nexus_health(
            'attention', 'portal-backup-missing', 'Portal database is healthy with no retained backup',
            'Create a Portal backup before making substantial database changes.', sampled_at
        )
    else:
        portal_record['health'] = _nexus_health(
            'healthy', 'portal-data-healthy', 'Portal database and retained backup are healthy',
            'No action is required.', sampled_at
        )

    arcade_root = _default_arcade_data_root()
    arcade_state_path = os.path.join(arcade_root, 'state.json')
    arcade_schema = _json_object_metadata(arcade_state_path, max_bytes=8 * 1024 * 1024)
    arcade_record = {
        'location': 'Managed Arcade data',
        **get_file_info(arcade_state_path, include_hash=True),
        'sampledAt': sampled_at,
        'schema': {'valid': arcade_schema.get('valid'), 'version': arcade_schema.get('schemaVersion')},
        'backup': {'managed': False, 'count': 0, 'status': 'component-managed', 'newestModifiedMs': None}
    }
    try:
        service = emugui_service_status()
        arcade_record['service'] = {
            'available': service.get('available') is True,
            'serviceVersion': int(service.get('serviceVersion', 0) or 0),
            'collectionCount': int(service.get('collectionCount', 0) or 0),
            'emulatorCount': int(service.get('emulatorCount', 0) or 0),
            'profileCount': int(service.get('profileCount', 0) or 0),
            'sampledAt': sampled_at
        }
    except Exception:
        arcade_record['service'] = {'available': False, 'errorCode': 'arcade-service-unavailable',
                                    'message': 'Cyrune Arcade service status is unavailable',
                                    'sampledAt': sampled_at}
    if arcade_record['service'].get('available') is not True:
        arcade_record['health'] = _nexus_health(
            'unavailable', 'arcade-service-unavailable', 'Arcade service is unavailable',
            'Confirm Host has the current Cyrune Arcade root, then reload Relay and Arcade.', sampled_at
        )
    elif not arcade_record.get('exists'):
        arcade_record['health'] = _nexus_health(
            'attention', 'arcade-state-missing', 'Arcade is available but its local state file is missing',
            'Use Arcade once to create its favourites and recent-history state file.', sampled_at
        )
    elif arcade_record['schema'].get('valid') is not True:
        arcade_record['health'] = _nexus_health(
            'attention', 'arcade-state-invalid', 'Arcade service is available but its local state is invalid',
            'Review Arcade favourites and recent history, then let Arcade rewrite the local state.', sampled_at
        )
    else:
        arcade_record['health'] = _nexus_health(
            'healthy', 'arcade-data-healthy', 'Arcade service and local state are healthy',
            'No action is required.', sampled_at
        )

    nexus_info = get_file_info(NEXUS_SETTINGS_PATH, include_hash=True)
    nexus_record = {
        'location': 'Managed Nexus settings',
        **nexus_info,
        'sampledAt': sampled_at,
        'backup': _nexus_backup_health()
    }
    if not nexus_info.get('exists'):
        nexus_record['schema'] = {'valid': True, 'version': NEXUS_SETTINGS_SCHEMA_VERSION, 'revision': 0}
        nexus_record['health'] = _nexus_health(
            'attention', 'nexus-settings-defaults', 'Nexus is using schema defaults',
            'Apply Variables once to create the authoritative settings file.', sampled_at
        )
    else:
        try:
            saved_settings = load_nexus_settings()
            nexus_record['schema'] = {
                'valid': True,
                'version': saved_settings.get('schemaVersion'),
                'revision': saved_settings.get('revision')
            }
            nexus_record['health'] = _nexus_health(
                'healthy', 'nexus-settings-healthy', 'Nexus settings are valid and authoritative',
                'No action is required.', sampled_at
            )
        except Exception:
            nexus_record['schema'] = {'valid': False, 'version': None, 'revision': None}
            nexus_record['health'] = _nexus_health(
                'unavailable', 'nexus-settings-invalid', 'Authoritative Nexus settings are unreadable',
                'Restore a retained Nexus settings backup before applying further shared variables.', sampled_at
            )
    return {
        'schemaVersion': 2,
        'sampledAt': sampled_at,
        'components': components,
        'services': {'host': {'available': True, 'version': HOST_VERSION, 'sampledAt': sampled_at,
                              'health': _nexus_health('healthy', 'host-healthy', 'Host is responding',
                                                      'No action is required.', sampled_at),
                              'capabilities': HOST_CAPABILITIES,
                              'protocols': HOST_PROTOCOLS}},
        'data': {'portal': portal_record, 'arcade': arcade_record, 'nexus': nexus_record},
        'repository': nexus_repository_status(),
        'validation': _sanitized_validation_receipt(),
        'events': sanitized_nexus_events()
    }


# ---------------------------------------------------------------------------
# Cyrune Arcade service bridge
# ---------------------------------------------------------------------------

def _configured_emugui_service():
    config = load_config()
    configured_root = str(config.get('arcadeRoot', '') or '').strip()
    if not configured_root:
        raise RuntimeError('Cyrune Arcade is not configured in Cyrune Host')
    root = os.path.realpath(configured_root)
    service_path = os.path.join(root, 'arcade_service.py')
    if not os.path.isdir(root) or not os.path.isfile(service_path):
        raise FileNotFoundError('The configured Cyrune Arcade installation is unavailable')
    return root, service_path


def _load_emugui_module():
    global EMUGUI_MODULE, EMUGUI_MODULE_PATH
    root, service_path = _configured_emugui_service()
    if EMUGUI_MODULE is not None and EMUGUI_MODULE_PATH == service_path:
        return EMUGUI_MODULE

    module_name = 'cyrune_arcade_native_service'
    spec = importlib.util.spec_from_file_location(module_name, service_path)
    if spec is None or spec.loader is None:
        raise RuntimeError('The Cyrune Arcade service could not be loaded')
    module = importlib.util.module_from_spec(spec)
    previous = sys.modules.get(module_name)
    added_path = root not in sys.path
    if added_path:
        sys.path.insert(0, root)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        if previous is None:
            sys.modules.pop(module_name, None)
        else:
            sys.modules[module_name] = previous
        raise
    finally:
        if added_path:
            try:
                sys.path.remove(root)
            except ValueError:
                pass
    if getattr(module, 'ARCADE_SERVICE_PROTOCOL_VERSION', None) != 2:
        raise RuntimeError('Update Cyrune Arcade and reload Relay: arcade-service v2 is required')
    module.configure_native_secret_service(get_secret=secret_get, set_secret=secret_set,
                                           delete_secret=secret_delete, status=secret_status)
    module.configure_optional_network_policy(arcade_optional_network_allowed)
    module.SCUMMVM_LAUNCH = _execute_catalogue_plan
    module.DISK_SET_LAUNCH = _execute_catalogue_plan
    module.GAME_PROPERTIES_ACCESS = lambda folder, game_id, disk=None: _atari_save_sessions().access(folder, game_id, disk)
    module.GAME_PROPERTIES_APPROVE = _approve_atari_properties
    if sys.platform == 'win32':
        module.NATIVE_REVEAL_GAME = _reveal_game_in_explorer
    module.VERSION_APPROVE = lambda plan: get_catalogue_bindings().approve_version(plan)
    module.EMULATOR_ICON_READER = _application_icon_data_url
    EMUGUI_MODULE = module
    EMUGUI_MODULE_PATH = service_path
    return module


def authorize_emugui_page(page_url):
    root, _service_path = _configured_emugui_service()
    parsed = urllib.parse.urlsplit(str(page_url or ''))
    if parsed.scheme.casefold() != 'file' or parsed.netloc not in {'', 'localhost'}:
        return False
    path = urllib.request.url2pathname(parsed.path or '')
    if sys.platform == 'win32' and re.match(r'^/[a-zA-Z]:[\\/]', path):
        path = path[1:]
    expected = os.path.realpath(os.path.join(root, 'web', 'index.html'))
    return os.path.normcase(os.path.realpath(path)) == os.path.normcase(expected)


def emugui_api_request(method, path, query=None, body=None):
    method = str(method or '').strip().upper()
    path = str(path or '').strip()
    query = query if isinstance(query, dict) else {}
    body = body if isinstance(body, dict) else {}
    if method not in {'GET', 'POST'} or not re.fullmatch(r'/api/[a-z0-9/-]{1,80}', path):
        raise ValueError('The Cyrune Arcade API request is invalid')
    if len(json.dumps({'query': query, 'body': body}, ensure_ascii=False)) > MAX_EMUGUI_RPC_REQUEST_BYTES:
        raise ValueError('The Cyrune Arcade API request is too large')
    if path == '/api/scrape-preview' and str(body.get('provider', 'manual')) != 'manual' and not arcade_optional_network_allowed():
        raise PermissionError('Optional network access is disabled in Cyrune Nexus')
    module = _load_emugui_module()
    dispatcher = module.dispatch_arcade_api
    if not callable(dispatcher):
        raise RuntimeError('The configured Cyrune Arcade installation does not expose the API service contract')
    result = dispatcher(method, path, query, body)
    if not isinstance(result, dict):
        raise RuntimeError('The Cyrune Arcade API service returned invalid data')
    if len(json.dumps(result, ensure_ascii=False)) > MAX_EMUGUI_RPC_RESPONSE_BYTES:
        raise ValueError('The Cyrune Arcade API response is too large')
    return result


def emugui_asset(relative_path, collection_id=None):
    module = _load_emugui_module()
    reader = module.read_arcade_asset
    if not callable(reader):
        raise RuntimeError('The configured Cyrune Arcade installation does not expose the asset service contract')
    starter = getattr(module, 'start_artwork_job', None)
    if callable(starter) and str(relative_path or '').startswith('scraper-artwork/'):
        result = starter(relative_path, collection_id)
    else:
        result = reader(str(relative_path or ''), MAX_EMUGUI_ASSET_BYTES, **({'collection_id':collection_id} if collection_id is not None else {}))
    if not isinstance(result, dict):
        raise RuntimeError('The Cyrune Arcade asset service returned invalid data')
    return result


def _arcade_transfer_store():
    name = '_cyrune_arcade_transfers'
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name('arcade_transfers.py'))
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return sys.modules[name].TransferStore(EMUGUI_TRANSFERS, max_transfers=MAX_EMUGUI_TRANSFERS,
        max_bytes=MAX_EMUGUI_RPC_RESPONSE_BYTES, chunk_bytes=MAX_EMUGUI_TRANSFER_CHUNK_BYTES,
        ttl=EMUGUI_TRANSFER_TTL_SECONDS)


def _cleanup_emugui_transfers(now=None):
    return _arcade_transfer_store().cleanup(now)


def read_emugui_transfer_chunk(transfer_id, offset=0):
    return _arcade_transfer_store().read(transfer_id, offset)


def start_emugui_transfer(payload):
    return _arcade_transfer_store().start(payload)


def emugui_service_status():
    """Return a path-free summary suitable for the ordinary Hub client."""
    payload = _load_emugui_module().dispatch_arcade_read('STATUS')
    if not isinstance(payload, dict):
        raise RuntimeError('The Cyrune Arcade service returned an invalid status')
    active = payload.get('active') if isinstance(payload.get('active'), dict) else {}
    collections = payload.get('collections') if isinstance(payload.get('collections'), list) else []
    emulators = payload.get('emulators') if isinstance(payload.get('emulators'), list) else []
    profiles = payload.get('profiles') if isinstance(payload.get('profiles'), list) else []
    return {
        'available': True,
        'serviceVersion': int(payload.get('serviceVersion', 0) or 0),
        'activeCollection': {
            'id': str(active.get('id', '') or '')[:120],
            'name': str(active.get('name', '') or '')[:160]
        },
        'collectionCount': len(collections),
        'emulatorCount': len(emulators),
        'profileCount': len(profiles)
    }


def _catalogue_thumbnail(module, catalogue_id):
    """Use the same exact, bounded local artwork read as the catalogue picker."""
    try:
        service = module.get_catalogue_service()
        entry = service.detail({'catalogueId': catalogue_id})['entry']
        if not entry.get('artworkRef'):
            return ''
        name = '_cyrune_host_catalogue_artwork'
        if name not in sys.modules:
            spec = importlib.util.spec_from_file_location(name, Path(HOST_DIR) / 'catalogue_artwork.py')
            loaded = importlib.util.module_from_spec(spec)
            sys.modules[name] = loaded
            spec.loader.exec_module(loaded)
        result = sys.modules[name].read_artwork(service, catalogue_id, entry['artworkRef'],
            bindings=_catalogue_binding_module(), check=lambda: None)
        return 'data:image/png;base64,' + result['data']
    except Exception:
        # Missing/disposable artwork must not change an approved launch target.
        return ''


def _catalogue_binding_module():
    name = '_cyrune_host_catalogue_bindings'
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, Path(HOST_DIR) / 'catalogue_bindings.py')
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return sys.modules[name]


@contextmanager
def game_binding_write_lock():
    if not GAME_BINDING_LOCK.acquire(timeout=30):
        raise _catalogue_binding_module().BindingError('busy')
    try:
        depth = getattr(GAME_BINDING_LOCK_DEPTH, 'value', 0)
        if depth:
            yield
            return
        try:
            with database_write_lock(str(Path(CONFIG_PATH).with_name('catalogue-bindings.json')), timeout_seconds=0):
                GAME_BINDING_LOCK_DEPTH.value = depth + 1
                try:
                    yield
                finally:
                    GAME_BINDING_LOCK_DEPTH.value = depth
        except TimeoutError:
            raise _catalogue_binding_module().BindingError('busy') from None
    finally:
        GAME_BINDING_LOCK.release()


def _serialize_game_bindings(function):
    @wraps(function)
    def invoke(*args, **kwargs):
        with game_binding_write_lock():
            return function(*args, **kwargs)
    return invoke


def _data_upgrades():
    name = '_cyrune_host_data_upgrades'
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, Path(HOST_DIR) / 'data_upgrades.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        sys.modules[name] = module
    return sys.modules[name]


def get_catalogue_bindings():
    """Internal binding service for dedicated native catalogue sessions."""
    global CATALOGUE_BINDINGS, CATALOGUE_BINDINGS_PATH
    path = Path(CONFIG_PATH).resolve().with_name('catalogue-bindings.json')
    if CATALOGUE_BINDINGS is None or CATALOGUE_BINDINGS_PATH != path:
        module = _catalogue_binding_module()
        CATALOGUE_BINDINGS = module.CatalogueBindings(
            path, lock=game_binding_write_lock,
            write=lambda target, value: atomic_write_text(str(target), module.encoded(value).decode('utf-8')),
            resolve=lambda catalogue_id, revision, **options: _load_emugui_module().resolve_catalogue_launch_plan(catalogue_id, revision, **options),
            present=lambda catalogue_id: _load_emugui_module().get_catalogue_service().detail({'catalogueId': catalogue_id})['entry'],
            execute=_execute_catalogue_plan,
            resolve_scope=lambda: _load_emugui_module().catalogue_read_snapshot(),
        )
        CATALOGUE_BINDINGS_PATH = path
        try:
            with game_binding_write_lock():
                _data_upgrades().bindings(sys.modules[__name__], CATALOGUE_BINDINGS, apply=True)
        except Exception:
            CATALOGUE_BINDINGS = None
            CATALOGUE_BINDINGS_PATH = None
            raise
    return CATALOGUE_BINDINGS


ATARI_SAVE_SESSIONS = None


def _atari_save_sessions():
    global ATARI_SAVE_SESSIONS
    if ATARI_SAVE_SESSIONS is None:
        name = '_cyrune_host_atari_sessions'
        spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name('atari_sessions.py'))
        sessions = importlib.util.module_from_spec(spec)
        sys.modules[name] = sessions
        spec.loader.exec_module(sessions)
        arcade = _load_emugui_module()
        from arcade_core.catalogue_identity import _writer_lock
        from arcade_core.persistence import atomic_write_json, atomic_write_bytes
        from arcade_core.game_properties import backup_disk
        ATARI_SAVE_SESSIONS = sessions.SaveSessions(arcade.DATA, _writer_lock, atomic_write_json, atomic_write_bytes, backup_disk)
    return ATARI_SAVE_SESSIONS


def _approve_atari_properties(collection_id, game_id, make_default):
    arcade = _load_emugui_module()
    plan = arcade.resolve_atari_game_plan(collection_id, game_id)
    store = get_catalogue_bindings()
    before, after = store.refresh_atari_policy(plan)
    try:
        if make_default:
            arcade.set_game_version_default(plan['catalogueId'], plan['catalogueId'], plan['entryRevision'])
    except Exception:
        with store._lock():
            current = store.load()
            # Keep newly allocated, unused approval keys, but restore every
            # previous shortcut's policy if choosing a default failed.
            for key, value in before['bindings'].items():
                if current['bindings'].get(key) == after['bindings'].get(key):
                    current['bindings'][key] = value
            current['revision'] += 1
            store._write(store.path, current)
        raise


def _execute_catalogue_plan(plan, *, atari_emulator_override='', selection=None):
    """Host independently guards native side effects while Arcade owns adapters."""
    bindings = _catalogue_binding_module()
    approval = bindings.validate_plan(plan)
    module = _load_emugui_module()
    def validate_current():
        options = {'atari_emulator_override': atari_emulator_override, 'selection': selection}
        current = module.resolve_catalogue_launch_plan(plan['catalogueId'], plan['entryRevision'], **options)
        if current != plan or bindings.validate_plan(current) != approval:
            raise bindings.BindingError('entry-changed')
    def launch(command, cwd):
        validate_current()
        if command != [plan['executable'], *plan['arguments']] or str(cwd) != plan['cwd']:
            raise bindings.BindingError('review-required')
        # Native messaging starts Host hidden. A game needs its own visible
        # window and must never inherit Relay's protocol pipes as standard IO.
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 1
        def start():
            validate_current()
            return subprocess.Popen(command, cwd=str(cwd), shell=False, close_fds=True,
                                    startupinfo=startupinfo, stdin=subprocess.DEVNULL,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if plan.get('adapterId') in {'steem', 'hatari'} and plan.get('schemaVersion') in (4, 5):
            return _atari_save_sessions().launch(plan, start)
        return start()
    def copy_profile(profile):
        validate_current()
        if profile != plan['profileCopy']:
            raise bindings.BindingError('review-required')
        target = Path(profile['target'])
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix='.catalogue-profile-', dir=target.parent)
        os.close(fd)
        try:
            shutil.copyfile(profile['source'], temporary)
            validate_current()
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.remove(temporary)
    validate_current()
    options = {'atari_emulator_override': atari_emulator_override, 'selection': selection}
    return module.launch_catalogue_plan(plan, launch_process=launch, copy_profile=copy_profile, **options)


@_serialize_game_bindings
def create_emugui_game_binding(game_id, emulator_id='', profile_id='', game_key=''):
    game_id = str(game_id or '').strip()
    emulator_id = str(emulator_id or '').strip()
    profile_id = str(profile_id or '').strip()
    if not EMUGUI_ID_PATTERN.fullmatch(game_id):
        raise ValueError('The Cyrune Arcade game ID is invalid')
    if emulator_id and not EMUGUI_ID_PATTERN.fullmatch(emulator_id):
        raise ValueError('The Cyrune Arcade emulator ID is invalid')
    if profile_id and not EMUGUI_ID_PATTERN.fullmatch(profile_id):
        raise ValueError('The Cyrune Arcade profile ID is invalid')
    game_key = str(game_key or '').strip()
    if game_key and not GAME_KEY_PATTERN.fullmatch(game_key):
        raise ValueError('The game binding key is invalid')

    module = _load_emugui_module()
    active = module.active_collection()
    library_id = active['id']
    selection = None
    if active['adapter'] == 'atari-st-disks-v1':
        if not atari_protocol_supported():
            raise ValueError('Update Cyrune Host and Arcade for Atari support')
        plan = module.resolve_atari_game_plan(library_id, game_id, emulator_id, profile_id)
    elif active['adapter'] == 'scummvm-config-v1':
        if not scummvm_protocol_supported():
            raise ValueError('Update Cyrune Host and Arcade for ScummVM support')
        plan = module.resolve_scummvm_game_plan(library_id, game_id, emulator_id, profile_id)
    else:
        entry = module.catalogue_game_entry(library_id, game_id)
        if emulator_id:
            selection = {'emulatorId': emulator_id, 'profileId': profile_id}
        elif profile_id:
            raise ValueError('Select the emulator for this profile')
        plan = module.resolve_catalogue_launch_plan(entry.base['catalogueId'], selection=selection)
    key = get_catalogue_bindings().approve_version(plan, game_key=game_key, selection=selection)
    return {'gameKey': key, 'state': 'ready', **plan['public'], 'tags': [],
            'thumbnailCache': _catalogue_thumbnail(module, plan['catalogueId'])}


def resolve_emugui_game_source(game_key):
    plan = get_catalogue_bindings().resolve(game_key)
    return ({'libraryId': plan['collectionId'], 'gameId': plan['gameId']},
            {'path': plan['media'], 'title': plan['public']['title']}, {})


def _game_status_languages(values, label=''):
    """Bounded language metadata only; never infer it from countries or paths."""
    if not isinstance(values, (list, tuple)):
        values = []
    result = []
    for value in values[:12]:
        if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z]{2,3}(?:-[a-zA-Z]{2})?', value):
            continue
        code = value.lower()
        if code not in result:
            result.append(code)
    if not result and label:
        try:
            from arcade_core.game_presentation import language_codes
        except ImportError:
            pass
        else:
            result = language_codes([], label)[:12]
    return result


def _game_version_anchor(game_key):
    if not isinstance(game_key, str) or not GAME_KEY_PATTERN.fullmatch(game_key):
        raise ValueError('Invalid game key')
    return get_catalogue_bindings().resolve(game_key)['catalogueId']


def game_versions_request(game_key, action='list', catalogue_id='', entry_revision=''):
    """Fixed game-family actions; the supplied key must already be approved."""
    if action not in {'list', 'launch', 'default'}:
        raise ValueError('Invalid game version action')
    module = _load_emugui_module()
    with module.COLLECTION_JOB_LOCK:
        anchor = _game_version_anchor(game_key)
        if action == 'list':
            if catalogue_id or entry_revision:
                raise ValueError('Invalid game version request')
            service = module.get_catalogue_service()
            result = service.versions(anchor)
            if not service.family(anchor)[3]:
                # An older exact shortcut keeps its pin until a shared default
                # is explicitly saved. Label its actual launch version honestly.
                result['defaultId'] = anchor
                for row in result['versions']:
                    row['isDefault'] = row['catalogueId'] == anchor
            return result
        if action == 'default':
            return module.set_game_version_default(anchor, catalogue_id, entry_revision)
        if not all(isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,80}', value)
                   for value in (catalogue_id, entry_revision)):
            raise ValueError('Invalid game version selection')
        with module.catalogue_read_snapshot():
            _group, members, _default, _saved = module.get_catalogue_service().family(anchor)
            if not isinstance(catalogue_id, str) or catalogue_id not in {entry.base['catalogueId'] for entry in members}:
                raise ValueError('That version does not belong to this game')
            plan = module.resolve_catalogue_launch_plan(catalogue_id, entry_revision)
        key = get_catalogue_bindings().approve_version(plan)
        get_catalogue_bindings().launch(key)
        return {'ok': True}


def _saved_game_default(game_key):
    module = _load_emugui_module()
    anchor = _game_version_anchor(game_key)
    group, members, _default, saved = module.get_catalogue_service().family(anchor)
    if not saved:
        return None
    plan = get_catalogue_bindings().resolve(saved['gameKey'])
    if (plan['catalogueId'] != saved['catalogueId']
            or plan['catalogueId'] not in {entry.base['catalogueId'] for entry in members}
            or module.get_catalogue_service().family(plan['catalogueId'])[0] != group):
        raise ValueError('The default version is no longer available. Choose a default in Launch Version.')
    return saved['gameKey']


def emugui_game_status(game_key, include_thumbnail=False):
    try:
        plan = get_catalogue_bindings().resolve(game_key)
        module = _load_emugui_module()
        group, members, _default, _saved = module.get_catalogue_service().family(plan['catalogueId'])
        saved_key = _saved_game_default(game_key)
        if saved_key:
            plan = get_catalogue_bindings().resolve(saved_key)
        detail = _load_emugui_module().get_catalogue_service().detail({'catalogueId': plan['catalogueId']})['entry']
        record = {'gameKey': game_key, 'state': 'ready', **plan['public'], 'tags': [], 'thumbnailCache': '',
                  'languages': _game_status_languages(detail.get('languages'))}
        if include_thumbnail:
            record['thumbnailCache'] = _catalogue_thumbnail(module, plan['catalogueId'])
        record['defaultVersion'] = {'languages': record['languages'],
                                    'platforms': [record.get('systemName', 'Unspecified platform')]}
        if detail.get('platformId') == 'zx-spectrum':
            record['defaultVersion']['systems'] = [detail['hardwareLabel']] if detail.get('hardwareLabel') else []
        record['defaultVersion'].update(module.get_catalogue_service().presentation(plan['catalogueId']))
        if plan['adapterId'] in {'steem', 'hatari'}:
            record['emulatorName'] = 'Hatari' if plan['adapterId'] == 'hatari' else 'STEem SSE'
        if plan['adapterId'] == 'scummvm':
            record.update(emulatorName='ScummVM', profileName='ScummVM settings')
            from arcade_core.import_scummvm import platform_presentation
            record['defaultVersion']['platforms'] = list(platform_presentation(plan['target']))
            record['defaultVersion']['systems'] = record['defaultVersion']['platforms']
        if members:
            record.update(versionGroup=group, versionCount=len(members),
                          platforms=list(dict.fromkeys(row.base['platformLabel'] for row in members))[:12],
                          languages=_game_status_languages(list(dict.fromkeys(lang for row in members for lang in row.detail['languages']))))
        return record
    except Exception as error:
        return {'gameKey': game_key, 'state': 'unavailable', 'title': 'Game',
                'error': _catalogue_binding_module().error_code(error)}


def emugui_game_link(game_key, rebind=False):
    store = get_catalogue_bindings()
    stored = store.load()['bindings'].get(game_key, {})
    if rebind and stored.get('mode') == 'unresolved':
        entry = stored['previous']
        collection = entry.get('libraryId', '')
        if not all(isinstance(value, str) and EMUGUI_ID_PATTERN.fullmatch(value) for value in (collection, entry.get('gameId'))):
            raise ValueError('The unavailable binding needs a new selection in Arcade')
    else:
        plan = store.resolve(game_key)
        collection = plan['collectionId']
        entry = {'gameId': plan['gameId']}
    query = {'game': str(entry.get('gameId') or '')}
    if collection:
        query['collection'] = collection
    if rebind:
        query['hubRebind'] = str(game_key)
    root, _service_path = _configured_emugui_service()
    page_path = os.path.realpath(os.path.join(root, 'web', 'index.html'))
    page_url = Path(page_path).as_uri()
    return f'{page_url}?{urllib.parse.urlencode(query)}'


def _reveal_game_in_explorer(path):
    name = '_cyrune_host_explorer'
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, Path(HOST_DIR) / 'explorer.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        sys.modules[name] = module
    sys.modules[name].reveal_game(path)


def reveal_emugui_game(game_key):
    _entry, game, _status = resolve_emugui_game_source(game_key)
    path = os.path.realpath(str(game.get('path') or ''))
    if not path or not os.path.exists(path):
        raise FileNotFoundError('The bound game file is missing or unavailable')
    if sys.platform == 'win32':
        subprocess.Popen(['explorer.exe', path] if os.path.isdir(path) else ['explorer.exe', '/select,', path])
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', '-R', path], close_fds=True)
    else:
        subprocess.Popen(['xdg-open', path if os.path.isdir(path) else os.path.dirname(path)], close_fds=True)
    return True


def rebind_emugui_game(game_key, game_id, emulator_id='', profile_id=''):
    return create_emugui_game_binding(game_id, emulator_id, profile_id, game_key)


def launch_emugui_game(game_key):
    return get_catalogue_bindings().launch(_saved_game_default(game_key) or game_key)


@_serialize_game_bindings
def forget_emugui_game(game_key):
    return get_catalogue_bindings().forget(game_key)


# ---------------------------------------------------------------------------
# Fixed-purpose system metrics (no arbitrary commands or process details)
# ---------------------------------------------------------------------------

def _cpu_snapshot():
    if sys.platform == 'win32':
        idle = FILETIME()
        kernel = FILETIME()
        user = FILETIME()
        if not ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)):
            return None
        value = lambda part: (part.dwHighDateTime << 32) | part.dwLowDateTime
        return value(idle), value(kernel), value(user)
    try:
        with open('/proc/stat', 'r', encoding='ascii') as source:
            parts = source.readline().split()[1:]
        values = [int(value) for value in parts]
        return values[3] + (values[4] if len(values) > 4 else 0), sum(values)
    except Exception:
        return None


def _cpu_percent():
    first = _cpu_snapshot()
    if first is None:
        load = os.getloadavg()[0] if hasattr(os, 'getloadavg') else 0
        return round(min(100.0, max(0.0, load * 100.0 / max(1, os.cpu_count() or 1))), 1)
    time.sleep(0.1)
    second = _cpu_snapshot()
    if second is None:
        return None
    if sys.platform == 'win32':
        idle_delta = second[0] - first[0]
        total_delta = (second[1] - first[1]) + (second[2] - first[2])
    else:
        idle_delta = second[0] - first[0]
        total_delta = second[1] - first[1]
    return round(max(0.0, min(100.0, 100.0 * (1.0 - idle_delta / max(1, total_delta)))), 1)


def _memory_metrics():
    if sys.platform == 'win32':
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [('dwLength', wintypes.DWORD), ('dwMemoryLoad', wintypes.DWORD),
                        ('ullTotalPhys', ctypes.c_ulonglong), ('ullAvailPhys', ctypes.c_ulonglong),
                        ('ullTotalPageFile', ctypes.c_ulonglong), ('ullAvailPageFile', ctypes.c_ulonglong),
                        ('ullTotalVirtual', ctypes.c_ulonglong), ('ullAvailVirtual', ctypes.c_ulonglong),
                        ('ullAvailExtendedVirtual', ctypes.c_ulonglong)]
        status = MEMORYSTATUSEX()
        status.dwLength = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return {'percent': float(status.dwMemoryLoad), 'usedBytes': int(status.ullTotalPhys - status.ullAvailPhys),
                    'totalBytes': int(status.ullTotalPhys), 'availableBytes': int(status.ullAvailPhys)}
    try:
        values = {}
        with open('/proc/meminfo', 'r', encoding='ascii') as source:
            for line in source:
                key, value = line.split(':', 1)
                values[key] = int(value.strip().split()[0]) * 1024
        total = values.get('MemTotal', 0)
        available = values.get('MemAvailable', values.get('MemFree', 0))
        return {'percent': round(100.0 * (total - available) / max(1, total), 1),
                'usedBytes': total - available, 'totalBytes': total, 'availableBytes': available}
    except Exception:
        return None


def _disk_metrics():
    roots = []
    if sys.platform == 'win32':
        mask = ctypes.windll.kernel32.GetLogicalDrives()
        roots = [f'{chr(65 + index)}:\\' for index in range(26) if mask & (1 << index)]
    else:
        roots = ['/']
        try:
            with open('/proc/mounts', 'r', encoding='utf-8') as source:
                for line in source:
                    parts = line.split()
                    if len(parts) >= 3 and parts[2] in {'ext4', 'xfs', 'btrfs', 'zfs', 'apfs'}:
                        roots.append(parts[1].replace('\\040', ' '))
        except Exception:
            pass
    disks = []
    for root in dict.fromkeys(roots):
        try:
            usage = shutil.disk_usage(root)
            disks.append({'name': root, 'totalBytes': usage.total, 'usedBytes': usage.used,
                          'freeBytes': usage.free, 'percent': round(100.0 * usage.used / max(1, usage.total), 1)})
        except Exception:
            continue
        if len(disks) >= 16:
            break
    return disks


def _network_metrics():
    try:
        if sys.platform.startswith('linux'):
            received = sent = 0
            with open('/proc/net/dev', 'r', encoding='ascii') as source:
                for line in source.readlines()[2:]:
                    _, values = line.split(':', 1)
                    fields = values.split()
                    received += int(fields[0])
                    sent += int(fields[8])
            return {'receivedBytes': received, 'sentBytes': sent}
        if sys.platform == 'win32':
            result = subprocess.run(['netstat', '-e'], capture_output=True, text=True, timeout=3,
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            for line in result.stdout.splitlines():
                if line.strip().lower().startswith('bytes'):
                    values = re.findall(r'\d+', line)
                    if len(values) >= 2:
                        return {'receivedBytes': int(values[0]), 'sentBytes': int(values[1])}
    except Exception:
        pass
    return None


def _battery_metrics():
    if sys.platform != 'win32':
        return None
    class SYSTEM_POWER_STATUS(ctypes.Structure):
        _fields_ = [('ACLineStatus', ctypes.c_ubyte), ('BatteryFlag', ctypes.c_ubyte),
                    ('BatteryLifePercent', ctypes.c_ubyte), ('SystemStatusFlag', ctypes.c_ubyte),
                    ('BatteryLifeTime', wintypes.DWORD), ('BatteryFullLifeTime', wintypes.DWORD)]
    status = SYSTEM_POWER_STATUS()
    if not ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(status)) or status.BatteryFlag == 128:
        return None
    return {'percent': None if status.BatteryLifePercent == 255 else int(status.BatteryLifePercent),
            'charging': status.ACLineStatus == 1, 'secondsRemaining': None if status.BatteryLifeTime == 0xFFFFFFFF else int(status.BatteryLifeTime)}


def collect_system_metrics(requested):
    allowed = {'cpu', 'memory', 'disk', 'network', 'uptime', 'battery', 'platform'}
    selected = [name for name in (requested or []) if name in allowed][:len(allowed)]
    result = {'sampledAt': int(time.time() * 1000)}
    if 'cpu' in selected:
        result['cpu'] = {'percent': _cpu_percent(), 'cores': os.cpu_count() or 1}
    if 'memory' in selected:
        result['memory'] = _memory_metrics()
    if 'disk' in selected:
        result['disk'] = _disk_metrics()
    if 'network' in selected:
        result['network'] = _network_metrics()
    if 'uptime' in selected:
        result['uptime'] = {'seconds': int(ctypes.windll.kernel32.GetTickCount64() / 1000) if sys.platform == 'win32' else int(time.monotonic())}
    if 'battery' in selected:
        result['battery'] = _battery_metrics()
    if 'platform' in selected:
        result['platform'] = {'system': platform.system(), 'release': platform.release(), 'machine': platform.machine()}
    return result


# ---------------------------------------------------------------------------
# User-approved directory handles and fixed repository/file operations
# ---------------------------------------------------------------------------

def open_directory_picker(title='Select folder'):
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes('-topmost', True)
        path = filedialog.askdirectory(title=str(title or 'Select folder')[:160], mustexist=True)
        root.destroy()
        if path:
            return path
    except Exception:
        pass
    if sys.platform == 'win32':
        try:
            safe_title = str(title or 'Select folder')[:160].replace("'", "''")
            script = ('Add-Type -AssemblyName System.Windows.Forms;'
                      '$d = New-Object System.Windows.Forms.FolderBrowserDialog;'
                      f'$d.Description = \'{safe_title}\';'
                      'if ($d.ShowDialog() -eq \'OK\') { Write-Output $d.SelectedPath }')
            result = subprocess.run(['powershell', '-STA', '-NonInteractive', '-Command', script],
                                    capture_output=True, text=True, timeout=60,
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if result.stdout.strip():
                return result.stdout.strip()
        except Exception:
            pass
    return None


def approve_directory(purpose, title='Select folder', selected_path=None):
    if purpose not in {'git', 'recent-files'}:
        raise ValueError('Unsupported directory approval purpose')
    path = os.path.realpath(selected_path or open_directory_picker(title) or '')
    if not path:
        return None
    if not os.path.isdir(path):
        raise ValueError('The selected directory is unavailable')
    config = load_config()
    approved = config.setdefault('approvedDirectories', {})
    for handle, entry in approved.items():
        if entry.get('purpose') == purpose and os.path.normcase(os.path.realpath(entry.get('path', ''))) == os.path.normcase(path):
            return {'handle': handle, 'label': entry.get('label') or os.path.basename(path) or path, 'path': path, 'purpose': purpose}
    handle = f'dir_{secrets.token_urlsafe(18)}'
    label = os.path.basename(path.rstrip('\\/')) or path
    approved[handle] = {'path': path, 'purpose': purpose, 'label': label, 'approvedAt': int(time.time() * 1000)}
    save_config(config)
    return {'handle': handle, 'label': label, 'path': path, 'purpose': purpose}


def resolve_approved_directory(handle, purpose=None, require_exists=True):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{12,80}', str(handle or '')):
        raise ValueError('Directory approval handle is invalid')
    entry = load_config().get('approvedDirectories', {}).get(str(handle))
    if not isinstance(entry, dict):
        raise ValueError('Directory approval was not found')
    if purpose and entry.get('purpose') != purpose:
        raise ValueError('Directory approval does not grant this capability')
    path = os.path.realpath(entry.get('path', ''))
    if require_exists and not os.path.isdir(path):
        raise FileNotFoundError('The approved directory is missing or unavailable')
    return path, entry


def _run_git(path, arguments, timeout=8):
    result = subprocess.run(['git', '-C', path, *arguments], capture_output=True, text=True,
                            encoding='utf-8', errors='replace', timeout=timeout,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    output = (result.stdout or '')[:1024 * 1024]
    error = (result.stderr or '')[:4096]
    if result.returncode != 0:
        raise RuntimeError(error.strip() or 'Git command failed')
    return output


def _run_git_remote(path, arguments, timeout=15):
    environment = os.environ.copy()
    environment.update({
        'GIT_TERMINAL_PROMPT': '0',
        'GCM_INTERACTIVE': 'Never',
        'GIT_ASKPASS': '',
        'SSH_ASKPASS': '',
        'GIT_SSH_COMMAND': 'ssh -oBatchMode=yes -oConnectTimeout=8'
    })
    result = subprocess.run(
        ['git', '-C', path, *arguments],
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace',
        timeout=timeout,
        env=environment,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    )
    output = (result.stdout or '')[:8192]
    error = (result.stderr or '')[:1024]
    if result.returncode != 0:
        raise RuntimeError(error.strip() or 'Remote Git check failed')
    return output


def _git_remote_link(remote):
    value = str(remote or '').strip()
    if value.startswith('git@') and ':' in value:
        host, repo = value[4:].split(':', 1)
        value = f'https://{host}/{repo}'
    elif value.startswith('ssh://git@'):
        value = 'https://' + value[len('ssh://git@'):]
    try:
        parsed = urllib.parse.urlsplit(value)
    except ValueError:
        return ''
    if parsed.scheme.casefold() != 'https' or not parsed.hostname:
        return ''
    host = parsed.hostname
    if parsed.port:
        host = f'{host}:{parsed.port}'
    path = parsed.path[:-4] if parsed.path.endswith('.git') else parsed.path
    return urllib.parse.urlunsplit(('https', host, path, '', ''))


def git_workspace_status(handle):
    path, entry = resolve_approved_directory(handle, 'git')
    status = _run_git(path, ['status', '--porcelain=v2', '--branch', '--untracked-files=normal'])
    branch = ''
    detached = False
    ahead = behind = staged = unstaged = untracked = 0
    for line in status.splitlines():
        if line.startswith('# branch.head '):
            branch = line[len('# branch.head '):].strip()
            detached = branch == '(detached)'
        elif line.startswith('# branch.ab '):
            match = re.search(r'\+(\d+)\s+-(\d+)', line)
            if match:
                ahead, behind = int(match.group(1)), int(match.group(2))
        elif line.startswith('? '):
            untracked += 1
            unstaged += 1
        elif line.startswith(('1 ', '2 ', 'u ')):
            parts = line.split()
            xy = parts[1] if len(parts) > 1 else '..'
            if len(xy) >= 1 and xy[0] not in {'.', ' '}:
                staged += 1
            if len(xy) >= 2 and xy[1] not in {'.', ' '}:
                unstaged += 1
    try:
        commit = _run_git(path, ['log', '-1', '--format=%H%x1f%h%x1f%ct%x1f%s']).strip().split('\x1f')
    except Exception:
        commit = []
    try:
        remote = _run_git(path, ['remote', 'get-url', 'origin']).strip()
    except Exception:
        remote = ''
    return {
        'handle': handle, 'label': entry.get('label') or os.path.basename(path), 'path': path,
        'branch': branch or 'HEAD', 'detached': detached, 'ahead': ahead, 'behind': behind,
        'staged': staged, 'unstaged': unstaged, 'untracked': untracked, 'clean': staged == 0 and unstaged == 0,
        'lastCommit': {'hash': commit[0] if len(commit) > 0 else '', 'shortHash': commit[1] if len(commit) > 1 else '',
                       'timestamp': int(commit[2]) * 1000 if len(commit) > 2 and commit[2].isdigit() else 0,
                       'subject': commit[3][:300] if len(commit) > 3 else ''},
        'remoteUrl': _git_remote_link(remote), 'sampledAt': int(time.time() * 1000)
    }


def _launch_terminal(path):
    if sys.platform == 'win32':
        windows_terminal = shutil.which('wt.exe')
        if windows_terminal:
            try:
                subprocess.Popen([windows_terminal, '-d', path], cwd=path, close_fds=True)
                return
            except OSError:
                pass

        powershell = shutil.which('pwsh.exe') or shutil.which('powershell.exe')
        if powershell:
            try:
                subprocess.Popen(
                    [powershell, '-NoExit', '-NoLogo'], cwd=path, close_fds=True,
                    creationflags=getattr(subprocess, 'CREATE_NEW_CONSOLE', 0)
                )
                return
            except OSError:
                pass

        command_prompt = os.environ.get('COMSPEC') or shutil.which('cmd.exe') or 'cmd.exe'
        subprocess.Popen(
            [command_prompt, '/D', '/K'], cwd=path, close_fds=True,
            creationflags=getattr(subprocess, 'CREATE_NEW_CONSOLE', 0)
        )
        return

    if sys.platform == 'darwin':
        subprocess.Popen(['open', '-a', 'Terminal', path], close_fds=True)
        return

    terminal = shutil.which('x-terminal-emulator')
    if not terminal:
        raise RuntimeError('No supported terminal application was found')
    subprocess.Popen([terminal, '--working-directory', path], close_fds=True)


def open_approved_directory(handle, purpose, action):
    path, _ = resolve_approved_directory(handle, purpose)
    if action not in {'folder', 'terminal'}:
        raise ValueError('Unsupported directory action')
    if sys.platform == 'win32':
        if action == 'folder':
            os.startfile(path)
        else:
            _launch_terminal(path)
    elif sys.platform == 'darwin':
        if action == 'folder':
            subprocess.Popen(['open', path], close_fds=True)
        else:
            _launch_terminal(path)
    else:
        if action == 'folder':
            subprocess.Popen(['xdg-open', path], close_fds=True)
        else:
            _launch_terminal(path)
    return True


def _approved_child_path(handle, purpose, relative_path, require_file=False):
    root, _ = resolve_approved_directory(handle, purpose)
    relative = str(relative_path or '').replace('\\', '/')
    if not relative or relative.startswith('/') or '\x00' in relative:
        raise ValueError('Relative file path is invalid')
    candidate = os.path.realpath(os.path.join(root, *relative.split('/')))
    try:
        contained = os.path.commonpath([os.path.normcase(root), os.path.normcase(candidate)]) == os.path.normcase(root)
    except ValueError:
        contained = False
    if not contained:
        raise ValueError('File path escapes the approved directory')
    if require_file and not os.path.isfile(candidate):
        raise FileNotFoundError('The selected file was renamed, deleted, or is unavailable')
    return root, candidate


def list_recent_files(handle, extensions=None, max_age_hours=168, limit=30, recursive=False):
    root, entry = resolve_approved_directory(handle, 'recent-files')
    allowed_extensions = {str(value).lower().lstrip('.')[:16] for value in (extensions or []) if re.fullmatch(r'\.?[A-Za-z0-9]{1,16}', str(value))}
    max_age = max(1, min(24 * 365, int(max_age_hours or 168)))
    max_results = max(1, min(100, int(limit or 30)))
    cutoff = time.time() - max_age * 3600
    deadline = time.monotonic() + 3.0
    scanned = 0
    results = []
    if recursive:
        iterator = os.walk(root, followlinks=False)
    else:
        iterator = [(root, [], os.listdir(root))]
    for current, directories, names in iterator:
        if recursive:
            relative_depth = os.path.relpath(current, root).count(os.sep)
            if relative_depth >= 3:
                directories[:] = []
            directories[:] = [name for name in directories if not os.path.islink(os.path.join(current, name))][:100]
        for name in names:
            if scanned >= 5000 or time.monotonic() > deadline:
                break
            scanned += 1
            candidate = os.path.join(current, name)
            try:
                if os.path.islink(candidate) or not os.path.isfile(candidate):
                    continue
                info = os.stat(candidate)
                if info.st_mtime < cutoff:
                    continue
                extension = os.path.splitext(name)[1].lower().lstrip('.')
                if allowed_extensions and extension not in allowed_extensions:
                    continue
                relative = os.path.relpath(candidate, root).replace(os.sep, '/')
                results.append({'name': name[:260], 'relativePath': relative[:2048], 'extension': extension,
                                'sizeBytes': int(info.st_size), 'modifiedAt': int(info.st_mtime * 1000)})
            except (FileNotFoundError, PermissionError, OSError):
                continue
        if scanned >= 5000 or time.monotonic() > deadline:
            break
    results.sort(key=lambda item: item['modifiedAt'], reverse=True)
    return {'handle': handle, 'label': entry.get('label') or os.path.basename(root), 'files': results[:max_results],
            'scanned': scanned, 'truncated': scanned >= 5000 or time.monotonic() > deadline, 'sampledAt': int(time.time() * 1000)}


def open_approved_file(handle, relative_path, action):
    if action not in {'open', 'reveal'}:
        raise ValueError('Unsupported file action')
    root, path = _approved_child_path(handle, 'recent-files', relative_path, require_file=True)
    if sys.platform == 'win32':
        if action == 'open':
            os.startfile(path)
        else:
            subprocess.Popen(['explorer.exe', '/select,', path])
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', path] if action == 'open' else ['open', '-R', path])
    else:
        subprocess.Popen(['xdg-open', path] if action == 'open' else ['xdg-open', os.path.dirname(path) or root])
    return True


# ---------------------------------------------------------------------------
# User-approved applications and fixed launch/reveal operations
# ---------------------------------------------------------------------------

def _internet_shortcut_scheme(path):
    if os.path.getsize(path) > MAX_INTERNET_SHORTCUT_BYTES:
        raise ValueError('The Internet Shortcut is too large')
    with open(path, 'rb') as shortcut_file:
        raw = shortcut_file.read(MAX_INTERNET_SHORTCUT_BYTES + 1)
    text = None
    encodings = ('utf-16', 'utf-8-sig', 'cp1252') if raw.startswith((b'\xff\xfe', b'\xfe\xff')) or b'\x00' in raw else ('utf-8-sig', 'cp1252')
    for encoding in encodings:
        try:
            text = raw.decode(encoding)
            break
        except UnicodeError:
            continue
    if text is None:
        raise ValueError('The Internet Shortcut could not be read')
    in_shortcut_section = False
    targets = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith('[') and stripped.endswith(']'):
            in_shortcut_section = stripped.casefold() == '[internetshortcut]'
        elif in_shortcut_section and stripped.casefold().startswith('url='):
            targets.append(stripped[4:].strip())
    if len(targets) != 1:
        raise ValueError('The Internet Shortcut must contain one application target')
    target = targets[0]
    return urllib.parse.urlsplit(_validated_application_uri(target)).scheme.casefold()


def _validated_application_uri(target):
    target = str(target or '').strip()
    if not target or len(target) > 4096 or any(ord(char) < 32 for char in target):
        raise ValueError('The application link has no valid target')
    parsed = urllib.parse.urlsplit(target)
    scheme = parsed.scheme.casefold()
    if scheme not in APPLICATION_URI_SCHEMES:
        raise ValueError('Only approved game and application protocol shortcuts are supported')
    return target


def _application_kind(path):
    extension = os.path.splitext(path)[1].lower()
    if sys.platform == 'win32':
        if not os.path.isfile(path):
            raise ValueError('The selected application is unavailable')
        if extension in {'.exe', '.com'}:
            return 'executable'
        if extension == '.lnk':
            return 'shortcut'
        if extension == '.url':
            _internet_shortcut_scheme(path)
            return 'uri-shortcut'
        raise ValueError('Select an executable or Windows application shortcut')
    if sys.platform == 'darwin':
        if extension == '.app' and os.path.isdir(path):
            return 'app-bundle'
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return 'executable'
        raise ValueError('Select an application bundle or executable')
    if extension == '.desktop' and os.path.isfile(path):
        return 'desktop-entry'
    if os.path.isfile(path) and os.access(path, os.X_OK):
        return 'executable'
    raise ValueError('Select a desktop application entry or executable')


def _application_icon_data_url(path):
    if sys.platform != 'win32':
        return ''
    script = (
        'Add-Type -AssemblyName System.Drawing;'
        '$p=[Console]::In.ReadToEnd().Trim();'
        '$i=[System.Drawing.Icon]::ExtractAssociatedIcon($p);'
        'if($i){$m=New-Object System.IO.MemoryStream;'
        '$i.ToBitmap().Save($m,[System.Drawing.Imaging.ImageFormat]::Png);'
        '[Convert]::ToBase64String($m.ToArray());$m.Dispose();$i.Dispose()}'
    )
    try:
        result = subprocess.run(
            ['powershell', '-NoProfile', '-NonInteractive', '-Command', script],
            input=str(path), capture_output=True, text=True, timeout=15,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
        )
        encoded = (result.stdout or '').strip()
        if not encoded or len(encoded) > 512 * 1024:
            return ''
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > 256 * 1024 or not raw.startswith(b'\x89PNG\r\n\x1a\n'):
            return ''
        return 'data:image/png;base64,' + encoded
    except Exception:
        return ''


def _steam_app_id(target_uri):
    try:
        parsed = urllib.parse.urlsplit(str(target_uri or '').strip())
    except ValueError:
        return ''
    if parsed.scheme.casefold() != 'steam' or parsed.netloc.casefold() != 'rungameid':
        return ''
    match = re.fullmatch(r'/(\d{1,10})/?', parsed.path or '')
    return match.group(1) if match else ''


def _steam_library_cache_dir():
    if sys.platform != 'win32':
        return ''
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Valve\Steam') as key:
            steam_path, _ = winreg.QueryValueEx(key, 'SteamPath')
        return os.path.realpath(os.path.join(str(steam_path), 'appcache', 'librarycache'))
    except (ImportError, OSError, TypeError, ValueError):
        return ''


def _bounded_local_image_data_url(path):
    try:
        if not os.path.isfile(path) or os.path.getsize(path) > MAX_APPLICATION_ICON_BYTES:
            return ''
        with open(path, 'rb') as image_file:
            data = image_file.read(MAX_APPLICATION_ICON_BYTES + 1)
    except OSError:
        return ''
    if not data or len(data) > MAX_APPLICATION_ICON_BYTES:
        return ''
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        mime = 'image/png'
    elif data.startswith(b'\xff\xd8\xff'):
        mime = 'image/jpeg'
    elif data.startswith((b'GIF87a', b'GIF89a')):
        mime = 'image/gif'
    elif data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        mime = 'image/webp'
    elif data.startswith(b'\x00\x00\x01\x00'):
        mime = 'image/x-icon'
    else:
        return ''
    return f'data:{mime};base64,{base64.b64encode(data).decode("ascii")}'


def _steam_cached_app_icon_data_url(app_id):
    if not re.fullmatch(r'\d{1,10}', str(app_id or '')):
        return ''
    cache_dir = _steam_library_cache_dir()
    if not cache_dir:
        return ''
    cache_dir = os.path.realpath(cache_dir)
    legacy_candidates = [
        os.path.join(cache_dir, f'{app_id}_icon.jpg'),
        os.path.join(cache_dir, f'{app_id}_icon.png')
    ]
    for candidate in legacy_candidates:
        resolved = os.path.realpath(candidate)
        try:
            if os.path.commonpath([os.path.normcase(cache_dir), os.path.normcase(resolved)]) != os.path.normcase(cache_dir):
                continue
        except ValueError:
            continue
        icon_data = _bounded_local_image_data_url(resolved)
        if icon_data:
            return icon_data

    app_dir = os.path.realpath(os.path.join(cache_dir, str(app_id)))
    try:
        if os.path.commonpath([os.path.normcase(cache_dir), os.path.normcase(app_dir)]) != os.path.normcase(cache_dir):
            return ''
        candidates = []
        with os.scandir(app_dir) as entries:
            for index, entry in enumerate(entries):
                if index >= 64:
                    break
                if not entry.is_file(follow_symlinks=False):
                    continue
                extension = os.path.splitext(entry.name)[1].casefold()
                if extension not in {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico'}:
                    continue
                resolved = os.path.realpath(entry.path)
                if os.path.commonpath([os.path.normcase(app_dir), os.path.normcase(resolved)]) != os.path.normcase(app_dir):
                    continue
                try:
                    size = os.path.getsize(resolved)
                except OSError:
                    continue
                if 0 < size <= MAX_APPLICATION_ICON_BYTES:
                    name = entry.name.casefold()
                    is_hashed_icon = re.fullmatch(r'[0-9a-f]{40}\.(?:jpe?g|png|gif|webp|ico)', name) is not None
                    priority = 0 if 'icon' in name or is_hashed_icon else 1
                    candidates.append((priority, size, resolved))
    except (OSError, ValueError):
        return ''
    for _, _, candidate in sorted(candidates):
        icon_data = _bounded_local_image_data_url(candidate)
        if icon_data:
            return icon_data
    return ''


def _steam_store_art_data_url(app_id):
    if not re.fullmatch(r'\d{1,10}', str(app_id or '')):
        return ''
    url = f'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{app_id}/library_600x900.jpg'
    try:
        return _download_favicon_candidate(url, MAX_APPLICATION_ICON_BYTES).get('dataUrl', '')
    except (OSError, ValueError, urllib.error.URLError):
        return ''


def _application_link_icon_data_url(target_uri, icon_hint=''):
    if sys.platform != 'win32' or urllib.parse.urlsplit(target_uri).scheme.casefold() != 'steam':
        return ''
    hinted_path = str(icon_hint or '').strip().strip('"')
    if hinted_path and os.path.splitext(hinted_path)[1].casefold() == '.ico':
        icon_path = os.path.realpath(hinted_path)
        icon_dir = os.path.dirname(icon_path)
        steam_dir = os.path.dirname(icon_dir)
        if os.path.basename(icon_dir).casefold() == 'games' and os.path.basename(steam_dir).casefold() == 'steam':
            try:
                if os.path.isfile(icon_path) and os.path.getsize(icon_path) <= MAX_FAVICON_BYTES:
                    icon_data = _application_icon_data_url(icon_path)
                    if icon_data:
                        return icon_data
            except OSError:
                pass
    app_id = _steam_app_id(target_uri)
    if not app_id:
        return ''
    return _steam_cached_app_icon_data_url(app_id) or _steam_store_art_data_url(app_id)


def _application_public_record(app_key, entry, state='ready'):
    return {
        'appKey': app_key,
        'label': str(entry.get('label', '') or 'Application')[:160],
        'kind': str(entry.get('kind', '') or ''),
        'state': state,
        'iconDataUrl': str(entry.get('iconDataUrl', '') or '')[:700000]
    }


def approve_application(app_key='', title='Select application', selected_path=None):
    requested_key = str(app_key or '')
    if requested_key and not APPLICATION_KEY_PATTERN.fullmatch(requested_key):
        raise ValueError('Application key is invalid')
    selected = selected_path or open_file_picker('application', str(title or 'Select application')[:160])
    if not selected:
        return None
    path = os.path.realpath(selected)
    kind = _application_kind(path)
    key = requested_key or f'app_{secrets.token_urlsafe(18)}'
    label = os.path.splitext(os.path.basename(path.rstrip('\\/')))[0] or 'Application'
    entry = {
        'path': path,
        'kind': kind,
        'label': label[:160],
        'approvedAt': int(time.time() * 1000),
        'iconDataUrl': _application_icon_data_url(path)
    }
    config = load_config()
    config.setdefault('approvedApplications', {})[key] = entry
    save_config(config)
    return _application_public_record(key, entry)


def approve_application_link(app_key='', title='Application', target_uri='', icon_hint=''):
    requested_key = str(app_key or '')
    if requested_key and not APPLICATION_KEY_PATTERN.fullmatch(requested_key):
        raise ValueError('Application key is invalid')
    target = _validated_application_uri(target_uri)
    key = requested_key or f'app_{secrets.token_urlsafe(18)}'
    fallback_label = urllib.parse.urlsplit(target).scheme or 'Application'
    entry = {
        'targetUri': target,
        'kind': 'protocol-link',
        'label': str(title or fallback_label)[:160],
        'approvedAt': int(time.time() * 1000),
        'iconDataUrl': _application_link_icon_data_url(target, icon_hint)
    }
    config = load_config()
    config.setdefault('approvedApplications', {})[key] = entry
    save_config(config)
    return _application_public_record(key, entry)


def resolve_approved_application(app_key, require_exists=True):
    key = str(app_key or '')
    if not APPLICATION_KEY_PATTERN.fullmatch(key):
        raise ValueError('Application key is invalid')
    entry = load_config().get('approvedApplications', {}).get(key)
    if not isinstance(entry, dict):
        raise ValueError('Application is not approved on this device')
    if entry.get('kind') == 'protocol-link':
        return _validated_application_uri(entry.get('targetUri', '')), entry
    path = os.path.realpath(str(entry.get('path', '') or ''))
    exists = os.path.isdir(path) if entry.get('kind') == 'app-bundle' else os.path.isfile(path)
    if require_exists and not exists:
        raise FileNotFoundError('The approved application is missing or unavailable')
    if exists and _application_kind(path) != entry.get('kind'):
        raise ValueError('The approved application type changed; approve it again')
    return path, entry


def application_status(app_key):
    try:
        _, entry = resolve_approved_application(app_key)
        public = _application_public_record(str(app_key), entry)
        if not public['iconDataUrl']:
            config = load_config()
            stored = config.get('approvedApplications', {}).get(str(app_key), {})
            if stored.get('kind') == 'protocol-link':
                icon_data = _application_link_icon_data_url(stored.get('targetUri', ''))
            else:
                path = stored.get('path', '')
                icon_data = _application_icon_data_url(path) if path else ''
            if icon_data:
                stored['iconDataUrl'] = icon_data
                save_config(config)
                public['iconDataUrl'] = icon_data
        return public
    except FileNotFoundError:
        return {'appKey': str(app_key or ''), 'label': 'Application', 'kind': '', 'state': 'missing', 'iconDataUrl': ''}
    except ValueError as error:
        state = 'unbound' if 'not approved' in str(error) else 'changed'
        return {'appKey': str(app_key or ''), 'label': 'Application', 'kind': '', 'state': state, 'iconDataUrl': ''}


def launch_approved_application(app_key):
    path, entry = resolve_approved_application(app_key)
    if sys.platform == 'win32':
        kind = entry.get('kind')
        if kind == 'executable':
            subprocess.Popen([path], cwd=os.path.dirname(path) or None, close_fds=True)
        else:
            subprocess.Popen(
                ['explorer.exe', path], close_fds=True,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
            )
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', path], close_fds=True) if entry.get('kind') == 'app-bundle' else subprocess.Popen([path], close_fds=True)
    elif entry.get('kind') == 'desktop-entry':
        launcher = shutil.which('gio')
        if not launcher:
            raise RuntimeError('No supported desktop-entry launcher was found')
        subprocess.Popen([launcher, 'launch', path], close_fds=True)
    else:
        subprocess.Popen([path], close_fds=True)
    return True


def reveal_approved_application(app_key):
    path, entry = resolve_approved_application(app_key)
    if entry.get('kind') == 'protocol-link':
        raise ValueError('Application protocol links do not have a file to reveal')
    if sys.platform == 'win32':
        subprocess.Popen(['explorer.exe', '/select,', path])
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', '-R', path], close_fds=True)
    else:
        subprocess.Popen(['xdg-open', os.path.dirname(path) or path], close_fds=True)
    return True


def forget_approved_application(app_key):
    key = str(app_key or '')
    if not APPLICATION_KEY_PATTERN.fullmatch(key):
        raise ValueError('Application key is invalid')
    config = load_config()
    removed = config.get('approvedApplications', {}).pop(key, None)
    save_config(config)
    return removed is not None


# ---------------------------------------------------------------------------
# Message handlers
# ---------------------------------------------------------------------------

NEXUS_MESSAGE_TYPES = frozenset({
    'NEXUS_AUTHORIZE_PAGE', 'NEXUS_GET_SETTINGS', 'NEXUS_GET_COMPONENT_SETTINGS',
    'NEXUS_SAVE_SETTINGS', 'NEXUS_GET_DOCUMENT', 'NEXUS_OPEN_TODO',
    'NEXUS_CHECK_REMOTE', 'NEXUS_GET_STATUS'
})


def handle_nexus_message(msg_type, msg):
    """Dispatch the fixed Nexus protocol independently of the legacy native router."""
    if msg_type not in NEXUS_MESSAGE_TYPES:
        return False
    if msg_type == 'NEXUS_AUTHORIZE_PAGE':
        try:
            reply_ok(authorized=authorize_nexus_page(msg.get('pageUrl', '')))
        except Exception:
            send_message({'ok': False, 'errorCode': 'nexus-authorization-failed',
                          'error': 'Cyrune Nexus page authorization failed'})
    elif msg_type == 'NEXUS_GET_SETTINGS':
        try:
            reply_ok(settings=load_nexus_settings(), history=load_nexus_history(), storage=nexus_storage_status())
        except Exception:
            send_message({'ok': False, 'errorCode': 'nexus-settings-unavailable',
                          'error': 'Authoritative Cyrune Nexus settings are unavailable'})
    elif msg_type == 'NEXUS_GET_COMPONENT_SETTINGS':
        try:
            reply_ok(profile=nexus_component_settings(msg.get('component', '')))
        except ValueError:
            send_message({'ok': False, 'errorCode': 'nexus-settings-consumer-unsupported',
                          'error': 'This Cyrune component settings profile is not supported'})
        except Exception:
            send_message({'ok': False, 'errorCode': 'nexus-settings-unavailable',
                          'error': 'Authoritative Cyrune component settings are unavailable'})
    elif msg_type == 'NEXUS_SAVE_SETTINGS':
        try:
            reply_ok(**save_nexus_settings(msg.get('settings'), msg.get('expectedRevision')))
        except ValueError as error:
            message = str(error)
            if message.startswith(('Unknown Nexus setting', 'Unknown Nexus settings section')):
                message = 'Nexus settings contain an unsupported field'
            send_message({'ok': False, 'errorCode': 'nexus-settings-invalid', 'error': message[:240]})
        except Exception:
            send_message({'ok': False, 'errorCode': 'nexus-settings-save-failed',
                          'error': 'Authoritative Cyrune Nexus settings could not be saved'})
    elif msg_type == 'NEXUS_GET_DOCUMENT':
        try:
            reply_ok(document=read_nexus_document(msg.get('component', ''), msg.get('documentType', '')))
        except Exception:
            send_message({'ok': False, 'errorCode': 'nexus-document-unavailable',
                          'error': 'The requested Cyrune project document is unavailable'})
    elif msg_type == 'NEXUS_OPEN_TODO':
        try:
            reply_ok(**open_nexus_todo(msg.get('component', '')))
        except ValueError:
            send_message({'ok': False, 'errorCode': 'nexus-todo-unsupported',
                          'error': 'The requested Cyrune TODO is not supported'})
        except FileNotFoundError:
            send_message({'ok': False, 'errorCode': 'vscode-unavailable',
                          'error': 'Visual Studio Code or the requested Cyrune TODO is unavailable'})
        except Exception:
            send_message({'ok': False, 'errorCode': 'nexus-todo-open-failed',
                          'error': 'The requested Cyrune TODO could not be opened in Visual Studio Code'})
    elif msg_type == 'NEXUS_CHECK_REMOTE':
        try:
            reply_ok(remote=nexus_repository_remote_status())
        except subprocess.TimeoutExpired:
            send_message({'ok': False, 'errorCode': 'nexus-remote-timeout',
                          'error': 'The Cyrune origin check timed out without changing the repository'})
        except ValueError:
            send_message({'ok': False, 'errorCode': 'nexus-remote-branch-unsupported',
                          'error': 'The current Cyrune branch cannot be checked against origin'})
        except Exception:
            send_message({'ok': False, 'errorCode': 'nexus-remote-unavailable',
                          'error': 'Cyrune origin could not be checked; local repository status is unchanged'})
    elif msg_type == 'NEXUS_GET_STATUS':
        try:
            reply_ok(snapshot=nexus_project_status())
        except Exception:
            try:
                record_nexus_event('host', 'status-failed', 'error')
            except OSError:
                pass
            send_message({'ok': False, 'errorCode': 'nexus-status-unavailable',
                          'error': 'The Cyrune project status snapshot is unavailable'})
    return True

def handle(msg):
    msg_type = msg.get('type', '')

    if msg_type == 'PING':
        reply_ok(component='host', version=HOST_VERSION, protocols=HOST_PROTOCOLS,
                 capabilities=HOST_CAPABILITIES)

    elif msg_type == 'READ_CONFIG':
        reply_ok(config=load_config())

    elif msg_type == 'PORTAL_GET_STORAGE_CONFIG':
        try:
            reply_ok(config=portal_storage_config())
        except Exception:
            reply_err('Portal storage configuration is unavailable')

    elif msg_type == 'PORTAL_SET_DATABASE_PATH':
        try:
            reply_ok(config=set_portal_database_path(msg.get('databasePath', '')))
        except ValueError as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal storage configuration could not be saved')

    elif msg_type == 'PORTAL_DATABASE_STAT':
        try:
            reply_ok(fileInfo=portal_database_file_info(include_hash=msg.get('includeHash') is True))
        except ValueError as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal database status is unavailable')

    elif msg_type == 'PORTAL_DATABASE_READ_CHUNK':
        try:
            reply_ok(**portal_database_read_chunk(
                msg.get('offset', 0), msg.get('length', 512 * 1024), msg.get('expectedVersion') or None
            ))
        except ValueError as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal database could not be read consistently')

    elif msg_type == 'PORTAL_DATABASE_WRITE':
        try:
            reply_ok(**portal_database_write(
                str(msg.get('content', '') or ''),
                msg.get('expectedVersion') or None,
                msg.get('expectedHash') or ''
            ))
        except ValueError as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal database could not be saved')

    elif msg_type == 'PORTAL_LIST_DATABASE_BACKUPS':
        try:
            reply_ok(backups=list_database_backups(configured_portal_database_path(required=True)))
        except ValueError as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal database backups are unavailable')

    elif msg_type == 'PORTAL_READ_DATABASE_BACKUP_CHUNK':
        try:
            reply_ok(**read_database_backup_chunk(
                configured_portal_database_path(required=True), msg.get('name', ''),
                msg.get('offset', 0), msg.get('length', 512 * 1024),
                msg.get('expectedVersion') or None
            ))
        except ValueError as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal database backup is unavailable')

    elif msg_type == 'PORTAL_CREATE_DATABASE_BACKUP':
        try:
            database_path = configured_portal_database_path(required=True)
            with database_write_lock(database_path):
                backup_path = backup_database_file(database_path, force=True)
            if not backup_path:
                raise ValueError('The configured Portal database is missing or empty')
            reply_ok(name=os.path.basename(backup_path), fileInfo=get_file_info(backup_path, include_hash=True))
        except ValueError as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal database backup could not be created')

    elif msg_type == 'PORTAL_LIST_THEMES':
        try:
            reply_ok(themes=list_portal_themes())
        except ValueError:
            reply_ok(themes=[])
        except Exception:
            reply_err('Portal themes are unavailable')

    elif msg_type == 'PORTAL_WRITE_THEME':
        try:
            reply_ok(fileInfo=write_portal_theme(msg.get('themeId', ''), msg.get('content', '')))
        except (ValueError, json.JSONDecodeError) as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal theme could not be saved')

    elif msg_type == 'PORTAL_BEGIN_ASSET_WRITE':
        try:
            reply_ok(**begin_portal_asset_write(
                msg.get('collectionName', ''), msg.get('itemName', ''), msg.get('extension', 'webp')
            ))
        except ValueError as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal asset write could not be started')

    elif msg_type == 'PORTAL_APPEND_ASSET_WRITE':
        try:
            reply_ok(written=append_portal_asset_write(msg.get('sessionId', ''), msg.get('chunk', '')))
        except (ValueError, binascii.Error) as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal asset chunk could not be saved')

    elif msg_type == 'PORTAL_FINISH_ASSET_WRITE':
        try:
            reply_ok(**finish_portal_asset_write(msg.get('sessionId', '')))
        except ValueError as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal asset write could not be completed')

    elif msg_type == 'PORTAL_ABORT_ASSET_WRITE':
        try:
            abort_portal_asset_write(msg.get('sessionId', ''))
            reply_ok()
        except ValueError as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal asset write could not be cancelled')

    elif msg_type == 'PORTAL_CACHE_ASSET_URL':
        try:
            reply_ok(**cache_portal_asset_url(
                msg.get('url', ''), msg.get('collectionName', ''), msg.get('itemName', ''),
                msg.get('extension', 'webp'), msg.get('maxBytes', MAX_DOWNLOAD_BYTES)
            ))
        except ValueError as error:
            reply_err(str(error))
        except Exception:
            reply_err('Portal remote asset could not be cached')

    elif msg_type == 'WRITE_CONFIG':
        try:
            save_config(msg.get('config', {}))
            reply_ok(config=load_config())
        except Exception as e:
            reply_err(str(e))

    elif handle_nexus_message(msg_type, msg):
        pass

    elif msg_type == 'READ_FILE':
        path = msg.get('path', '')
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            reply_ok(content=content, fileInfo=get_file_info(path, include_hash=True))
        except FileNotFoundError:
            reply_ok(content=None, fileInfo=get_file_info(path))   # not found is not an error — caller falls back
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'READ_FILE_CHUNK':
        path = msg.get('path', '')
        try:
            reply_ok(**read_file_chunk(
                path,
                msg.get('offset', 0),
                msg.get('length', 512 * 1024),
                msg.get('expectedVersion') or None
            ))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'WRITE_FILE':
        path = msg.get('path', '')
        content = msg.get('content', '')
        try:
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            reply_ok(fileInfo=get_file_info(path))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'WRITE_THEME_FILE':
        try:
            path = resolve_theme_path(msg.get('themesDir', ''), msg.get('themeId', ''))
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as theme_file:
                theme_file.write(msg.get('content', ''))
            reply_ok(fileInfo=get_file_info(path))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'BEGIN_FILE_WRITE':
        temp_path = msg.get('tempPath', '')
        try:
            os.makedirs(os.path.dirname(os.path.abspath(temp_path)), exist_ok=True)
            with open(temp_path, 'wb'):
                pass
            reply_ok()
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'APPEND_FILE_CHUNK':
        temp_path = msg.get('tempPath', '')
        chunk = msg.get('chunk', '')
        try:
            data = base64.b64decode(chunk.encode('ascii'))
            with open(temp_path, 'ab') as f:
                f.write(data)
            reply_ok(written=len(data))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'FINISH_FILE_WRITE':
        temp_path = msg.get('tempPath', '')
        path = msg.get('path', '')
        try:
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
            os.replace(temp_path, path)
            reply_ok(fileInfo=get_file_info(path))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'DOWNLOAD_URL_TO_FILE':
        url = msg.get('url', '')
        path = msg.get('path', '')
        temp_path = msg.get('tempPath', '')
        max_bytes = min(MAX_DOWNLOAD_BYTES, max(1, int(msg.get('maxBytes', MAX_DOWNLOAD_BYTES) or MAX_DOWNLOAD_BYTES)))
        try:
            result = download_url_to_file(url, path, temp_path, max_bytes)
            reply_ok(fileInfo=get_file_info(path), **result)
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'FETCH_FAVICON':
        url = msg.get('url', '')
        max_bytes = min(MAX_FAVICON_BYTES, max(1, int(msg.get('maxBytes', MAX_FAVICON_BYTES) or MAX_FAVICON_BYTES)))
        try:
            reply_ok(**fetch_favicon(url, max_bytes))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'DELETE_FILE':
        path = msg.get('path', '')
        try:
            if path and os.path.isfile(path):
                os.remove(path)
            reply_ok()
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'WRITE_FILE_IF_UNCHANGED':
        path = msg.get('path', '')
        content = msg.get('content', '')
        expected_version = msg.get('expectedVersion') or None
        expected_hash = msg.get('expectedHash') or ''
        try:
            reply_ok(**write_file_if_unchanged(
                path,
                content,
                expected_version=expected_version,
                expected_hash=expected_hash
            ))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'STAT_FILE':
        path = msg.get('path', '')
        try:
            reply_ok(fileInfo=get_file_info(path, include_hash=msg.get('includeHash') is True))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'LIST_DATABASE_BACKUPS':
        try:
            reply_ok(backups=list_database_backups(msg.get('databasePath', '')))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'READ_DATABASE_BACKUP_CHUNK':
        try:
            reply_ok(**read_database_backup_chunk(
                msg.get('databasePath', ''), msg.get('name', ''),
                msg.get('offset', 0), msg.get('length', 512 * 1024),
                msg.get('expectedVersion') or None
            ))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'CREATE_DATABASE_BACKUP':
        try:
            database_path = msg.get('databasePath', '')
            with database_write_lock(database_path):
                backup_path = backup_database_file(database_path, force=True)
            if not backup_path:
                raise ValueError('The configured database is missing or empty')
            reply_ok(name=os.path.basename(backup_path), fileInfo=get_file_info(backup_path, include_hash=True))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'SECRET_STATUS':
        try:
            reply_ok(**secret_status())
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'SECRET_GET':
        try:
            reply_ok(value=secret_get(msg.get('key', '')))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'SECRET_SET':
        try:
            secret_set(msg.get('key', ''), msg.get('value', ''))
            reply_ok()
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'SECRET_DELETE':
        try:
            secret_delete(msg.get('key', ''))
            reply_ok()
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'SECRET_LIST':
        try:
            reply_ok(keys=secret_list())
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'SYSTEM_METRICS':
        try:
            reply_ok(metrics=collect_system_metrics(msg.get('metrics', [])))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'APPROVE_DIRECTORY':
        try:
            approved = approve_directory(msg.get('purpose', ''), msg.get('title', 'Select folder'))
            reply_ok(directory=approved)
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'GIT_WORKSPACE_STATUS':
        try:
            reply_ok(repository=git_workspace_status(msg.get('handle', '')))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'OPEN_APPROVED_DIRECTORY':
        try:
            open_approved_directory(msg.get('handle', ''), msg.get('purpose', ''), msg.get('action', ''))
            reply_ok()
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'LIST_RECENT_FILES':
        try:
            reply_ok(result=list_recent_files(msg.get('handle', ''), msg.get('extensions', []),
                                              msg.get('maxAgeHours', 168), msg.get('limit', 30),
                                              msg.get('recursive') is True))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'OPEN_APPROVED_FILE':
        try:
            open_approved_file(msg.get('handle', ''), msg.get('relativePath', ''), msg.get('action', ''))
            reply_ok()
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'APPROVE_APPLICATION':
        try:
            reply_ok(application=approve_application(msg.get('appKey', ''), msg.get('title', 'Select application')))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'APPROVE_APPLICATION_LINK':
        try:
            reply_ok(application=approve_application_link(
                msg.get('appKey', ''), msg.get('title', 'Application'), msg.get('targetUri', ''), msg.get('iconHint', '')
            ))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'GET_APPLICATION_STATUS':
        try:
            reply_ok(application=application_status(msg.get('appKey', '')))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'LAUNCH_APPROVED_APPLICATION':
        try:
            launch_approved_application(msg.get('appKey', ''))
            reply_ok()
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'REVEAL_APPROVED_APPLICATION':
        try:
            reveal_approved_application(msg.get('appKey', ''))
            reply_ok()
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'FORGET_APPROVED_APPLICATION':
        try:
            reply_ok(removed=forget_approved_application(msg.get('appKey', '')))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'EMUGUI_STATUS':
        try:
            reply_ok(emugui=emugui_service_status())
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'EMUGUI_AUTHORIZE_PAGE':
        try:
            reply_ok(authorized=authorize_emugui_page(msg.get('pageUrl', '')))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'EMUGUI_API':
        try:
            _arcade_transfer_store().available()
            reply_ok(transfer=start_emugui_transfer(emugui_api_request(
                msg.get('method', ''), msg.get('path', ''), msg.get('query', {}), msg.get('body', {})
            )))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'EMUGUI_ASSET':
        try:
            _arcade_transfer_store().available()
            reply_ok(transfer=start_emugui_transfer(emugui_asset(msg.get('path', ''), msg.get('collectionId'))))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'EMUGUI_TRANSFER_CHUNK':
        try:
            reply_ok(transfer=read_emugui_transfer_chunk(msg.get('transferId', ''), msg.get('offset', 0)))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'EMUGUI_CREATE_HUB_BINDING':
        try:
            reply_ok(game=create_emugui_game_binding(
                msg.get('gameId', ''), msg.get('emulatorId', ''), msg.get('profileId', '')
            ))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'GAME_STATUS':
        try:
            reply_ok(game=emugui_game_status(msg.get('gameKey', ''), msg.get('includeThumbnail') is True))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'LAUNCH_GAME':
        try:
            launch_emugui_game(msg.get('gameKey', ''))
            reply_ok()
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'GAME_VERSIONS':
        try:
            if set(msg) - {'type', 'gameKey', 'action', 'catalogueId', 'entryRevision'}:
                raise ValueError('Invalid game version request')
            reply_ok(result=game_versions_request(msg.get('gameKey'), msg.get('action', 'list'),
                                                msg.get('catalogueId', ''), msg.get('entryRevision', '')))
        except Exception as e:
            reply_err('Game versions are unavailable: ' + _catalogue_binding_module().error_code(e))

    elif msg_type == 'OPEN_GAME_IN_EMUGUI':
        try:
            reply_ok(url=emugui_game_link(msg.get('gameKey', ''), msg.get('rebind') is True))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'REVEAL_GAME':
        try:
            reveal_emugui_game(msg.get('gameKey', ''))
            reply_ok()
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'REBIND_GAME':
        try:
            reply_ok(game=rebind_emugui_game(
                msg.get('gameKey', ''), msg.get('gameId', ''),
                msg.get('emulatorId', ''), msg.get('profileId', '')
            ))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'FORGET_GAME':
        try:
            reply_ok(removed=forget_emugui_game(msg.get('gameKey', '')))
        except Exception as e:
            reply_err(str(e))

    elif msg_type == 'OPEN_FILE_PICKER':
        accept = msg.get('accept', '')
        title  = msg.get('title', 'Select file')
        path = open_file_picker(accept, title)
        if path:
            try:
                data_url = file_to_data_url(path)
                reply_ok(path=path, name=os.path.basename(path), dataUrl=data_url)
            except Exception as e:
                reply_err(str(e))
        else:
            reply_ok(path=None, name=None, dataUrl=None)   # user cancelled

    elif msg_type == 'SAVE_FILE_PICKER':
        accept = msg.get('accept', 'json')
        title = msg.get('title', 'Choose file')
        default_name = msg.get('defaultName', 'cyrune-portal.json')
        path = save_file_picker(accept, title, default_name)
        if path:
            reply_ok(path=path, name=os.path.basename(path))
        else:
            reply_ok(path=None, name=None)

    elif msg_type == 'LIST_DIR':
        path = msg.get('path', '')
        ext  = msg.get('ext', '')
        try:
            if not os.path.isdir(path):
                reply_ok(files=[])
            else:
                files = [f for f in os.listdir(path)
                         if os.path.isfile(os.path.join(path, f))
                         and (not ext or f.endswith(ext))]
                reply_ok(files=sorted(files))
        except Exception as e:
            reply_err(str(e))

    else:
        reply_err(f'Unknown message type: {msg_type}')


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def authorize_catalogue_portal_page(page_url):
    parsed = urllib.parse.urlsplit(page_url)
    if parsed.scheme != 'file' or parsed.netloc not in {'', 'localhost'} or parsed.query or parsed.fragment:
        return False
    path = urllib.request.url2pathname(parsed.path)
    if sys.platform == 'win32' and re.match(r'^/[a-zA-Z]:[\\/]', path):
        path = path[1:]
    expected = os.path.join(CYRUNE_REPO_ROOT, 'Portal', 'index.html')
    return os.path.normcase(os.path.realpath(path)) == os.path.normcase(os.path.realpath(expected))


def catalogue_protocol_supported():
    if type(HOST_PROTOCOLS.get('arcade-catalogue')) is not int or HOST_PROTOCOLS['arcade-catalogue'] != 1:
        return False
    root, _service = _configured_emugui_service()
    manifest = _catalogue_binding_module().read_object(Path(root) / 'component.json', 65536)
    version = manifest.get('protocols', {}).get('arcade-catalogue')
    return type(version) is int and version == 1


def scummvm_protocol_supported():
    if type(HOST_PROTOCOLS.get('arcade-scummvm')) is not int or HOST_PROTOCOLS['arcade-scummvm'] != 1:
        return False
    root, _service = _configured_emugui_service()
    manifest = _catalogue_binding_module().read_object(Path(root) / 'component.json', 65536)
    version = manifest.get('protocols', {}).get('arcade-scummvm')
    return type(version) is int and version == 1 and getattr(_load_emugui_module(), 'ARCADE_SCUMMVM_VERSION', None) == 1


def atari_protocol_supported():
    if type(HOST_PROTOCOLS.get('arcade-atari-st')) is not int or HOST_PROTOCOLS['arcade-atari-st'] != 1:
        return False
    root, _service = _configured_emugui_service()
    manifest = _catalogue_binding_module().read_object(Path(root) / 'component.json', 65536)
    version = manifest.get('protocols', {}).get('arcade-atari-st')
    return type(version) is int and version == 1 and getattr(_load_emugui_module(), 'ARCADE_ATARI_VERSION', None) == 1


def gameboy_protocol_supported():
    if type(HOST_PROTOCOLS.get('arcade-gameboy')) is not int or HOST_PROTOCOLS['arcade-gameboy'] != 1:
        return False
    root, _service = _configured_emugui_service()
    manifest = _catalogue_binding_module().read_object(Path(root) / 'component.json', 65536)
    version = manifest.get('protocols', {}).get('arcade-gameboy')
    return type(version) is int and version == 1 and getattr(_load_emugui_module(), 'ARCADE_GAMEBOY_VERSION', None) == 1


def get_catalogue_transport():
    global CATALOGUE_TRANSPORT
    if CATALOGUE_TRANSPORT is None:
        name = '_cyrune_host_catalogue_transport'
        if name not in sys.modules:
            spec = importlib.util.spec_from_file_location(name, Path(HOST_DIR) / 'catalogue_transport.py')
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
        CATALOGUE_TRANSPORT = sys.modules[name].CatalogueTransport(
            bindings=get_catalogue_bindings,
            service=lambda: _load_emugui_module().get_catalogue_service(),
            resolve=lambda identifier, revision: _load_emugui_module().resolve_catalogue_launch_plan(identifier, revision),
            supported=catalogue_protocol_supported, authorize_page=authorize_catalogue_portal_page,
            supported_scummvm=scummvm_protocol_supported, supported_atari=atari_protocol_supported, supported_gameboy=gameboy_protocol_supported,
            read_scope=lambda: _load_emugui_module().catalogue_read_snapshot(),
            module=_catalogue_binding_module())
    return CATALOGUE_TRANSPORT


def serve_catalogue_connection(first_message):
    """Dedicated persistent connection; EOF revokes in-flight binding authority."""
    transport = get_catalogue_transport()
    pending = queue.Queue(maxsize=4)
    stopped = threading.Event()

    def read_requests():
        try:
            while not stopped.is_set():
                message = read_message(max_bytes=1024 * 1024)
                if message is None:
                    break
                # Relay sends only one native request at a time on this port.
                pending.put_nowait(message)
        except Exception:
            pass
        finally:
            transport.disconnect()
            stopped.set()

    reader = threading.Thread(target=read_requests, daemon=True)
    reader.start()
    message = first_message
    try:
        while not stopped.is_set():
            send_message(transport.handle(message))
            while not stopped.is_set():
                try:
                    message = pending.get(timeout=0.1)
                    break
                except queue.Empty:
                    continue
    finally:
        stopped.set()
        transport.disconnect()


def main():
    while True:
        msg = read_message()
        if msg is None:
            break
        if isinstance(msg, dict) and str(msg.get('type', '')).startswith('ARCADE_CATALOGUE_'):
            serve_catalogue_connection(msg)
            break
        try:
            handle(msg)
        except Exception as e:
            reply_err(f'Host error: {e}')


if __name__ == '__main__':
    main()
