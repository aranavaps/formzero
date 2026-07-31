import urllib.request
import urllib.parse
import json

url = 'https://formzero-six.vercel.app/api/v1/auth/debug-supabase?email=test5@example.com'
req = urllib.request.Request(url, method='POST')

try:
    response = urllib.request.urlopen(req)
    print("Success:", response.read().decode())
except Exception as e:
    print("Error:", e.read().decode() if hasattr(e, 'read') else str(e))
