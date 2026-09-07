(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // ORDER IS LAW. features.js and model/train.py must emit in this order.
  const FEATURE_NAMES = [
    'url_length', 'host_length', 'path_length', 'num_dots_host',
    'num_subdomains', 'num_hyphens_host', 'num_digits_host', 'digit_ratio_host',
    'has_at_symbol', 'has_ip_host', 'has_punycode', 'is_https',
    'num_query_params', 'suspicious_tld', 'suspicious_token_count',
    'host_entropy', 'brand_lookalike'
  ];

  const THRESHOLDS = { suspicious: 0.5, dangerous: 0.8,
    // contentSuspicious is a default only; the shipped page model's
    // `thresholds.suspicious` (0.80) takes precedence at runtime.
    contentSuspicious: 0.9, contentCorroborateRule: 0.3, contentCorroborateModel: 0.7,
    // iconHamming lowered 6 -> 4 (v0.5.0 fix wave): tools/measure-icon-fp.js
    // against 88 real Tranco sites measured a 2.74% false-positive rate at
    // maxDist=6 (> the 1% bar) — see model/README.md / final-fix-report.md
    // for the measurement. Re-measured at maxDist=4 before shipping.
    contentCorroborateModelMinRule: 0.15, iconHamming: 4 };

  // key, names (word-boundary matched when nameMatch), legit registrable domains (incl. auth), opts:
  //   { nameMatch = true, display, ccPolicy = 'open', suffixes }
  // display: canonical mixed-case name for UI; falls back to title-cased names[0], then key.
  // ccPolicy 'closed': the brand provably has no ccTLD storefronts — `suffixes` lists the exact
  // public suffixes it uses (brand_match.js's brandForeignSuffix() consults this; 0.13.0).
  const B = (key, names, domains, opts) => Object.assign({ key, names, domains, nameMatch: true, ccPolicy: 'open', fuzzy: true }, opts || {});
  const BRANDS_HAND = [
    B('paypal', ['paypal'], ['paypal.com'], { display: 'PayPal' }),
    B('google', ['google', 'gmail', 'youtube'], ['google.com', 'gmail.com', 'youtube.com', 'googleapis.com', 'gstatic.com']),
    B('apple', ['apple', 'icloud', 'apple id'], ['apple.com', 'icloud.com']),
    B('microsoft', ['microsoft', 'office 365', 'onedrive', 'sharepoint', 'microsoft azure'], ['microsoft.com', 'live.com', 'office.com', 'outlook.com', 'microsoftonline.com', 'office365.com', 'azure.com', 'sharepoint.com', 'onedrive.com', 'msftauth.net', 'msauth.net', 'hotmail.com']),
    B('amazon', ['amazon', 'prime video'], ['amazon.com', 'amazon.ae', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.nl', 'amazon.ca', 'amazon.in', 'amazon.sg', 'amazon.sa', 'amazon.eg', 'amazon.com.au', 'amazon.com.br', 'amazon.com.mx', 'amazon.com.tr', 'amazon.co.jp', 'primevideo.com', 'media-amazon.com']),
    B('facebook', ['facebook', 'meta platforms'], ['facebook.com', 'fb.com', 'fbcdn.net']),
    B('instagram', ['instagram'], ['instagram.com', 'cdninstagram.com']),
    B('netflix', ['netflix'], ['netflix.com', 'nflxext.com']),
    B('whatsapp', ['whatsapp'], ['whatsapp.com', 'whatsapp.net'], { display: 'WhatsApp' }),
    B('binance', ['binance'], ['binance.com']),
    B('coinbase', ['coinbase'], ['coinbase.com'], { ccPolicy: 'closed', suffixes: ['com'] }),
    B('metamask', ['metamask'], ['metamask.io'], { display: 'MetaMask', ccPolicy: 'closed', suffixes: ['io'] }),
    B('dbs', ['dbs bank', 'posb'], ['dbs.com.sg', 'dbs.com', 'posb.com.sg'], { nameMatch: false, display: 'DBS Bank' }),
    B('maybank', ['maybank'], ['maybank2u.com.my', 'maybank.com']),
    B('wise', ['wise'], ['wise.com'], { nameMatch: false }),
    B('revolut', ['revolut'], ['revolut.com']),
    B('linkedin', ['linkedin'], ['linkedin.com', 'licdn.com'], { display: 'LinkedIn' }),
    B('outlook', ['outlook', 'hotmail'], ['outlook.com', 'live.com', 'hotmail.com']),
    B('gmail', ['gmail'], ['gmail.com', 'google.com']),
    B('telegram', ['telegram'], ['telegram.org', 'telegram.me', 't.me']),
    B('steam', ['steam'], ['steampowered.com', 'steamcommunity.com'], { nameMatch: false, ccPolicy: 'closed', suffixes: ['com'] }),
    B('roblox', ['roblox'], ['roblox.com', 'rbxcdn.com'], { ccPolicy: 'closed', suffixes: ['com'] }),
    B('dhl', ['dhl'], ['dhl.com', 'dhl.de'], { display: 'DHL' }),
    B('fedex', ['fedex'], ['fedex.com'], { display: 'FedEx' }),
    B('usps', ['usps'], ['usps.com'], { display: 'USPS' }),
    B('ups', ['ups'], ['ups.com'], { nameMatch: false, display: 'UPS' }),
    B('docusign', ['docusign'], ['docusign.com', 'docusign.net'], { display: 'DocuSign', ccPolicy: 'closed', suffixes: ['com', 'net'] }),
    // dropbox.co.jp 301s to www.dropbox.com/ja/ (curl-verified 2026-09-07) —
    // Dropbox's own JP storefront. Listed as an owned DOMAIN (appended, so
    // domains[0] and therefore the fuzzy form stay 'dropbox'), not merely an
    // allowed suffix: the suffix list only silences brandForeignSuffix, while
    // the allowlist gate is what also stops fuzzy rule (c) grading Dropbox's
    // own site as a TLD swap of itself.
    B('dropbox', ['dropbox'], ['dropbox.com', 'dropbox.co.jp'], { ccPolicy: 'closed', suffixes: ['com', 'co.jp'] }),
    B('adobe', ['adobe'], ['adobe.com', 'adobelogin.com']),
    B('spotify', ['spotify'], ['spotify.com', 'scdn.co']),
    // fuzzy:false 2026-09-07 fix round: 'chase' is an ordinary English verb
    // (gradeAgainst rules a/b match the raw key as a hyphen/label token,
    // e.g. "car-chase-scene.com") — the same class of bug the reviewer found
    // in the generated pack's common-word keys.
    B('chase', ['chase bank', 'jpmorgan'], ['chase.com', 'jpmorgan.com'], { nameMatch: false, fuzzy: false }),
    B('wellsfargo', ['wells fargo'], ['wellsfargo.com'], { display: 'Wells Fargo' }),
    B('bankofamerica', ['bank of america'], ['bankofamerica.com', 'bofa.com'], { display: 'Bank of America' }),
    B('citi', ['citibank'], ['citi.com', 'citibank.com', 'citibank.ae']),
    B('hsbc', ['hsbc'], ['hsbc.com', 'hsbc.ae', 'hsbc.co.uk', 'hsbc.com.sg', 'hsbc.com.hk'], { display: 'HSBC' }),
    B('barclays', ['barclays'], ['barclays.co.uk', 'barclays.com']),
    B('santander', ['santander'], ['santander.com', 'santander.co.uk', 'santander.es']),
    B('ing', ['ing bank'], ['ing.com', 'ing.nl', 'ing.be'], { nameMatch: false }),
    // domains[0] MUST stay 'sbi.co.in': its fuzzyForm ('sbi', 3 chars) is
    // under brand_match.js's MIN_BRAND_LEN=5, which deliberately keeps the
    // 3-letter key 'sbi' OUT of the fuzzy candidate list — promoting a
    // longer domains[0] (e.g. onlinesbi.com) would admit 'sbi' as a fuzzy
    // candidate and flag ordinary hosts with an incidental "sbi" hyphen
    // token (my-sbi-jobs.net, sbi-loan-advisors.com) as brandFuzzyMatch.
    // sbi.bank.in is additive only (curl-verified live 2026-09-07).
    B('sbi', ['state bank of india', 'onlinesbi'], ['sbi.co.in', 'onlinesbi.sbi', 'onlinesbi.com', 'sbi.bank.in'], { display: 'SBI' }),
    B('hdfc', ['hdfc'], ['hdfcbank.com', 'hdfc.com', 'hdfc.bank.in'], { display: 'HDFC Bank' }),
    B('icici', ['icici'], ['icicibank.com', 'icici.bank.in'], { display: 'ICICI Bank' }),
    B('emiratesnbd', ['emirates nbd'], ['emiratesnbd.com'], { display: 'Emirates NBD' }),
    B('adcb', ['adcb'], ['adcb.com'], { display: 'ADCB' }),
    B('fab', ['first abu dhabi bank'], ['bankfab.com', 'fab.ae'], { nameMatch: false, display: 'FAB' }),
    B('mashreq', ['mashreq'], ['mashreq.com', 'mashreqbank.com']),
    B('rakbank', ['rakbank'], ['rakbank.ae'], { display: 'RAKBANK' }),
    B('dib', ['dubai islamic bank'], ['dib.ae'], { nameMatch: false, display: 'DIB' }),
    B('etisalat', ['etisalat', 'e& uae'], ['etisalat.ae', 'eand.com', 'eandme.ae']),
    B('du', ['du telecom'], ['du.ae'], { nameMatch: false }),
    B('noon', ['noon.com'], ['noon.com'], { nameMatch: false }),
    B('aramex', ['aramex'], ['aramex.com']),
    B('royalmail', ['royal mail'], ['royalmail.com'], { display: 'Royal Mail' }),
    B('evri', ['evri'], ['evri.com'], { display: 'Evri' }),
    B('emiratespost', ['emirates post'], ['emiratespost.ae', 'epg.gov.ae'], { display: 'Emirates Post' }),
    B('dpd', ['dpd'], ['dpd.com', 'dpd.co.uk', 'dpd.de'], { display: 'DPD' }),
    B('talabat', ['talabat'], ['talabat.com']),
    B('careem', ['careem'], ['careem.com']),
    B('adnoc', ['adnoc'], ['adnoc.ae', 'adnocdistribution.ae'], { display: 'ADNOC' }),
    B('dewa', ['dewa'], ['dewa.gov.ae'], { display: 'DEWA' }),
    B('icp', ['icp uae', 'federal authority for identity'], ['icp.gov.ae'], { nameMatch: false, display: 'ICP' }),
    B('mohre', ['mohre'], ['mohre.gov.ae'], { display: 'MOHRE' }),
    B('dubaipolice', ['dubai police'], ['dubaipolice.gov.ae']),
    B('uaepass', ['uae pass', 'uaepass'], ['uaepass.ae'], { display: 'UAE PASS' }),
    B('emirates', ['emirates airline', 'fly emirates'], ['emirates.com'], { nameMatch: false }),
    B('etihad', ['etihad'], ['etihad.com']),
    // shopee.com.br appended (never reordered) 2026-09-07: FP-gate fix, curl-verified 200.
    B('shopee', ['shopee'], ['shopee.sg', 'shopee.com.my', 'shopee.co.id', 'shopee.ph', 'shopee.com', 'shopee.com.br']),
    B('lazada', ['lazada'], ['lazada.sg', 'lazada.com.my', 'lazada.com', 'lazada.co.th']),
    B('grab', ['grab'], ['grab.com'], { nameMatch: false })
  ];
  // BEGIN GENERATED BRANDS
  const BRANDS_GENERATED = [
    B('discord', ['discord chat', 'discord app'], ['discord.com', 'discordapp.com', 'discord.gg', 'discord.media'], { display: 'Discord', ccPolicy: 'closed', suffixes: ['com', 'gg', 'media'], fuzzy: false }),
    B('ledger', ['ledger wallet', 'ledger live'], ['ledger.com', 'ledger.fr'], { display: 'Ledger', ccPolicy: 'closed', suffixes: ['com', 'fr'] }),
    B('trezor', ['trezor'], ['trezor.io'], { display: 'Trezor', ccPolicy: 'closed', suffixes: ['io'] }),
    B('phantom', ['phantom wallet'], ['phantom.app'], { display: 'Phantom', ccPolicy: 'closed', suffixes: ['app'] }),
    B('kraken', ['kraken exchange', 'kraken crypto'], ['kraken.com'], { display: 'Kraken', ccPolicy: 'closed', suffixes: ['com'], fuzzy: false }),
    B('zoom', ['zoom meetings', 'zoom video'], ['zoom.us', 'zoom.com'], { display: 'Zoom', ccPolicy: 'closed', suffixes: ['us', 'com'] }),
    B('okta', ['okta'], ['okta.com'], { display: 'Okta', ccPolicy: 'closed', suffixes: ['com'] }),
    B('bbva', ['bbva'], ['bbva.com', 'bbva.es', 'bbva.mx'], { display: 'BBVA' }),
    B('caixabank', ['caixabank'], ['caixabank.es', 'caixabank.com'], { display: 'CaixaBank' }),
    B('sabadell', ['banco sabadell'], ['bancosabadell.com', 'grupobancosabadell.com'], { display: 'Banco Sabadell' }),
    B('bankinter', ['bankinter'], ['bankinter.com'], { display: 'Bankinter' }),
    B('unicredit', ['unicredit'], ['unicredit.eu', 'unicreditgroup.eu'], { display: 'UniCredit' }),
    B('intesasanpaolo', ['intesa sanpaolo'], ['intesasanpaolo.com', 'group.intesasanpaolo.com'], { display: 'Intesa Sanpaolo' }),
    B('posteitaliane', ['poste italiane'], ['poste.it'], { display: 'Poste Italiane' }),
    B('deutschebank', ['deutsche bank'], ['db.com'], { display: 'Deutsche Bank' }),
    B('commerzbank', ['commerzbank'], ['commerzbank.de'], { display: 'Commerzbank' }),
    B('dkb', ['deutsche kreditbank'], ['dkb.de'], { display: 'DKB' }),
    B('sparkasse', ['sparkasse'], ['sparkasse.de'], { display: 'Sparkasse' }),
    B('postbank', ['postbank'], ['postbank.de'], { display: 'Postbank' }),
    B('abnamro', ['abn amro'], ['abnamro.nl', 'abnamro.com'], { display: 'ABN AMRO' }),
    B('rabobank', ['rabobank'], ['rabobank.nl', 'rabobank.com'], { display: 'Rabobank' }),
    B('bnpparibas', ['bnp paribas'], ['bnpparibas.com'], { display: 'BNP Paribas' }),
    B('societegenerale', ['societe generale'], ['societegenerale.com'], { display: 'Societe Generale' }),
    B('creditagricole', ['credit agricole'], ['credit-agricole.com'], { display: 'Credit Agricole' }),
    B('creditsuisse', ['credit suisse'], ['credit-suisse.com'], { display: 'Credit Suisse' }),
    B('ubs', ['ubs bank'], ['ubs.com'], { display: 'UBS' }),
    B('swisscom', ['swisscom'], ['swisscom.ch'], { display: 'Swisscom' }),
    B('scotiabank', ['scotiabank'], ['scotiabank.com'], { display: 'Scotiabank' }),
    B('rbc', ['royal bank of canada'], ['rbc.com', 'rbcroyalbank.com'], { display: 'RBC' }),
    B('td', ['td bank'], ['td.com', 'tdbank.com'], { display: 'TD Bank' }),
    B('bmo', ['bmo bank'], ['bmo.com'], { display: 'BMO' }),
    B('cibc', ['cibc bank'], ['cibc.com'], { display: 'CIBC' }),
    B('desjardins', ['desjardins'], ['desjardins.com'], { display: 'Desjardins' }),
    B('canadapost', ['canada post'], ['canadapost.ca'], { display: 'Canada Post' }),
    B('interac', ['interac'], ['interac.ca'], { display: 'Interac' }),
    B('usaa', ['usaa'], ['usaa.com'], { display: 'USAA' }),
    B('capitalone', ['capital one'], ['capitalone.com'], { display: 'Capital One' }),
    B('navyfederal', ['navy federal'], ['navyfederal.org'], { display: 'Navy Federal' }),
    B('pnc', ['pnc bank'], ['pnc.com'], { display: 'PNC Bank' }),
    B('truist', ['truist bank'], ['truist.com'], { display: 'Truist' }),
    B('regions', ['regions bank'], ['regions.com'], { display: 'Regions Bank', fuzzy: false }),
    B('fifththird', ['fifth third'], ['53.com'], { display: 'Fifth Third Bank' }),
    B('keybank', ['keybank'], ['key.com'], { display: 'KeyBank' }),
    B('discover', ['discover card', 'discover bank'], ['discover.com'], { display: 'Discover', fuzzy: false }),
    B('amex', ['american express'], ['americanexpress.com'], { display: 'American Express' }),
    B('venmo', ['venmo'], ['venmo.com'], { display: 'Venmo' }),
    B('zelle', ['zelle'], ['zellepay.com'], { display: 'Zelle' }),
    B('westernunion', ['western union'], ['westernunion.com'], { display: 'Western Union' }),
    B('moneygram', ['moneygram'], ['moneygram.com'], { display: 'MoneyGram' }),
    B('n26', ['n26 bank'], ['n26.com'], { display: 'N26' }),
    B('monzo', ['monzo bank'], ['monzo.com'], { display: 'Monzo' }),
    B('starlingbank', ['starling bank'], ['starlingbank.com'], { display: 'Starling Bank' }),
    B('chime', ['chime bank'], ['chime.com'], { display: 'Chime', fuzzy: false }),
    B('nab', ['national australia bank'], ['nab.com.au'], { display: 'NAB' }),
    B('anz', ['anz bank'], ['anz.com'], { display: 'ANZ' }),
    B('westpac', ['westpac bank'], ['westpac.com.au'], { display: 'Westpac' }),
    B('commbank', ['commonwealth bank'], ['commbank.com.au'], { display: 'CommBank' }),
    B('auspost', ['australia post'], ['auspost.com.au'], { display: 'Australia Post' }),
    B('nzpost', ['nz post'], ['nzpost.co.nz'], { display: 'NZ Post' }),
    B('standardchartered', ['standard chartered'], ['sc.com'], { display: 'Standard Chartered' }),
    B('ocbc', ['ocbc bank'], ['ocbc.com'], { display: 'OCBC' }),
    B('uob', ['uob bank'], ['uob.com.sg'], { display: 'UOB' }),
    B('cimb', ['cimb bank'], ['cimb.com'], { display: 'CIMB' }),
    B('publicbank', ['public bank berhad'], ['pbebank.com'], { display: 'Public Bank' }),
    B('rhbbank', ['rhb bank'], ['rhbgroup.com'], { display: 'RHB Bank' }),
    B('bhd', ['banco bhd'], ['bhd.com.do'], { display: 'Banco BHD' }),
    B('banreservas', ['banreservas'], ['banreservas.com'], { display: 'Banreservas' }),
    B('bancaribe', ['bancaribe'], ['bancaribe.com'], { display: 'Bancaribe' }),
    B('popular', ['banco popular'], ['popular.com'], { display: 'Banco Popular', fuzzy: false }),
    B('itau', ['itau unibanco'], ['itau.com.br'], { display: 'Itau' }),
    B('bradesco', ['banco bradesco'], ['bradesco.com.br'], { display: 'Bradesco' }),
    B('vietcombank', ['vietcombank'], ['vietcombank.com.vn'], { display: 'Vietcombank' }),
    B('bidv', ['bidv bank'], ['bidv.com.vn'], { display: 'BIDV' }),
    B('vpbank', ['vpbank'], ['vpbank.com.vn'], { display: 'VPBank' }),
    B('acbbank', ['acb bank'], ['acb.com.vn'], { display: 'ACB Bank' }),
    B('bdo', ['bdo unibank'], ['bdo.com.ph'], { display: 'BDO Unibank' }),
    B('metrobank', ['metrobank'], ['metrobank.com.ph'], { display: 'Metrobank' }),
    B('bpi', ['bank of the philippine islands'], ['bpi.com.ph'], { display: 'BPI' }),
    B('rcbc', ['rcbc bank'], ['rcbc.com'], { display: 'RCBC' }),
    B('unionbankph', ['unionbank philippines'], ['unionbankph.com'], { display: 'UnionBank' }),
    B('bca', ['bank central asia'], ['bca.co.id'], { display: 'Bank Central Asia' }),
    B('bri', ['bank rakyat indonesia'], ['bri.co.id'], { display: 'Bank Rakyat Indonesia' }),
    B('bankmandiri', ['bank mandiri'], ['bankmandiri.co.id'], { display: 'Bank Mandiri' }),
    B('bni', ['bank negara indonesia'], ['bni.co.id'], { display: 'BNI' }),
    B('scbthailand', ['siam commercial bank'], ['scb.co.th'], { display: 'SCB Thailand' }),
    B('krungsri', ['krungsri bank'], ['krungsri.com'], { display: 'Krungsri' }),
    B('ttbbank', ['ttb bank'], ['ttbbank.com'], { display: 'TTB Bank' }),
    B('allianz', ['allianz insurance'], ['allianz.com'], { display: 'Allianz' }),
    B('axa', ['axa insurance'], ['axa.com'], { display: 'AXA' }),
    B('zurich', ['zurich insurance'], ['zurich.com'], { display: 'Zurich Insurance', fuzzy: false }),
    B('metlife', ['metlife insurance'], ['metlife.com'], { display: 'MetLife' }),
    B('ebay', ['ebay'], ['ebay.com'], { display: 'eBay' }),
    B('etsy', ['etsy'], ['etsy.com'], { display: 'Etsy' }),
    B('walmart', ['walmart'], ['walmart.com'], { display: 'Walmart' }),
    B('target', ['target corporation', 'target.com'], ['target.com'], { display: 'Target', fuzzy: false }),
    B('bestbuy', ['best buy'], ['bestbuy.com'], { display: 'Best Buy' }),
    B('aliexpress', ['aliexpress'], ['aliexpress.com'], { display: 'AliExpress' }),
    B('alibaba', ['alibaba'], ['alibaba.com'], { display: 'Alibaba' }),
    B('taobao', ['taobao'], ['taobao.com'], { display: 'Taobao' }),
    B('jd', ['jd.com'], ['jd.com'], { display: 'JD.com' }),
    B('zalando', ['zalando'], ['zalando.com'], { display: 'Zalando' }),
    B('asos', ['asos'], ['asos.com'], { display: 'ASOS' }),
    B('otto', ['otto.de'], ['otto.de'], { display: 'OTTO' }),
    B('wish', ['wish shopping'], ['wish.com'], { display: 'Wish' }),
    B('temu', ['temu'], ['temu.com'], { display: 'Temu' }),
    B('shein', ['shein'], ['shein.com'], { display: 'SHEIN' }),
    B('mercadolivre', ['mercado livre'], ['mercadolivre.com.br'], { display: 'Mercado Livre' }),
    B('mercadolibre', ['mercado libre'], ['mercadolibre.com', 'mercadolibre.com.ar', 'mercadolibre.com.mx', 'mercadolibre.com.co', 'mercadolibre.cl', 'mercadolibre.com.uy'], { display: 'Mercado Libre' }),
    B('rakuten', ['rakuten'], ['rakuten.co.jp', 'rakuten.com'], { display: 'Rakuten' }),
    B('olx', ['olx classifieds', 'olx marketplace'], ['olx.com', 'olx.pl'], { display: 'OLX' }),
    B('vinted', ['vinted'], ['vinted.com'], { display: 'Vinted' }),
    B('shopify', ['shopify'], ['shopify.com'], { display: 'Shopify' }),
    B('flipkart', ['flipkart'], ['flipkart.com'], { display: 'Flipkart' }),
    B('myntra', ['myntra'], ['myntra.com'], { display: 'Myntra' }),
    B('tokopedia', ['tokopedia'], ['tokopedia.com'], { display: 'Tokopedia' }),
    B('bukalapak', ['bukalapak'], ['bukalapak.com'], { display: 'Bukalapak' }),
    B('tiki', ['tiki.vn'], ['tiki.vn'], { display: 'Tiki' }),
    B('correios', ['correios brasil'], ['correios.com.br'], { display: 'Correios' }),
    B('correos', ['correos espana'], ['correos.es'], { display: 'Correos' }),
    B('laposte', ['la poste'], ['laposte.fr'], { display: 'La Poste' }),
    B('ctt', ['ctt correios'], ['ctt.pt'], { display: 'CTT' }),
    B('anpost', ['an post'], ['anpost.com'], { display: 'An Post' }),
    B('bpost', ['bpost belgium'], ['bpost.be'], { display: 'Bpost' }),
    B('postnl', ['postnl'], ['postnl.nl'], { display: 'PostNL' }),
    B('deutschepost', ['deutsche post'], ['deutschepost.de'], { display: 'Deutsche Post' }),
    B('japanpost', ['japan post'], ['post.japanpost.jp'], { display: 'Japan Post' }),
    B('indiapost', ['india post'], ['indiapost.gov.in'], { display: 'India Post' }),
    B('att', ['at&t', 'att wireless'], ['att.com', 'att.net'], { display: 'AT&T' }),
    B('bellsouth', ['bellsouth'], ['bellsouth.net'], { display: 'BellSouth' }),
    B('verizon', ['verizon wireless'], ['verizon.com'], { display: 'Verizon' }),
    B('tmobile', ['t-mobile'], ['t-mobile.com'], { display: 'T-Mobile' }),
    B('vodafone', ['vodafone'], ['vodafone.com'], { display: 'Vodafone' }),
    B('orange', ['orange telecom', 'orange france', 'orange mobile'], ['orange.fr'], { display: 'Orange', fuzzy: false }),
    B('sfr', ['sfr telecom'], ['sfr.fr'], { display: 'SFR' }),
    B('deutschetelekom', ['deutsche telekom'], ['telekom.de', 'telekom.net'], { display: 'Deutsche Telekom' }),
    B('o2', ['o2 mobile'], ['o2.co.uk'], { display: 'O2' }),
    B('ee', ['ee mobile'], ['ee.co.uk'], { display: 'EE' }),
    B('three', ['three uk', 'three mobile'], ['three.co.uk'], { display: 'Three', fuzzy: false }),
    B('telstra', ['telstra'], ['telstra.com.au'], { display: 'Telstra' }),
    B('optus', ['optus'], ['optus.com.au'], { display: 'Optus' }),
    B('singtel', ['singtel'], ['singtel.com'], { display: 'Singtel' }),
    B('starhub', ['starhub'], ['starhub.com'], { display: 'StarHub' }),
    B('smart', ['smart communications'], ['smart.com.ph'], { display: 'Smart Communications', fuzzy: false }),
    B('pldt', ['pldt'], ['pldt.com'], { display: 'PLDT' }),
    B('airtel', ['airtel'], ['airtel.in'], { display: 'Airtel' }),
    B('jio', ['reliance jio'], ['jio.com'], { display: 'Jio' }),
    B('ooredoo', ['ooredoo'], ['ooredoo.com'], { display: 'Ooredoo' }),
    B('stc', ['saudi telecom'], ['stc.com.sa'], { display: 'STC' }),
    B('digi', ['digi telco'], ['digi.com.my'], { display: 'Digi Telco' }),
    B('celcom', ['celcom'], ['celcom.com.my'], { display: 'Celcom' }),
    B('umobile', ['u mobile'], ['u.com.my'], { display: 'U Mobile' }),
    B('maxis', ['maxis'], ['maxis.com.my'], { display: 'Maxis' }),
    B('dtac', ['dtac mobile'], ['dtac.co.th'], { display: 'dtac' }),
    B('viettel', ['viettel'], ['viettel.com.vn'], { display: 'Viettel' }),
    B('slack', ['slack technologies', 'slack workspace'], ['slack.com'], { display: 'Slack', fuzzy: false }),
    B('salesforce', ['salesforce crm', 'salesforce.com'], ['salesforce.com'], { display: 'Salesforce', fuzzy: false }),
    B('workday', ['workday hcm', 'workday inc'], ['workday.com'], { display: 'Workday', fuzzy: false }),
    B('atlassian', ['atlassian'], ['atlassian.com', 'atlassian.net'], { display: 'Atlassian' }),
    B('github', ['github'], ['github.com', 'github.io'], { display: 'GitHub' }),
    B('gitlab', ['gitlab'], ['gitlab.com', 'gitlab.io'], { display: 'GitLab' }),
    B('notion', ['notion.so', 'notion labs'], ['notion.so'], { display: 'Notion', fuzzy: false }),
    B('airtable', ['airtable'], ['airtable.com'], { display: 'Airtable' }),
    B('figma', ['figma'], ['figma.com'], { display: 'Figma' }),
    B('canva', ['canva'], ['canva.com'], { display: 'Canva' }),
    B('squarespace', ['squarespace'], ['squarespace.com'], { display: 'Squarespace' }),
    B('wix', ['wix.com'], ['wix.com'], { display: 'Wix' }),
    B('stripe', ['stripe payments', 'stripe.com'], ['stripe.com'], { display: 'Stripe', fuzzy: false }),
    B('square', ['squareup', 'square payments', 'square inc'], ['squareup.com'], { display: 'Square', fuzzy: false }),
    B('wetransfer', ['wetransfer'], ['wetransfer.com'], { display: 'WeTransfer' }),
    B('twitch', ['twitch.tv'], ['twitch.tv'], { display: 'Twitch', fuzzy: false }),
    B('epicgames', ['epic games'], ['epicgames.com'], { display: 'Epic Games' }),
    B('ea', ['electronic arts'], ['ea.com'], { display: 'Electronic Arts' }),
    B('ubisoft', ['ubisoft'], ['ubisoft.com'], { display: 'Ubisoft' }),
    B('riotgames', ['riot games'], ['riotgames.com'], { display: 'Riot Games' }),
    B('nintendo', ['nintendo'], ['nintendo.com', 'nintendo.net'], { display: 'Nintendo' }),
    B('playstation', ['playstation'], ['playstation.com', 'playstation.net'], { display: 'PlayStation' }),
    B('xbox', ['xbox'], ['xbox.com'], { display: 'Xbox' }),
    B('klarna', ['klarna'], ['klarna.com'], { display: 'Klarna' }),
    B('afterpay', ['afterpay'], ['afterpay.com'], { display: 'Afterpay' }),
    B('affirm', ['affirm pay'], ['affirm.com'], { display: 'Affirm', fuzzy: false }),
    B('opensea', ['opensea'], ['opensea.io'], { display: 'OpenSea' }),
    B('twitter', ['twitter'], ['twitter.com', 'x.com'], { display: 'Twitter (X)' }),
    B('tiktok', ['tiktok'], ['tiktok.com', 'tiktokv.com', 'tiktokv.us', 'tiktokv.eu', 'tiktokw.us'], { display: 'TikTok' }),
    B('snapchat', ['snapchat'], ['snapchat.com'], { display: 'Snapchat' }),
    B('pinterest', ['pinterest'], ['pinterest.com'], { display: 'Pinterest' }),
    B('reddit', ['reddit'], ['reddit.com'], { display: 'Reddit' }),
    B('disneyplus', ['disney plus'], ['disneyplus.com'], { display: 'Disney+' }),
    B('hulu', ['hulu'], ['hulu.com'], { display: 'Hulu' }),
    B('line', ['line messenger'], ['line.me'], { display: 'LINE' }),
    B('viber', ['viber'], ['viber.com'], { display: 'Viber' }),
    B('bybit', ['bybit'], ['bybit.com'], { display: 'Bybit' }),
    B('okx', ['okx exchange', 'okx crypto'], ['okx.com'], { display: 'OKX' }),
    B('kucoin', ['kucoin'], ['kucoin.com'], { display: 'KuCoin' }),
    B('cryptocom', ['crypto.com'], ['crypto.com'], { display: 'Crypto.com' }),
    B('blockchaincom', ['blockchain.com'], ['blockchain.com'], { display: 'Blockchain.com' }),
    B('exodus', ['exodus wallet'], ['exodus.com'], { display: 'Exodus Wallet', fuzzy: false }),
    B('trustwallet', ['trust wallet'], ['trustwallet.com'], { display: 'Trust Wallet' }),
    B('uniswap', ['uniswap'], ['uniswap.org'], { display: 'Uniswap' }),
    B('gemini', ['gemini exchange', 'gemini crypto'], ['gemini.com'], { display: 'Gemini Exchange', fuzzy: false }),
    B('bitfinex', ['bitfinex'], ['bitfinex.com'], { display: 'Bitfinex' }),
    B('htx', ['htx exchange'], ['htx.com'], { display: 'HTX' }),
    B('gateio', ['gate.io'], ['gate.io'], { display: 'Gate.io' }),
    B('luno', ['luno'], ['luno.com'], { display: 'Luno' }),
    B('bitso', ['bitso'], ['bitso.com'], { display: 'Bitso' }),
    B('paytm', ['paytm'], ['paytm.com'], { display: 'Paytm' }),
    B('gcash', ['gcash'], ['gcash.com'], { display: 'GCash' }),
    B('alipay', ['alipay'], ['alipay.com'], { display: 'Alipay' }),
    B('wechatpay', ['wechat pay'], ['pay.weixin.qq.com'], { display: 'WeChat Pay' }),
    B('unionpay', ['unionpay'], ['unionpayintl.com'], { display: 'UnionPay' }),
    B('qatarairways', ['qatar airways'], ['qatarairways.com'], { display: 'Qatar Airways' }),
    B('saudia', ['saudia airlines'], ['saudia.com'], { display: 'Saudia' }),
    B('turkishairlines', ['turkish airlines'], ['turkishairlines.com'], { display: 'Turkish Airlines' }),
    B('britishairways', ['british airways'], ['britishairways.com'], { display: 'British Airways' }),
    B('lufthansa', ['lufthansa'], ['lufthansa.com'], { display: 'Lufthansa' }),
    B('united', ['united airlines', 'mileageplus'], ['united.com'], { display: 'United Airlines', fuzzy: false }),
    B('americanairlines', ['american airlines'], ['aa.com'], { display: 'American Airlines' }),
    B('southwest', ['southwest airlines'], ['southwest.com'], { display: 'Southwest Airlines', fuzzy: false }),
    B('singaporeairlines', ['singapore airlines'], ['singaporeair.com'], { display: 'Singapore Airlines' }),
    B('cathaypacific', ['cathay pacific'], ['cathaypacific.com'], { display: 'Cathay Pacific' }),
    B('qantas', ['qantas'], ['qantas.com'], { display: 'Qantas' }),
    B('airindia', ['air india'], ['airindia.com'], { display: 'Air India' }),
    B('malaysiaairlines', ['malaysia airlines'], ['malaysiaairlines.com'], { display: 'Malaysia Airlines' }),
    B('thaiairways', ['thai airways'], ['thaiairways.com'], { display: 'Thai Airways' }),
    B('vietnamairlines', ['vietnam airlines'], ['vietnamairlines.com'], { display: 'Vietnam Airlines' }),
    B('philippineairlines', ['philippine airlines'], ['philippineairlines.com'], { display: 'Philippine Airlines' }),
    B('garuda', ['garuda indonesia'], ['garuda-indonesia.com'], { display: 'Garuda Indonesia', fuzzy: false }),
    B('airasia', ['airasia'], ['airasia.com'], { display: 'AirAsia' }),
    B('scoot', ['scoot airlines'], ['flyscoot.com'], { display: 'Scoot', fuzzy: false }),
    B('vistara', ['vistara'], ['airvistara.com'], { display: 'Vistara' }),
    B('indigo', ['indigo airlines', 'goindigo'], ['goindigo.in'], { display: 'IndiGo', fuzzy: false }),
    B('indeed', ['indeed.com', 'indeed jobs'], ['indeed.com'], { display: 'Indeed', fuzzy: false }),
    B('glassdoor', ['glassdoor'], ['glassdoor.com'], { display: 'Glassdoor' }),
    B('coursera', ['coursera'], ['coursera.org'], { display: 'Coursera' }),
    B('udemy', ['udemy'], ['udemy.com'], { display: 'Udemy' }),
    B('duolingo', ['duolingo'], ['duolingo.com'], { display: 'Duolingo' }),
    B('grammarly', ['grammarly'], ['grammarly.com', 'grammarly.io'], { display: 'Grammarly' }),
    B('evernote', ['evernote'], ['evernote.com'], { display: 'Evernote' }),
    B('trello', ['trello'], ['trello.com'], { display: 'Trello' }),
    B('asana', ['asana.com'], ['asana.com'], { display: 'Asana', fuzzy: false }),
    B('mondaycom', ['monday.com'], ['monday.com'], { display: 'monday.com' }),
    B('zendesk', ['zendesk'], ['zendesk.com'], { display: 'Zendesk' }),
    B('hubspot', ['hubspot'], ['hubspot.com'], { display: 'HubSpot' }),
    B('mailchimp', ['mailchimp'], ['mailchimp.com'], { display: 'Mailchimp' }),
    B('surveymonkey', ['surveymonkey'], ['surveymonkey.com'], { display: 'SurveyMonkey' }),
    B('typeform', ['typeform'], ['typeform.com'], { display: 'Typeform' }),
    B('calendly', ['calendly'], ['calendly.com'], { display: 'Calendly' }),
    B('adp', ['adp payroll'], ['adp.com'], { display: 'ADP' }),
    B('concur', ['sap concur'], ['concur.com'], { display: 'SAP Concur', fuzzy: false }),
    B('expensify', ['expensify'], ['expensify.com'], { display: 'Expensify' }),
    B('greenhouse', ['greenhouse.io', 'greenhouse software'], ['greenhouse.io'], { display: 'Greenhouse', fuzzy: false }),
    B('lever', ['lever.co'], ['lever.co'], { display: 'Lever', fuzzy: false }),
    B('ziprecruiter', ['ziprecruiter'], ['ziprecruiter.com'], { display: 'ZipRecruiter' }),
    B('naukri', ['naukri.com'], ['naukri.com'], { display: 'Naukri' }),
    B('bayt', ['bayt.com'], ['bayt.com'], { display: 'Bayt' }),
    B('gulftalent', ['gulftalent'], ['gulftalent.com'], { display: 'GulfTalent' }),
    B('xing', ['xing.com'], ['xing.com'], { display: 'XING' }),
    B('coinmarketcap', ['coinmarketcap'], ['coinmarketcap.com'], { display: 'CoinMarketCap' }),
    B('coingecko', ['coingecko'], ['coingecko.com'], { display: 'CoinGecko' }),
  ];
  // END GENERATED BRANDS
  const BRANDS = BRANDS_HAND.concat(BRANDS_GENERATED);
  const ORIGINAL_19 = ['paypal', 'google', 'apple', 'microsoft', 'amazon', 'facebook', 'instagram', 'netflix',
    'whatsapp', 'binance', 'coinbase', 'metamask', 'dbs', 'maybank', 'wise', 'revolut', 'linkedin', 'outlook', 'gmail'];
  // URL lookalike matching (features.js) keeps the original 19 exactly — behaviour floor.
  const POPULAR_BRANDS = ORIGINAL_19;
  const NAME_RES = BRANDS.filter((b) => b.nameMatch).map((b) => [b.key,
    new RegExp('(^|[^a-z0-9])(' + b.names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ \\-]?')).join('|') + ')([^a-z0-9]|$)', 'i')]);
  function brandNameIn(text) {
    const t = String(text || '');
    for (const [key, re] of NAME_RES) if (re.test(t)) return key;
    return null;
  }

  // High-abuse TLDs (no leading dot).
  const SUSPICIOUS_TLDS = [
    'zip', 'mov', 'xyz', 'top', 'club', 'click', 'link', 'gq', 'cf', 'tk',
    'ml', 'ga', 'work', 'support', 'rest', 'country', 'kim',
    'pw', 'cc', 'ws', 'icu', 'buzz'
  ];

  // Two-label public suffixes (subset of the PSL covering the ccTLDs our users
  // and target brands actually live on). Hosts on suffixes missing from this
  // list degrade to plain last-two-label parsing — same as pre-0.3.1, never worse.
  const MULTI_LABEL_SUFFIXES = [
    'co.uk', 'org.uk', 'me.uk', 'net.uk', 'ltd.uk', 'plc.uk', 'ac.uk', 'gov.uk', 'sch.uk', 'nhs.uk',
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
    'com.sg', 'edu.sg', 'gov.sg', 'net.sg', 'org.sg',
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
    'com.my', 'net.my', 'org.my', 'edu.my', 'gov.my',
    'co.in', 'net.in', 'org.in', 'ac.in', 'edu.in', 'gov.in', 'res.in',
    'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
    'com.mx', 'org.mx', 'gob.mx', 'edu.mx',
    'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
    'com.tr', 'net.tr', 'org.tr', 'gov.tr', 'edu.tr',
    'com.hk', 'net.hk', 'org.hk', 'edu.hk', 'gov.hk',
    'co.kr', 'ne.kr', 'or.kr', 'go.kr', 'ac.kr',
    'com.tw', 'net.tw', 'org.tw', 'edu.tw', 'gov.tw',
    'co.za', 'net.za', 'org.za', 'gov.za', 'ac.za',
    'com.ar', 'net.ar', 'org.ar', 'gob.ar', 'edu.ar',
    'com.sa', 'net.sa', 'org.sa', 'gov.sa', 'edu.sa',
    'com.eg', 'net.eg', 'org.eg', 'gov.eg', 'edu.eg',
    'co.th', 'in.th', 'or.th', 'ac.th', 'go.th',
    'com.ph', 'net.ph', 'org.ph', 'gov.ph', 'edu.ph',
    'com.vn', 'net.vn', 'org.vn', 'gov.vn', 'edu.vn',
    'co.id', 'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
    'com.pk', 'com.bd', 'com.ng', 'co.ke',
    'co.il', 'org.il', 'ac.il', 'gov.il',
    'com.ua', 'com.co', 'com.pe', 'com.cl', 'com.ec', 'com.uy',
    'com.ve', 'co.ve', 'com.do', 'com.gt', 'co.cr', 'com.pa', 'com.py', 'com.bo',
    'com.kw', 'com.qa', 'com.bh', 'com.om', 'com.jo', 'com.lb',
    'com.lk', 'com.np', 'com.kh', 'com.mm',
    // 0.13.0: RBI moved every Indian bank to <bank>.bank.in (registrations
    // are licence-checked by IDRBT), so 'bank.in' is a suffix for us even
    // though the PSL does not list it yet. Fixes the hdfc/icici banner.
    'bank.in'
  ];
  const MULTI_LABEL_SUFFIX_SET = new Set(MULTI_LABEL_SUFFIXES);
  const IP4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

  // Registry-verified namespaces (0.13.0). Only entities the registry has
  // vetted can register here, so a brand token in the host is the brand,
  // not an impersonation. Consulted ONLY by brand-impersonation evidence
  // (fuzzy/icon/content) and by the hot-list client guard — never by the
  // feed block path or any DOM/behaviour detector (R14). No .edu: student
  // sub-sites get compromised.
  const VERIFIED_NAMESPACES = [
    'bank', 'insurance', 'bank.in', 'gov', 'mil',
    'gov.uk', 'nhs.uk', 'police.uk', 'gov.ae', 'u.ae', 'gov.sg', 'gov.my', 'gov.in', 'nic.in', 'gov.au', 'gov.ca', 'gc.ca',
    'gov.sa', 'gov.qa', 'gov.bh', 'gov.om', 'gov.kw', 'gov.hk', 'gov.tw', 'go.jp', 'go.kr', 'gov.br', 'gob.mx', 'gob.es', 'gouv.fr',
    'gov.it', 'gov.pl', 'gov.za', 'gov.ng', 'gov.ph', 'gov.vn', 'go.th', 'gov.tr', 'gov.eg', 'gov.pk', 'gov.bd', 'gov.lk', 'gov.np',
    'admin.ch', 'gv.at', 'belgium.be', 'overheid.nl', 'gov.ie', 'gov.pt', 'gov.gr', 'gov.il', 'gov.nz'
  ];
  function isVerifiedNamespace(host) {
    const h = String(host || '').toLowerCase().replace(/\.+$/, '');
    return VERIFIED_NAMESPACES.some((s) => h === s || h.endsWith('.' + s));
  }

  // Canonical approximate eTLD+1 split. The single implementation shared by
  // engine, content scripts, and popup — do not re-implement elsewhere.
  function registrableParts(host) {
    const h = String(host || '').toLowerCase().replace(/\.+$/, '');
    const labels = h.split('.').filter(Boolean);
    if (IP4_RE.test(h) || labels.length <= 1) return { domain: h, sld: h, suffix: '' };
    const lastTwo = labels.slice(-2).join('.');
    if (MULTI_LABEL_SUFFIX_SET.has(lastTwo) && labels.length >= 3) {
      return { domain: labels.slice(-3).join('.'), sld: labels[labels.length - 3], suffix: lastTwo };
    }
    return { domain: lastTwo, sld: labels[labels.length - 2], suffix: labels[labels.length - 1] };
  }
  function registrableDomain(host) { return registrableParts(host).domain; }

  const SUSPICIOUS_TOKENS = [
    'login', 'signin', 'verify', 'verification', 'account', 'secure',
    'update', 'confirm', 'bank', 'wallet', 'free', 'win', 'winner', 'gift',
    'prize', 'bonus', 'claim', 'unlock', 'suspended', 'limited', 'security'
  ];

  const SCAM_PHRASES = [
    'you won', 'you have won', 'congratulations you', 'claim your prize',
    'you have been selected', 'free gift', 'crypto giveaway', 'double your',
    'risk-free investment', 'act now', 'verify your account', 'account suspended',
    'unusual activity', 'confirm your identity'
  ];

  // Very-high-traffic legitimate sites; we skip warnings on these to avoid
  // embarrassing false positives. NOT a security boundary — just FP control.
  // Matched by exact host or any subdomain (host.endsWith('.' + d)), so
  // multi-label suffixes like dbs.com.sg work without eTLD parsing.
  const SAFE_DOMAINS = [
    'google.com', 'youtube.com', 'gmail.com', 'facebook.com', 'instagram.com',
    'whatsapp.com', 'microsoft.com', 'live.com', 'office.com', 'outlook.com',
    'apple.com', 'icloud.com', 'amazon.com', 'netflix.com', 'linkedin.com',
    'github.com', 'wikipedia.org', 'x.com', 'twitter.com', 'reddit.com',
    'paypal.com', 'binance.com', 'coinbase.com', 'cloudflare.com', 'mozilla.org',
    'dbs.com.sg', 'maybank2u.com.my', 'wise.com', 'revolut.com',
    'discord.com', 'spotify.com', 'tiktok.com', 'shopee.sg', 'lazada.sg',
    'grab.com', 'metamask.io', 'opensea.io', 'etherscan.io',
    // Regional brand storefronts + brand-controlled infra. NEVER add shared
    // hosting infra here (amazonaws.com, azurewebsites.net, googleusercontent.com,
    // windows.net) — those hosts serve arbitrary attacker content.
    'amazon.ae', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it',
    'amazon.es', 'amazon.nl', 'amazon.ca', 'amazon.in', 'amazon.sg',
    'amazon.sa', 'amazon.eg', 'amazon.com.au', 'amazon.com.br',
    'amazon.com.mx', 'amazon.com.tr', 'amazon.co.jp', 'primevideo.com',
    'google.co.uk', 'google.de', 'google.fr', 'google.ae', 'google.com.sg',
    'google.com.au', 'google.co.in', 'google.co.jp', 'google.ca', 'google.com.br',
    'microsoftonline.com', 'office365.com', 'azure.com', 'sharepoint.com'
  ];

  // SSO / identity providers that legitimate sites post credential forms to.
  // A password form whose action targets one of these registrable domains is
  // normal federated login, not credential exfiltration.
  const KNOWN_AUTH_PROVIDERS = [
    'google.com', 'microsoftonline.com', 'microsoft.com', 'live.com',
    'apple.com', 'facebook.com', 'github.com', 'linkedin.com',
    'okta.com', 'auth0.com', 'onelogin.com', 'pingidentity.com',
    'duosecurity.com', 'salesforce.com', 'amazon.com', 'paypal.com'
  ];

  // Known legitimate domains per brand (registrable form). If a page *names* a
  // brand but its domain is not in that brand's list, it's likely impersonation.
  const BRAND_DOMAINS = Object.fromEntries(BRANDS.map((b) => [b.key, b.domains]));
  // Every registrable domain a known brand legitimately controls (flattened).
  const KNOWN_BRAND_REGISTRABLES = [...new Set(Object.values(BRAND_DOMAINS).flat())];

  const BRANDS_BY_KEY = Object.fromEntries(BRANDS.map((b) => [b.key, b]));
  function titleCase(s) { return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase()); }
  // Canonical mixed-case brand name for UI. Explicit `display` wins; falls
  // back to a title-cased names[0], then the raw key.
  function brandDisplayName(key) {
    const b = BRANDS_BY_KEY[key];
    if (!b) return key;
    if (b.display) return b.display;
    if (b.names && b.names[0]) return titleCase(b.names[0]);
    return b.key;
  }

  function isSafeHost(host) {
    const h = String(host || '').toLowerCase();
    return SAFE_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
  }
  // Phrases that indicate a wallet recovery-phrase harvesting attempt.
  const SEED_PHRASE_HINTS = ['recovery phrase', 'seed phrase', 'secret phrase', 'mnemonic', 'private key'];

  // Parcel carriers (0.6.0): brands whose impersonation pattern is a card-fee
  // form rather than a password form — drives the delivery-fee-scam rule.
  const CARRIER_BRANDS = ['dhl', 'fedex', 'usps', 'ups', 'aramex', 'royalmail', 'evri', 'emiratespost', 'dpd'];

  // Free/tenant hosting apexes where anyone can mint a sub-domain in seconds
  // (0.13.0). The apex itself is fine; the tenant label is scored. Never
  // add brand-controlled infra (amazonaws.com is a *hoster*, not a tenant
  // platform: it lives in the feed's risk tables).
  const TENANT_PLATFORMS = [
    'webflow.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'github.io', 'gitlab.io', 'web.app', 'firebaseapp.com',
    'azurewebsites.net', 'web.core.windows.net', 'blob.core.windows.net', 'backblazeb2.com', 'r2.dev', 'surge.sh', 'glitch.me', 'repl.co', 'replit.app',
    'weebly.com', 'wixsite.com', 'blogspot.com', 'wordpress.com', 'godaddysites.com', 'square.site', 'systeme.io', 'carrd.co', 'strikingly.com',
    'duckdns.org', 'zya.me', 'eu.cc', 'hstn.me', 'fwh.is', '000webhostapp.com', 'ngrok-free.app', 'ngrok.io', 'trycloudflare.com', 'onrender.com', 'fly.dev', 'herokuapp.com', 'koyeb.app', 'railway.app'
  ];
  // Leftmost label of a tenant-platform host — the part the tenant actually
  // controls — or null for the apex itself, a bare "www", or any non-platform
  // host. Used to score credential forms on free-hosting tenants (0.13.0).
  function tenantLabel(host) {
    const h = String(host || '').toLowerCase().replace(/\.+$/, '');
    const apex = TENANT_PLATFORMS.find((a) => h.endsWith('.' + a));
    if (!apex) return null;
    const first = h.slice(0, -(apex.length + 1)).split('.').filter(Boolean)[0];
    if (!first || first === 'www') return null;
    return first;
  }

  // SERP redirect-wrapper hosts (0.10.0, Task C1): search engines that route
  // an organic/sponsored result through a same-origin tracking redirect
  // before the real destination, keyed on the query param(s) that carry it.
  // Pure string/URL parsing only — no network fetch, no DOM — so the SERP
  // badge annotator (content/content_script.js) can unwrap a result href
  // before taking its registrable domain, and this stays unit-testable here
  // like every other constants.js helper.
  // `path` scopes the unwrap to the actual redirect endpoint — e.g. Google's
  // own /maps or /search also carry a "q" parameter that means something
  // else entirely, so only /url and /aclk (its ad-click redirect) qualify.
  const SERP_REDIRECT_HOSTS = [
    { re: /(^|\.)google\.[a-z.]+$/i, path: /^\/(url|aclk)$/, params: ['q', 'url', 'adurl'] },
    { re: /(^|\.)bing\.com$/i, path: /^\/aclick$/, params: ['u'] },
    { re: /(^|\.)duckduckgo\.com$/i, path: /^\/y\.js$/, params: ['uddg'] }
  ];
  function unwrapSerpRedirect(href, baseHref) {
    if (!href) return null;
    let u;
    try { u = new URL(href, baseHref); } catch (_) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    const entry = SERP_REDIRECT_HOSTS.find((e) => e.re.test(host) && e.path.test(u.pathname));
    if (entry) {
      for (const p of entry.params) {
        const wrapped = u.searchParams.get(p);
        if (!wrapped) continue;
        try {
          const w = new URL(wrapped, baseHref);
          if (/^https?:$/.test(w.protocol)) return w.href;
        } catch (_) { /* not a real wrapped URL — fall through */ }
      }
    }
    return u.href;
  }

  // Unique, insertion-ordered, bounded — the SERP badge annotator's own
  // "hard cap the work" requirement, and generic enough for any other caller
  // that wants to dedup a list without an unbounded scan.
  function dedupeCapped(list, cap) {
    const seen = new Set();
    const out = [];
    for (const item of (list || [])) {
      if (item == null || seen.has(item)) continue;
      seen.add(item);
      out.push(item);
      if (out.length >= cap) break;
    }
    return out;
  }

  // --- Cross-origin credential/card exfil watch (0.10.0, Task C2) -----------
  // Netcraft-style "watches outgoing requests for credentials posted cross-
  // domain" and Malwarebytes-style "credit card skimmer protection", done
  // on-device: content_script.js flags a form submit whose action posts a
  // password or a PAN-shaped card number to a different registrable domain.
  // These are pure helpers only — no DOM, no chrome — so the submit-time
  // wiring in content/content_script.js stays unit-testable here.

  // Standard Luhn checksum (mod 10, doubling every second digit from the
  // right). `digits` is expected pre-stripped to [0-9]; a non-digit anywhere
  // fails closed rather than throwing.
  function luhnValid(digits) {
    const s = String(digits || '');
    if (!s.length) return false;
    let sum = 0, alt = false;
    for (let i = s.length - 1; i >= 0; i--) {
      const code = s.charCodeAt(i) - 48;
      if (code < 0 || code > 9) return false;
      let d = code;
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  // A raw input value "looks like a PAN" when, digits-only, it falls in the
  // 13-19 length range every real card scheme uses AND passes Luhn. This is
  // deliberately the ONLY place a typed value is inspected for card-shape —
  // callers identify *candidate* inputs by attribute (autocomplete="cc-number",
  // name/id/placeholder containing "card") and only run this at submit time.
  function isPanShaped(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    return luhnValid(digits);
  }

  // The small set of SSO / payment-processor hosts that legitimately receive
  // a password or card-number form POST from a different registrable domain
  // (federated login, hosted checkout). Documented by the exact host each
  // flow actually posts to; matched by registrable domain (registrableDomain,
  // the same eTLD+1 comparison used everywhere else in this file), so any
  // subdomain of these still clears. Deliberately separate from
  // KNOWN_AUTH_PROVIDERS above (password-login only, no payment processors) —
  // this list backs the distinct exfil-watch signal below, which also covers
  // card forms; check both callers before merging the two.
  const CRED_EXFIL_ALLOWLIST_HOSTS = [
    'accounts.google.com', 'login.microsoftonline.com', 'appleid.apple.com',
    'checkout.stripe.com', 'pay.google.com', 'www.paypal.com', 'checkout.paypal.com'
  ];
  const CRED_EXFIL_ALLOWLIST = [...new Set(CRED_EXFIL_ALLOWLIST_HOSTS.map((h) => registrableDomain(h)))];
  function isCredExfilAllowlisted(host) {
    return CRED_EXFIL_ALLOWLIST.includes(registrableDomain(host));
  }

  // The destination registrable domain when a form's raw `action` attribute
  // points cross-origin to a non-allowlisted http(s) host — or null when the
  // submission must never be flagged:
  //   - no action attribute at all (a falsy `actionAttr` — a self-post, since
  //     browsers submit an action-less form back to the current page);
  //   - a non-http(s) scheme (javascript:, about:, mailto:, ...);
  //   - the same registrable domain as the page, including any subdomain;
  //   - a known SSO/payment target (isCredExfilAllowlisted above).
  // `pageHref` is the page's own URL, used both to resolve a relative action
  // and as the same-origin comparison baseline.
  function crossOriginCredPostHost(pageHref, actionAttr) {
    if (!actionAttr) return null;
    let base, u;
    try { base = new URL(pageHref); } catch (_) { return null; }
    try { u = new URL(actionAttr, base); } catch (_) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const pageDomain = registrableDomain(base.hostname);
    const actionDomain = registrableDomain(u.hostname);
    if (actionDomain === pageDomain) return null;
    if (isCredExfilAllowlisted(u.hostname)) return null;
    return actionDomain;
  }

  return {
    FEATURE_NAMES, THRESHOLDS, BRANDS, BRANDS_BY_KEY, POPULAR_BRANDS, SUSPICIOUS_TLDS, SUSPICIOUS_TOKENS,
    SCAM_PHRASES, SAFE_DOMAINS, BRAND_DOMAINS, SEED_PHRASE_HINTS, CARRIER_BRANDS,
    TENANT_PLATFORMS, tenantLabel,
    MULTI_LABEL_SUFFIXES, KNOWN_AUTH_PROVIDERS, KNOWN_BRAND_REGISTRABLES,
    VERIFIED_NAMESPACES, isVerifiedNamespace,
    registrableParts, registrableDomain, isSafeHost, brandNameIn, brandDisplayName,
    unwrapSerpRedirect, dedupeCapped,
    luhnValid, isPanShaped, CRED_EXFIL_ALLOWLIST, isCredExfilAllowlisted, crossOriginCredPostHost
  };
});
