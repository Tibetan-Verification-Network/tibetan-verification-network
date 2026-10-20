# Public search (Phase 4.1)

Public list and search read from the `public_articles` projection only. Rows are written inside publication transactions (`publish`, correction publish, `withdraw`) and via `tvn-rebuild-public-index`.

## Normalization

- Unicode NFC
- Latin lowercased in `search_text`
- Tibetan tsheg (U+0F0B) and shad (U+0F0D) stripped or used as syllable boundaries
- `search_tokens`: Tibetan syllables plus Latin word tokens

## Indexes

- GIN `gin_trgm_ops` on `search_text`
- GIN on `search_tokens` and `topics`
- B-tree on `(language, is_withdrawn, last_published_at)` and `verdict`

## Tibetan `pg_trgm` spike

Run against Neon or local Postgres:

```sql
SELECT show_trgm('བོད་ཡིག་ཚོད་ལྟ');
SELECT show_trgm('tibetan verification');
```

If Tibetan script produces few or no trigrams under the database collation, public search relies on syllable-token containment (`search_tokens @> …`) with Latin trigram/`ILIKE` fallback for English queries. Record `EXPLAIN ANALYZE` from `backend/scripts/seed_search_corpus.py` after seeding the corpus.

## Query behavior

- Tibetan-oriented terms: all syllable tokens must appear in `search_tokens`
- Latin terms: `search_text ILIKE` per token
- Withdrawn articles: excluded from list/search; detail still returns withdrawal notice
