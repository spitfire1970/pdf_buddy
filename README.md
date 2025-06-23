- ```uvicorn application:app --reload```
- ```npm run watch```
- ```npm run dev```
- ```npx @biomejs/biome format --write ./src```
- ```rm -rf node_modules/.vite```
- REMEMBER to always run ```npx patch-package``` after npm install
- delete all tables:
```
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;
```