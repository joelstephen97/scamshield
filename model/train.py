"""Train the ScamShield phishing-URL classifier and export to ONNX.

Feature order MUST match engine/constants.js FEATURE_NAMES exactly.
Default data: model/data/sample.csv (url,label).

NOTE: model/data/sample.csv is a SYNTHETIC seed set (hand-crafted legit/
phishing strings with hard negatives and positives). It exists so the
pipeline is reproducible and the parity guard has fixtures; it is NOT a
production-grade corpus. To train on real data, swap it in with
`--data path/to/urls.csv` where the CSV has the same `url,label` columns
(label 0 = legit, 1 = phishing). Holdout metrics below are only as
trustworthy as the data they are computed on.
"""
import argparse, math, re
from urllib.parse import urlparse
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
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

def build_clf(n):
    """Fresh CalibratedClassifierCV(RandomForest) sized for n training rows."""
    base=RandomForestClassifier(n_estimators=120,max_depth=8,random_state=42)
    return CalibratedClassifierCV(base,cv=3 if n>=30 else 2)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--data',default='model/data/sample.csv')
    ap.add_argument('--out',default='model/phishing-url.onnx')
    a=ap.parse_args()
    df=pd.read_csv(a.data)
    X=np.array([features(u) for u in df['url']],dtype=np.float32)
    y=df['label'].astype(int).values

    # --- Honest holdout evaluation: stratified 75/25 split ---
    X_tr,X_te,y_tr,y_te=train_test_split(X,y,test_size=0.25,stratify=y,random_state=42)
    eval_clf=build_clf(len(X_tr))
    eval_clf.fit(X_tr,y_tr)
    y_pred=eval_clf.predict(X_te)
    y_proba=eval_clf.predict_proba(X_te)[:,1]
    print(f'Holdout evaluation (test_size=0.25, stratified, n_test={len(y_te)}):')
    print(classification_report(y_te,y_pred,target_names=['legit','phishing'],digits=3))
    print('Confusion matrix [rows=true 0/1, cols=pred 0/1]:')
    print(confusion_matrix(y_te,y_pred))
    auc=roc_auc_score(y_te,y_proba)
    acc=(y_pred==y_te).mean()
    from sklearn.metrics import precision_score,recall_score,f1_score
    prec=precision_score(y_te,y_pred,zero_division=0)
    rec=recall_score(y_te,y_pred,zero_division=0)
    f1=f1_score(y_te,y_pred,zero_division=0)
    print(f'ROC-AUC (holdout): {auc:.3f}')

    # --- Ship a model trained on ALL rows (uses every labelled example) ---
    clf=build_clf(len(X))
    clf.fit(X,y)
    onx=to_onnx(clf,initial_types=[('input',FloatTensorType([None,len(FEATURE_NAMES)]))],
                options={'zipmap':False})
    blob=onx.SerializeToString()
    with open(a.out,'wb') as fh: fh.write(blob)
    print(f'Wrote {a.out} ({len(blob)} bytes).')
    print(f'Holdout: acc={acc:.3f} precision={prec:.3f} recall={rec:.3f} '
          f'f1={f1:.3f} auc={auc:.3f} | shipped model trained on {len(df)} rows.')

if __name__=='__main__': main()
