"""A small in-process cache with an expiry and a size cap.

The server runs on a 512 MB instance, and several lookups are cached by an
id taken from the request (any TMDB id can be asked for), so a plain dict
would grow with every id anyone tries. Past `max_size` entries the one
stored longest ago is dropped."""
import threading
import time
from collections import OrderedDict

MISSING = object()


class TTLCache:
    def __init__(self, ttl, max_size):
        self.ttl, self.max_size = ttl, max_size
        self._data = OrderedDict()  # key -> (stored at, value), oldest first
        self._lock = threading.Lock()

    def get(self, key, default=MISSING):
        with self._lock:
            hit = self._data.get(key)
            if hit is None:
                return default
            if time.time() - hit[0] >= self.ttl:
                del self._data[key]
                return default
            return hit[1]

    def set(self, key, value):
        with self._lock:
            self._data.pop(key, None)
            self._data[key] = (time.time(), value)
            while len(self._data) > self.max_size:
                self._data.popitem(last=False)

    def __len__(self):
        return len(self._data)
