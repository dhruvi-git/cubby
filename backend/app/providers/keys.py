"""Key providers hold the MASTER key that protects each user's data key.

Separation of trust: files live on AWS (S3), the master key lives on Azure
(Key Vault). Our database only ever stores data keys in wrapped (encrypted) form.
"""
import base64
import os
from functools import lru_cache

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ..config import get_settings


class LocalKeyProvider:
    """Development only: master key comes from LOCAL_MASTER_KEY in .env."""
    name = "local"
    cloud = "This computer"

    def __init__(self) -> None:
        raw = get_settings().local_master_key
        if not raw:
            raise RuntimeError("LOCAL_MASTER_KEY is empty. Generate one (see docs/SETUP_GUIDE.md, Part 1).")
        self._key = base64.b64decode(raw)
        if len(self._key) != 32:
            raise RuntimeError("LOCAL_MASTER_KEY must decode to exactly 32 bytes.")

    def wrap(self, dek: bytes) -> bytes:
        nonce = os.urandom(12)
        return nonce + AESGCM(self._key).encrypt(nonce, dek, b"cubby-dek")

    def unwrap(self, wrapped: bytes) -> bytes:
        return AESGCM(self._key).decrypt(wrapped[:12], wrapped[12:], b"cubby-dek")

    def health(self) -> bool:
        return True


class AzureKeyVaultProvider:
    """Wraps/unwraps data keys with an RSA key that never leaves Azure Key Vault."""
    name = "azure"
    cloud = "Azure Key Vault"

    def __init__(self) -> None:
        from azure.identity import ClientSecretCredential
        from azure.keyvault.keys import KeyClient
        from azure.keyvault.keys.crypto import CryptographyClient

        s = get_settings()
        if not (s.azure_key_vault_url and s.azure_tenant_id and s.azure_client_id and s.azure_client_secret):
            raise RuntimeError("Azure Key Vault settings are missing in .env.")
        cred = ClientSecretCredential(s.azure_tenant_id, s.azure_client_id, s.azure_client_secret)
        self._keys = KeyClient(vault_url=s.azure_key_vault_url, credential=cred)
        key = self._keys.get_key(s.azure_key_name)
        self._crypto = CryptographyClient(key, credential=cred)
        self._key_name = s.azure_key_name

    def wrap(self, dek: bytes) -> bytes:
        from azure.keyvault.keys.crypto import KeyWrapAlgorithm
        return self._crypto.wrap_key(KeyWrapAlgorithm.rsa_oaep_256, dek).encrypted_key

    def unwrap(self, wrapped: bytes) -> bytes:
        from azure.keyvault.keys.crypto import KeyWrapAlgorithm
        return self._crypto.unwrap_key(KeyWrapAlgorithm.rsa_oaep_256, wrapped).key

    def health(self) -> bool:
        self._keys.get_key(self._key_name)
        return True


_PROVIDERS = {"local": LocalKeyProvider, "azure": AzureKeyVaultProvider}


@lru_cache
def get_key_provider(name: str | None = None):
    name = name or get_settings().key_provider
    if name not in _PROVIDERS:
        raise RuntimeError(f"Unknown KEY_PROVIDER '{name}'")
    return _PROVIDERS[name]()
