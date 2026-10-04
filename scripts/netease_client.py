import base64, ctypes, json, pathlib, sqlite3, secrets
import requests
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import padding

def dpapi(data):
    class Blob(ctypes.Structure):
        _fields_ = [('size', ctypes.c_ulong), ('data', ctypes.POINTER(ctypes.c_char))]
    buf = ctypes.create_string_buffer(data)
    src = Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    dst = Blob()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(src), None, None, None, None, 0, ctypes.byref(dst)):
        raise RuntimeError('Existing desktop session could not be unlocked by this Windows user')
    try:
        return ctypes.string_at(dst.data, dst.size)
    finally:
        ctypes.windll.kernel32.LocalFree(dst.data)

def desktop_session(profile=None):
    root = pathlib.Path(profile) if profile else pathlib.Path.home() / 'AppData/Local/Netease/CloudMusic/webapp91x64'
    prefs = json.loads((root/'LocalPrefs.json').read_text())
    key = dpapi(base64.b64decode(prefs['os_crypt']['encrypted_key'])[5:])
    db = sqlite3.connect('file:'+str(root/'Cookies')+'?mode=ro', uri=True)
    sess = requests.Session()
    sess.headers.update({'Referer':'https://music.163.com', 'User-Agent':'Mozilla/5.0'})
    for host, name, value, encrypted in db.execute('select host_key,name,value,encrypted_value from cookies where host_key like ?', ('%music.163.com%',)):
        if encrypted:
            if encrypted[:3] in (b'v10',b'v11'):
                plain = AESGCM(key).decrypt(encrypted[3:15],encrypted[15:],None)
                value = plain.decode()
            else:
                value = dpapi(encrypted).decode()
        sess.cookies.set(name,value,domain=host,path='/')
    db.close()
    return sess

def weapi(sess,path,data):
    data['csrf_token'] = sess.cookies.get_dict().get('__csrf','')
    modulus = int('00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7',16)
    key = ''.join(secrets.choice('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') for _ in range(16)).encode()
    def encrypt(value,key):
        pad = padding.PKCS7(128).padder()
        padded=pad.update(value)+pad.finalize()
        enc=Cipher(algorithms.AES(key),modes.CBC(b'0102030405060708')).encryptor()
        return base64.b64encode(enc.update(padded)+enc.finalize())
    payload=encrypt(encrypt(json.dumps(data,separators=(',',':')).encode(),b'0CoJUm6Qyw8W8jud'),key)
    rsa=format(pow(int.from_bytes(key[::-1],'big'),65537,modulus),'0256x')
    r=sess.post('https://music.163.com'+path,data={'params':payload.decode(),'encSecKey':rsa},timeout=30)
    r.raise_for_status()
    return r.json()

