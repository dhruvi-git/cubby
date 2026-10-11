def describe(ua: str) -> str:
    browser = ("Edge" if "Edg/" in ua else "Chrome" if "Chrome/" in ua else "Firefox" if "Firefox/" in ua
               else "Safari" if "Safari/" in ua else "Unknown browser")
    os_ = ("Windows" if "Windows" in ua else "macOS" if "Mac OS" in ua else "Android" if "Android" in ua
           else "iOS" if ("iPhone" in ua or "iPad" in ua) else "Linux" if "Linux" in ua else "")
    return f"{browser} on {os_}" if os_ else browser
