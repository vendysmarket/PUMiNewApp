# PUMi App - Complete Package

## 📦 Mit kaptál?

Egy **teljes, production-ready** PUMi alkalmazást, amit azonnal tudsz deployolni és fejleszteni.

## 🗂️ Tartalom

```
pumi-app/
├── frontend/              # React frontend (Vite + TypeScript)
├── backend/               # FastAPI backend (Python 3.12)
├── docs/                  # Részletes dokumentáció
│   ├── DEPLOYMENT.md      # Teljes deployment guide
│   ├── DEVELOPER.md       # Fejlesztői útmutató
│   ├── ENVIRONMENT.md     # Környezeti változók referencia
│   └── database-schema.sql # Teljes adatbázis séma
├── README.md              # Projekt áttekintés
├── PROJECT_OVERVIEW.md    # Részletes projekt dokumentáció
├── QUICKSTART.md          # 5 perces gyorsindító
├── CHANGELOG.md           # Verziókövetés
├── setup.sh               # Automatikus telepítő script
└── .gitignore             # Git ignore fájl
```

## ⚡ Gyors Start (5 perc)

### 1. Kicsomagolás
```bash
tar -xzf pumi-app-complete.tar.gz
cd pumi-app
```

### 2. Automatikus Setup
```bash
chmod +x setup.sh
./setup.sh
```

### 3. API kulcsok beszerzése
- **Anthropic**: https://console.anthropic.com (Claude API)
- **Supabase**: https://supabase.com (Auth + Database)

### 4. .env konfigurálás
```bash
# Backend
nano backend/.env
# Add meg: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# Frontend
nano frontend/.env.local
# Add meg: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
```

### 5. Indítás
```bash
# Terminal 1 - Backend
cd backend
python start.py

# Terminal 2 - Frontend
cd frontend
npm run dev
```

✅ Kész! → http://localhost:5173

## 📚 Dokumentáció

### Alapvető
- **QUICKSTART.md** - Első lépések (5 perc)
- **README.md** - Projekt áttekintés
- **PROJECT_OVERVIEW.md** - Teljes projekt dokumentáció

### Fejlesztés
- **docs/DEVELOPER.md** - Fejlesztői guide
- **docs/ENVIRONMENT.md** - Környezeti változók
- **docs/database-schema.sql** - Adatbázis séma

### Deployment
- **docs/DEPLOYMENT.md** - Production deployment (Railway + Vercel)

## 🎯 Fő Feature-ök

### 1. Két Személyiség
- **GenZ Mode**: Rövid, direkt, kihívó (2-4 mondat)
- **Millennial Mode**: Átgondolt, részletes, professzionális (3-5 mondat)

### 2. Focus Mode
- 45 perces strukturált tanulási szekciók
- Interaktív leckék, kvízek, gyakorlatok
- Napi streak követés
- Többféle practice típus (fordítás, roleplay, írás, flashcards)

### 3. Memória Rendszer
- Kontextus megőrzése beszélgetések között
- Személyre szabott válaszok
- Haladás követés

### 4. Előfizetési Szintek
- **Free**: 4,000 token/nap
- **GenZ**: 25,000 token/nap ($9/hó)
- **Millennial**: 40,000 token/nap ($14/hó)

## 🛠️ Tech Stack

### Frontend
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS + shadcn/ui
- Supabase Auth

### Backend
- Python 3.12
- FastAPI
- Claude API (Anthropic)
- Supabase (PostgreSQL)
- Stripe (fizetés)

## 🚀 Deployment

### Railway (Backend)
1. Projekt létrehozása
2. GitHub repo összekötés
3. Root directory: `backend/`
4. Environment változók beállítása
5. Deploy

### Vercel (Frontend)
1. Projekt importálás
2. Root directory: `frontend/`
3. Build command: `npm run build`
4. Environment változók beállítása
5. Deploy

**Részletes útmutató**: `docs/DEPLOYMENT.md`

## 📊 Projektstruktúra

### Backend
```
backend/app/
├── main.py                    # FastAPI app
├── llm_client.py             # Claude API (személyiségek)
├── chat_enhanced.py          # Chat végpont
├── focus_api.py              # Focus Mode API
├── focus_content_generators.py # AI content generálás
├── billing.py                # Stripe integráció
├── account.py                # Felhasználói fiókok
├── db.py                     # Supabase kliens
└── memory_store.py           # Beszélgetés memória
```

### Frontend
```
frontend/src/
├── components/
│   ├── auth/                 # Bejelentkezés
│   ├── chat/                 # Chat felület
│   ├── focus/                # Focus Mode UI
│   └── ui/                   # Alap komponensek
├── pages/                    # Oldalak (route-ok)
├── hooks/                    # Custom React hooks
├── lib/                      # Utilities & i18n
└── integrations/             # Supabase kliens
```

## 🔑 Szükséges API Kulcsok

### 1. Anthropic (kötelező)
- Console: https://console.anthropic.com
- Create API key
- Másold: `sk-ant-api03-...`

### 2. Supabase (kötelező)
- Új projekt: https://supabase.com
- Settings → API
- Másold:
  - Project URL
  - `anon` public key
  - `service_role` key

### 3. Stripe (opcionális - csak fizetéshez)
- Dashboard: https://dashboard.stripe.com
- Developers → API keys
- Másold: Secret key, Webhook secret

## 💡 Gyakori Műveletek

### Új Feature Hozzáadása
1. Backend endpoint: `backend/app/my_feature.py`
2. Frontend komponens: `frontend/src/components/MyFeature.tsx`
3. Router regisztráció: `backend/app/main.py`

### Személyiség Módosítása
Szerkesztd: `backend/app/llm_client.py`
- `_genz_system()` - GenZ módhoz
- `_millenial_system()` - Millennial módhoz

### Új Fordítás Hozzáadása
Szerkesztsd: `frontend/src/lib/i18n.ts`

### Adatbázis Módosítás
1. Módosítsd: `docs/database-schema.sql`
2. Futtasd SQL-t Supabase SQL Editor-ban
3. Frissítsd backend modelleket

## 🐛 Troubleshooting

### "Invalid API key"
- Ellenőrizd `ANTHROPIC_API_KEY` formátumát
- Nézd meg van-e kredited

### "Database connection failed"
- Ellenőrizd Supabase URL-t és kulcsokat
- Projekt nem szünetel-e

### "CORS error"
- Frontend URL benne van-e backend `ALLOWED_ORIGINS`-ben
- Nincs trailing slash

### Port foglalt
```bash
# Backend más porton
python start.py --port 8001

# Frontend más porton
npm run dev -- --port 5174
```

## 📝 Next Steps

1. **Lokálisan futtasd** - Nézd meg működik-e
2. **Testreszabás** - Módosítsd személyiségeket
3. **Deployment** - Tedd ki production-ba
4. **Marketing** - Kezdj el user-eket szerezni

## 🆘 Support

### Dokumentáció
- `QUICKSTART.md` - Gyors indítás
- `docs/DEPLOYMENT.md` - Production setup
- `docs/DEVELOPER.md` - Fejlesztői guide
- `docs/ENVIRONMENT.md` - Environment változók

### Problémák
- Nézd át a logs-okat
- Ellenőrizd environment változókat
- Olvass el a troubleshooting szekciót

## ✅ Checklist Production-hoz

- [ ] API kulcsok beszerzése
- [ ] Backend .env konfigurálás
- [ ] Frontend .env konfigurálás
- [ ] Supabase adatbázis séma futtatás
- [ ] Google OAuth beállítás
- [ ] Lokális tesztelés
- [ ] Railway backend deploy
- [ ] Vercel frontend deploy
- [ ] CORS beállítás
- [ ] Domain konfiguráció (opcionális)
- [ ] Stripe webhook setup (opcionális)
- [ ] Production tesztelés

## 🎉 Kész!

Most már minden eszközöd megvan ahhoz, hogy:
- Lokálisan futtasd
- Fejleszd tovább
- Production-ba rakd
- Monetizáld

**Good luck! 🚀**

---

**Version**: 1.0.0  
**Date**: 2026-02-10  
**Created by**: Claude (with ❤️)
