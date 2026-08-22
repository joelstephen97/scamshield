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
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from skl2onnx import to_onnx
from skl2onnx.common.data_types import FloatTensorType
import json, pathlib

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
    'ga','work','support','rest','country','kim','pw','cc','ws','icu','buzz']
SUSPICIOUS_TOKENS = ['login','signin','verify','verification','account','secure','update',
    'confirm','bank','wallet','free','win','winner','gift','prize','bonus','claim',
    'unlock','suspended','limited','security']
IP_RE = re.compile(r'^(\d{1,3}\.){3}\d{1,3}$')

# Mirrors engine/constants.js MULTI_LABEL_SUFFIXES — keep in sync.
MULTI_LABEL_SUFFIXES = {
    'co.uk','org.uk','me.uk','net.uk','ltd.uk','plc.uk','ac.uk','gov.uk','sch.uk','nhs.uk',
    'co.jp','ne.jp','or.jp','ac.jp','go.jp',
    'com.sg','edu.sg','gov.sg','net.sg','org.sg',
    'com.au','net.au','org.au','edu.au','gov.au','id.au',
    'com.my','net.my','org.my','edu.my','gov.my',
    'co.in','net.in','org.in','ac.in','edu.in','gov.in','res.in',
    'com.br','net.br','org.br','gov.br','edu.br',
    'com.mx','org.mx','gob.mx','edu.mx',
    'co.nz','net.nz','org.nz','govt.nz','ac.nz',
    'com.tr','net.tr','org.tr','gov.tr','edu.tr',
    'com.hk','net.hk','org.hk','edu.hk','gov.hk',
    'co.kr','ne.kr','or.kr','go.kr','ac.kr',
    'com.tw','net.tw','org.tw','edu.tw','gov.tw',
    'co.za','net.za','org.za','gov.za','ac.za',
    'com.ar','net.ar','org.ar','gob.ar','edu.ar',
    'com.sa','net.sa','org.sa','gov.sa','edu.sa',
    'com.eg','net.eg','org.eg','gov.eg','edu.eg',
    'co.th','in.th','or.th','ac.th','go.th',
    'com.ph','net.ph','org.ph','gov.ph','edu.ph',
    'com.vn','net.vn','org.vn','gov.vn','edu.vn',
    'co.id','com.cn','net.cn','org.cn','gov.cn','edu.cn',
    'com.pk','com.bd','com.ng','co.ke',
    'co.il','org.il','ac.il','gov.il',
    'com.ua','com.co','com.pe','com.cl','com.ec','com.uy',
    'com.ve','co.ve','com.do','com.gt','co.cr','com.pa','com.py','com.bo',
    'com.kw','com.qa','com.bh','com.om','com.jo','com.lb',
    'com.lk','com.np','com.kh','com.mm',
}

# Mirrors engine/constants.js BRAND_DOMAINS (all BRANDS entries, flattened into
# KNOWN_BRAND_REGISTRABLES). POPULAR_BRANDS above stays the original 19 — only
# KNOWN_BRAND_REGISTRABLES (used to zero out brand_lookalike on legit domains)
# grows with the new brands.
BRAND_DOMAINS = {
    'paypal': ['paypal.com'], 'google': ['google.com','gmail.com','youtube.com','googleapis.com','gstatic.com'],
    'apple': ['apple.com','icloud.com'],
    'microsoft': ['microsoft.com','live.com','office.com','outlook.com',
        'microsoftonline.com','office365.com','azure.com','sharepoint.com',
        'onedrive.com','msftauth.net','msauth.net','hotmail.com'],
    'amazon': ['amazon.com','amazon.ae','amazon.co.uk','amazon.de','amazon.fr',
        'amazon.it','amazon.es','amazon.nl','amazon.ca','amazon.in','amazon.sg',
        'amazon.sa','amazon.eg','amazon.com.au','amazon.com.br','amazon.com.mx',
        'amazon.com.tr','amazon.co.jp','primevideo.com','media-amazon.com'],
    'facebook': ['facebook.com','fb.com','fbcdn.net'], 'instagram': ['instagram.com','cdninstagram.com'],
    'netflix': ['netflix.com','nflxext.com'],
    'whatsapp': ['whatsapp.com','whatsapp.net'], 'binance': ['binance.com'],
    'coinbase': ['coinbase.com'], 'metamask': ['metamask.io'],
    'dbs': ['dbs.com.sg','dbs.com','posb.com.sg'],
    'maybank': ['maybank2u.com.my','maybank.com'], 'wise': ['wise.com'], 'revolut': ['revolut.com'],
    'linkedin': ['linkedin.com','licdn.com'], 'outlook': ['outlook.com','live.com','hotmail.com'],
    'gmail': ['gmail.com','google.com'],
    'telegram': ['telegram.org','telegram.me','t.me'],
    'steam': ['steampowered.com','steamcommunity.com'],
    'roblox': ['roblox.com','rbxcdn.com'],
    'dhl': ['dhl.com','dhl.de'],
    'fedex': ['fedex.com'],
    'usps': ['usps.com'],
    'ups': ['ups.com'],
    'docusign': ['docusign.com','docusign.net'],
    'dropbox': ['dropbox.com'],
    'adobe': ['adobe.com','adobelogin.com'],
    'spotify': ['spotify.com','scdn.co'],
    'chase': ['chase.com','jpmorgan.com'],
    'wellsfargo': ['wellsfargo.com'],
    'bankofamerica': ['bankofamerica.com','bofa.com'],
    'citi': ['citi.com','citibank.com','citibank.ae'],
    'hsbc': ['hsbc.com','hsbc.ae','hsbc.co.uk','hsbc.com.sg','hsbc.com.hk'],
    'barclays': ['barclays.co.uk','barclays.com'],
    'santander': ['santander.com','santander.co.uk','santander.es'],
    'ing': ['ing.com','ing.nl','ing.be'],
    'sbi': ['sbi.co.in','onlinesbi.sbi','onlinesbi.com'],
    'hdfc': ['hdfcbank.com','hdfc.com'],
    'icici': ['icicibank.com'],
    'emiratesnbd': ['emiratesnbd.com'],
    'adcb': ['adcb.com'],
    'fab': ['bankfab.com','fab.ae'],
    'mashreq': ['mashreq.com','mashreqbank.com'],
    'rakbank': ['rakbank.ae'],
    'dib': ['dib.ae'],
    'etisalat': ['etisalat.ae','eand.com','eandme.ae'],
    'du': ['du.ae'],
    'noon': ['noon.com'],
    'aramex': ['aramex.com'],
    'talabat': ['talabat.com'],
    'careem': ['careem.com'],
    'adnoc': ['adnoc.ae','adnocdistribution.ae'],
    'dewa': ['dewa.gov.ae'],
    'icp': ['icp.gov.ae'],
    'mohre': ['mohre.gov.ae'],
    'dubaipolice': ['dubaipolice.gov.ae'],
    'uaepass': ['uaepass.ae'],
    'emirates': ['emirates.com'],
    'etihad': ['etihad.com'],
    'shopee': ['shopee.sg','shopee.com.my','shopee.co.id','shopee.ph','shopee.com'],
    'lazada': ['lazada.sg','lazada.com.my','lazada.com','lazada.co.th'],
    'grab': ['grab.com'],
}
KNOWN_BRAND_REGISTRABLES = {d for ds in BRAND_DOMAINS.values() for d in ds}

def registrable_parts(host):
    """Mirrors engine/constants.js registrableParts (approximate eTLD+1)."""
    h = str(host or '').lower().rstrip('.')
    labels = [x for x in h.split('.') if x]
    if IP_RE.match(h) or len(labels) <= 1:
        return h, h, ''
    last_two = '.'.join(labels[-2:])
    if last_two in MULTI_LABEL_SUFFIXES and len(labels) >= 3:
        return '.'.join(labels[-3:]), labels[-3], last_two
    return last_two, labels[-2], labels[-1]

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
    """Mirrors engine/features.js isBrandLookalike (0.3.1 semantics)."""
    domain, sld, suffix = registrable_parts(host)
    if not suffix: return 0
    if domain in KNOWN_BRAND_REGISTRABLES: return 0
    if sld in POPULAR_BRANDS:
        return 1 if suffix.split('.')[-1] in SUSPICIOUS_TLDS else 0
    cands=[sld,deglyph(sld)]
    labels=[x for x in host.lower().split('.') if x]
    sub_labels=labels[:max(0,len(labels)-len(domain.split('.')))]
    for brand in POPULAR_BRANDS:
        db=deglyph(brand)
        for c in cands:
            if c==db: return 1
            if len(db)>=5 and db in c: return 1
            if lev(c,db)==1: return 1
        for lab in sub_labels:
            if len(db)>=5 and db in deglyph(lab): return 1
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
        'suspicious_token_count':(lambda toks: sum(1 for t in SUSPICIOUS_TOKENS if t in toks))(
            set(re.split(r'[^a-z0-9]+', low))),
        'host_entropy':round(entropy(host),4),'brand_lookalike':brand_lookalike(host),
    }
    return [f[name] for name in FEATURE_NAMES]

def build_clf():
    """Gradient-boosted trees: well-calibrated log-loss output, tiny JSON export."""
    return HistGradientBoostingClassifier(
        max_iter=300, max_leaf_nodes=15, learning_rate=0.1, early_stopping=True,
        validation_fraction=0.1, n_iter_no_change=20, random_state=42)

def export_json(clf, out_path):
    """Walk sklearn's internal predictors into the engine/url_model.js node format:
    [featureIdx, threshold, left, right, value, missingLeft]; leaf ⇔ left == -1."""
    trees = []
    for stage in clf._predictors:            # binary: one predictor per iteration
        pred = stage[0]
        nodes = []
        for n in pred.nodes:
            if n['is_leaf']:
                nodes.append([-1, 0.0, -1, -1, float(n['value']), 0])
            else:
                nodes.append([int(n['feature_idx']), float(n['num_threshold']),
                              int(n['left']), int(n['right']), 0.0,
                              1 if bool(n['missing_go_to_left']) else 0])
        trees.append({'nodes': nodes})
    baseline = float(clf._baseline_prediction.ravel()[0])
    model = {'version': 2, 'features': FEATURE_NAMES, 'baseline': baseline, 'trees': trees}
    pathlib.Path(out_path).write_text(json.dumps(model, separators=(',', ':')))
    return model

def _patch_skl2onnx_hgb_bool_bug():
    """skl2onnx 1.20's HistGradientBoosting tree converter forwards sklearn's
    numpy.bool_ `missing_go_to_left` straight through as the ONNX
    `nodes_missing_value_tracks_true` attribute; onnx (INTS field) rejects a
    literal bool ('Expected an int, got a boolean'). Coerce to int at the
    single call site (`add_node`, looked up dynamically from the module's
    globals, so patching the module attribute affects the existing internal
    caller). Artifact-only export (see main()) — not shipped in the
    extension, so this only needs to unblock local training."""
    from skl2onnx.common import tree_ensemble as _te
    _orig_add_node = _te.add_node
    def _patched_add_node(*args, **kwargs):
        if 'nodes_missing_value_tracks_true' in kwargs:
            kwargs['nodes_missing_value_tracks_true'] = int(bool(kwargs['nodes_missing_value_tracks_true']))
        return _orig_add_node(*args, **kwargs)
    _te.add_node = _patched_add_node

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--data',default='model/data/real.csv')
    ap.add_argument('--out',default='model/phishing-url.onnx')
    ap.add_argument('--json',default='model/url-model.json')
    ap.add_argument('--parity-in',default='model/parity.json')
    ap.add_argument('--parity-out',default='model/url_parity.json')
    ap.add_argument('--compare-onnx',default='',help='path to the previous ONNX model for verdict-agreement report')
    a=ap.parse_args()
    df=pd.read_csv(a.data)
    X=np.array([features(u) for u in df['url']],dtype=np.float32)
    y=df['label'].astype(int).values

    X_tr,X_te,y_tr,y_te=train_test_split(X,y,test_size=0.25,stratify=y,random_state=42)
    eval_clf=build_clf(); eval_clf.fit(X_tr,y_tr)
    y_pred=eval_clf.predict(X_te); y_proba=eval_clf.predict_proba(X_te)[:,1]
    print(f'Holdout evaluation (test_size=0.25, stratified, n_test={len(y_te)}):')
    print(classification_report(y_te,y_pred,target_names=['legit','phishing'],digits=3))
    print(confusion_matrix(y_te,y_pred))
    auc=roc_auc_score(y_te,y_proba); acc=(y_pred==y_te).mean()
    from sklearn.metrics import precision_score,recall_score,f1_score
    prec=precision_score(y_te,y_pred,zero_division=0); rec=recall_score(y_te,y_pred,zero_division=0)
    print(f'ROC-AUC (holdout): {auc:.3f}')

    if a.compare_onnx:
        import onnxruntime as ort
        sess=ort.InferenceSession(a.compare_onnx)
        name=sess.get_inputs()[0].name
        outs=sess.run(None,{name:X_te})
        old=outs[1][:,1] if len(outs)>1 else outs[0]
        lvl=lambda p: np.where(p>=0.8,2,np.where(p>=0.5,1,0))
        agree=(lvl(np.asarray(old))==lvl(y_proba)).mean()
        print(f'Verdict-level agreement with {a.compare_onnx} on holdout: {agree:.4f}')

    clf=build_clf(); clf.fit(X,y)
    _patch_skl2onnx_hgb_bool_bug()
    onx=to_onnx(clf,initial_types=[('input',FloatTensorType([None,len(FEATURE_NAMES)]))],options={'zipmap':False})
    blob=onx.SerializeToString(); open(a.out,'wb').write(blob)
    print(f'Wrote {a.out} ({len(blob)} bytes) [artifact only — not shipped].')
    model=export_json(clf,a.json)
    print(f'Wrote {a.json} ({pathlib.Path(a.json).stat().st_size} bytes, {len(model["trees"])} trees).')

    # Parity: Python probabilities for the JS-frozen URL list.
    cases=json.loads(pathlib.Path(a.parity_in).read_text())
    Xp=np.array([features(c['url']) for c in cases],dtype=np.float32)
    probs=clf.predict_proba(Xp)[:,1]
    pathlib.Path(a.parity_out).write_text(json.dumps(
        [{'url':c['url'],'prob':float(p)} for c,p in zip(cases,probs)],indent=1)+'\n')
    print(f'Wrote {a.parity_out} ({len(cases)} cases).')
    print(f'Holdout: acc={acc:.3f} precision={prec:.3f} recall={rec:.3f} auc={auc:.3f} | trained on {len(df)} rows.')

if __name__=='__main__': main()
