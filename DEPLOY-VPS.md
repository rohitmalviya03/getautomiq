# 🚀 Production Deploy — Hostinger VPS (pm2)

Ye file batati hai ki **naya code push karne ke baad production par kya chalana hai**.

> ⚠️ Ye server **pm2 + nginx + system MySQL** par chalta hai — Docker par **nahi**.
> Repo me jo `docker-compose.yml` / `scripts/deploy.sh` / GitHub Actions workflow hai,
> wo ek alag (abhi unused) setup ke liye hai. Har push par wo deploy job **fail hoga** —
> wo normal hai, us par dhyan mat do. Asli deploy yahi manual process hai.

---

## 🗺️ Kya kahan chalta hai

| Cheez | Kahan | Kaise serve hota hai |
|---|---|---|
| API (NestJS) | `~/growasy/growasy-api` | pm2 process `growasy-api` → `dist/main.js` → nginx proxy → `api.getautomiq.in` |
| Worker (BullMQ) | `~/growasy/growasy-worker` | pm2 process `growasy-worker` → `dist/index.js` (koi public URL nahi) |
| Web (React) | `~/growasy/growasy-web` | **build hoke `dist/` banti hai, nginx usi folder ko serve karta hai** → `app.getautomiq.in` |
| Database | host par MySQL | db `growasy` |
| Redis | host par | BullMQ queue |

**Sabse important baat:** API aur Worker TypeScript se compile hote hain (`dist/`), aur Web
ek static build hai. Sirf `git pull` karne se **kuch nahi badalta** — jab tak `npm run build`
na chale, purana `dist/` hi chalta rehta hai.

---

## ⚡ Standard deploy — kya badla, kya chalao

| Aapne kya badla | Kya chalana hai |
|---|---|
| Sirf `growasy-web/` (UI, pages, components) | Web build |
| Sirf `growasy-api/src/` | API build + restart |
| Sirf `growasy-worker/src/` | Worker build + restart |
| `prisma/schema.prisma` (naya column/table) | Migration + generate + build + restart |
| Koi `.env` value | Sirf `pm2 restart --update-env` (build ki zarurat nahi) |
| `package.json` (naya package) | Us service me `npm install` bhi |
| Pata nahi kya badla | Neeche wala **full deploy** chala do — safe hai |

---

## 📦 FULL DEPLOY (confusion ho to yahi chalao)

```bash
ssh root@<SERVER_IP>

# 0. BACKUP — schema change ho to skip mat karna
mysqldump -u growasy_user -p growasy > ~/growasy_backup_$(date +%F_%H%M).sql

# 1. Naya code
cd ~/growasy && git pull

# 2. API
cd ~/growasy/growasy-api
npm install
npx prisma generate          # schema badla ho to zaroori
npx prisma migrate status    # ⚠️ pehle status dekho (neeche "Migrations" section)
npx prisma migrate deploy    # pending migrations lagao
npm run build

# 3. Worker
cd ~/growasy/growasy-worker
npm install
npx prisma generate
npm run build

# 4. Web  ← ye step sabse zyada bhula jata hai
cd ~/growasy/growasy-web
npm install
npm run build                # dist/ update hoti hai, nginx turant serve karega

# 5. Restart
pm2 restart all --update-env
pm2 status
pm2 logs --lines 30 --nostream
```

Browser me **Ctrl+Shift+R** (hard refresh) — warna purana bundle cache se chal sakta hai.

---

## 🗃️ Migrations — yahan sambhal ke

Prisma do alag cheezein hain, dono chahiye:

- `npx prisma generate` → **TypeScript types** banata hai (code compile hone ke liye)
- `npx prisma migrate deploy` → **database me actual columns** banata hai

Sirf `generate` chalane se code to compile ho jayega, par runtime par
`The column ... does not exist` error aayega.

### Hamesha pehle status dekho

```bash
cd ~/growasy/growasy-api
npx prisma migrate status
```

**Case 1 — "Following migrations have not yet been applied"**
```bash
npx prisma migrate deploy
```

**Case 2 — `P3009: migrate found failed migrations`**

Iska matlab: database `prisma db push` se bana tha (tables hain par migration history khali),
aur baad me kisi ne `migrate deploy` chalaya jo pehle hi `CREATE TABLE ... already exists`
par fail ho gaya.

**Yahan `prisma migrate reset` BILKUL mat chalana — wo poora database uda deta hai.**

Do options:

- **Option A (aasan, additive changes ke liye):**
  ```bash
  npx prisma db push          # --accept-data-loss KABHI mat lagana
  ```
  `db push` schema ko DB se match karta hai. Naye column/table add karne me safe hai;
  agar kuch destructive hoga to wo khud ruk jayega.

- **Option B (history theek karna):** pehle verify karo ki tables sach me maujood hain,
  phir baseline karo:
  ```bash
  npx prisma migrate resolve --rolled-back <failed_migration_name>
  npx prisma migrate resolve --applied <migration_jo_pehle_se_DB_me_hai>
  npx prisma migrate deploy
  ```
  Ye tabhi karo jab confirm ho ki us migration ka schema DB me already hai.

---

## 🌱 Seed — kab chalana hai

Seed **users ya organizations ko haath nahi lagata**. Wo sirf platform catalogues maintain
karta hai. Steps alag-alag chala sakte ho:

```bash
cd ~/growasy/growasy-api

npm run prisma:seed:plans        # sirf pricing plans (Plan table)
npx prisma db seed -- permissions # sirf permission catalogue
npx prisma db seed -- roles       # naye permissions purani orgs ke roles tak pahunchana
npx prisma db seed                # sab
```

| Step | Kya karta hai | Kab chalao |
|---|---|---|
| `plans` | Plan table me missing storefront fields backfill karta hai. **Price/features/promo jo admin ne set kiye hain, unhe chhuta nahi.** | Pricing se related migration ke baad |
| `permissions` | Global permission list upsert | Naya permission add hone par |
| `roles` | Existing system roles ko missing permission grants deta hai (sirf add, kabhi revoke nahi) | Naya permission add hone par |

> Plans ko default values par **reset** karna ho (admin edits mit jayenge):
> `SEED_FORCE_PLANS=1 npx prisma db seed -- plans`

---

## ✅ Deploy ke baad verify karo

```bash
# 1. Dono process online?
pm2 status

# 2. API zinda hai?
curl -s -o /dev/null -w "%{http_code}\n" https://api.getautomiq.in/api/health     # 200

# 3. Pricing catalogue aa raha hai?
curl -s https://api.getautomiq.in/api/v1/plans | head -c 300

# 4. Errors to nahi?
pm2 logs growasy-api --lines 50 --nostream | grep -i -E "error|prisma|failed"
```

### Web build sach me update hui? (ye check kaam ka hai)

```bash
# apne laptop se — prod bundle me naya code hai ya nahi
ASSET=$(curl -s https://app.getautomiq.in/ | grep -oE '/assets/[A-Za-z0-9._-]+\.js' | head -1)
curl -s "https://app.getautomiq.in$ASSET" | grep -c "admin/coupons"
```
`0` aaya = **web build nahi hui**, purana bundle serve ho raha hai. `git pull` kar liya hone
se koi fark nahi padta — `npm run build` chalana zaroori hai.

Kisi bhi naye feature ke liye us feature ka koi **string literal** dhundo (route path ya UI text).
Function/variable names minify ho jate hain, isliye wo grep me nahi milenge.

---

## 🔧 Alag-alag situations

### Sirf frontend badla
```bash
cd ~/growasy/growasy-web && git pull && npm install && npm run build
```
pm2 restart ki zarurat **nahi** — nginx `dist/` seedha serve karta hai.

### Sirf API badla
```bash
cd ~/growasy && git pull
cd growasy-api && npm install && npm run build
pm2 restart growasy-api --update-env
```

### Sirf `.env` badla
```bash
nano ~/growasy/growasy-api/.env
pm2 restart growasy-api --update-env     # --update-env ke bina purana env load rehta hai
```

### Worker badla (DM sending, emails, queues)
```bash
cd ~/growasy && git pull
cd growasy-worker && npm install && npm run build
pm2 restart growasy-worker --update-env
```

---

## 🆘 "Changes reflect nahi ho rahe" — kaise dhundhein

Order me check karo, pehla jo fail ho wahi problem hai:

| # | Check | Command | Fail hone par |
|---|---|---|---|
| 1 | Naya code server par aaya? | `cd ~/growasy && git log --oneline -1` | `git pull` |
| 2 | Build hui? | `ls -l growasy-api/dist/main.js` (time dekho) | `npm run build` |
| 3 | Process restart hua? | `pm2 status` (uptime dekho) | `pm2 restart ... --update-env` |
| 4 | DB me columns hain? | `npx prisma migrate status` | `migrate deploy` ya `db push` |
| 5 | Web bundle naya hai? | upar wala ASSET grep | `cd growasy-web && npm run build` |
| 6 | Data seed hua? | `curl .../api/v1/plans` me `null` fields | `npm run prisma:seed:plans` |
| 7 | Browser cache | Ctrl+Shift+R / incognito | — |

**Sabse common:** API to update ho jati hai (kyunki uska build+restart yaad rehta hai),
par **web ka `npm run build` reh jata hai** — isliye UI purana dikhta hai.

---

## ⏪ Rollback

```bash
cd ~/growasy
git log --oneline -5                 # kis commit par wapas jana hai
git checkout <commit-sha>

cd growasy-api && npm install && npm run build && cd ..
cd growasy-web && npm install && npm run build && cd ..
pm2 restart all --update-env
```

Database rollback alag hai — migrations apne aap wapas nahi hoti. Backup se restore karo:
```bash
mysql -u growasy_user -p growasy < ~/growasy_backup_<FILENAME>.sql
```
Isiliye **schema change wale deploy se pehle backup lena zaroori hai**.

---

## 🔍 Crawler rendering (blog ko Google + AI par laane ke liye)

App ek client-rendered SPA hai. Jo client JavaScript nahi chalata use
`/blog/koi-post` par sirf `<div id="root"></div>` milta hai — na title, na text.
Google JS render kar leta hai (dheere), par **GPTBot, PerplexityBot, ClaudeBot
bilkul nahi karte** — aur wahi engines aapke `robots.txt` me invite kiye hue hain.

Iska fix `nginx/crawler-rendering.conf` me hai: crawler requests API par jati
hain jo poora HTML deta hai (title, meta, canonical, OG, JSON-LD, article body),
aur insaan ko SPA hi milta hai.

Ek baar server par lagana hai:

```bash
nano /etc/nginx/sites-available/getautomiq   # repo wali file se blocks copy karo
nginx -t && systemctl reload nginx
```

Verify:
```bash
# crawler ban ke — post ka apna title aana chahiye
curl -s -A "GPTBot/1.0" https://app.getautomiq.in/blog/<slug> | grep -o '<title>[^<]*'

# browser ban ke — SPA ka title
curl -s https://app.getautomiq.in/blog/<slug> | grep -o '<title>[^<]*'

# sitemap me ab blog posts honi chahiye
curl -s https://app.getautomiq.in/sitemap.xml | grep -c '/blog/'
```

`sitemap.xml` aur `llms.txt` ab API se serve hote hain, isliye naya post publish
karte hi unme aa jata hai — frontend rebuild ki zarurat nahi.

**Dhyan:** crawler ko wahi content dena hai jo browser dikhata hai. Alag content
dena cloaking hai aur Google usse penalise karta hai.

## 📌 Yaad rakhne wali baatein

- `git pull` = kuch nahi hua. **`npm run build` = asli deploy.**
- Web ke liye pm2 restart bekaar hai; API/Worker ke liye build ke baad restart zaroori hai.
- `.env` badla to `--update-env` lagao, warna purana env chalta rahega.
- `prisma generate` ≠ `prisma migrate deploy` — dono alag kaam karte hain.
- **`prisma migrate reset` production par kabhi nahi** — data chala jayega.
- Schema change = pehle `mysqldump` backup.
- GitHub Actions ka deploy job fail hoga (wo docker maangta hai) — ignore karo.
