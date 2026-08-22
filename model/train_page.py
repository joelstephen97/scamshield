"""model/train_page.py — train the on-device page-content classifier.

Input : model/data/pages.jsonl  (from `npm run crawl:pages`)
Output: model/page-content.json (int8 weights), model/page_parity.json (200 rows)
Split : grouped by registrable domain so the holdout never shares a site with training.
Threshold: smallest p with FPR ≤ 0.5% on legit LOGIN pages (n_password > 0).
"""
import argparse, base64, json, pathlib
import numpy as np
from scipy import sparse
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import roc_auc_score

BUCKETS = 32768
DENSE = ['n_forms','n_inputs','n_password','n_hidden_inputs','n_links','external_link_ratio',
         'dead_href_ratio','same_host_link_ratio','n_iframes','n_images','n_scripts','text_len_log',
         'has_nav_or_header_footer','has_lang_attr','has_icon_link','login_words_in_inputs']

def load(p):
    rows=[json.loads(l) for l in pathlib.Path(p).read_text(encoding='utf8').splitlines() if l.strip()]
    data,ri,ci,dense,y,g=[],[],[],[],[],[]
    for r,row in enumerate(rows):
        for k,v in row['features']['tokens'].items():
            ri.append(r); ci.append(int(k)); data.append(np.log1p(v))
        dense.append(row['features']['dense']); y.append(int(row['label'])); g.append(row['regDomain'])
    X=sparse.hstack([sparse.csr_matrix((data,(ri,ci)),shape=(len(rows),BUCKETS)),sparse.csr_matrix(np.array(dense,dtype=np.float64))]).tocsr()
    return rows,X,np.array(y),np.array(g)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--data',default='model/data/pages.jsonl')
    ap.add_argument('--out',default='model/page-content.json'); ap.add_argument('--parity',default='model/page_parity.json')
    ap.add_argument('--max-login-fpr',type=float,default=0.005); a=ap.parse_args()
    rows,X,y,g=load(a.data)
    tr,te=next(GroupShuffleSplit(n_splits=1,test_size=0.2,random_state=42).split(X,y,g))
    best=None
    for C in [0.03,0.1,0.3,1.0,3.0,10.0]:
        clf=LogisticRegression(C=C,class_weight='balanced',max_iter=2000,solver='liblinear').fit(X[tr],y[tr])
        p=clf.predict_proba(X[te])[:,1]; auc=roc_auc_score(y[te],p)
        print(f'C={C}: holdout AUC={auc:.4f}')
        if best is None or auc>best[0]: best=(auc,C,clf,p)
    auc,C,clf,p=best
    # threshold on legit login pages of the holdout
    pw=np.array([rows[i]['features']['dense'][DENSE.index('n_password')] for i in te])
    legit_login=(y[te]==0)&(pw>0)
    thr=0.9; found=False
    for t in np.arange(0.5,0.995,0.005):
        fpr=(p[legit_login]>=t).mean() if legit_login.any() else 0.0
        if fpr<=a.max_login_fpr: thr=float(round(t,3)); found=True; break
    if not found:
        print(f'WARNING: no threshold in [0.5,0.995) satisfied login FPR<={a.max_login_fpr}; falling back to thr=0.9')
    rec=(p[y[te]==1]>=thr).mean(); fpr_all=(p[y[te]==0]>=thr).mean()
    print(f'Chosen C={C} AUC={auc:.4f} threshold={thr} recall@thr={rec:.3f} FPR(all legit)={fpr_all:.4f} legit-login n={int(legit_login.sum())}')
    clf=LogisticRegression(C=C,class_weight='balanced',max_iter=2000,solver='liblinear').fit(X,y)
    w=clf.coef_.ravel(); wt=w[:BUCKETS]; wd=w[BUCKETS:]
    scale=float(np.abs(wt).max()/127.0) or 1.0
    q=np.clip(np.round(wt/scale),-127,127).astype(np.int8)
    model={'version':1,'buckets':BUCKETS,'denseNames':DENSE,'w':base64.b64encode(q.tobytes()).decode('ascii'),
           'wScale':scale,'wDense':[float(x) for x in wd],'bias':float(clf.intercept_[0]),'thresholds':{'suspicious':thr}}
    pathlib.Path(a.out).write_text(json.dumps(model,separators=(',',':')))
    # parity: evaluate the QUANTISED model in Python on 200 holdout rows so JS must match it
    rng=np.random.default_rng(42); sel=rng.choice(te,size=min(200,len(te)),replace=False)
    out=[]
    for i in sel:
        f=rows[i]['features']; z=model['bias']
        for k,v in f['tokens'].items(): z+=np.log1p(v)*int(q[int(k)])*scale
        z+=float(np.dot(np.array(f['dense']),wd)); out.append({'features':f,'prob':float(1/(1+np.exp(-z)))})
    pathlib.Path(a.parity).write_text(json.dumps(out)+'\n')
    print(f'Wrote {a.out} and {a.parity}. Gate: AUC>=0.97 -> {"OK" if auc>=0.97 else "FAIL"}; login FPR<={a.max_login_fpr} -> {"OK" if found else "FALLBACK thr=0.9"}')
if __name__=='__main__': main()
