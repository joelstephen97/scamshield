"""Train the ScamShield phishing-URL classifier and export to ONNX.

Feature order MUST match engine/constants.js FEATURE_NAMES exactly.
Default data: model/data/sample.csv (url,label). To use a full dataset,
point --data at any CSV with the same two columns.
"""
import argparse, math, re
from urllib.parse import urlparse
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from skl2onnx import to_onnx
from skl2onnx.common.data_types import FloatTensorType

FEATURE_NAMES = [
    'url_length','host_length','path_length','num_dots_host','num_subdomains',
    'num_hyphens_host','num_digits_host','digit_ratio_host','has_at_symbol',
    'has_ip_host','has_punycode','is_https','num_query_params','suspicious_tld',
    'suspicious_token_count','host_entropy','brand_lookalike'
]
POPULAR_BRANDS = ['paypal','google','apple','microsoft','amazon','facebook','instagram',
    'netflix','whatsapp','binance','coinbase','metamask','dbs','maybank','wise',
    'revolut','linkedin','outlook','gmail']
SUSPICIOUS_TLDS = ['zip','mov','xyz','top','club','click','link','gq','cf','tk','ml',
    'ga','work','support','rest','country','kim']
SUSPICIOUS_TOKENS = ['login','signin','verify','verification','account','secure','update',
    'confirm','bank','wallet','free','win','winner','gift','prize','bonus','claim',
    'unlock','suspended','limited','security']
IP_RE = re.compile(r'^(\d{1,3}\.){3}\d{1,3}$')

def entropy(s):
    if not s: return 0.0
    from collections import Counter
    n = len(s)
    return -sum((c/n) * math.log2(c/n) for c in Counter(s).values())

def deglyph(s):
    s = s.lower()
    for a,b in [('1','i'),('l','i'),('|','i'),('0','o'),('5','s'),('3','e'),('$','s')]:
        s = s.replace(a,b)
    return re.sub(r'[^a-z]','',s)

def lev(a,b):
    if abs(len(a)-len(b))>2: return 3
    m,n=len(a),len(b); dp=list(range(n+1))
    for i in range(1,m+1):
        prev=dp[0]; dp[0]=i
        for j in range(1,n+1):
            cur=dp[j]
            dp[j]=min(dp[j]+1,dp[j-1]+1,prev+(0 if a[i-1]==b[j-1] else 1))
            prev=cur
    return dp[n]

def brand_lookalike(host):
    labels=host.split('.'); sld=labels[-2] if len(labels)>=2 else host
    if sld in POPULAR_BRANDS: return 0
    cands=[sld,deglyph(sld)]+[deglyph(x) for x in labels]
    for brand in POPULAR_BRANDS:
        db=deglyph(brand)
        for c in cands:
            if c==db and sld!=brand: return 1
            if len(db)>=5 and db in c and sld!=brand: return 1
            if lev(c,db)==1: return 1
    return 0

def features(url):
    s=str(url);
    try: u=urlparse(s); host=(u.hostname or '').lower(); path=u.path or ''
    except Exception: host=re.sub(r'^[a-z]+://','',s).split('/')[0].lower(); path=''
    digits=sum(ch.isdigit() for ch in host); low=s.lower()
    tld=host.split('.')[-1] if '.' in host else ''
    f={
        'url_length':len(s),'host_length':len(host),'path_length':len(path),
        'num_dots_host':host.count('.'),
        'num_subdomains':0 if IP_RE.match(host) else max(0,len(host.split('.'))-2),
        'num_hyphens_host':host.count('-'),'num_digits_host':digits,
        'digit_ratio_host':digits/len(host) if host else 0,
        'has_at_symbol':1 if '@' in s else 0,'has_ip_host':1 if IP_RE.match(host) else 0,
        'has_punycode':1 if 'xn--' in host else 0,'is_https':1 if s.lower().startswith('https:') else 0,
        'num_query_params':len(urlparse(s).query.split('&')) if urlparse(s).query else 0,
        'suspicious_tld':1 if tld in SUSPICIOUS_TLDS else 0,
        'suspicious_token_count':sum(1 for t in SUSPICIOUS_TOKENS if t in low),
        'host_entropy':round(entropy(host),4),'brand_lookalike':brand_lookalike(host),
    }
    return [f[name] for name in FEATURE_NAMES]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--data',default='model/data/sample.csv')
    ap.add_argument('--out',default='model/phishing-url.onnx')
    a=ap.parse_args()
    df=pd.read_csv(a.data)
    X=np.array([features(u) for u in df['url']],dtype=np.float32)
    y=df['label'].astype(int).values
    base=RandomForestClassifier(n_estimators=120,max_depth=8,random_state=42)
    clf=CalibratedClassifierCV(base,cv=3 if len(df)>=30 else 2)
    clf.fit(X,y)
    onx=to_onnx(clf,initial_types=[('input',FloatTensorType([None,len(FEATURE_NAMES)]))],
                options={'zipmap':False})
    with open(a.out,'wb') as fh: fh.write(onx.SerializeToString())
    print(f'Wrote {a.out} ({len(onx.SerializeToString())} bytes). Train acc='
          f'{clf.score(X,y):.3f} on {len(df)} rows.')

if __name__=='__main__': main()
