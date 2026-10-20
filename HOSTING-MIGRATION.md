# Free hosting migration

Status: prepared, not deployed. Northflank was rejected because even its Sandbox requires card verification. Railway Free account setup is in progress; no card or paid plan is authorized. Railway's ongoing $1 monthly allowance must be checked against actual server usage before describing it as a permanent hosting solution.

## Runtime configuration

- `PORT=3000` (public HTTP port).
- `STARLITE_REQUIRE_MONGO=1` (set by Dockerfile).
- `MONGODB_URI`: configure the existing database connection as a runtime secret; never commit it.
- `STARLITE_DOWNLOAD_MODE=external` (set by Dockerfile).
- `STARLITE_LAUNCHER_URL`: verified HTTPS URL of the new launcher release, configured after validation.
- `STARLITE_MIRROR_PREFIXES`: optional comma-separated, explicitly approved HTTPS path prefixes for independent public mirrors.

The existing non-empty MongoDB state must be available. Startup must not seed a replacement user database. API calls remain unavailable until the required remote database connects. No real user data is included in the container build.

## Downloads

The website returns small manifests and redirects. It does not download, cache, assemble or stream game archives in external mode. Existing bundle manifests contain verified chunks; a launcher with multipart support is required for first installation. Core update URLs remain compatible with redirects.

The staged launcher transport supports per-artifact sources, integrity checking, failed-source fallback, and resuming verified multipart chunks. No desktop capture or PC reporting is included in this migration build. The public launcher URL is deliberately unset until the final endpoint and transport are verified.

An independent second mirror must be published and probed before claiming regional redundancy. Current manifests retain the original GitHub URLs; no mirror or Russia/Ukraine connectivity guarantee has been established yet.

## Checks completed

- 12 Node tests passed (download source policy, verified artifact handling, and refusal to start without the required existing database).
- 14 loopback transport checks passed (HTTP failure, corrupt response fallback, preserved installed file, cache reuse, multipart resume/order, traversal and invalid metadata rejection).
- The staged WPF launcher compiles; it has not been published or tested against the final new host.

## Deployment gates

1. Complete Railway repository connection and verify account eligibility for external MongoDB connections. Northflank's empty `Default` project was deleted with user authorization; its team is now on Sandbox, with no service running.
2. Configure the existing database credential on the new host after approval for secret transfer.
3. Create the free service using this branch and validate the actual public hostname.
4. Publish and validate the independent mirror, then test downloads from Russian and Ukrainian probes/connections.
5. Set the actual API hostname in the staged launcher, recheck and publish it; configure `STARLITE_LAUNCHER_URL`.
6. Verify the complete fresh-install and existing-client update paths before switching users.
