"""Native save-disk session leases and private STEem INI preparation."""
from contextlib import contextmanager
import configparser
import ctypes
from ctypes import wintypes
import hashlib
import io
import json
import os
from pathlib import Path


def process_identity(pid):
    if os.name != 'nt':
        try:
            return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[19]
        except FileNotFoundError:
            return None
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    kernel.GetProcessTimes.argtypes = [wintypes.HANDLE, *([ctypes.POINTER(wintypes.FILETIME)] * 4)]
    handle = kernel.OpenProcess(0x1000, False, pid)
    if not handle:
        if ctypes.get_last_error() == 87:
            return None
        raise ValueError('Cannot verify the previous emulator session')
    try:
        code = wintypes.DWORD()
        if not kernel.GetExitCodeProcess(handle, ctypes.byref(code)):
            raise ValueError('Cannot verify the previous emulator session')
        if code.value != 259:
            return None
        times = [wintypes.FILETIME() for _ in range(4)]
        if not kernel.GetProcessTimes(handle, *(ctypes.byref(t) for t in times)):
            raise ValueError('Cannot verify the previous emulator session')
        return str((times[0].dwHighDateTime << 32) | times[0].dwLowDateTime)
    finally:
        kernel.CloseHandle(handle)


def ini_bytes(path, adapter='steem'):
    with path.open('rb') as stream:
        raw = stream.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise ValueError('Emulator profile is too large')
    try:
        text = raw.decode('utf-8-sig')
        encoding = 'utf-8-sig' if raw.startswith(b'\xef\xbb\xbf') else 'utf-8'
    except UnicodeDecodeError:
        text = raw.decode('cp1252')
        encoding = 'cp1252'
    ini = configparser.ConfigParser(interpolation=None, strict=False)
    ini.optionxform = str
    ini.read_string(text)
    overrides = {'Disks': {'AutoInsert2':'0', 'Disk_A_Path':'', 'Disk_A_Name':'', 'Disk_A_DiskInZip':'',
        'Disk_B_Path':'', 'Disk_B_Name':'', 'Disk_B_DiskInZip':'', 'NumFloppyDrives':'2', 'EjectDisksWhenQuit':'1'},
        'Options': {'AutoLoadSnapShot':'0', 'AutoSaveSnapShot':'0'}}
    if adapter == 'hatari':
        overrides = {'Floppy': {'bAutoInsertDiskB': 'FALSE', 'szDiskAFileName': '', 'szDiskBFileName': '',
            'szDiskAZipPath': '', 'szDiskBZipPath': '', 'EnableDriveA': 'TRUE', 'EnableDriveB': 'TRUE'},
            'Memory': {'bAutoSave': 'FALSE'}, 'HardDisk': {'bBootFromHardDisk': 'FALSE'}}
    for section, values in overrides.items():
        actual = next((s for s in ini.sections() if s.casefold() == section.casefold()), section)
        if not ini.has_section(actual):
            ini.add_section(actual)
        for key, value in values.items():
            for old in list(ini[actual]):
                if old.casefold() == key.casefold():
                    ini.remove_option(actual, old)
            ini.set(actual, key, value)
    stream = io.StringIO()
    ini.write(stream, space_around_delimiters=False)
    return stream.getvalue().encode(encoding)


class SaveSessions:
    def __init__(self, runtime, lock, write_json, write_bytes, backup):
        self.root = Path(runtime).resolve() / 'save-sessions'
        self.lock, self.write_json, self.write_bytes, self.backup = lock, write_json, write_bytes, backup

    def resource(self, path):
        key = hashlib.sha256(str(path.resolve()).casefold().encode()).hexdigest()
        return self.root / (key + '.json')

    @contextmanager
    def access(self, folder, game_id, save_disk=None):
        from contextlib import ExitStack
        paths = [Path(folder) / '.sessions' / game_id]
        if save_disk:
            paths.append(Path(save_disk))
        records = sorted({self.resource(p) for p in paths})
        self.root.mkdir(parents=True, exist_ok=True)
        with ExitStack() as stack:
            for path in records:
                stack.enter_context(self.lock(path))
                if path.exists():
                    data = json.loads(path.read_text(encoding='utf-8'))
                    if set(data) != {'pid','identity','phase'} or type(data['pid']) is not int or data['pid'] <= 0 or not isinstance(data['identity'], str) or not data['identity'] or data['phase'] not in {'starting', 'running'}:
                        raise ValueError('Save-disk session state needs review')
                    if data['phase'] == 'starting':
                        raise ValueError('An interrupted emulator start needs review before this save disk can be reused')
                    if process_identity(data['pid']) == data['identity']:
                        raise ValueError('This game or save disk is already in use. Close that emulator session first')
            yield records

    def launch(self, plan, start):
        settings = plan['settings']
        session = Path(settings['sessionDirectory'])
        save = Path(settings['saveDisk']) if settings['saveDisk'] else None
        with self.access(session.parent.parent, plan['gameId'], save) as records:
            if save:
                self.backup(save)
            # Only this launch copy is handed to the emulator. Its preferences/history
            # writes must never modify the user's original named configuration.
            adapter = plan['adapterId']
            self.write_bytes(session / ('launch.cfg' if adapter == 'hatari' else 'launch.ini'),
                             ini_bytes(Path(settings['profile']), adapter))
            starting = {'pid': os.getpid(), 'identity': process_identity(os.getpid()), 'phase': 'starting'}
            for path in records:
                self.write_json(path, starting)
            try:
                process = start()
            except Exception:
                for path in records:
                    path.unlink(missing_ok=True)
                raise
            identity = process_identity(process.pid)
            if identity is None:
                for path in records:
                    path.unlink(missing_ok=True)
                raise ValueError('The emulator exited before the save-disk session could be recorded')
            running = {'pid': process.pid, 'identity': identity, 'phase': 'running'}
            for path in records:
                self.write_json(path, running)
            return process
