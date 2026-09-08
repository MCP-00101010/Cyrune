"""Read-only index lease: reuse checked parents, then reject directory changes.

This never grants launch or write authority. Those operations resolve exact paths
again using ConfinedRoot and their own file/signature validation.
"""
from pathlib import Path
import stat
from arcade_core.paths import ConfinedRoot, PathConfinementError


class IndexPaths(ConfinedRoot):
    def __init__(self, root):
        super().__init__(Path(root))
        self.parents = {}

    def __enter__(self):
        return self

    @staticmethod
    def signature(path):
        value = path.stat()
        return value.st_dev, value.st_ino, value.st_mtime_ns

    def __exit__(self, kind, _value, _traceback):
        if kind is None:
            for relative, (path, signature) in self.parents.items():
                if super().resolve(relative, require_exists=True) != path or self.signature(path) != signature:
                    raise ValueError('A library directory changed during indexing. Rebuild the index again.')

    def resolve(self, value, *, require_exists=False):
        text = str(value or '').strip()
        relative = Path(text)
        if not text or '\x00' in text or relative.is_absolute():
            raise PathConfinementError('Path is empty or invalid')
        if '..' in relative.parts or not relative.name:
            return super().resolve(value, require_exists=require_exists)
        parent = str(relative.parent)
        if parent not in self.parents:
            checked = super().resolve(parent, require_exists=True)
            self.parents[parent] = (checked, self.signature(checked))
        target = self.parents[parent][0] / relative.name
        try:
            info = target.lstat()
        except FileNotFoundError:
            if require_exists:
                raise
            return target
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            return super().resolve(value, require_exists=require_exists)
        return target
