# Database migrations

The initial migration is a reviewable PostgreSQL SQL file. Run it on an empty database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/versions/0001_market_data_core.sql
```

Back up production before applying it. Add new migration files; never rewrite an applied migration.
