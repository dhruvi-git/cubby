"""Storage backends for encrypted files. Files are encrypted BEFORE they get here,
so every backend only ever sees unreadable bytes."""
from functools import lru_cache
from pathlib import Path

from ..config import get_settings


class LocalStorage:
    name = "local"
    label = "This computer"

    def __init__(self) -> None:
        self.root = Path(get_settings().local_storage_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = self.root / key
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def put(self, key: str, data: bytes) -> None:
        self._path(key).write_bytes(data)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def health(self) -> bool:
        return self.root.exists()


class S3Storage:
    name = "s3"
    label = "AWS S3"

    def __init__(self) -> None:
        import boto3
        s = get_settings()
        if not s.s3_bucket:
            raise RuntimeError("S3_BUCKET is missing in .env.")
        self.bucket = s.s3_bucket
        self.client = boto3.client(
            "s3", region_name=s.aws_region,
            aws_access_key_id=s.aws_access_key_id or None,
            aws_secret_access_key=s.aws_secret_access_key or None,
        )

    def put(self, key: str, data: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data,
                               ServerSideEncryption="AES256")

    def get(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def health(self) -> bool:
        self.client.list_objects_v2(Bucket=self.bucket, MaxKeys=1)
        return True


class AzureBlobStorage:
    name = "azure"
    label = "Azure Blob Storage"

    def __init__(self) -> None:
        from azure.storage.blob import BlobServiceClient
        s = get_settings()
        if not s.azure_storage_connection_string:
            raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING is missing in .env.")
        service = BlobServiceClient.from_connection_string(s.azure_storage_connection_string)
        self.container = service.get_container_client(s.azure_blob_container)

    def put(self, key: str, data: bytes) -> None:
        self.container.upload_blob(key, data, overwrite=True)

    def get(self, key: str) -> bytes:
        return self.container.download_blob(key).readall()

    def delete(self, key: str) -> None:
        self.container.delete_blob(key, delete_snapshots="include")

    def health(self) -> bool:
        self.container.get_container_properties()
        return True


_BACKENDS = {"local": LocalStorage, "s3": S3Storage, "azure": AzureBlobStorage}


@lru_cache
def get_backend(name: str):
    if name not in _BACKENDS:
        raise RuntimeError(f"Unknown storage backend '{name}'")
    return _BACKENDS[name]()


class StorageManager:
    """Writes to the primary backend and (optionally) a backup copy."""

    def __init__(self) -> None:
        s = get_settings()
        self.primary = s.storage_primary
        self.backup = None if s.storage_backup in ("", "none") else s.storage_backup

    def save(self, key: str, data: bytes) -> list[str]:
        get_backend(self.primary).put(key, data)
        locations = [self.primary]
        if self.backup and self.backup != self.primary:
            try:
                get_backend(self.backup).put(key, data)
                locations.append(self.backup)
            except Exception as exc:  # backup failure must not block the upload
                print(f"[storage] backup to {self.backup} failed: {exc}")
        return locations

    def load(self, key: str, locations: list[str]) -> bytes:
        last_error: Exception | None = None
        for name in locations:  # primary first, then the backup copy
            try:
                return get_backend(name).get(key)
            except Exception as exc:
                last_error = exc
        raise RuntimeError(f"File unavailable in all locations: {last_error}")

    def delete(self, key: str, locations: list[str]) -> None:
        for name in locations:
            try:
                get_backend(name).delete(key)
            except Exception as exc:
                print(f"[storage] delete from {name} failed: {exc}")


def get_storage() -> StorageManager:
    return StorageManager()
