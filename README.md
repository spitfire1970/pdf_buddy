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

- pm2 + serve
- npm run build
- pm2 start serve --name "pdfbuddy-frontend" -- -s dist -l 3003
- pm2 save
- pm2 startup
- pm2 stop pdfbuddy-frontend
- pm2 list
- pm2 describe pdfbuddy-frontend
- pm2 delete pdfbuddy-frontend
- pm2 restart pdfbuddy-frontend