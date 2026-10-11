"""Prints fresh random secrets to paste into your .env file.

Run:  python scripts/make_secrets.py
"""
import base64
import os
import secrets

print("Copy these three lines into backend/.env (replace the empty ones):\n")
print(f"APP_SECRET={secrets.token_urlsafe(48)}")
print(f"CRON_SECRET={secrets.token_urlsafe(32)}")
print(f"LOCAL_MASTER_KEY={base64.b64encode(os.urandom(32)).decode()}")
