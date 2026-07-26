.PHONY: openapi tokens check-assets

openapi:
	node scripts/export-openapi.mjs

tokens:
	pnpm tokens:build

check-assets:
	node scripts/check-asset-registry.mjs
