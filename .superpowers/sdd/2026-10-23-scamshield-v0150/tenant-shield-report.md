# Tenant shield report (0.15.0 recall fix)

Status: DONE.

Changes
- background/service_worker.js isPopularHost: false when ScamShield.tenantLabel(host) is non-null. Every call site (annotate/checkFeedBatch link+ad guard, checkFeedHost message handler) goes through it, so all are covered. Bare apex and www stay popular.
- engine/doctrine.js popularMode: returns 'none' when C.tenantLabel(host) is set (SW and content cannot drift).
- engine/constants.js: 17 dynamic-DNS apexes added to TENANT_PLATFORMS (duckdns.org already present); STORAGE_TENANT_PLATFORMS added and exported; isBuilderTenantHost also true for them (hasLoginPair !== false still required). Dev-host exclusion comment updated. isTenantApex / scopeDomain verified: scope is per-tenant.
- rules/popular40.bin + popular.meta.json: 13 new apexes (ddnss.de, no-ip.biz, zapto.org, sytes.net, servebeer.com, serveftp.com, myftp.org, freeddns.org, dynu.net, dyndns.org, ddnsfree.com, myddns.me, ooguy.com) were in the shipped popular set and failed the existing "no tenant apex" unit test. Stripped offline from the bin (50000 -> 49987), meta count/excludedPlatforms updated. Equivalent to what scripts/build-popular.js produces on rebuild.
- tools/lib/ext-launch.js: host maps login-fixture.web.core.windows.net and www.web.core.windows.net (:5600).

Tests
- Unit: tests/unit/doctrine.test.js (+6 tests: popularMode, daniho.dyn.ddnss.de warn, apex/www/mail.google.com shielded, risk-hosting quiet, storage tenant tenant-credential + github.io/pages.dev none, apex list + per-tenant scope).
- E2E: tests/e2e/hard-benign-pack.spec.js (+2: storage tenant with login pair warns and isPopularHost false; www.web.core.windows.net canary no banner).

Follow-ups
- Add the same dyn-DNS apexes to parry-feed/lib/gate.js SHARED_HOST_APEXES (feed repo not touched).
- Regenerate popular40.bin from the next Tranco list with the build script.
- Tenant verdicts for daniho.dyn.ddnss.de / duckdns.org cloaking page: the duckdns page (no inputs, risk-hosting only) intentionally stays quiet; its recall now relies on the feed/model path, not this fix.
